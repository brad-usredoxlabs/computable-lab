import { createInferenceClient } from './src/ai/InferenceClient.js';
import * as fs from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { INTENT_ACTIONS, buildScientistIntentTool } from './src/compiler/scientistIntent/intentCompile.js';

const client = createInferenceClient({
  provider: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:8899/v1',
  model: 'lfm2.5-2.6b',
  temperature: 0,
  enableThinking: false,
}) as never;

// Raw vendor protocol text
const seg: any = parseYaml(fs.readFileSync(
  '../artifacts/segments/d4302-d4306-d4308-zymobiomics-96-magbead-dna-kit.yaml', 'utf8'));
const full = String(seg.protocol_text ?? '');
const start = full.indexOf('Add sample to the BashingBead');
const end = full.indexOf('Appendices');
const RAW_ZYMO = full.slice(start, end > start ? end : start + 5000).trim();

const SYSTEM = `You are a bench scientist's scribe converting a vendor protocol into a structured scientist-intent document. Emit ONLY a tool call to emit_scientist_intent. Use the exact closed-vocabulary action names in the tool schema. Preserve step order and every volume/reagent. No deck slots or record ids — symbolic labels only. If a step is state-change (magnetic pellet, aspirate/discard, dry), still pick the CLOSEST allowed action name (e.g. mix, transfer, spin) and carry the state in params. Do NOT invent action names.`;

async function run() {
  let parsed: unknown;
  try {
    const raw = await client.complete({
      model: 'lfm2.5-2.6b',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: RAW_ZYMO },
      ],
      tools: [buildScientistIntentTool()],
      tool_choice: { type: 'function', function: { name: 'emit_scientist_intent' } },
    } as never);
    const msg = raw.choices?.[0]?.message;
    const toolArgs = msg?.tool_calls?.[0]?.function?.arguments;
    if (!toolArgs) { console.log('NO TOOL CALL'); return; }
    parsed = JSON.parse(toolArgs);
    console.log('=== TOOL ARGUMENTS (parsed, permissive) ===');
    console.log(JSON.stringify(parsed, null, 2));
  } catch (err) {
    console.log('ERR: ' + (err instanceof Error ? err.message : String(err)));
    return;
  }

  const actions = (parsed as any)?.actions ?? [];
  const ok = new Set<string>();
  const bad = new Set<string>();
  for (const a of actions) {
    const name = (a as any)?.action;
    (INTENT_ACTIONS as readonly string[]).includes(name) ? ok.add(name) : bad.add(name);
  }
  console.log('\n=== ACTION ENUM CLEANLINESS ===');
  console.log('accepted (' + ok.size + '): ' + Array.from(ok).join(', '));
  console.log('INVENTED (' + bad.size + '): ' + Array.from(bad).join(', '));
  if (bad.size > 0) {
    console.log('\n=== FATAL: invented action names must map (or model fails closed) — promoting to canonical via a synonym table');
  }
  process.exit(0);
}

run();