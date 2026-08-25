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
import { liftScientistIntent } from './liftScientistIntent.js';
import { parse as parseYaml } from 'yaml';
import type { CompletionRequest } from '../../ai/types.js';
import type { ScientistIntent } from './types.js';

/**
 * Minimal LLM client for the intent driver — a widened version of the shared
 * pipeline LlmClient that also surfaces tool_calls (the `emit_scientist_intent`
 * path). Structurally satisfied by InferenceClient.
 */
export interface ScientistIntentLlmClient {
  complete(req: CompletionRequest): Promise<{
    choices?: Array<{
      message: {
        content?: string | null;
        tool_calls?: Array<{ function: { name: string; arguments: string } }>;
      };
    }>;
  }>;
}

/**
 * Token budget for the small-model scientist-intent calls. The small model is a
 * REASONING model: a tight budget truncates its thinking chain and it returns an
 * empty / partial completion. This is deliberately generous (10x a plausible
 * safe minimum) per the performance-test budget rule, sized for the worst real
 * localization prompt plus its reasoning.
 */
export const INTENT_COMPILE_MAX_TOKENS = 8000;

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
  llmClient: ScientistIntentLlmClient;
  model?: string;
  deps?: ScientistIntentCompileDeps;
  systemPrompt?: string;
  /** The lab's on-box inventory (instruments/labware/materials) so the small
   *  model grounds symbolic labels in what THIS lab actually owns. When
   *  present, it is injected as a `LAB INVENTORY` block in the user prompt. */
  labInventory?: LabInventory;
}

/** Lightweight lab-inventory snapshot for the one-shot localizer. Each list is
 *  the lab-global names (labels) of records of that kind. */
export interface LabInventory {
  instruments?: string[];
  labware?: string[];
  materials?: string[];
}

/** Build the user prompt, optionally prefixing the lab-inventory context. */
export function composeIntentPrompt(prompt: string, inventory?: LabInventory): string {
  if (!inventory) return prompt;
  const sections: string[] = [];
  if (inventory.instruments?.length) sections.push(`INSTRUMENTS: ${inventory.instruments.join(', ')}`);
  if (inventory.labware?.length) sections.push(`LABWARE: ${inventory.labware.join(', ')}`);
  if (inventory.materials?.length) sections.push(`MATERIALS: ${inventory.materials.join(', ')}`);
  if (sections.length === 0) return prompt;
  return [
    'LAB INVENTORY (this lab owns; prefer these when binding labware/instruments):',
    ...sections,
    '',
    prompt,
  ].join('\n');
}

/**
 * Full closed action vocabulary — overrides the schema enum. Kept in one place
 * so the tool schema, the prompt, and the parser can't drift.
 */
export const INTENT_ACTIONS = [
  'seed', 'incubate', 'mix', 'resuspend', 'dilute', 'shake', 'count', 'read',
  'add_material', 'create_container', 'transfer', 'stain', 'fix', 'permeabilize',
  'block', 'quench', 'label', 'transfect', 'aliquot', 'wash', 'elute', 'harvest',
  'passage', 'freeze', 'thaw', 'spin', 'pellet', 'serial_dilution',
  'media_swap_duplicate_columns', 'source_wells_to_duplicate_target_columns',
  'repeat_rows',
] as const;

export const SCIENTIST_INTENT_TOOL_NAME = 'emit_scientist_intent';

/**
 * JSON-Schema parameters for the `emit_scientist_intent` tool. A tool-call
 * emission is far more reliable for a small model than free YAML: the action
 * `enum` forces correct factoring (never "2-fold serial dilution" as a verb),
 * and the arguments come back as pure JSON — no prose, fences, or `parameters:`
 * wrappers to strip.
 */
export function buildScientistIntentToolSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      intentId: { type: 'string', description: 'short stable id, e.g. dilution-readout' },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: INTENT_ACTIONS as unknown as string[] },
            // symbolic noun labels (never deck slots / record ids)
            source: { type: 'string', description: 'symbolic source label, e.g. standards' },
            target: { type: 'string', description: 'symbolic target label, e.g. fresh plate' },
            labware: { type: 'string', description: 'symbolic labware label' },
            source_name: { type: 'string', description: 'reagent/material name' },
            // quantities
            factor: { type: 'number', description: 'fold for serial_dilution (2 = 2-fold)' },
            points: { type: 'integer', description: 'dilution positions for serial_dilution' },
            replicates: { type: 'integer', description: 'physical copies of a dilution ladder' },
            ratio: { type: 'string', description: 'e.g. 1:2 or 4:1' },
            volume: { oneOf: [{ type: 'number' }, { type: 'string' }] },
            volumeUl: { type: 'number' },
            cycles: { type: 'integer', minimum: 0 },
            duration: { type: 'string', description: 'e.g. 10 min, 30 min, overnight' },
            temperatureC: { type: 'number' },
            rpm: { type: 'number' },
            mode: { type: 'string', description: 'absorbance, fluorescence, ...' },
            wavelength: { type: 'string', description: 'e.g. 450 nm' },
            material: { type: 'string' },
            sourceWells: { type: 'array', items: { type: 'string' } },
            targetWells: { type: 'array', items: { type: 'string' } },
          },
          required: ['action'],
        },
      },
      unresolved: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            reason: { type: 'string' },
            candidates: {
              type: 'array',
              items: {
                type: 'object',
                properties: { label: { type: 'string' }, confidence: { type: 'number' } },
                required: ['label'],
              },
            },
          },
          required: ['label', 'reason'],
        },
      },
    },
    required: ['intentId', 'actions'],
  };
}

export function buildScientistIntentTool(): { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } } {
  return {
    type: 'function',
    function: {
      name: SCIENTIST_INTENT_TOOL_NAME,
      description: 'Emit a portable scientist-intent document. The deterministic compiler expands these macros into the canonical event graph.',
      parameters: buildScientistIntentToolSchema(),
    },
  };
}

/**
 * Drive a small model to emit scientist-intent via a TOOL CALL (no token cap),
 * then compile it deterministically.
 *
 * Preference order:
 *   1. tool call (`tool_calls[].function.arguments`) — structured JSON, action
 *      enum is grammar-enforced, no prose to strip.
 *   2. YAML-text fallback (fence/prose-stripped) when the endpoint does not
 *      return a tool call.
 */
export async function compileFromSmallLlm(
  args: IntentCompileFromPromptArgs,
): Promise<{ intent: ScientistIntent; compile: Awaited<ReturnType<typeof compileScientistIntent>> }> {
  const system = args.systemPrompt ?? INTENT_COMPILE_SYSTEM_PROMPT;
  const userPrompt = composeIntentPrompt(args.prompt, args.labInventory);
  const baseRequest = {
    model: args.model ?? 'small-model',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: INTENT_COMPILE_MAX_TOKENS,
  };

  // Attempt 1: forced intent-tool call. Some small models / llama.cpp builds
  // return EMPTY when forced into a function call (they don't implement
  // function-calling); in that case `message.tool_calls` and `message.content`
  // are both empty, so we fall through to plain-text output (Attempt 2).
  let raw = await args.llmClient.complete({
    ...baseRequest,
    tools: [buildScientistIntentTool()],
    tool_choice: { type: 'function', function: { name: SCIENTIST_INTENT_TOOL_NAME } },
  } as never);

  let message = raw.choices?.[0]?.message;
  let toolArgs = message?.tool_calls?.[0]?.function?.arguments;
  let text = (message?.content ?? '').trim();

  let intent: ScientistIntent;
  try {
    if (toolArgs) {
      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(toolArgs);
      } catch {
        parsedArgs = toolArgs;
      }
      const lifted = liftScientistIntent(parsedArgs);
      intent = parseScientistIntent(JSON.stringify(lifted));
    } else {
      intent = parseScientistIntent(stripYamlFence(text));
    }
  } catch (toolErr) {
    // Attempt 2: the tool path produced nothing parseable (empty content, or a
    // bare echo of the prompt template). Retry as a PLAIN text completion (no
    // tools) — empirically this is where small models emit clean YAML.
    if (!toolArgs && !text) {
      throw toolErr; // nothing to work from; surface the real error
    }
    const retry = await args.llmClient.complete({
      ...baseRequest,
    } as never);
    const retryMessage = retry.choices?.[0]?.message;
    const retryText = (retryMessage?.content ?? '').trim();
    // Plain-text YAML from a small model still needs the same lift the tool
    // path applies (verb aliases + flattening nested `parameters`), so parse
    // to a raw doc, lift it, then validate the lifted form.
    const rawDoc = parseYamlDoc(stripYamlFence(retryText));
    const lifted = liftScientistIntent(rawDoc ?? {});
    intent = parseScientistIntent(JSON.stringify(lifted));
  }

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

/** Parse a YAML doc into a plain object WITHOUT schema validation (used for the
 *  plain-text fallback before lift+validate). Returns null on parse error. */
export function parseYamlDoc(text: string): Record<string, unknown> | null {
  try {
    const parsed = parseYaml(text);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Branch-question extraction (localization preamble)
//
// The `emit_branch_questions` tool: given a universal protocol text, a small
// model emits the HIGH-LEVEL decisions a human must make to localize it. These
// are surfaced as plain human questions + choices (NOT if/then/else predicates),
// matching the ask-the-user localization loop the scientist-intent path uses.
// A human answer picks a choice; the deterministic BranchResolver then derives
// the active starting step set from the chosen branch (kept as data).
// ---------------------------------------------------------------------------

export const BRANCH_QUESTIONS_TOOL_NAME = 'emit_branch_questions';

export interface BranchQuestionChoice {
  value: string;
  label: string;
}

export interface BranchQuestionAxis {
  axisId: string;
  question: string;
  choices: BranchQuestionChoice[];
}

export interface BranchQuestionsResult {
  axes: BranchQuestionAxis[];
}

export function buildBranchQuestionsToolSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      axes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            axisId: { type: 'string', description: 'short stable id, e.g. sample_type' },
            question: { type: 'string', description: 'exact question to ask the human' },
            choices: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  value: { type: 'string', description: 'stable option value' },
                  label: { type: 'string', description: 'human-readable label' },
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
  };
}

export function buildBranchQuestionsTool(): { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } } {
  return {
    type: 'function',
    function: {
      name: BRANCH_QUESTIONS_TOOL_NAME,
      description: 'Emit the high-level branch questions a human must answer to localize this universal protocol.',
      parameters: buildBranchQuestionsToolSchema(),
    },
  };
}

const BRANCH_QUESTIONS_SYSTEM_PROMPT = `You are a protocol localizer. A vendor universal protocol text is below. Identify the HIGH-LEVEL decisions a human must make before this becomes a concrete run protocol — the branch points that change which steps run (e.g. starting sample type, lysis/labware format, optional reagent substitution).

Emit ONLY a tool call to emit_branch_questions. Do NOT unroll the steps or enumerate wells/volumes. For each real branch in the text, give one question with honest choices. If there are none, emit axes: []. Do NOT invent branches the text does not support.`;

export interface ExtractBranchQuestionsArgs {
  protocolText: string;
  llmClient: ScientistIntentLlmClient;
  model?: string;
  systemPrompt?: string;
}

/**
 * Drive a small model to extract the high-level branch questions for a universal
 * protocol. Returns a deterministic BranchQuestionsResult (empty axes = no
 * human decision needed).
 */
export async function extractBranchQuestionsFromSmallLlm(
  args: ExtractBranchQuestionsArgs,
): Promise<BranchQuestionsResult> {
  const system = args.systemPrompt ?? BRANCH_QUESTIONS_SYSTEM_PROMPT;
  const raw = await args.llmClient.complete({
    model: args.model ?? 'small-model',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: args.protocolText },
    ],
    tools: [buildBranchQuestionsTool()],
    tool_choice: { type: 'function', function: { name: BRANCH_QUESTIONS_TOOL_NAME } },
    max_tokens: INTENT_COMPILE_MAX_TOKENS,
  } as never);

  const toolArgs = raw.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!toolArgs) return { axes: [] };
  try {
    const parsed = JSON.parse(toolArgs);
    const axes = (parsed as BranchQuestionsResult).axes ?? [];
    // Coerce to a stable shape: verify required fields, drop bad entries.
    return {
      axes: axes.filter((a): a is BranchQuestionAxis =>
        a && typeof a.axisId === 'string' && typeof a.question === 'string'
        && Array.isArray(a.choices) && a.choices.every((c) => c && typeof c.value === 'string' && typeof c.label === 'string')),
    };
  } catch {
    return { axes: [] };
  }
}