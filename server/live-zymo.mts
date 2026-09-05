import { createInferenceClient } from './src/ai/InferenceClient.js';
import { parseScientistIntent } from './src/compiler/scientistIntent/parseScientistIntent.js';
import { compileScientistIntent } from './src/compiler/scientistIntent/compileScientistIntent.js';
import { INTENT_ACTIONS, buildScientistIntentTool } from './src/compiler/scientistIntent/intentCompile.js';

const client = createInferenceClient({
  provider: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:8899/v1',
  model: 'lfm2.5-2.6b',
  temperature: 0,
  enableThinking: false,
}) as never;

const SYSTEM = `You translate a scientist's free-text Zymo MagBead DNA extraction description into a compact scientist-intent document. Emit it ONLY as a tool call to emit_scientist_intent.
Use exact closed-vocabulary action names from: ${INTENT_ACTIONS.join(', ')}.
Symbolic labels only for source/target/labware (e.g. primary_plate, reservoir, pcr_plate) — never deck slots or record ids.
Express each distinct step as its own action. Do NOT unroll loops by hand — use one wash action per wash step and note repetition with 'cycles' when the vendor repeats a wash.`;

const PROMPT = `Zymo MagBead DNA extraction, 96-well deepwell in primary_plate. Lyse by bead-beating in a BashingBead rack, then centrifuge. Transfer lysate and add MagBinding Buffer (600 uL) and MagBinding Beads (25 uL), mix 10 minutes. Pellet on a magnetic stand, aspirate and discard supernatant. Wash 1: add MagWash 1 (500 uL), mix 1 min, pellet, discard. Wash 2: add MagWash 2 (900 uL), mix 1 min, pellet, discard, repeat this wash once more. Dry the beads on a 55C heating element for 10 minutes. Then add 50 uL DNase-free water, resuspend and mix 10 minutes, pellet, and transfer the eluted DNA supernatant to a clean PCR plate.`;

async function run() {
  console.log('=== PROMPT ===\n' + PROMPT + '\n');
  const raw = await client.complete({
    model: 'lfm2.5-2.6b',
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: PROMPT },
    ],
    tools: [buildScientistIntentTool()],
    tool_choice: { type: 'function', function: { name: 'emit_scientist_intent' } },
  } as never);

  const msg = raw.choices?.[0]?.message;
  const toolArgs = msg?.tool_calls?.[0]?.function?.arguments;
  if (!toolArgs) {
    console.log('NO TOOL CALL. content=' + JSON.stringify(msg?.content ?? '').slice(0, 500));
    return;
  }
  console.log('=== TOOL ARGUMENTS (raw) ===');
  console.log(toolArgs);
  console.log();

  let intent;
  try {
    intent = parseScientistIntent(toolArgs);
  } catch (err) {
    console.log('PARSE FAIL: ' + (err instanceof Error ? err.message : String(err)));
    return;
  }
  console.log('=== PARSED INTENT ===\n' + JSON.stringify(intent, null, 2));

  const compiled = await compileScientistIntent(intent, {
    searchLabwareByHint: async (h) => {
      const hl = h.toLowerCase();
      if (hl.includes('plate') || hl.includes('deepwell')) return [{ recordId: 'LAB-sample', title: h }];
      if (hl.includes('reservoir')) return [{ recordId: 'LAB-reservoir', title: h }];
      if (hl.includes('pcr') || hl.includes('elution')) return [{ recordId: 'LAB-pcr', title: h }];
      return [];
    },
  });

  console.log('\n=== OUTCOME === ' + compiled.outcome);
  const byType: Record<string, number> = {};
  for (const e of compiled.terminalArtifacts.events) byType[e.event_type] = (byType[e.event_type] ?? 0) + 1;
  console.log('EVENTS(' + compiled.terminalArtifacts.events.length + '): ' + JSON.stringify(byType));
  console.log('GAPS: ' + JSON.stringify(compiled.terminalArtifacts.gaps.map((g) => g.message)));
  process.exit(0);
}

run().catch((err) => { console.log('FATAL: ' + (err instanceof Error ? err.message : String(err))); process.exit(1); });