import { createInferenceClient } from './src/ai/InferenceClient.js';
import * as fs from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { compileScientistIntent } from './src/compiler/scientistIntent/compileScientistIntent.js';
import {
  INTENT_ACTIONS,
  buildScientistIntentTool,
} from './src/compiler/scientistIntent/intentCompile.js';

const client = createInferenceClient({
  provider: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:8899/v1',
  model: 'lfm2.5-2.6b',
  temperature: 0,
  enableThinking: false,
}) as any;

// ---- raw vendor protocol text (the universal layer, unmodified) ----
const seg: any = parseYaml(fs.readFileSync(
  '../artifacts/segments/d4302-d4306-d4308-zymobiomics-96-magbead-dna-kit.yaml', 'utf8'));
const full = String(seg.protocol_text ?? '');
const start = full.indexOf('Add sample to the BashingBead');
const end = full.indexOf('Appendices');
const RAW_ZYMO = full.slice(start, end > start ? end : start + 5000).trim();

// ---------------------------------------------------------------------------
// Stage 1 tool: emit the HIGH-LEVEL branch QUESTIONS a human must answer to
// localize this universal protocol. No predicates — plain question + choices.
// ---------------------------------------------------------------------------
const BRANCH_TOOL = {
  type: 'function',
  function: {
    name: 'emit_branch_questions',
    description: 'Emit the high-level branch questions a human must answer to localize this universal protocol.',
    parameters: {
      type: 'object',
      properties: {
        axes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              axisId: { type: 'string', description: 'short stable id, e.g. sample_type' },
              question: { type: 'string', description: 'The exact question to ask the human, e.g. "What starting sample type are you extracting from?"' },
              choices: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    value: { type: 'string', description: 'stable option value, e.g. bacterial or mammalian' },
                    label: { type: 'string', description: 'human label, e.g. "Bacteria / endospores" or "Mammalian cell culture"' },
                  },
                  required: ['value', 'label'],
                },
              },
            },
            required: ['axisId', 'question', 'choices'],
          },
        },
      },
      required: ['axes'],
    },
  },
};

const STAGE1_SYS = `You are a protocol localizer. A vendor universal protocol text is below. Your job is to identify the HIGH-LEVEL decisions a human must make before this can become a concrete run protocol — the branch points that change the steps (e.g. starting sample type, lysis/labware format).

Emit ONLY a tool call to emit_branch_questions. Do NOT unroll the steps. Do NOT enumerate wells or volumes. For each real branch in the text, give one question with its honest choices. If there is no branch, emit an empty axes array. Do not invent branches the text does not support.`;

// ---------------------------------------------------------------------------
// Stage 2: — emit the precise scientist-intent for the RESOLVED path.
// ---------------------------------------------------------------------------

async function main() {
  console.log('================ STAGE 1: BRANCH QUESTIONS ================\n');

  const s1 = await client.complete({
    model: 'lfm2.5-2.6b',
    messages: [
      { role: 'system', content: STAGE1_SYSTEM },
      { role: 'user', content: RAW_ZYMO },
    ],
    tools: [BRANCH_TOOL],
    tool_choice: { type: 'function', function: { name: 'emit_branch_questions' } },
  } as never);
  const s1Args = s1.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!s1Args) { console.log('NO BRANCH TOOL CALL'); console.log('finish=' + s1.choices?.[0]?.finish_reason); return; }
  let axes: any[];
  try { axes = JSON.parse(s1Args).axes ?? []; } catch { console.log('PARSE FAIL stage1: ' + s1Args); return; }
  console.log(JSON.stringify(axes, null, 2));

  // --- human answers ---
  // Present the questions, take an answer per axis (bacterial as a demo choice).
  console.log('\n=== HUMAN CLARIFICATION ===\n');
  const answers: Record<string, string> = {};
  for (const axis of axes) {
    console.log('Q: ' + axis.question);
    axis.choices.forEach((c: any, i: number) => console.log(`   [${i}] ${c.label}`));
    // Demo: answer the sample-type axis as "bacterial", others first-choice
    const pick = axis.axisId?.includes('sample') ? 'bacterial' : axis.choices?.[0]?.value;
    answers[axis.axisId] = pick;
    console.log('   → ' + (axis.choices.find((c: any) => c.value === pick)?.label ?? pick) + '\n');
  }
  const answersText = axes.map((a) => `${a.axisId}=${answers[a.axisId]}`).join('; ');

  // -------------------------------------------------------------------------
  console.log('\n=== STAGE 2: SCIENTIST-INTENT FOR RESOLVED PATH ===\n');
  const s2 = await client.complete({
    model: 'lfm2.5-2.6b',
    messages: [
      { role: 'system', content: STAGE2_SYSTEM },
      { role: 'user', content: `Resolved branch choices: ${answersText || '(none)'}.\n\nHere is the universal protocol text — emit the concrete scientist-intent for the chosen path:\n\n${RAW_ZYMO}` },
    ],
    tools: [buildScientistIntentTool()],
    tool_choice: { type: 'function', function: { name: 'emit_scientist_intent' } },
  } as never);
  const s2Args = s2.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!s2Args) { console.log('NO INTENT TOOL. finish=' + s2.choices?.[0]?.finish_reason); console.log('content=' + JSON.stringify(s2.choices?.[0]?.message?.content ?? '').slice(0,600)); return; }
  console.log(s2Args);

  // -------------------------------------------------------------------------
  // Compile: first resolve-library synthetically, then parse+compile.
  console.log('\n=== DETERMINISTIC COMPILE ===\n');
  try {
    const doc = JSON.parse(s2Args);
    // light-enum-lift: coerce invented action names to canonical + numeric strings
    const { parseScientistIntent } = await import('./src/compiler/scientistIntent/parseScientistIntent.js');
    // Re-serialize as strict scientist-intent (drop non-schema fields)
    const strict = { intentId: doc.intentId, actions: (doc.actions ?? []).map(normalizeAction) };
    const intent = parseScientistIntent(JSON.stringify(strict));
    const compiled = await compileScientistIntent(intent, {
      searchLabwareByHint: async (h) => {
        const hl = h.toLowerCase();
        if (hl.includes('deepwell') || hl.includes('block') || hl.includes('sample')) return [{ recordId: 'LAB-sample', title: h }];
        if (hl.includes('reservoir')) return [{ recordId: 'LAB-reservoir', title: h }];
        if (hl.includes('pcr') || hl.includes('elution')) return [{ recordId: 'LAB-pcr', title: h }];
        return [];
      },
    });
    console.log('OUTCOME: ' + compiled.outcome);
    const byType: Record<string, number> = {};
    for (const e of compiled.terminalArtifacts.events) byType[e.event_type] = (byType[e.event_type] ?? 0) + 1;
    console.log('EVENTS(' + compiled.terminalArtifacts.events.length + '): ' + JSON.stringify(byType));
    console.log('GAPS: ' + JSON.stringify(compiled.terminalArtifacts.gaps.map((g) => g.message)));
  } catch (err) {
    console.log('COMPILE FAIL: ' + (err instanceof Error ? err.message : String(err)));
  }
  process.exit(0);
}

const STAGE1_SYSTEM = `You are a protocol localizer. A vendor universal protocol text is below. Your job is to identify the HIGH-LEVEL decisions a human must make before this can become a concrete run protocol — the branch points that change the steps (e.g. starting sample type, lysis/labware format). Emit ONLY a tool call to emit_branch_questions. Do NOT unroll steps or enumerate wells/volumes. Give one honest question per real branch; empty axes if none.`;

const STAGE2_SYSTEM = `You are a bench scientist's scribe. Given a resolved branch choice and a universal protocol text, emit the CONCRETE scientist-intent the deterministic compiler will expand into events. Emit ONLY a tool call to emit_scientist_intent using the closed action vocabulary. Preserve step order and every volume/reagent the vendor states. source/target/labware are SYMBOLIC labels (primary_plate, reservoir, pcr_plate) — never deck slots or record ids. Include ONE action per distinct step. Do not unroll loops; carry repetition as cycles/factor. If a step does not fit the closed vocabulary, put it under unresolved instead of inventing a verb.`;

const SYNONYM: Record<string, string> = {
  aspirate_discard: 'transfer', discard: 'transfer', aspirate: 'transfer',
  dispense: 'transfer', add: 'add_material', elute: 'transfer',
  repeat_cycle: 'mix', dry: 'incubate', lyse: 'mix', lysate: 'transfer',
  pellet: 'spin', resuspend: 'mix', dissolve: 'mix', centrifuge: 'spin',
  cent: 'spin', '65_freeze': 'freeze',
};

function normalizeAction(a: any): any {
  const out: Record<string, unknown> = { action: SYNONYM[String(a.action)] ?? String(a.action) };
  for (const key of ['source','target','labware','material','factor','points','replicates','ratio','volumeUl','cycles','duration','temperatureC','rpm','mode','wavelength']) {
    let v = a[key];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== '') v = Number(v);
    out[key] = v;
  }
  return out;
}

main().catch((err) => { console.log('FATAL: ' + (err instanceof Error ? err.message : String(err))); process.exit(1); });