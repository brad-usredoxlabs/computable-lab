import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  buildDiagnosticBlock,
  createEventEditorFixHandlers,
  type FixItSeed,
} from './EventEditorFixHandlers.js';
import type { InferenceClient } from '../../ai/types.js';

function makeSeed(): FixItSeed {
  return {
    prompt: 'put a 12-well reservoir on deck slot b1',
    draft: {
      events: [],
      placements: [],
      labwares: {},
      skips: ['lbw-foo: validation error'],
    },
    deckContext: {
      platformId: 'opentrons_flex',
      platformLabel: 'Opentrons Flex',
      variantId: 'flex_96',
      variantTitle: 'Flex 96-channel',
      committedPlacements: [],
    },
    fixItSessionId: 'fix-test-123',
  };
}

function makeFastifyReply() {
  let statusCode = 200;
  const sent: unknown[] = [];
  const writeChunks: string[] = [];
  let ended = false;
  const rawListeners = new Map<string, Set<() => void>>();
  const reply = {
    status(code: number) {
      statusCode = code;
      return reply;
    },
    async send(payload: unknown) {
      sent.push(payload);
    },
    raw: {
      writeHead: vi.fn(),
      write: vi.fn((chunk: string) => {
        writeChunks.push(chunk);
      }),
      end: vi.fn(() => {
        ended = true;
      }),
      on(event: string, listener: () => void) {
        let set = rawListeners.get(event);
        if (!set) { set = new Set(); rawListeners.set(event, set); }
        set.add(listener);
        return reply.raw;
      },
      off(event: string, listener: () => void) {
        rawListeners.get(event)?.delete(listener);
        return reply.raw;
      },
    },
    fireClose() {
      for (const listener of rawListeners.get('close') ?? []) listener();
    },
    _stats: () => ({ statusCode, sent, writeChunks, ended }),
  };
  return reply;
}

function makeFastifyRequest<B>(body: B) {
  const raw = {
    on(_event: string, _listener: () => void) {
      return raw;
    },
    off(_event: string, _listener: () => void) {
      return raw;
    },
  };
  const req = {
    body,
    headers: {},
    raw,
    log: {
      error: vi.fn(),
      warn: vi.fn(),
    } as unknown as { error: (...args: unknown[]) => void; warn: (...args: unknown[]) => void },
  };
  return req as never;
}

function parseSseDataLines(chunks: string[]): unknown[] {
  // Each chunk is `data: <json>\n\n` — pull the json out and JSON.parse.
  return chunks
    .join('')
    .split('\n\n')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('data: '))
    .map((s) => JSON.parse(s.slice('data: '.length)) as unknown);
}

describe('buildDiagnosticBlock', () => {
  it('shows the real pass outputs for the canonical demo prompt', async () => {
    const seed: FixItSeed = {
      ...makeSeed(),
      prompt: 'Place a 96-well plate on B2',
    };
    const block = await buildDiagnosticBlock(seed);

    expect(block).toContain('Compiler trace (server-computed pass outputs');
    expect(block).toContain('deckLikeTokens:');
    expect(block).toMatch(/token:\s+B2/);

    // The trace must rule out "missing 96-well plate definition".
    expect(block).toMatch(/phrase:\s*96-well plate/);
    expect(block).toMatch(/hit:\s*true/);
    expect(block).toMatch(/recordId:\s*lbw-def-generic-96-well-plate/);
    expect(block).toMatch(/displayName:\s*Generic 96-Well Plate/);

    // And it must expose the placement failure: the labware candidate has
    // no deckSlot and no pinned deck layout was emitted. Depending on the
    // current compiler patch attempt, B2 may show up as a misplaced well
    // parameter or the action may be suppressed entirely; both are upstream
    // placement-emission failures, not missing-definition failures.
    expect(block).toMatch(/candidateLabwares:[^\n]*\n\s+- hint:\s*96-well plate/);
    expect(block).not.toContain('deckSlot: B2');
    expect(block).toMatch(/labwareAdditions:\s*\[\]/);
    expect(block).toMatch(/pinned:\s*\[\]/);
  });

  it('reports verb and noun misses for an unrelated slotless prompt', async () => {
    const seed: FixItSeed = {
      ...makeSeed(),
      prompt: 'Frobnicate the doohickey',
    };
    const block = await buildDiagnosticBlock(seed);

    expect(block).toContain('deckLikeTokens: []');
    expect(block).toMatch(/residualClauses:\n\s+- text:\s*Frobnicate the doohickey/);
    expect(block).toMatch(/reason:\s*no_verb/);
    expect(block).toMatch(/phrase:\s*Frobnicate the doohickey/);
    expect(block).toMatch(/hit:\s*false/);
  });
});

describe('EventEditorFixHandlers.chatStream', () => {
  it('supplies placement guardrails and real pass output to the diagnosis model', async () => {
    const completeStream = vi.fn(async function* () {
      yield {
        id: 'mock',
        choices: [{
          index: 0,
          delta: { content: 'ok' },
          finish_reason: null,
        }],
      };
    });
    const client = {
      complete: vi.fn(),
      completeStream,
    } as unknown as InferenceClient;

    const handlers = createEventEditorFixHandlers({
      clientFactory: () => client,
    });

    const reply = makeFastifyReply();
    await handlers.chatStream(
      makeFastifyRequest({
        seed: {
          ...makeSeed(),
          prompt: 'Place a 96-well plate on B2',
        },
        history: [],
        userMessage: 'Why did this fail?',
      }),
      reply as never,
    );

    const call = completeStream.mock.calls[0]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemContent = call.messages[0]!.content;
    expect(systemContent).toContain('real pass outputs');
    expect(systemContent).toContain('Do not jump from "the matched verb is add_material"');
    expect(systemContent).toContain('emit a labware placement candidate with deckSlot');
    expect(systemContent).toContain('Compiler trace (server-computed pass outputs');
    expect(systemContent).toMatch(/phrase:\s*96-well plate/);
    expect(systemContent).toMatch(/recordId:\s*lbw-def-generic-96-well-plate/);
    expect(systemContent).toMatch(/token:\s+B2/);
  });
});

describe('EventEditorFixHandlers.synthesizeSpec', () => {
  it('returns YAML spec + fixture from a mocked LLM JSON response', async () => {
    const llmJson = {
      spec: {
        title: 'Recognize lowercase deck slot tokens',
        fixClass: 'compiler',
        rationale: 'The slot regex is case-insensitive but the cited tests show otherwise.',
        ownedFiles: [
          'server/src/compiler/pipeline/passes/DeterministicPrecompilePass.ts',
        ],
        acceptance: ["Prompt with 'b1' yields candidateLabwares with deckSlot 'B1'"],
      },
      fixture: {
        description: 'lowercase deck slot',
        input: { prompt: 'put a 12-well reservoir on deck slot b1' },
        expected: {
          outcome: 'complete',
          terminalArtifacts: {
            deckLayoutPlan: { pinned: [{ slot: 'B1' }] },
          },
        },
      },
    };
    const complete = vi.fn().mockResolvedValue({
      id: 'mock',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: JSON.stringify(llmJson) },
        finish_reason: 'stop',
      }],
    });

    const client = {
      complete,
      completeStream: vi.fn(),
    } as unknown as InferenceClient;

    const handlers = createEventEditorFixHandlers({
      clientFactory: () => client,
    });

    const reply = makeFastifyReply();
    const result = await handlers.synthesizeSpec(
      makeFastifyRequest({ seed: makeSeed(), history: [] }),
      reply as never,
    );

    if ('error' in result) {
      throw new Error(`expected success, got: ${result.message}`);
    }
    expect(result.specId).toMatch(/^spec-fix-/);
    expect(result.fixturePath).toBe(
      `server/src/compiler/pipeline/fixtures/${result.specId}.yaml`,
    );

    // Spec YAML parses and has the right shape.
    const specObj = parseYaml(result.specYaml) as Record<string, unknown>;
    expect(specObj.id).toBe(result.specId);
    expect(specObj.fixClass).toBe('compiler');
    expect(specObj.failingPrompt).toBe('put a 12-well reservoir on deck slot b1');
    // Auto-added entries:
    expect(specObj.ownedFiles).toContain(result.fixturePath);
    expect((specObj.tests as string[]).some((t) => t.includes(result.specId))).toBe(true);

    // Fixture YAML parses + is deterministicOnly.
    const fixtureObj = parseYaml(result.fixtureYaml) as Record<string, unknown>;
    expect(fixtureObj.name).toBe(result.specId);
    expect(fixtureObj.deterministicOnly).toBe(true);
    expect((fixtureObj.input as { prompt: string }).prompt)
      .toBe('put a 12-well reservoir on deck slot b1');

    const call = complete.mock.calls[0]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemContent = call.messages[0]!.content;
    expect(systemContent).toContain('placement-emission are compiler fixes');
    expect(systemContent).toContain('spec.fixClass = "compiler"');
    expect(systemContent).toContain('do not emit a registry');
    expect(systemContent).toContain('guardrail acceptance criterion');
    expect(systemContent).toContain('explicitly refer to wells');
    expect(systemContent).toContain('labwareAdditions is an internal resolve_labware pass output');
    expect(systemContent).toContain('Deck setup is not');
    expect(systemContent).toContain('place_labware event');
    expect(systemContent).toContain('prefer asserting deckLayoutPlan.pinned');
    expect(systemContent).toContain('Do not invent event fields like type');
    expect(systemContent).toContain('Do not invent labwareId/deckSlot keys under deckLayoutPlan.pinned');
    expect(systemContent).toContain('use fully resolvable nouns');
  });

  it('strips markdown fences around the JSON response', async () => {
    const llmJson = {
      spec: { title: 't', fixClass: 'data-only', rationale: 'r', ownedFiles: [], acceptance: [] },
      fixture: { description: 'd', input: { prompt: 'p' }, expected: { outcome: 'complete' } },
    };
    const fencedContent = '```json\n' + JSON.stringify(llmJson) + '\n```';

    const client = {
      complete: vi.fn().mockResolvedValue({
        id: 'mock',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: fencedContent },
          finish_reason: 'stop',
        }],
      }),
      completeStream: vi.fn(),
    } as unknown as InferenceClient;

    const handlers = createEventEditorFixHandlers({ clientFactory: () => client });
    const reply = makeFastifyReply();
    const result = await handlers.synthesizeSpec(
      makeFastifyRequest({ seed: makeSeed(), history: [] }),
      reply as never,
    );
    if ('error' in result) throw new Error(`expected success, got: ${result.message}`);
    expect((parseYaml(result.specYaml) as { title: string }).title).toBe('t');
  });

  it('returns an error envelope when the LLM emits non-JSON', async () => {
    const client = {
      complete: vi.fn().mockResolvedValue({
        id: 'mock',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'this is not json' },
          finish_reason: 'stop',
        }],
      }),
      completeStream: vi.fn(),
    } as unknown as InferenceClient;

    const handlers = createEventEditorFixHandlers({ clientFactory: () => client });
    const reply = makeFastifyReply();
    const result = await handlers.synthesizeSpec(
      makeFastifyRequest({ seed: makeSeed(), history: [] }),
      reply as never,
    );
    expect('error' in result).toBe(true);
  });
});

describe('EventEditorFixHandlers.applyFixStream', () => {
  it('writes fixture + spec, runs the coder with autoCommit:false, then commits on critic pass', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fixit-apply-'));
    try {
      const runCoderPatch = vi.fn(async (input: { artifactRoot: string; repoRoot: string; protocolId: string; variant: string; forcedSpecPath: string }) => {
        return {
          status: 'applied' as const,
          resultPath: join(input.artifactRoot, 'result.yaml'),
          message: 'patch applied',
          touchedFiles: ['server/src/foo.ts'],
        };
      });
      const runPatchCritic = vi.fn(async () => ({
        kind: 'protocol-foundry-critic-report' as const,
        protocolId: 'event-editor-fixit',
        variant: 'manual_tubes',
        generated_at: '2026-05-16T00:00:00Z',
        verdict: 'pass' as const,
        reportPath: '/tmp/report.yaml',
        reviewDurationMs: 1,
        message: 'patch matches the spec acceptance criteria',
        notes: [],
        touchedFiles: ['server/src/foo.ts'],
        specVerification: {
          accepted: true,
          criteriaMet: ['criterion-1'],
          criteriaFailed: [],
          notes: [],
        },
      }));
      const gitOps = {
        commit: vi.fn(async (_files: string[], _title: string) => 'deadbeef'),
        reset: vi.fn(async (_files: string[]) => undefined),
      };

      const handlers = createEventEditorFixHandlers({
        workspaceRoot: tmp,
        clientFactory: () => ({ complete: vi.fn(), completeStream: vi.fn() } as unknown as InferenceClient),
        runCoderPatch: runCoderPatch as never,
        runPatchCritic: runPatchCritic as never,
        gitOps,
      });

      const reply = makeFastifyReply();
      await handlers.applyFixStream(
        makeFastifyRequest({
          specYaml: 'id: spec-fix-X\ntitle: Recognize lowercase slot tokens\nfixClass: compiler\n',
          fixtureYaml: 'name: spec-fix-X\ninput:\n  prompt: x\n',
          specId: 'spec-fix-X',
          fixturePath: 'server/src/compiler/pipeline/fixtures/spec-fix-X.yaml',
        }),
        reply as never,
      );

      // Fixture was written into the source tree (under tmp).
      const fixtureContents = await readFile(
        join(tmp, 'server/src/compiler/pipeline/fixtures/spec-fix-X.yaml'),
        'utf-8',
      );
      expect(fixtureContents).toContain('name: spec-fix-X');

      // Spec was written into the artifact queue.
      const patchSpecPath = join(
        tmp,
        'artifacts/event-editor-fixit/patch-specs/event-editor-fixit/manual_tubes/spec-fix-X.yaml',
      );
      const specContents = await readFile(patchSpecPath, 'utf-8');
      expect(specContents).toContain('id: spec-fix-X');

      // Coder was called with autoCommit:false so the handler can defer
      // the commit until the critic has weighed in.
      expect(runCoderPatch).toHaveBeenCalledTimes(1);
      const call = runCoderPatch.mock.calls[0]![0];
      expect(call.protocolId).toBe('event-editor-fixit');
      expect(call.variant).toBe('manual_tubes');
      expect(call.forcedSpecPath).toBe(patchSpecPath);
      expect((call as { coderRole: string }).coderRole).toBe('junior');
      expect((call as { coderEngine: string }).coderEngine).toBe('tool-agent');
      expect((call as { autoCommit: boolean }).autoCommit).toBe(false);

      // Critic ran exactly once (pass verdict, no senior retry).
      expect(runPatchCritic).toHaveBeenCalledTimes(1);

      // Pass verdict → commit; reset must NOT fire.
      expect(gitOps.commit).toHaveBeenCalledTimes(1);
      expect(gitOps.reset).not.toHaveBeenCalled();
      expect(gitOps.commit.mock.calls[0]![0]).toEqual(['server/src/foo.ts']);
      expect(gitOps.commit.mock.calls[0]![1]).toBe('Recognize lowercase slot tokens');

      // SSE stream surfaced the expected stages and a done event with
      // the critic summary + commit SHA attached.
      const events = parseSseDataLines(reply._stats().writeChunks);
      const stageNames = events
        .filter((e): e is { type: 'stage'; stage: string } => (e as { type?: string }).type === 'stage')
        .map((e) => e.stage);
      expect(stageNames).toEqual([
        'writing_fixture',
        'writing_spec',
        'coder_running',
        'critic_running',
      ]);
      const done = events.find((e): e is {
        type: 'done';
        result: {
          status: string;
          touchedFiles: string[];
          commit?: string;
          critic?: { verdict: string; criteriaMet: string[]; seniorRetryRan: boolean };
        };
      } => (e as { type?: string }).type === 'done');
      expect(done?.result.status).toBe('applied');
      expect(done?.result.touchedFiles).toEqual(['server/src/foo.ts']);
      expect(done?.result.commit).toBe('deadbeef');
      expect(done?.result.critic?.verdict).toBe('pass');
      expect(done?.result.critic?.criteriaMet).toEqual(['criterion-1']);
      expect(done?.result.critic?.seniorRetryRan).toBe(false);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('escalates to the senior coder when the critic asks for revision', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fixit-senior-'));
    try {
      const seenCoderRoles: string[] = [];
      const seenAutoCommit: boolean[] = [];
      const runCoderPatch = vi.fn(async (input: {
        artifactRoot: string;
        coderRole?: string;
        revisionFeedback?: string;
        autoCommit?: boolean;
      }) => {
        seenCoderRoles.push(input.coderRole ?? '');
        seenAutoCommit.push(input.autoCommit ?? false);
        return {
          status: 'applied' as const,
          resultPath: join(input.artifactRoot, 'result.yaml'),
          message: input.coderRole === 'senior' ? 'senior patch applied' : 'junior patch applied',
          touchedFiles:
            input.coderRole === 'senior' ? ['server/src/bar.ts'] : ['server/src/foo.ts'],
        };
      });
      let criticCall = 0;
      const runPatchCritic = vi.fn(async () => {
        criticCall += 1;
        // First critic asks for revision (junior was insufficient); second
        // critic blesses the senior's patch.
        if (criticCall === 1) {
          return {
            kind: 'protocol-foundry-critic-report' as const,
            protocolId: 'event-editor-fixit',
            variant: 'manual_tubes',
            generated_at: '2026-05-16T00:00:00Z',
            verdict: 'revision' as const,
            reportPath: '/tmp/report.yaml',
            reviewDurationMs: 1,
            message: 'spec acceptance partially met',
            notes: [],
            touchedFiles: ['server/src/foo.ts'],
            specVerification: {
              accepted: false,
              criteriaMet: [],
              criteriaFailed: ['criterion-1'],
              notes: [],
            },
            revisionFeedback: 'be more explicit about case-insensitive regex',
          };
        }
        return {
          kind: 'protocol-foundry-critic-report' as const,
          protocolId: 'event-editor-fixit',
          variant: 'manual_tubes',
          generated_at: '2026-05-16T00:00:01Z',
          verdict: 'pass' as const,
          reportPath: '/tmp/report.yaml',
          reviewDurationMs: 1,
          message: 'senior patch matches the spec',
          notes: [],
          touchedFiles: ['server/src/bar.ts'],
          specVerification: {
            accepted: true,
            criteriaMet: ['criterion-1'],
            criteriaFailed: [],
            notes: [],
          },
        };
      });
      const gitOps = {
        commit: vi.fn(async (_files: string[], _title: string) => 'cafebabe'),
        reset: vi.fn(async (_files: string[]) => undefined),
      };

      const handlers = createEventEditorFixHandlers({
        workspaceRoot: tmp,
        clientFactory: () => ({ complete: vi.fn(), completeStream: vi.fn() } as unknown as InferenceClient),
        runCoderPatch: runCoderPatch as never,
        runPatchCritic: runPatchCritic as never,
        gitOps,
      });

      const reply = makeFastifyReply();
      await handlers.applyFixStream(
        makeFastifyRequest({
          specYaml: 'id: spec-fix-Y\n',
          fixtureYaml: 'name: spec-fix-Y\ninput:\n  prompt: y\n',
          specId: 'spec-fix-Y',
          fixturePath: 'server/src/compiler/pipeline/fixtures/spec-fix-Y.yaml',
        }),
        reply as never,
      );

      // Two coder invocations: junior first, then senior with the
      // critic's revision feedback piped through. Both with
      // autoCommit:false so the handler controls the merge.
      expect(seenCoderRoles).toEqual(['junior', 'senior']);
      expect(seenAutoCommit).toEqual([false, false]);
      const seniorCall = runCoderPatch.mock.calls[1]![0];
      expect((seniorCall as { coderEngine?: string }).coderEngine).toBe('tool-agent');
      expect((seniorCall as { revisionFeedback?: string }).revisionFeedback).toBe(
        'be more explicit about case-insensitive regex',
      );
      // Two critic invocations: once after junior, once after senior.
      expect(runPatchCritic).toHaveBeenCalledTimes(2);

      // Final critic verdict is 'pass' → commit once with the union of
      // both passes' touched files. No reset.
      expect(gitOps.commit).toHaveBeenCalledTimes(1);
      expect(gitOps.reset).not.toHaveBeenCalled();
      expect(gitOps.commit.mock.calls[0]![0].sort()).toEqual(
        ['server/src/bar.ts', 'server/src/foo.ts'].sort(),
      );

      const events = parseSseDataLines(reply._stats().writeChunks);
      const stageNames = events
        .filter((e): e is { type: 'stage'; stage: string } => (e as { type?: string }).type === 'stage')
        .map((e) => e.stage);
      expect(stageNames).toEqual([
        'writing_fixture',
        'writing_spec',
        'coder_running',
        'critic_running',
        'senior_retry',
        'critic_running',
      ]);

      const done = events.find((e): e is {
        type: 'done';
        result: {
          status: string;
          touchedFiles: string[];
          commit?: string;
          critic?: { verdict: string; seniorRetryRan: boolean };
        };
      } => (e as { type?: string }).type === 'done');
      expect(done?.result.touchedFiles?.sort()).toEqual(
        ['server/src/bar.ts', 'server/src/foo.ts'].sort(),
      );
      expect(done?.result.commit).toBe('cafebabe');
      expect(done?.result.critic?.verdict).toBe('pass');
      expect(done?.result.critic?.seniorRetryRan).toBe(true);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('surfaces needs-revision when the senior patch still fails critic regression tests', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fixit-senior-revision-'));
    try {
      const runCoderPatch = vi.fn(async (input: { artifactRoot: string; coderRole?: string }) => ({
        status: 'applied' as const,
        resultPath: join(input.artifactRoot, 'result.yaml'),
        message: 'patch applied',
        touchedFiles:
          input.coderRole === 'senior' ? ['server/src/bar.ts'] : ['server/src/foo.ts'],
      }));
      const runPatchCritic = vi.fn(async () => ({
        kind: 'protocol-foundry-critic-report' as const,
        protocolId: 'event-editor-fixit',
        variant: 'manual_tubes',
        generated_at: '2026-05-16T00:00:00Z',
        verdict: 'revision' as const,
        reportPath: '/tmp/report.yaml',
        reviewDurationMs: 1,
        message: 'regression fixture still fails',
        notes: [],
        touchedFiles: ['server/src/foo.ts'],
        specVerification: {
          accepted: false,
          criteriaMet: ['criterion-1'],
          criteriaFailed: ['Regression test failed: fixture'],
          notes: [],
        },
        revisionFeedback: 'fixture still fails',
      }));
      const gitOps = {
        commit: vi.fn(),
        reset: vi.fn(async (_files: string[]) => undefined),
      };

      const handlers = createEventEditorFixHandlers({
        workspaceRoot: tmp,
        clientFactory: () => ({ complete: vi.fn(), completeStream: vi.fn() } as unknown as InferenceClient),
        runCoderPatch: runCoderPatch as never,
        runPatchCritic: runPatchCritic as never,
        gitOps,
      });

      const reply = makeFastifyReply();
      await handlers.applyFixStream(
        makeFastifyRequest({
          specYaml: 'id: spec-fix-R\ntitle: still failing\n',
          fixtureYaml: 'name: spec-fix-R\ninput:\n  prompt: r\n',
          specId: 'spec-fix-R',
          fixturePath: 'server/src/compiler/pipeline/fixtures/spec-fix-R.yaml',
        }),
        reply as never,
      );

      expect(runCoderPatch).toHaveBeenCalledTimes(2);
      expect(runPatchCritic).toHaveBeenCalledTimes(2);
      expect(gitOps.commit).not.toHaveBeenCalled();
      expect(gitOps.reset).toHaveBeenCalledTimes(1);
      expect(gitOps.reset.mock.calls[0]![0].sort()).toEqual(
        ['server/src/bar.ts', 'server/src/foo.ts'].sort(),
      );

      const events = parseSseDataLines(reply._stats().writeChunks);
      const done = events.find((e): e is {
        type: 'done';
        result: { status: string; message: string; commit?: string; critic?: { verdict: string; seniorRetryRan: boolean } };
      } => (e as { type?: string }).type === 'done');
      expect(done?.result.status).toBe('needs-revision');
      expect(done?.result.message).toBe('regression fixture still fails');
      expect(done?.result.commit).toBeUndefined();
      expect(done?.result.critic?.verdict).toBe('revision');
      expect(done?.result.critic?.seniorRetryRan).toBe(true);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('escalates to the senior coder when the junior tool-agent needs human help', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fixit-needs-human-senior-'));
    try {
      const seenCoderRoles: string[] = [];
      const runCoderPatch = vi.fn(async (input: { artifactRoot: string; coderRole?: string; revisionFeedback?: string }) => {
        seenCoderRoles.push(input.coderRole ?? '');
        if (input.coderRole === 'junior') {
          return {
            status: 'needs-human' as const,
            resultPath: join(input.artifactRoot, 'result.yaml'),
            message: 'tool agent did not complete: max-turns',
            touchedFiles: [],
          };
        }
        expect(input.revisionFeedback).toContain('Junior coder did not produce an accepted patch');
        expect(input.revisionFeedback).toContain('max-turns');
        return {
          status: 'applied' as const,
          resultPath: join(input.artifactRoot, 'result.yaml'),
          message: 'senior patch applied',
          touchedFiles: ['server/src/senior.ts'],
        };
      });
      const runPatchCritic = vi.fn(async () => ({
        kind: 'protocol-foundry-critic-report' as const,
        protocolId: 'event-editor-fixit',
        variant: 'manual_tubes',
        generated_at: '2026-05-16T00:00:00Z',
        verdict: 'pass' as const,
        reportPath: '/tmp/report.yaml',
        reviewDurationMs: 1,
        message: 'senior patch passes',
        notes: [],
        touchedFiles: ['server/src/senior.ts'],
        specVerification: {
          accepted: true,
          criteriaMet: ['criterion-1'],
          criteriaFailed: [],
          notes: [],
        },
      }));
      const gitOps = {
        commit: vi.fn(async (_files: string[], _title: string) => 'facefeed'),
        reset: vi.fn(async (_files: string[]) => undefined),
      };

      const handlers = createEventEditorFixHandlers({
        workspaceRoot: tmp,
        clientFactory: () => ({ complete: vi.fn(), completeStream: vi.fn() } as unknown as InferenceClient),
        runCoderPatch: runCoderPatch as never,
        runPatchCritic: runPatchCritic as never,
        gitOps,
      });

      const reply = makeFastifyReply();
      await handlers.applyFixStream(
        makeFastifyRequest({
          specYaml: 'id: spec-fix-H\ntitle: senior after needs-human\n',
          fixtureYaml: 'name: spec-fix-H\ninput:\n  prompt: h\n',
          specId: 'spec-fix-H',
          fixturePath: 'server/src/compiler/pipeline/fixtures/spec-fix-H.yaml',
        }),
        reply as never,
      );

      expect(seenCoderRoles).toEqual(['junior', 'senior']);
      expect(runPatchCritic).toHaveBeenCalledTimes(1);
      expect(gitOps.commit).toHaveBeenCalledTimes(1);
      expect(gitOps.reset).not.toHaveBeenCalled();

      const events = parseSseDataLines(reply._stats().writeChunks);
      const stageNames = events
        .filter((e): e is { type: 'stage'; stage: string } => (e as { type?: string }).type === 'stage')
        .map((e) => e.stage);
      expect(stageNames).toEqual([
        'writing_fixture',
        'writing_spec',
        'coder_running',
        'senior_retry',
        'critic_running',
      ]);
      const done = events.find((e): e is {
        type: 'done';
        result: { status: string; commit?: string; critic?: { verdict: string; seniorRetryRan: boolean } };
      } => (e as { type?: string }).type === 'done');
      expect(done?.result.status).toBe('applied');
      expect(done?.result.commit).toBe('facefeed');
      expect(done?.result.critic?.verdict).toBe('pass');
      expect(done?.result.critic?.seniorRetryRan).toBe(true);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('resets the working tree when the critic blocks the patch', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fixit-block-'));
    try {
      const runCoderPatch = vi.fn(async (input: { artifactRoot: string }) => ({
        status: 'applied' as const,
        resultPath: join(input.artifactRoot, 'result.yaml'),
        message: 'patch applied (uncommitted)',
        touchedFiles: ['server/src/baz.ts'],
      }));
      const runPatchCritic = vi.fn(async () => ({
        kind: 'protocol-foundry-critic-report' as const,
        protocolId: 'event-editor-fixit',
        variant: 'manual_tubes',
        generated_at: '2026-05-16T00:00:00Z',
        verdict: 'block' as const,
        reportPath: '/tmp/report.yaml',
        reviewDurationMs: 1,
        message: 'spec is malformed; cannot accept patch',
        notes: [],
        touchedFiles: ['server/src/baz.ts'],
        specVerification: {
          accepted: false,
          criteriaMet: [],
          criteriaFailed: ['criterion-1'],
          notes: [],
        },
      }));
      const gitOps = {
        commit: vi.fn(),
        reset: vi.fn(async (_files: string[]) => undefined),
      };

      const handlers = createEventEditorFixHandlers({
        workspaceRoot: tmp,
        clientFactory: () => ({ complete: vi.fn(), completeStream: vi.fn() } as unknown as InferenceClient),
        runCoderPatch: runCoderPatch as never,
        runPatchCritic: runPatchCritic as never,
        gitOps,
      });

      const reply = makeFastifyReply();
      await handlers.applyFixStream(
        makeFastifyRequest({
          specYaml: 'id: spec-fix-B\ntitle: bad patch\n',
          fixtureYaml: 'name: spec-fix-B\ninput:\n  prompt: q\n',
          specId: 'spec-fix-B',
          fixturePath: 'server/src/compiler/pipeline/fixtures/spec-fix-B.yaml',
        }),
        reply as never,
      );

      // Block verdict → reset, no commit. Senior retry must NOT fire
      // (block is terminal; only revision triggers escalation).
      expect(runCoderPatch).toHaveBeenCalledTimes(1);
      expect(runPatchCritic).toHaveBeenCalledTimes(1);
      expect(gitOps.commit).not.toHaveBeenCalled();
      expect(gitOps.reset).toHaveBeenCalledTimes(1);
      expect(gitOps.reset.mock.calls[0]![0]).toEqual(['server/src/baz.ts']);

      const events = parseSseDataLines(reply._stats().writeChunks);
      const done = events.find((e): e is {
        type: 'done';
        result: { status: string; commit?: string; critic?: { verdict: string } };
      } => (e as { type?: string }).type === 'done');
      expect(done?.result.status).toBe('blocked');
      expect(done?.result.commit).toBeUndefined();
      expect(done?.result.critic?.verdict).toBe('block');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('skips the critic when the coder did not apply a patch', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fixit-noapply-'));
    try {
      const runCoderPatch = vi.fn(async (input: { artifactRoot: string }) => ({
        status: 'blocked' as const,
        resultPath: join(input.artifactRoot, 'result.yaml'),
        message: 'coder produced no patch',
        touchedFiles: [],
      }));
      const runPatchCritic = vi.fn();

      const handlers = createEventEditorFixHandlers({
        workspaceRoot: tmp,
        clientFactory: () => ({ complete: vi.fn(), completeStream: vi.fn() } as unknown as InferenceClient),
        runCoderPatch: runCoderPatch as never,
        runPatchCritic: runPatchCritic as never,
      });

      const reply = makeFastifyReply();
      await handlers.applyFixStream(
        makeFastifyRequest({
          specYaml: 'id: spec-fix-Z\n',
          fixtureYaml: 'name: spec-fix-Z\ninput:\n  prompt: z\n',
          specId: 'spec-fix-Z',
          fixturePath: 'server/src/compiler/pipeline/fixtures/spec-fix-Z.yaml',
        }),
        reply as never,
      );

      expect(runPatchCritic).not.toHaveBeenCalled();
      const events = parseSseDataLines(reply._stats().writeChunks);
      const done = events.find((e): e is {
        type: 'done';
        result: { status: string; critic?: unknown };
      } => (e as { type?: string }).type === 'done');
      expect(done?.result.status).toBe('blocked');
      expect(done?.result.critic).toBeUndefined();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('resets the working tree and skips the done event when the client aborts', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fixit-abort-'));
    try {
      // Wire up: the moment the junior coder mock is invoked it fires the
      // response.close listener, simulating the user clicking Stop while the
      // coder was running. The handler should bail out before the critic
      // ever runs.
      let reply: { fireClose: () => void } | null = null;
      const runCoderPatch = vi.fn(async (input: { artifactRoot: string }) => {
        reply?.fireClose();
        return {
          status: 'applied' as const,
          resultPath: join(input.artifactRoot, 'result.yaml'),
          message: 'junior patch (will be aborted)',
          touchedFiles: ['server/src/aborted.ts'],
        };
      });
      const runPatchCritic = vi.fn();
      const gitOps = {
        commit: vi.fn(),
        reset: vi.fn(async (_files: string[]) => undefined),
      };

      const handlers = createEventEditorFixHandlers({
        workspaceRoot: tmp,
        clientFactory: () => ({ complete: vi.fn(), completeStream: vi.fn() } as unknown as InferenceClient),
        runCoderPatch: runCoderPatch as never,
        runPatchCritic: runPatchCritic as never,
        gitOps,
      });

      const replyObj = makeFastifyReply();
      reply = replyObj;
      const req = makeFastifyRequest({
        specYaml: 'id: spec-fix-A\ntitle: aborted run\n',
        fixtureYaml: 'name: spec-fix-A\ninput:\n  prompt: q\n',
        specId: 'spec-fix-A',
        fixturePath: 'server/src/compiler/pipeline/fixtures/spec-fix-A.yaml',
      });
      await handlers.applyFixStream(req as never, replyObj as never);

      // Critic never ran (abort fired between coder and critic).
      expect(runPatchCritic).not.toHaveBeenCalled();
      // Commit never happened; reset cleaned up the junior's edits.
      expect(gitOps.commit).not.toHaveBeenCalled();
      expect(gitOps.reset).toHaveBeenCalledTimes(1);
      expect(gitOps.reset.mock.calls[0]![0]).toEqual(['server/src/aborted.ts']);

      // No 'done' event surfaces — the connection is gone.
      const events = parseSseDataLines(replyObj._stats().writeChunks);
      const done = events.find((e) => (e as { type?: string }).type === 'done');
      expect(done).toBeUndefined();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('rejects fixture paths outside the fixtures directory', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fixit-apply-bad-'));
    try {
      const runCoderPatch = vi.fn();
      const handlers = createEventEditorFixHandlers({
        workspaceRoot: tmp,
        clientFactory: () => ({ complete: vi.fn(), completeStream: vi.fn() } as unknown as InferenceClient),
        runCoderPatch: runCoderPatch as never,
      });

      const reply = makeFastifyReply();
      await handlers.applyFixStream(
        makeFastifyRequest({
          specYaml: 'id: x',
          fixtureYaml: 'name: x',
          specId: 'x',
          fixturePath: 'server/src/sneaky/x.yaml',
        }),
        reply as never,
      );

      expect(runCoderPatch).not.toHaveBeenCalled();
      const events = parseSseDataLines(reply._stats().writeChunks);
      const err = events.find((e): e is { type: 'error'; message: string } =>
        (e as { type?: string }).type === 'error');
      expect(err?.message).toMatch(/fixturePath/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
