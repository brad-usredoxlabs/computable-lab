#!/usr/bin/env tsx
/**
 * SH-QA-3 mode-1 determinism replay (spec §RED "Determinism replay").
 *
 * The exact mixture prompt from the wave header, replayed N=10 times through
 * the REAL chat path: real initializeApp (the lane data repo store), the
 * active-profile inference client (live-smoke.ts construction discipline —
 * the model is NAMED AT RUN TIME from the lane config, no model/profile name
 * literal here), and the real orchestrator run on surface `workspace.deck`
 * (the shorthand drafting surface from the drafting-config DATA). ONE chain
 * per run; the route's own retries are the route's.
 *
 * BARS (per run, all N — spec §RED bars, precise not optimistic):
 *   (i)   ZERO prose-blob cards — no clarification request whose label (or
 *         unresolvedFact.label) fails the noun-shape DATA, and none with
 *         allowCreateLocal: true on such a label.
 *   (ii)  ZERO empty graphs — every run ends with events > 0 OR >= 1
 *         clarification request naming a specific blocking reason (a
 *         legitimate unknown-noun on an unseeded component is a named
 *         reason, not a prose-blob card and not an empty graph).
 *   (iii) raw model emissions RETAINED per run so non-determinism is
 *         measured, not asserted away.
 *
 * This script is EVIDENCE, not a gate (OQ4(a) precedent): exit 0 whenever all
 * runs COMPLETED and the bars hold; a completed-but-bar-failing run is
 * reported honestly in the summary, never papered over.
 *
 * Artifacts (raws untracked): server/.artifacts/shqa3-replay/<UTC-ts>/
 *   run-N.json    — per-run outcome, clarification labels, strip-log lines,
 *                   RAW model emissions verbatim
 *   summary.json  — the per-run bars + aggregate verdict (COMMITTED)
 *
 * Mode 2 (orch, post-merge, AS-SERVED): CL_REPLAY_BASE_URL=http://localhost:3093
 * POSTs the same prompt to /api/ai/assist/stream — that leg is the
 * orchestrator's; this file is the coder's in-process mode 1.
 *
 * Run: cd <wt>/server && npx tsx scripts/shqa3-mixture-replay.mts [N]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from '../src/server.js';
import { createInferenceClient } from '../src/ai/InferenceClient.js';
import { createAgentOrchestrator } from '../src/ai/AgentOrchestrator.js';
import { createResolveSpineFromContext } from '../src/resolve/index.js';
import { createLabwareLookup } from '../src/ai/compiler/labwareLookup.js';
import { loadNounShape, isMintableLabel } from '../src/compiler/resolution/nounShape.js';
import { resolveAiProfile } from '../src/config/types.js';
import type { AgentResult } from '../src/ai/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(__dirname, '..');

/** The mixture prompt VERBATIM from the wave header (task-list :7549-7551). */
const MIXTURE_PROMPT = 'Add 50uL of 50% Thermo trypsin-EDTA / 50% DMEM with 10% FBS containing 200 HepG2 cells per uL to each well.';

const N = Number(process.argv[2] ?? '10');

interface RawCall {
  toolCalls: Array<{ name: string; arguments: string }>;
  content: string | null;
}

async function main(): Promise<number> {
  // REAL app context: the lane data repo store (config.yaml dataDir), the
  // active profile resolved exactly like the production handler does.
  const ctx = await initializeApp(SERVER_DIR);
  const ai = ctx.appConfig?.ai;
  const activeProfileName = ai?.activeProfile;
  const profile = activeProfileName ? ai?.profiles?.[activeProfileName] : undefined;
  if (!activeProfileName || !profile?.inference?.baseUrl || !profile?.inference?.model) {
    console.log('shqa3-replay: NO active profile resolves in the lane config — cannot run.');
    return 1;
  }

  const inferenceConfig = profile.inference;
  const realClient = createInferenceClient(inferenceConfig);

  // Recording wrapper: forwards to the REAL client, retains the RAW emission
  // (bar (iii): non-determinism is measured, not asserted away).
  let rawCalls: RawCall[] = [];
  const record = (message: { tool_calls?: Array<{ function: { name: string; arguments: string } }>; content?: string | null }): void => {
    rawCalls.push({
      toolCalls: (message.tool_calls ?? []).map((tc) => ({ name: tc.function.name, arguments: tc.function.arguments })),
      content: typeof message.content === 'string' ? message.content : null,
    });
  };
  const recordingClient = {
    complete: async (req: Parameters<typeof realClient.complete>[0]) => {
      const response = await realClient.complete(req);
      record(response?.choices?.[0]?.message ?? {});
      return response;
    },
    completeStream: async function* (req: Parameters<typeof realClient.completeStream>[0]) {
      const toolArgs = new Map<string, { name: string; arguments: string }>();
      let content = '';
      for await (const chunk of realClient.completeStream(req)) {
        for (const choice of chunk.choices ?? []) {
          for (const tc of choice.delta?.tool_calls ?? []) {
            const slot = toolArgs.get(String(tc.index ?? 0)) ?? { name: '', arguments: '' };
            if (tc.function?.name) slot.name = tc.function.name;
            if (tc.function?.arguments) slot.arguments += tc.function.arguments;
            toolArgs.set(String(tc.index ?? 0), slot);
          }
          if (typeof choice.delta?.content === 'string') content += choice.delta.content;
        }
        yield chunk;
      }
      record({ tool_calls: [...toolArgs.values()].map((slot) => ({ function: slot })), content: content || null });
    },
  } as typeof realClient;

  // Orchestrator construction mirrors the shorthandChat test seam (store +
  // spine + labware lookup deps; the drafting surface forces the shorthand
  // intent tool via the drafting-config DATA).
  const spine = createResolveSpineFromContext({ store: ctx.store } as never);
  const orchestrator = createAgentOrchestrator(
    recordingClient,
    { getToolDefinitions: () => [], executeTool: async () => ({ content: '[]' }) },
    inferenceConfig,
    profile.agent ?? {},
    {
      store: ctx.store as never,
      resolveSpine: spine as never,
      searchLabwareByHint: createLabwareLookup(ctx.store as never) as never,
      ...(ctx.appConfig?.ai?.shadowRouter ? { shadowRouter: ctx.appConfig.ai.shadowRouter } : {}),
    },
  );

  const nounShape = loadNounShape();
  if (!nounShape) {
    console.log('shqa3-replay: nounShape DATA absent — mint refusals are OFF; bars would be vacuous. Disclosed.');
  }

  // Capture the strip's loud console.log per run (evidence the strip fired on
  // the REAL model emission, not just in tests).
  const stripLines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    const line = String(args[0] ?? '');
    if (line.startsWith('SH-QA-3 redundancy strip:')) stripLines.push(line);
    else originalLog(...args);
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const artifactDir = join(SERVER_DIR, '.artifacts', 'shqa3-replay', stamp);
  mkdirSync(artifactDir, { recursive: true });

  const runs: Array<Record<string, unknown>> = [];
  let blobCardRuns = 0;
  let emptyGraphRuns = 0;
  let stripRuns = 0;

  for (let i = 1; i <= N; i += 1) {
    rawCalls = [];
    stripLines.length = 0;
    const result: AgentResult = await orchestrator.run({
      prompt: MIXTURE_PROMPT,
      surface: 'workspace.deck',
      forceDraftTool: true,
      context: { labwares: [], eventSummary: 'No events yet.', vocabPackId: 'general', availableVerbs: [] },
    });

    const requests = result.clarificationRequests ?? [];
    // Bar (i): prose-blob card = a clarification whose label FAILS the DATA
    // shape (or a mint affordance on such a label).
    const blobCards = requests.filter((r) => {
      const label = r.unresolvedFact?.label ?? r.prompt;
      return !isMintableLabel(String(label), nounShape) || (r.allowCreateLocal === true && !isMintableLabel(String(label), nounShape));
    });
    // Bar (ii): empty graph = success-shaped with ZERO events AND zero named
    // clarification reasons.
    const events = result.events?.length ?? 0;
    const emptyGraph = events === 0 && requests.length === 0;

    if (blobCards.length > 0) blobCardRuns += 1;
    if (emptyGraph) emptyGraphRuns += 1;
    if (stripLines.length > 0) stripRuns += 1;

    const runRecord = {
      run: i,
      at: new Date().toISOString(),
      success: result.success,
      eventCount: events,
      clarificationCount: requests.length,
      clarifications: requests.map((r) => ({
        reason: r.unresolvedFact?.reason ?? null,
        label: r.unresolvedFact?.label ?? null,
        allowCreateLocal: r.allowCreateLocal ?? false,
        mintCandidateCount: (r.unresolvedFact?.candidates ?? []).filter((c) => String(c.label ?? '').startsWith('Create local term')).length,
      })),
      blobCardCount: blobCards.length,
      emptyGraph,
      stripLogLines: [...stripLines],
      rawModelEmissions: rawCalls,
    };
    writeFileSync(join(artifactDir, `run-${i}.json`), `${JSON.stringify(runRecord, null, 2)}\n`);
    runs.push(runRecord);
    originalLog(`run ${i}: events=${events} clarifications=${requests.length} blobCards=${blobCards.length} emptyGraph=${emptyGraph} strip=${stripLines.length > 0 ? 'YES' : 'no'}`);
  }
  console.log = originalLog;

  const summary = {
    item: 'SH-QA3-mode1-replay',
    runAt: new Date().toISOString(),
    profile: activeProfileName,
    model: inferenceConfig.model,
    baseUrlHost: new URL(inferenceConfig.baseUrl).host,
    prompt: MIXTURE_PROMPT,
    runs: N,
    bars: {
      zeroProseBlobCards: blobCardRuns === 0,
      zeroEmptyGraphs: emptyGraphRuns === 0,
      rawEmissionsRetained: true,
    },
    counts: {
      blobCardRuns,
      emptyGraphRuns,
      stripRuns,
      eventCounts: runs.map((r) => r.eventCount),
      clarificationCounts: runs.map((r) => r.clarificationCount),
    },
    note: 'Mode 1 (coder, pre-merge): in-process against the worktree boot of the lane data repo store, real active-profile inference client, ONE chain per run. Evidence, not a gate. Mode 2 (orch, as-served vs :3093) is the orchestrator leg.',
  };
  writeFileSync(join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  originalLog(JSON.stringify(summary.bars));
  originalLog(`ARTIFACTS: ${artifactDir}`);
  return blobCardRuns === 0 && emptyGraphRuns === 0 ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(`shqa3-replay: run failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
