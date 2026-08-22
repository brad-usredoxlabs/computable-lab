/**
 * intentCompile — small-LLM driver for the scientist-intent compile path.
 *
 * Pipeline (the load-bearing shape):
 *
 *   English
 *     ↓  small model (lmf25-class 3B / qwen3.6-35b fallback)
 *   portable scientist-intent YAML   (closed vocabulary, low entropy)
 *     ↓  deterministic expansion (compileScientistIntent reuses protocolIntent stack)
 *   canonical event graph (TerminalArtifacts)
 *     ↓  existing platform lowering (plan_deck_layout, emit_instrument_run_files)
 *   platform-specific execution
 *
 * The model only ever writes the easy YAML. Every well, deck slot, resource,
 * volume, and robot action is owned by the deterministic compiler.
 */
import { parseScientistIntent } from './parseScientistIntent.js';
import { compileScientistIntent, type ScientistIntentCompileDeps } from './compileScientistIntent.js';
import type { LlmClient } from '../pipeline/passes/ChatbotCompilePasses.js';
import type { ScientistIntent } from './types.js';

/**
 * Closed-vocabulary system prompt for the small model. Kept as an inline
 * constant by design: it is an I/O contract, not a mutable registry template,
 * and hardcoding it here is the deterministic handoff point the compiler
 * advertises. (The reusable `intent.compile.system` template is also shipped in
 * schema/registry/prompt-templates/ for the registry/UI layer.)
 */
export const INTENT_COMPILE_SYSTEM_PROMPT = `You translate a scientist's free-text experiment description into a compact, portable scientist-intent YAML document. You do NOT produce low-level events, well addresses, deck slots, record IDs, or robot actions — the deterministic compiler does that. You only express the SCIENTIST'S INTENT.

OUTPUT ONLY YAML. No prose, no code fences.

TOP-LEVEL SHAPE:
intentId: <short id>
actions:
  - action: <verb from the closed set>
    <parameters>
unresolved:
  - label: "<thing you could not commit to>"
    reason: "<why>"

ALLOWED ACTIONS (never invent another):
seed | incubate | mix | resuspend | dilute | shake | count | read |
add_material | create_container | transfer | stain | fix | permeabilize |
block | quench | label | transfect | aliquot | wash | elute | harvest |
passage | freeze | thaw | spin | pellet | serial_dilution |
media_swap_duplicate_columns | source_wells_to_duplicate_target_columns |
repeat_rows

PARAMETERS (only these; ordinary words/numbers):
- source / target / labware: SYMBOLIC label (e.g. "standards", "cells", "media"). NEVER a deck slot or record id.
- factor / points / replicates: serial_dilution (factor 2 = 2-fold; points = # positions; replicates = # copies).
- ratio ("1:2"), volume / volumeUl, cycles, duration ("10 min"), temperatureC, rpm, mode, wavelength, material, source_name.
- sourceWells / targetWells: arrays of symbolic well names ONLY when the scientist names them explicitly.

RULES:
- If unsure whether a label is an existing or new plate, still use a symbolic word and note it under unresolved. The compiler binds or asks.
- Never emit a deck slot, an event graph, or a record id.
- Do not add wells/volumes the scientist did not state.
- serial_dilution / media_swap / repeat macros are ONE action — do not unroll.
- If a parameter is ambiguous or missing, put it under unresolved instead of inventing it.`;

export interface IntentCompileFromPromptArgs {
  prompt: string;
  llmClient: LlmClient;
  model?: string;
  deps?: ScientistIntentCompileDeps;
  systemPrompt?: string;
}

/**
 * Drive the small model to emit a scientist-intent YAML, then compile it
 * deterministically into the canonical event graph.
 */
export async function compileFromSmallLlm(
  args: IntentCompileFromPromptArgs,
): Promise<{ intent: ScientistIntent; compile: Awaited<ReturnType<typeof compileScientistIntent>> }> {
  const system = args.systemPrompt ?? INTENT_COMPILE_SYSTEM_PROMPT;
  const raw = await args.llmClient.complete({
    model: args.model ?? 'small-model',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: args.prompt },
    ],
  } as never);

  const text = raw.choices?.[0]?.message?.content ?? '';
  const intent = parseScientistIntent(stripYamlFence(text));
  const compiled = await compileScientistIntent(intent, args.deps);
  return { intent, compile: compiled };
}

/** Small models sometimes wrap YAML in markdown fences / intro prose. */
export function stripYamlFence(text: string): string {
  let t = text.trim();
  const fence = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  if (fence && fence[1] !== undefined) t = fence[1].trim();
  // Drop any leading prose before the first `intentId:` line.
  const idx = t.indexOf('intentId:');
  if (idx > 0) t = t.slice(idx).trim();
  return t;
}