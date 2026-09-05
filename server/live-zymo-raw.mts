import { createInferenceClient } from './src/ai/InferenceClient.js';
import { parseScientistIntent } from './src/compiler/scientistIntent/parseScientistIntent.js';
import { compileScientistIntent } from './src/compiler/scientistIntent/compileScientistIntent.js';
import { INTENT_ACTIONS, buildScientistIntentTool } from './src/compiler/scientistIntent/intentCompile.js';
import * as fs from 'node:fs';
import { parse as parseYaml } from 'yaml';

const client = createInferenceClient({
  provider: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:8899/v1',
  model: 'lfm2.5-2.6b',
  temperature: 0,
  enableThinking: false,
}) as never;

// Fed RAW vendor protocol text (Steps 1-17), NOT a structured summary.
// Load from the segment's protocol_text and slice the main protocol section.
const seg: any = parseYaml(fs.readFileSync(
  '../artifacts/segments/d4302-d4306-d4308-zymobiomics-96-magbead-dna-kit.yaml', 'utf8'));
const full = String(seg.protocol_text ?? '');
const start = full.indexOf('Add sample to the BashingBead');
const end = full.indexOf('Appendices');
const RAW_ZYMO = full.slice(start, end > start ? end : start + 5000).trim();
console.log('=== RAW ZYMO TEXT LENGTH = ' + RAW_ZYMO.length + ' chars ===');

const SYSTEM = `You are a bench scientist's scribe. A vendor protocol PDF has been OCR'd below. Your ONLY job is to convert it into a structured scientist-intent document that a deterministic compiler will expand — you DO NOT enumerate wells, deck slots, or record IDs.

Emit the intent ONLY as a tool call to emit_scientist_intent. The tool's action enum is your closed vocabulary — you may only use those exact action names.

Rules:
- One action per distinct protocol step. Preserve the ORDER.
- Wash/elute/lyse/bind are steps; aspiration/centrifuge/magnetic-pellet/dry are state changes — express the liquid handling as add/transfer/mix and mark non-liquid steps with 'action' names that carry the closest meaning, keeping symbolic source/target labels (primary_plate, reservoir, pcr_plate).
- Repeats (e.g. 'Repeat the wash') become a 'repeat_rows' or a wash action with cycles/factor>1 style repetition. Do NOT unroll loops.
- Keep every volume and reagent the vendor states. If it is a wash loop, use one wash action and note cycles.
- source/target/labware are SYMBOLIC labels only.
- If the text has branches (rack vs tube lysis), pick the primary path and note the alternative under unresolved.
- If you cannot confidently map a step, put it under 'unresolved' rather than inventing an action.`;

const PROMPT = RAW_ZYMO;

async function run() {
  console.log('=== PROMPT (first 300 chars) ===\n' + RAW_ZYMO.slice(0, 300) + '...\n');
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
    console.log('NO TOOL CALL. finish=' + (raw.choices?.[0]?.finish_reason ?? '?'));
    console.log('content=' + JSON.stringify(msg?.content ?? '').slice(0, 1500));
    return;
  }
  console.log('=== TOOL ARGUMENTS ===');
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
      if (hl.includes('deepwell') || hl.includes('block') || hl.includes('sample')) return [{ recordId: 'LAB-sample', title: h }];
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