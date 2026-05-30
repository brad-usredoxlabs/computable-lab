/**
 * submit_suggestion — the agent's structured output tool (#8).
 *
 * Instead of emitting free-text JSON in a markdown fence (parsed by regex —
 * fragile, and ungrounded), the agent finalizes by CALLING this tool. The
 * model API guarantees the arguments match the schema, so malformed
 * suggestions are impossible by construction. Material references are
 * CURIE-typed: each is either an existing CURIE (from the resolve tool) or a
 * `{mint:{label,domain}}` request — never a bare free-text name.
 *
 * The orchestrator intercepts a call to this tool as the terminal turn and maps
 * the arguments to an AgentResult (see parseSubmitSuggestionArgs).
 */

import type {
  AgentResult,
  AgentClarification,
  AgentClarificationOption,
  AgentLabwareAddition,
  GroundedMaterial,
  OntologyRefProposal,
  PlateEventProposal,
  ToolDefinition,
} from './types.js';

export const SUBMIT_SUGGESTION_TOOL_NAME = 'submit_suggestion';

/**
 * System-prompt guidance directing the agent to resolve nouns first and
 * finalize via the structured output tool. Appended to the agent's system
 * message on tool-bearing turns.
 */
export const SUBMIT_SUGGESTION_INSTRUCTION = [
  'FINALIZING YOUR ANSWER:',
  '- Resolve every material/reagent/noun with the `resolve` tool first, and use the top-ranked CURIE it returns.',
  '- Finish by calling the `submit_suggestion` tool exactly once. Do NOT print JSON in your text reply.',
  "- In each event's `materials[]`, reference a material only as {curie} (from `resolve`) or {mint:{label,domain}} when no ontology term fits — never a bare free-text name.",
  '- If you need more information, call `submit_suggestion` with a `clarification` (and no events) instead.',
].join('\n');

const GROUNDED_REF_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      required: ['curie'],
      additionalProperties: false,
      properties: {
        curie: { type: 'string', description: 'An existing CURIE from the resolve tool (e.g. "CHEBI:5001", "local:MAT-…").' },
      },
    },
    {
      type: 'object',
      required: ['mint'],
      additionalProperties: false,
      properties: {
        mint: {
          type: 'object',
          required: ['label'],
          additionalProperties: false,
          properties: {
            label: { type: 'string' },
            domain: { type: 'string', description: 'cell_line | chemical | media | reagent | organism | sample | other' },
          },
        },
      },
    },
  ],
};

/**
 * The OpenAI tool definition the orchestrator appends to the model's tools.
 */
export const SUBMIT_SUGGESTION_TOOL_DEF: ToolDefinition = {
  type: 'function',
  function: {
    name: SUBMIT_SUGGESTION_TOOL_NAME,
    description:
      'Finalize your answer. Call this exactly once when you are ready to propose events (or ask for clarification). ' +
      'Every material you reference MUST be grounded: put it in the event\'s materials[] as an existing {curie} from the ' +
      'resolve tool, or as {mint:{label,domain}} only when no ontology term fits. Never invent a free-text material name.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        events: {
          type: 'array',
          description: 'Proposed events to preview in the editor.',
          items: {
            type: 'object',
            required: ['verb'],
            properties: {
              eventId: { type: 'string' },
              event_type: { type: 'string' },
              verb: { type: 'string' },
              vocabPackId: { type: 'string' },
              details: { type: 'object', additionalProperties: true, description: 'Verb-specific parameters.' },
              materials: {
                type: 'array',
                description: 'CURIE-typed material references for this event.',
                items: {
                  type: 'object',
                  required: ['ref'],
                  additionalProperties: false,
                  properties: {
                    slot: { type: 'string', description: 'e.g. "source", "target", "reagent".' },
                    ref: GROUNDED_REF_SCHEMA,
                  },
                },
              },
              t_offset: { type: 'string' },
              notes: { type: 'string' },
            },
          },
        },
        notes: { type: 'array', items: { type: 'string' } },
        unresolvedRefs: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
        clarification: {
          type: 'object',
          required: ['prompt', 'entityType', 'options'],
          properties: {
            prompt: { type: 'string' },
            entityType: { type: 'string' },
            options: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'label'],
                properties: {
                  id: { type: 'string' },
                  label: { type: 'string' },
                  snippet: { type: 'string' },
                },
              },
            },
          },
        },
        labwareAdditions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['recordId'],
            properties: {
              recordId: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
      },
    },
  },
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function parseMaterials(raw: unknown): GroundedMaterial[] {
  if (!Array.isArray(raw)) return [];
  const out: GroundedMaterial[] = [];
  for (const item of raw) {
    const r = asRecord(item);
    if (!r) continue;
    const ref = asRecord(r.ref);
    if (!ref) continue;
    if (typeof ref.curie === 'string' && ref.curie.length > 0) {
      const m: GroundedMaterial = { ref: { curie: ref.curie } };
      if (typeof r.slot === 'string') m.slot = r.slot;
      out.push(m);
    } else {
      const mint = asRecord(ref.mint);
      if (mint && typeof mint.label === 'string' && mint.label.length > 0) {
        const ref2: { mint: { label: string; domain?: string } } = { mint: { label: mint.label } };
        if (typeof mint.domain === 'string') ref2.mint.domain = mint.domain;
        const m: GroundedMaterial = { ref: ref2 };
        if (typeof r.slot === 'string') m.slot = r.slot;
        out.push(m);
      }
    }
  }
  return out;
}

let agCounter = 0;
function newActionGroupId(): string {
  agCounter = (agCounter + 1) % 100000;
  return `ag-${Date.now().toString(36)}-${agCounter.toString(36)}`;
}

function parseEvents(raw: unknown): PlateEventProposal[] {
  if (!Array.isArray(raw)) return [];
  const ts = new Date().toISOString();
  const out: PlateEventProposal[] = [];
  for (const item of raw) {
    const e = asRecord(item);
    if (!e || typeof e.verb !== 'string' || e.verb.length === 0) continue;
    const materials = parseMaterials(e.materials);
    const event: PlateEventProposal = {
      eventId: typeof e.eventId === 'string' && e.eventId ? e.eventId : `evt-${newActionGroupId()}`,
      event_type: typeof e.event_type === 'string' ? e.event_type : e.verb,
      verb: e.verb,
      vocabPackId: typeof e.vocabPackId === 'string' ? e.vocabPackId : '',
      details: asRecord(e.details) ?? {},
      provenance: { actor: 'ai-agent', timestamp: ts, method: 'automated', actionGroupId: newActionGroupId() },
    };
    if (materials.length > 0) event.materials = materials;
    if (typeof e.t_offset === 'string') event.t_offset = e.t_offset;
    if (typeof e.notes === 'string') event.notes = e.notes;
    out.push(event);
  }
  return out;
}

function parseClarification(raw: unknown): AgentClarification | undefined {
  const c = asRecord(raw);
  if (!c) return undefined;
  const optionsRaw = Array.isArray(c.options) ? c.options : [];
  const options = optionsRaw
    .map((o): AgentClarificationOption | null => {
      const oo = asRecord(o);
      if (!oo || typeof oo.id !== 'string' || typeof oo.label !== 'string') return null;
      const out: AgentClarificationOption = { id: oo.id, label: oo.label };
      if (typeof oo.snippet === 'string') out.snippet = oo.snippet;
      return out;
    })
    .filter((o): o is AgentClarificationOption => o !== null);
  if (typeof c.prompt === 'string' && typeof c.entityType === 'string' && options.length > 0) {
    return { prompt: c.prompt, entityType: c.entityType, options };
  }
  return undefined;
}

function parseLabwareAdditions(raw: unknown): AgentLabwareAddition[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentLabwareAddition[] = [];
  for (const item of raw) {
    const r = asRecord(item);
    if (!r || typeof r.recordId !== 'string' || r.recordId.length === 0) continue;
    const entry: AgentLabwareAddition = { recordId: r.recordId };
    if (typeof r.reason === 'string') entry.reason = r.reason;
    out.push(entry);
  }
  return out;
}

/**
 * Map submit_suggestion tool arguments to an AgentResult. Defensive: even
 * though the schema constrains the shape, local models via vLLM may not always
 * conform, so every field is parsed tolerantly.
 */
export function parseSubmitSuggestionArgs(
  args: Record<string, unknown>,
  usage: { promptTokens: number; completionTokens: number },
  turns: number,
  toolCalls: number,
): AgentResult {
  const events = parseEvents(args.events);
  const clarification = parseClarification(args.clarification);
  const labwareAdditions = parseLabwareAdditions(args.labwareAdditions);

  const result: AgentResult = {
    success: true,
    events,
    notes: Array.isArray(args.notes) ? args.notes.filter((n): n is string => typeof n === 'string') : [],
    unresolvedRefs: Array.isArray(args.unresolvedRefs) ? (args.unresolvedRefs as OntologyRefProposal[]) : [],
    usage: {
      ...usage,
      totalTokens: usage.promptTokens + usage.completionTokens,
      turns,
      toolCalls,
    },
  };
  if (clarification) result.clarification = clarification;
  if (labwareAdditions.length > 0) result.labwareAdditions = labwareAdditions;
  return result;
}
