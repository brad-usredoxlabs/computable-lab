import { describe, it, expect, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { parse as parseYaml } from 'yaml';
import {
  buildDiagnosticBlock,
  createEventEditorFixHandlers,
  type FixItSeed,
} from './EventEditorFixHandlers.js';
import type { InferenceClient } from '../../ai/types.js';
import { EventEditorFixItJobManager } from '../../foundry/EventEditorFixItJobManager.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd });
  return result.stdout;
}

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

    // The canonical demo prompt is now fixed: the trace should show that the
    // deterministic compiler emits the deck slot on the labware candidate and
    // that downstream labware/deck passes preserve the placement.
    expect(block).toMatch(/candidateLabwares:[^\n]*\n\s+- hint:\s*96-well plate/);
    expect(block).toContain('deckSlot: B2');
    expect(block).toMatch(/labwareAdditions:[\s\S]*recordId:\s*lbw-def-generic-96-well-plate/);
    expect(block).toMatch(/pinned:[\s\S]*slot:\s*B2/);
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
    // Confidence calibration: the diagnosis model must know it lacks source
    // access and hedge the mechanism rather than assert a confident fix.
    expect(systemContent).toContain('You have the compiler trace, NOT the source code');
    expect(systemContent).toContain('Candidate mechanisms (unverified)');
    expect(systemContent).not.toContain('No "I think"');
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
  it('lands an approved diff from an isolated worktree when the gate reports PASS', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fixit-worktree-apply-'));
    try {
      await git(tmp, ['init']);
      await git(tmp, ['config', 'user.email', 'fixit@example.test']);
      await git(tmp, ['config', 'user.name', 'Fix It Test']);
      await mkdir(join(tmp, 'server/src'), { recursive: true });
      await writeFile(join(tmp, 'server/src/base.ts'), 'export const base = true;\n', 'utf-8');
      await git(tmp, ['add', 'server/src/base.ts']);
      await git(tmp, ['commit', '-m', 'initial']);

      let coderRepoRoot = '';
      const runCoderPatch = vi.fn(async (input: {
        artifactRoot: string;
        repoRoot: string;
      }) => {
        coderRepoRoot = input.repoRoot;
        await mkdir(join(input.repoRoot, 'server/src'), { recursive: true });
        await writeFile(join(input.repoRoot, 'server/src/foo.ts'), 'export const foo = 1;\n', 'utf-8');
        return {
          status: 'applied' as const,
          resultPath: join(input.artifactRoot, 'result.yaml'),
          message: 'patch applied in worktree',
          touchedFiles: ['server/src/foo.ts'],
        };
      });
      // Gate reports the fixture fully satisfied → PASS → land.
      const verifyFixtures = vi.fn(async () => ({
        target: { name: 'spec-fix-W', passed: true, missing: [], partial: [], matched: ['outcome'] },
        suite: [] as Array<{ name: string; passed: boolean }>,
      }));

      const handlers = createEventEditorFixHandlers({
        workspaceRoot: tmp,
        clientFactory: () => ({ complete: vi.fn(), completeStream: vi.fn() } as unknown as InferenceClient),
        runCoderPatch: runCoderPatch as never,
        verifyFixtures: verifyFixtures as never,
      });

      const reply = makeFastifyReply();
      await handlers.applyFixStream(
        makeFastifyRequest({
          specYaml: 'id: spec-fix-W\ntitle: worktree landing\nfixClass: compiler\n',
          fixtureYaml: 'name: spec-fix-W\ninput:\n  prompt: worktree prompt\n',
          specId: 'spec-fix-W',
          fixturePath: 'server/src/compiler/pipeline/fixtures/spec-fix-W.yaml',
          fixItSessionId: 'fix-session-worktree',
          sessionSnapshot: {
            seed: { prompt: 'worktree prompt', fixItSessionId: 'fix-session-worktree' },
            chat: [{ role: 'assistant', content: 'worktree diagnosis' }],
            stage: 'applying',
          },
        }),
        reply as never,
      );

      expect(coderRepoRoot).not.toBe(tmp);
      expect(coderRepoRoot).toContain('.fixit-worktrees');
      await expect(readFile(join(tmp, 'server/src/foo.ts'), 'utf-8')).resolves.toContain('foo = 1');
      // Junior only — a PASS on round 1 never escalates to senior.
      expect(runCoderPatch.mock.calls.every((c) => (c[0] as { coderRole?: string }).coderRole === 'junior')).toBe(true);

      const events = parseSseDataLines(reply._stats().writeChunks);
      const jobProgress = events.find((e): e is {
        type: 'progress';
        phase: string;
        details?: { id?: string; worktreePath?: string };
      } => (e as { type?: string }).type === 'progress' && (e as { phase?: string }).phase === 'job_started');
      expect(jobProgress?.details?.id).toBeDefined();
      expect(jobProgress?.details?.worktreePath).toBe(coderRepoRoot);
      const eventLog = await readFile(
        join(tmp, 'artifacts/event-editor-fixit/jobs', jobProgress!.details!.id!, 'events.jsonl'),
        'utf-8',
      );
      expect(eventLog).toContain('"phase":"junior_started"');
      expect(eventLog).toContain('"phase":"committed"');
      expect(existsSync(coderRepoRoot)).toBe(false);

      const done = events.find((e): e is {
        type: 'done';
        result: { status: string; commit?: string; job?: { id: string; worktreePath?: string } };
      } => (e as { type?: string }).type === 'done');
      expect(done?.result.status).toBe('applied');
      expect(done?.result.commit).toBeDefined();
      const log = await git(tmp, ['log', '-1', '--pretty=%s']);
      expect(log.trim()).toBe('Event-editor fix-it: worktree landing');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('commits a fix when the gate reports PASS (junior only, no senior)', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fixit-apply-'));
    try {
      const runCoderPatch = vi.fn(async (input: { artifactRoot: string }) => ({
        status: 'applied' as const,
        resultPath: join(input.artifactRoot, 'result.yaml'),
        message: 'patch applied',
        touchedFiles: ['server/src/foo.ts'],
      }));
      const gitOps = {
        commit: vi.fn(async (_files: string[], _title: string) => 'deadbeef'),
        reset: vi.fn(async (_files: string[]) => undefined),
      };
      const verifyFixtures = vi.fn(async () => ({
        target: { name: 'spec-fix-X', passed: true, missing: [], partial: [], matched: ['outcome'] },
        suite: [] as Array<{ name: string; passed: boolean }>,
      }));

      const handlers = createEventEditorFixHandlers({
        workspaceRoot: tmp,
        clientFactory: () => ({ complete: vi.fn(), completeStream: vi.fn() } as unknown as InferenceClient),
        runCoderPatch: runCoderPatch as never,
        gitOps,
        fixItJobManager: null,
        verifyFixtures: verifyFixtures as never,
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

      // Fixture + spec written into the (tmp) tree.
      expect(await readFile(join(tmp, 'server/src/compiler/pipeline/fixtures/spec-fix-X.yaml'), 'utf-8')).toContain('name: spec-fix-X');

      // One junior crack, autoCommit:false.
      expect(runCoderPatch).toHaveBeenCalledTimes(1);
      const call = runCoderPatch.mock.calls[0]![0] as { coderRole?: string; coderEngine?: string; autoCommit?: boolean };
      expect(call.coderRole).toBe('junior');
      expect(call.coderEngine).toBe('tool-agent');
      expect(call.autoCommit).toBe(false);

      // Gate PASS → commit, no reset.
      expect(gitOps.commit).toHaveBeenCalledTimes(1);
      expect(gitOps.reset).not.toHaveBeenCalled();
      expect(gitOps.commit.mock.calls[0]![0]).toEqual(['server/src/foo.ts']);
      expect(gitOps.commit.mock.calls[0]![1]).toBe('Recognize lowercase slot tokens');

      const events = parseSseDataLines(reply._stats().writeChunks);
      const done = events.find((e): e is {
        type: 'done';
        result: { status: string; touchedFiles: string[]; commit?: string; critic?: { verdict: string } };
      } => (e as { type?: string }).type === 'done');
      expect(done?.result.status).toBe('applied');
      expect(done?.result.touchedFiles).toEqual(['server/src/foo.ts']);
      expect(done?.result.commit).toBe('deadbeef');
      expect(done?.result.critic?.verdict).toBe('pass');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('retries the junior on STUCK, escalates to the senior after 2 stuck rounds, then to human', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fixit-stuck-escalate-'));
    try {
      const seenRoles: string[] = [];
      const runCoderPatch = vi.fn(async (input: { artifactRoot: string; coderRole?: string }) => {
        seenRoles.push(input.coderRole ?? '');
        return {
          status: 'applied' as const,
          resultPath: join(input.artifactRoot, 'result.yaml'),
          message: 'patch applied',
          touchedFiles: ['server/src/foo.ts'],
        };
      });
      const gitOps = {
        commit: vi.fn(),
        reset: vi.fn(async (_files: string[]) => undefined),
      };
      // Always STUCK: baseline === post (same missing path, no progress).
      const verifyFixtures = vi.fn(async () => ({
        target: { name: 'spec-fix-S', passed: false, missing: ['a'], partial: [], matched: [] },
        suite: [] as Array<{ name: string; passed: boolean }>,
      }));

      const handlers = createEventEditorFixHandlers({
        workspaceRoot: tmp,
        clientFactory: () => ({ complete: vi.fn(), completeStream: vi.fn() } as unknown as InferenceClient),
        runCoderPatch: runCoderPatch as never,
        gitOps,
        fixItJobManager: null,
        verifyFixtures: verifyFixtures as never,
        maxRounds: 3,
      });

      const reply = makeFastifyReply();
      await handlers.applyFixStream(
        makeFastifyRequest({
          specYaml: 'id: spec-fix-S\ntitle: stuck\n',
          fixtureYaml: 'name: spec-fix-S\ninput:\n  prompt: s\n',
          specId: 'spec-fix-S',
          fixturePath: 'server/src/compiler/pipeline/fixtures/spec-fix-S.yaml',
        }),
        reply as never,
      );

      // SENIOR_AFTER=2: junior, junior, senior — then a stuck senior ends it.
      expect(seenRoles).toEqual(['junior', 'junior', 'senior']);
      const seniorCall = runCoderPatch.mock.calls[2]![0] as { coderRole?: string; seniorEndpoint?: string };
      expect(seniorCall.coderRole).toBe('senior');
      expect(seniorCall.seniorEndpoint).toBe('worker');
      // Nothing landed; each stuck round discarded its edits.
      expect(gitOps.commit).not.toHaveBeenCalled();
      expect(gitOps.reset).toHaveBeenCalledTimes(3);
      const events = parseSseDataLines(reply._stats().writeChunks);
      const done = events.find((e): e is { type: 'done'; result: { status: string } } =>
        (e as { type?: string }).type === 'done');
      expect(done?.result.status).toBe('needs-human');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('lands a fix when an escalated senior round finally makes the fixture pass', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fixit-senior-lands-'));
    try {
      const seenRoles: string[] = [];
      const runCoderPatch = vi.fn(async (input: { artifactRoot: string; coderRole?: string }) => {
        seenRoles.push(input.coderRole ?? '');
        return {
          status: 'applied' as const,
          resultPath: join(input.artifactRoot, 'result.yaml'),
          message: 'patch applied',
          touchedFiles: ['server/src/foo.ts'],
        };
      });
      const gitOps = {
        commit: vi.fn(async (_files: string[], _title: string) => 'sen10r'),
        reset: vi.fn(async (_files: string[]) => undefined),
      };
      // Calls: r1 baseline/post (stuck), r2 baseline/post (stuck), r3 baseline/post (PASS).
      const missingByCall: Record<number, string[]> = { 1: ['a'], 2: ['a'], 3: ['a'], 4: ['a'], 5: ['a'], 6: [] };
      let call = 0;
      const verifyFixtures = vi.fn(async () => {
        call += 1;
        const missing = missingByCall[call] ?? [];
        return {
          target: { name: 'spec-fix-SL', passed: missing.length === 0, missing, partial: [], matched: [] },
          suite: [] as Array<{ name: string; passed: boolean }>,
        };
      });

      const handlers = createEventEditorFixHandlers({
        workspaceRoot: tmp,
        clientFactory: () => ({ complete: vi.fn(), completeStream: vi.fn() } as unknown as InferenceClient),
        runCoderPatch: runCoderPatch as never,
        gitOps,
        fixItJobManager: null,
        verifyFixtures: verifyFixtures as never,
        maxRounds: 4,
      });

      const reply = makeFastifyReply();
      await handlers.applyFixStream(
        makeFastifyRequest({
          specYaml: 'id: spec-fix-SL\ntitle: senior lands\n',
          fixtureYaml: 'name: spec-fix-SL\ninput:\n  prompt: sl\n',
          specId: 'spec-fix-SL',
          fixturePath: 'server/src/compiler/pipeline/fixtures/spec-fix-SL.yaml',
        }),
        reply as never,
      );

      expect(seenRoles).toEqual(['junior', 'junior', 'senior']);
      expect(gitOps.commit).toHaveBeenCalledTimes(1);
      const done = parseSseDataLines(reply._stats().writeChunks).find((e): e is { type: 'done'; result: { status: string; commit?: string } } =>
        (e as { type?: string }).type === 'done');
      expect(done?.result.status).toBe('applied');
      expect(done?.result.commit).toBe('sen10r');
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

  it('lands incremental progress across rounds, committing each verified step', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fixit-rounds-'));
    try {
      const runCoderPatch = vi.fn(async (input: { artifactRoot: string }) => ({
        status: 'applied' as const,
        resultPath: join(input.artifactRoot, 'result.yaml'),
        message: 'patch applied',
        touchedFiles: ['server/src/compiler/pipeline/passes/DeterministicPrecompilePass.ts'],
      }));
      // Critic never reports a full pass, so the verified gate decides.
      const runPatchCritic = vi.fn(async () => ({
        kind: 'protocol-foundry-critic-report' as const,
        protocolId: 'event-editor-fixit',
        variant: 'manual_tubes',
        generated_at: '2026-05-21T00:00:00Z',
        verdict: 'block' as const,
        reportPath: '/tmp/r.yaml',
        reviewDurationMs: 1,
        message: 'fixture still failing',
        notes: [],
        touchedFiles: ['server/src/compiler/pipeline/passes/DeterministicPrecompilePass.ts'],
        specVerification: { accepted: false, criteriaMet: [], criteriaFailed: ['x'], notes: [] },
      }));
      const gitOps = {
        commit: vi.fn(async () => `commit-${gitOps.commit.mock.calls.length}`),
        reset: vi.fn(async (_files: string[]) => undefined),
      };
      // Calls in order: r1 baseline, r1 post, r2 baseline, r2 post.
      const missingByCall: Record<number, string[]> = { 1: ['a', 'b'], 2: ['b'], 3: ['b'], 4: [] };
      let call = 0;
      const verifyFixtures = vi.fn(async () => {
        call += 1;
        const missing = missingByCall[call] ?? [];
        return {
          target: { name: 'spec-fix-R', passed: missing.length === 0, missing, partial: [], matched: [] },
          suite: [] as Array<{ name: string; passed: boolean }>,
        };
      });

      const handlers = createEventEditorFixHandlers({
        workspaceRoot: tmp,
        clientFactory: () => ({ complete: vi.fn(), completeStream: vi.fn() } as unknown as InferenceClient),
        runCoderPatch: runCoderPatch as never,
        runPatchCritic: runPatchCritic as never,
        gitOps,
        fixItJobManager: null,
        verifyFixtures: verifyFixtures as never,
        maxRounds: 3,
      });

      const reply = makeFastifyReply();
      await handlers.applyFixStream(
        makeFastifyRequest({
          specYaml: 'id: spec-fix-R\ntitle: incremental rounds\nfixClass: compiler\n',
          fixtureYaml: 'name: spec-fix-R\ninput:\n  prompt: r\n',
          specId: 'spec-fix-R',
          fixturePath: 'server/src/compiler/pipeline/fixtures/spec-fix-R.yaml',
        }),
        reply as never,
      );

      // Round 1 PROGRESS + round 2 PASS = two commits.
      expect(gitOps.commit).toHaveBeenCalledTimes(2);
      expect(gitOps.reset).not.toHaveBeenCalled();
      const events = parseSseDataLines(reply._stats().writeChunks);
      const done = events.find((e): e is { type: 'done'; result: { status: string } } =>
        (e as { type?: string }).type === 'done');
      expect(done?.result.status).toBe('applied');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

});

describe('EventEditorFixHandlers Fix-it job endpoints', () => {
  it('lists, reads, and completes durable Fix-it jobs', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fixit-job-endpoints-'));
    try {
      await git(tmp, ['init']);
      await git(tmp, ['config', 'user.email', 'fixit@example.test']);
      await git(tmp, ['config', 'user.name', 'Fix It Test']);
      await writeFile(join(tmp, 'README.md'), 'base\n', 'utf-8');
      await git(tmp, ['add', 'README.md']);
      await git(tmp, ['commit', '-m', 'initial']);

      const manager = new EventEditorFixItJobManager({
        repoRoot: tmp,
        artifactRoot: join(tmp, 'artifacts'),
        idFactory: () => 'job-endpoint',
      });
      await manager.enqueue({
        specId: 'spec-endpoint',
        prompt: 'endpoint prompt',
        sessionSnapshot: {
          seed: { prompt: 'endpoint prompt', fixItSessionId: 'fix-endpoint' },
          chat: [{ role: 'assistant', content: 'endpoint diagnosis' }],
          stage: 'applying',
        },
      });
      await manager.claimNextQueuedJob();
      await manager.completeJob('job-endpoint', {
        status: 'needs-feedback',
        message: 'waiting for user',
        result: { status: 'needs-revision', touchedFiles: ['server/src/foo.ts'] },
        releaseWorktree: false,
      });

      const handlers = createEventEditorFixHandlers({
        workspaceRoot: tmp,
        clientFactory: () => ({ complete: vi.fn(), completeStream: vi.fn() } as unknown as InferenceClient),
        fixItJobManager: manager,
      });

      const list = await handlers.listJobs(makeFastifyRequest({}) as never, makeFastifyReply() as never);
      expect(list.jobs.map((job) => job.id)).toEqual(['job-endpoint']);
      expect(list.jobs[0]?.status).toBe('needs-feedback');

      const detail = await handlers.getJob(
        { params: { id: 'job-endpoint' } } as never,
        makeFastifyReply() as never,
      );
      expect('job' in detail ? detail.job.id : '').toBe('job-endpoint');
      expect('events' in detail ? detail.events.map((event) => event.phase) : []).toContain('completed');
      expect('sessionSnapshot' in detail ? detail.sessionSnapshot?.['stage'] : '').toBe('failed');
      const applyResult = 'sessionSnapshot' in detail
        ? detail.sessionSnapshot?.['applyResult'] as { status?: string } | undefined
        : undefined;
      expect(applyResult?.status).toBe('needs-revision');
      const retainedWorktree = 'job' in detail ? detail.job.worktreePath : undefined;
      expect(retainedWorktree).toBeDefined();
      expect(existsSync(retainedWorktree!)).toBe(true);

      const completed = await handlers.completeJob(
        { params: { id: 'job-endpoint' } } as never,
        makeFastifyReply() as never,
      );
      expect('job' in completed ? completed.job.status : '').toBe('complete');
      expect(existsSync(retainedWorktree!)).toBe(false);
      expect('events' in completed ? completed.events.map((event) => event.phase) : []).toContain('marked_complete');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('startApplyFixJob returns once the job is started and keeps persisting coder/critic progress in the background', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fixit-start-job-'));
    try {
      await git(tmp, ['init']);
      await git(tmp, ['config', 'user.email', 'fixit@example.test']);
      await git(tmp, ['config', 'user.name', 'Fix It Test']);
      await mkdir(join(tmp, 'server/src'), { recursive: true });
      await writeFile(join(tmp, 'server/src/base.ts'), 'export const base = true;\n', 'utf-8');
      await git(tmp, ['add', 'server/src/base.ts']);
      await git(tmp, ['commit', '-m', 'initial']);

      // Gate the coder so the driver is still mid-run when we assert the
      // handler has already returned. If startApplyFixJob blocked on the
      // whole driver (the old bug) this test would deadlock and time out.
      let releaseCoder!: () => void;
      const coderGate = new Promise<void>((resolve) => { releaseCoder = resolve; });
      const runCoderPatch = vi.fn(async (input: { repoRoot: string; artifactRoot: string }) => {
        await coderGate;
        await mkdir(join(input.repoRoot, 'server/src'), { recursive: true });
        await writeFile(join(input.repoRoot, 'server/src/foo.ts'), 'export const foo = 1;\n', 'utf-8');
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
        generated_at: '2026-05-21T00:00:00Z',
        verdict: 'pass' as const,
        reportPath: '/tmp/report.yaml',
        reviewDurationMs: 1,
        message: 'passes',
        notes: [],
        touchedFiles: ['server/src/foo.ts'],
        specVerification: { accepted: true, criteriaMet: ['criterion-1'], criteriaFailed: [], notes: [] },
      }));
      const gitOps = {
        commit: vi.fn(async () => 'deadbeef'),
        commitFromWorktree: vi.fn(async () => 'deadbeef'),
        reset: vi.fn(async () => undefined),
      };
      const manager = new EventEditorFixItJobManager({
        repoRoot: tmp,
        artifactRoot: join(tmp, 'artifacts'),
        idFactory: () => 'job-start-test',
      });

      const verifyFixtures = vi.fn(async () => ({
        target: { name: 'spec-fix-J', passed: true, missing: [], partial: [], matched: ['outcome'] },
        suite: [] as Array<{ name: string; passed: boolean }>,
      }));
      const handlers = createEventEditorFixHandlers({
        workspaceRoot: tmp,
        clientFactory: () => ({ complete: vi.fn(), completeStream: vi.fn() } as unknown as InferenceClient),
        runCoderPatch: runCoderPatch as never,
        runPatchCritic: runPatchCritic as never,
        gitOps,
        fixItJobManager: manager,
        verifyFixtures: verifyFixtures as never,
        probeFailingPrompt: (async () => undefined) as never,
      });

      const reply = makeFastifyReply();
      const result = await handlers.startApplyFixJob(
        makeFastifyRequest({
          specYaml: 'id: spec-fix-J\ntitle: durable start\nfixClass: compiler\n',
          fixtureYaml: 'name: spec-fix-J\ninput:\n  prompt: j\n',
          specId: 'spec-fix-J',
          fixturePath: 'server/src/compiler/pipeline/fixtures/spec-fix-J.yaml',
        }),
        reply as never,
      );

      // Returned before the gated coder could finish → non-blocking.
      if ('error' in result) throw new Error(`expected job detail, got: ${result.message}`);
      expect(result.job.id).toBe('job-start-test');
      expect(result.job.status).toBe('running');
      expect(runPatchCritic).not.toHaveBeenCalled();

      // Let the background driver run to completion. Generous deadline: the
      // driver does real git worktree create/release (I/O-heavy), which slows
      // under parallel suite load — a tight 5s window was flaky in the full run.
      releaseCoder();
      const deadline = Date.now() + 20_000;
      let finalStatus = result.job.status;
      while (Date.now() < deadline) {
        const job = await manager.getJob('job-start-test');
        finalStatus = job?.status ?? finalStatus;
        if (finalStatus !== 'running' && finalStatus !== 'critic' && finalStatus !== 'queued') break;
        await new Promise((r) => setTimeout(r, 25));
      }
      // Accepted patches release the worktree, which lands the job in the
      // terminal 'complete' state (see EventEditorFixItJobManager.completeJob).
      expect(finalStatus).toBe('complete');

      // Progress was persisted to the durable event log — the channel the
      // panel tails for live feedback. Without this the job looks frozen
      // after "Created worktree".
      const phases = (await manager.readEvents('job-start-test')).map((e) => e.phase);
      expect(phases).toContain('junior_started');
      expect(phases).toContain('progress_gate');
      expect(phases).toContain('committed');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  it('streamJobEvents emits a snapshot then done for a terminal job', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'fixit-stream-events-'));
    try {
      await git(tmp, ['init']);
      await git(tmp, ['config', 'user.email', 'fixit@example.test']);
      await git(tmp, ['config', 'user.name', 'Fix It Test']);
      await writeFile(join(tmp, 'README.md'), 'base\n', 'utf-8');
      await git(tmp, ['add', 'README.md']);
      await git(tmp, ['commit', '-m', 'initial']);

      const manager = new EventEditorFixItJobManager({
        repoRoot: tmp,
        artifactRoot: join(tmp, 'artifacts'),
        idFactory: () => 'job-stream',
      });
      await manager.enqueue({ specId: 'spec-stream', prompt: 'stream prompt' });
      await manager.claimNextQueuedJob();
      await manager.completeJob('job-stream', {
        status: 'accepted',
        message: 'done',
        result: { status: 'applied', touchedFiles: [] },
      });

      const handlers = createEventEditorFixHandlers({
        workspaceRoot: tmp,
        clientFactory: () => ({ complete: vi.fn(), completeStream: vi.fn() } as unknown as InferenceClient),
        fixItJobManager: manager,
      });

      const reply = makeFastifyReply();
      const raw = { on() { return raw; }, off() { return raw; } };
      const req = {
        params: { id: 'job-stream' },
        headers: {},
        raw,
        log: { error: vi.fn(), warn: vi.fn() },
      };
      await handlers.streamJobEvents(req as never, reply as never);

      const events = parseSseDataLines(reply._stats().writeChunks);
      const snapshot = events.find((e): e is { type: 'snapshot'; job: { id: string }; events: unknown[] } =>
        (e as { type?: string }).type === 'snapshot');
      expect(snapshot?.job.id).toBe('job-stream');
      expect(events.some((e) => (e as { type?: string }).type === 'done')).toBe(true);
      expect(reply._stats().ended).toBe(true);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
