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
  AgentClarificationRequest,
  AgentLabwareAddition,
  AgentLabwareRequirement,
  GroundedMaterial,
  OntologyRefProposal,
  PlateEventProposal,
  ToolDefinition,
} from './types.js';
import {
  clarificationRequestFromLegacy,
  legacyClarificationFromRequests,
  parseClarificationRequests,
} from './clarifications.js';

export const SUBMIT_SUGGESTION_TOOL_NAME = 'submit_suggestion';
export const COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME = 'compile_event_graph_draft';

/**
 * System-prompt guidance directing the agent to resolve nouns first and
 * finalize via the structured output tool. Appended to the agent's system
 * message on tool-bearing turns.
 */
export const SUBMIT_SUGGESTION_INSTRUCTION = [
  'FINALIZING YOUR ANSWER:',
  '- Resolve every material/reagent/noun with the `resolve` tool first, and use the top-ranked CURIE it returns.',
  '- Finish by calling the `compile_event_graph_draft` tool exactly once. Do NOT print JSON in your text reply.',
  "- In each event's `materials[]`, reference a material only as {curie} (from `resolve`) or {mint:{label,domain}} when no ontology term fits — never a bare free-text name. Use `role` for mixture semantics such as cells, buffer_component, or additive, `concentration` for component contributions such as 10% FBS, and `count` for absolute cell counts.",
  '- For requested labware, prefer `labwareRequirements[]` with a computable classCurie such as CL:96_well_plate, CL:384_well_plate, CL:96_deepwell_plate, CL:8_well_reservoir_horizontal, CL:12_well_reservoir_vertical, CL:single_well_reservoir_sbs, CL:16_well_reservoir_horizontal_384_pitch, CL:24_well_reservoir_vertical_384_pitch, or CL:tube_rack_15ml.',
  '- Do not ask which vendor/catalog/plate subtype for a generic request like "a 96-well plate". Emit a generic labwareRequirement and let the user refine it later.',
  '- Ask a labware clarification only when no baseline classCurie can be inferred at all.',
  '- Use `labwareAdditions[]` only when you have a concrete known labware record or definition id. Never invent LBW-* record ids.',
  '- If the context includes an active deck scope, do not propose labwareRequirements, labwareAdditions, deckSlot values, or lawn placements outside that scope. Ask for a layout-switch clarification instead.',
  '- If you need more information, call `compile_event_graph_draft` with atomic `clarificationRequests[]` (and no events) instead.',
  "- Clarify only ambiguous literals in the user's prompt, such as which named material, which concentration meaning, or which wells. One request per ambiguity.",
  '- Do not ask the user to choose aliquots, vials, inventory sources, lots, or physical instances unless the user explicitly asked for a specific physical source. Draft concept/formulation additions first; inventory binding is a later refinement.',
  '- Never combine unrelated questions into one multiple-choice clarification. For example, concentration ambiguity and well-range ambiguity must be separate clarificationRequests.',
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
              details: {
                type: 'object',
                additionalProperties: true,
                description:
                  'Verb-specific parameters. Well-targeted verbs (add_material, transfer, mix, …) MUST include ' +
                  'labwareId (an existing editor labware id) and wells (e.g. ["A1","B2"]). Use structured ' +
                  'quantities: volume {value,unit}, concentration {value,unit}.',
                properties: {
                  labwareId: { type: 'string', description: 'Target labware id from the editor context.' },
                  wells: { type: 'array', items: { type: 'string' }, description: 'Target wells, e.g. ["A1"].' },
                  material_ref: {
                    type: 'object',
                    additionalProperties: true,
                    description:
                      'Display reference for the added material, e.g. {"kind":"ontology","id":"CHEBI:5001",' +
                      '"namespace":"CHEBI","label":"fenofibrate"}. ALWAYS include the human-readable label. ' +
                      'This complements (does not replace) the grounded materials[] entry.',
                  },
                },
              },
              materials: {
                type: 'array',
                description: 'CURIE-typed material references for this event.',
                items: {
                  type: 'object',
                  required: ['ref'],
                  additionalProperties: false,
                  properties: {
                    slot: { type: 'string', description: 'e.g. "source", "target", "reagent".' },
                    role: { type: 'string', description: 'Composition role, e.g. cells, buffer_component, additive, solute, solvent, other.' },
                    count: { type: 'number', description: 'Absolute material count when the user specifies one, e.g. 10000 cells.' },
                    concentration: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['value', 'unit'],
                      properties: {
                        value: { type: 'number' },
                        unit: { type: 'string' },
                        basis: { type: 'string' },
                      },
                    },
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
                  source: { type: 'string' },
                  score: { type: 'number' },
                  ref: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        clarificationRequests: {
          type: 'array',
          description: 'Atomic follow-up questions for ambiguous literals in the user prompt. Use one request per ambiguity. Use menuProvider /m for named material/ontology choices and /l for labware choices. Do not ask for aliquots, vials, inventory sources, lots, or physical instances unless the user explicitly requested a physical source.',
          items: {
            type: 'object',
            required: ['id', 'kind', 'prompt'],
            properties: {
              id: { type: 'string' },
              kind: { type: 'string', enum: ['material', 'aliquot', 'labware', 'vendor-product', 'ontology', 'parameter', 'well-selection', 'sequence', 'general'] },
              prompt: { type: 'string' },
              entityType: { type: 'string' },
              menuProvider: { type: 'string', enum: ['/m', '/l', 'choice'] },
              query: { type: 'string' },
              roleId: { type: 'string' },
              slot: { type: 'string' },
              snippet: { type: 'string' },
              allowCreateLocal: { type: 'boolean' },
              sourceSpan: {
                type: 'object',
                properties: {
                  start: { type: 'number' },
                  end: { type: 'number' },
                },
              },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'label'],
                  properties: {
                    id: { type: 'string' },
                    label: { type: 'string' },
                    snippet: { type: 'string' },
                    source: { type: 'string' },
                    score: { type: 'number' },
                    ref: { type: 'object', additionalProperties: true },
                  },
                },
              },
            },
          },
        },
        labwareRequirements: {
          type: 'array',
          description: 'Generic or constrained labware requirements. Use this for natural-language labware such as "a 96-well plate" rather than inventing a recordId.',
          items: {
            type: 'object',
            required: ['classCurie'],
            properties: {
              classCurie: {
                type: 'string',
                description: 'Computable labware class CURIE, e.g. CL:96_well_plate, CL:384_well_plate, CL:1536_well_plate, CL:8_well_reservoir_horizontal, CL:12_well_reservoir_vertical, CL:tube_rack_15ml.',
              },
              handle: { type: 'string', description: 'Optional user-visible instance handle, e.g. plate1 or res1.' },
              reason: { type: 'string' },
              deckSlot: { type: 'string', description: 'Optional deck slot, e.g. B2.' },
              constraints: { type: 'array', items: { type: 'string' }, description: 'Optional trait constraints such as CL:black, CL:low_binding, CL:flat_bottom.' },
              specificity: { type: 'string', enum: ['generic', 'constrained', 'concrete'] },
              tubeVolumeClass: { type: 'string', enum: ['1.5ml', '2ml', '5ml', '15ml', '50ml'] },
              rows: { type: 'number' },
              columns: { type: 'number' },
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
              deckSlot: { type: 'string', description: 'Optional deck slot for the new labware, e.g. B2.' },
            },
          },
        },
      },
    },
  },
};
export const COMPILE_EVENT_GRAPH_DRAFT_TOOL_DEF: ToolDefinition = {
  ...SUBMIT_SUGGESTION_TOOL_DEF,
  function: {
    ...SUBMIT_SUGGESTION_TOOL_DEF.function,
    name: COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME,
    description:
      'Compile an AI-proposed draft event graph through the server compiler and return ghostable events or clarification gaps. Every material reference MUST be grounded as {curie} or {mint:{label,domain}}.',
  },
};


function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function parseConcentrationValue(raw: unknown): { value: number; unit: string; basis?: string } | undefined {
  const record = asRecord(raw);
  if (!record || typeof record.value !== 'number' || !Number.isFinite(record.value)) return undefined;
  if (typeof record.unit !== 'string' || record.unit.trim().length === 0) return undefined;
  return {
    value: record.value,
    unit: record.unit.trim(),
    ...(typeof record.basis === 'string' && record.basis.trim() ? { basis: record.basis.trim() } : {}),
  };
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
      if (typeof r.role === 'string') m.role = r.role;
      if (typeof r.count === 'number' && Number.isFinite(r.count)) m.count = r.count;
      const concentration = parseConcentrationValue(r.concentration);
      if (concentration) m.concentration = concentration;
      out.push(m);
    } else {
      const mint = asRecord(ref.mint);
      if (mint && typeof mint.label === 'string' && mint.label.length > 0) {
        const ref2: { mint: { label: string; domain?: string } } = { mint: { label: mint.label } };
        if (typeof mint.domain === 'string') ref2.mint.domain = mint.domain;
        const m: GroundedMaterial = { ref: ref2 };
        if (typeof r.slot === 'string') m.slot = r.slot;
        if (typeof r.role === 'string') m.role = r.role;
        if (typeof r.count === 'number' && Number.isFinite(r.count)) m.count = r.count;
        const concentration = parseConcentrationValue(r.concentration);
        if (concentration) m.concentration = concentration;
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
      if (typeof oo.source === 'string') out.source = oo.source;
      if (typeof oo.score === 'number' && Number.isFinite(oo.score)) out.score = oo.score;
      const ref = asRecord(oo.ref);
      if (ref) out.ref = ref;
      return out;
    })
    .filter((o): o is AgentClarificationOption => o !== null);
  if (typeof c.prompt === 'string' && typeof c.entityType === 'string' && Array.isArray(c.options)) {
    const result: AgentClarification = { prompt: c.prompt, entityType: c.entityType, options };
    if (typeof c.id === 'string') result.id = c.id;
    if (c.menuProvider === '/m' || c.menuProvider === '/l' || c.menuProvider === 'choice') result.menuProvider = c.menuProvider;
    if (typeof c.query === 'string') result.query = c.query;
    if (typeof c.roleId === 'string') result.roleId = c.roleId;
    if (typeof c.slot === 'string') result.slot = c.slot;
    if (typeof c.snippet === 'string') result.snippet = c.snippet;
    if (typeof c.allowCreateLocal === 'boolean') result.allowCreateLocal = c.allowCreateLocal;
    return result;
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
    if (typeof r.deckSlot === 'string') entry.deckSlot = r.deckSlot;
    out.push(entry);
  }
  return out;
}

function inferLabwareClassCurie(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (/1536\s*[-_ ]?\s*well/.test(lower)) return 'CL:1536_well_plate';
  if (/384\s*[-_ ]?\s*well/.test(lower)) return 'CL:384_well_plate';
  if (/96\s*[-_ ]?\s*(deep\s*well|deepwell)/.test(lower)) return 'CL:96_deepwell_plate';
  if (/96\s*[-_ ]?\s*well/.test(lower)) return 'CL:96_well_plate';
  if (/48\s*[-_ ]?\s*well/.test(lower)) return 'CL:48_well_plate';
  if (/24\s*[-_ ]?\s*well/.test(lower) && /reservoir|reagent/.test(lower)) return 'CL:24_well_reservoir_vertical_384_pitch';
  if (/24\s*[-_ ]?\s*well/.test(lower)) return 'CL:24_well_plate';
  if (/16\s*[-_ ]?\s*well/.test(lower) && /reservoir|reagent/.test(lower)) return 'CL:16_well_reservoir_horizontal_384_pitch';
  if (/12\s*[-_ ]?\s*well/.test(lower) && /reservoir|reagent/.test(lower)) return 'CL:12_well_reservoir_vertical';
  if (/12\s*[-_ ]?\s*well/.test(lower)) return 'CL:12_well_plate';
  if (/8\s*[-_ ]?\s*well/.test(lower) && /reservoir|reagent/.test(lower)) return 'CL:8_well_reservoir_horizontal';
  if (/6\s*[-_ ]?\s*well/.test(lower)) return 'CL:6_well_plate';
  if (/(single|one)\s*[-_ ]?\s*well/.test(lower) && /reservoir|reagent/.test(lower)) return 'CL:single_well_reservoir_sbs';
  if (/50\s*ml/.test(lower) && /tube/.test(lower)) return 'CL:tube_rack_50ml';
  if (/15\s*ml/.test(lower) && /tube/.test(lower)) return 'CL:tube_rack_15ml';
  if (/5\s*ml/.test(lower) && /tube/.test(lower)) return 'CL:tube_rack_5ml';
  if (/2\s*ml/.test(lower) && /tube/.test(lower)) return 'CL:tube_rack_2ml';
  if (/(1\.5|1p5)\s*ml/.test(lower) && /tube/.test(lower)) return 'CL:tube_rack_1p5ml';
  if (/tube/.test(lower) && /rack|set/.test(lower)) return 'CL:tube_rack';
  return undefined;
}

function inferLabwareConstraints(text: string): string[] {
  const lower = text.toLowerCase();
  const constraints: string[] = [];
  const add = (curie: string) => {
    if (!constraints.includes(curie)) constraints.push(curie);
  };
  if (/\bblack\b|all[-_ ]black/.test(lower)) add('CL:black');
  if (/\bclear\b/.test(lower)) add('CL:clear');
  if (/white/.test(lower)) add('CL:white');
  if (/low[-_ ]?binding|non[-_ ]?binding/.test(lower)) add('CL:low_binding');
  if (/high[-_ ]?binding/.test(lower)) add('CL:high_binding');
  if (/flat[-_ ]?bottom/.test(lower)) add('CL:flat_bottom');
  if (/u[-_ ]?bottom/.test(lower)) add('CL:u_bottom');
  if (/v[-_ ]?bottom/.test(lower)) add('CL:v_bottom');
  if (/glass[-_ ]?bottom|glass/.test(lower)) add('CL:glass_bottom');
  if (/film[-_ ]?bottom|imaging/.test(lower)) add('CL:imaging_bottom');
  if (/polystyrene|\bps\b/.test(lower)) add('CL:polystyrene');
  if (/polypropylene|\bpp\b/.test(lower)) add('CL:polypropylene');
  return constraints;
}

function inferTubeVolumeClass(text: string): AgentLabwareRequirement['tubeVolumeClass'] | undefined {
  const lower = text.toLowerCase();
  if (/50\s*ml/.test(lower)) return '50ml';
  if (/15\s*ml/.test(lower)) return '15ml';
  if (/5\s*ml/.test(lower)) return '5ml';
  if (/2\s*ml/.test(lower)) return '2ml';
  if (/(1\.5|1p5)\s*ml/.test(lower)) return '1.5ml';
  return undefined;
}

function inferDeckSlot(text: string): string | undefined {
  const explicit = text.match(/\b(?:deck\s*)?slot\s+([A-Z][0-9]{1,2})\b/i);
  if (explicit?.[1]) return explicit[1].toUpperCase();
  const compact = text.match(/\b([A-Z][0-9]{1,2})\b/i);
  if (compact?.[1]) return compact[1].toUpperCase();
  return undefined;
}

function labwareRequirementFromAddition(addition: AgentLabwareAddition): AgentLabwareRequirement | null {
  const text = `${addition.recordId} ${addition.reason ?? ''}`;
  const classCurie = inferLabwareClassCurie(text);
  if (!classCurie) return null;

  const recordIdLooksInvented = /^LBW[-_:]/i.test(addition.recordId);
  const recordIdLooksConcreteDefinition = /[/@]/.test(addition.recordId);
  const recordIdLooksLikeDescription = !recordIdLooksConcreteDefinition && /plate|well|reservoir|tube|rack|deepwell/i.test(addition.recordId);
  if (!recordIdLooksInvented && !recordIdLooksLikeDescription) return null;

  const constraints = inferLabwareConstraints(text);
  const entry: AgentLabwareRequirement = {
    classCurie,
    specificity: constraints.length > 0 ? 'constrained' : 'generic',
  };
  if (typeof addition.reason === 'string') entry.reason = addition.reason;
  const deckSlot = typeof addition.deckSlot === 'string' ? addition.deckSlot : inferDeckSlot(text);
  if (deckSlot) entry.deckSlot = deckSlot;
  if (constraints.length > 0) entry.constraints = constraints;
  const tubeVolumeClass = inferTubeVolumeClass(text);
  if (tubeVolumeClass) entry.tubeVolumeClass = tubeVolumeClass;
  return entry;
}

function labwareRequirementFromClarification(clarification: AgentClarification | undefined, notes: string[]): AgentLabwareRequirement | null {
  if (!clarification || !/labware|plate|reservoir|tube/i.test(clarification.entityType)) return null;
  const optionText = clarification.options
    .map((option) => `${option.label} ${option.snippet ?? ''}`)
    .join(' ');
  const text = `${clarification.prompt} ${notes.join(' ')} ${optionText}`;
  const classCurie = inferLabwareClassCurie(text);
  if (!classCurie) return null;
  const entry: AgentLabwareRequirement = {
    classCurie,
    specificity: 'generic',
    reason: notes[0] ?? clarification.prompt,
  };
  const deckSlot = inferDeckSlot(text);
  if (deckSlot) entry.deckSlot = deckSlot;
  const tubeVolumeClass = inferTubeVolumeClass(text);
  if (tubeVolumeClass) entry.tubeVolumeClass = tubeVolumeClass;
  return entry;
}

function parseLabwareRequirements(raw: unknown): AgentLabwareRequirement[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentLabwareRequirement[] = [];
  for (const item of raw) {
    const r = asRecord(item);
    if (!r || typeof r.classCurie !== 'string' || r.classCurie.length === 0) continue;
    const entry: AgentLabwareRequirement = { classCurie: r.classCurie };
    if (typeof r.handle === 'string') entry.handle = r.handle;
    if (typeof r.reason === 'string') entry.reason = r.reason;
    if (typeof r.deckSlot === 'string') entry.deckSlot = r.deckSlot;
    if (Array.isArray(r.constraints)) entry.constraints = r.constraints.filter((c): c is string => typeof c === 'string' && c.length > 0);
    if (r.specificity === 'generic' || r.specificity === 'constrained' || r.specificity === 'concrete') entry.specificity = r.specificity;
    if (r.tubeVolumeClass === '1.5ml' || r.tubeVolumeClass === '2ml' || r.tubeVolumeClass === '5ml' || r.tubeVolumeClass === '15ml' || r.tubeVolumeClass === '50ml') entry.tubeVolumeClass = r.tubeVolumeClass;
    if (typeof r.rows === 'number') entry.rows = r.rows;
    if (typeof r.columns === 'number') entry.columns = r.columns;
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
  const notes = Array.isArray(args.notes) ? args.notes.filter((n): n is string => typeof n === 'string') : [];
  const clarification = parseClarification(args.clarification);
  const clarificationRequests: AgentClarificationRequest[] = [
    ...parseClarificationRequests(args.clarificationRequests),
    ...(clarification ? [clarificationRequestFromLegacy(clarification)] : []),
  ];
  const rawLabwareAdditions = parseLabwareAdditions(args.labwareAdditions);
  const inferredLabwareRequirements = rawLabwareAdditions
    .map(labwareRequirementFromAddition)
    .filter((entry): entry is AgentLabwareRequirement => entry !== null);
  const labwareClarificationRequirement = labwareRequirementFromClarification(clarification, notes);
  const labwareAdditions = rawLabwareAdditions.filter((addition) => labwareRequirementFromAddition(addition) === null);
  const labwareRequirements = [
    ...parseLabwareRequirements(args.labwareRequirements),
    ...inferredLabwareRequirements,
    ...(labwareClarificationRequirement ? [labwareClarificationRequirement] : []),
  ];

  const result: AgentResult = {
    success: true,
    events,
    notes,
    unresolvedRefs: Array.isArray(args.unresolvedRefs) ? (args.unresolvedRefs as OntologyRefProposal[]) : [],
    usage: {
      ...usage,
      totalTokens: usage.promptTokens + usage.completionTokens,
      turns,
      toolCalls,
    },
  };
  if (!labwareClarificationRequirement && clarificationRequests.length > 0) {
    result.clarificationRequests = clarificationRequests;
    const legacyClarification = legacyClarificationFromRequests(clarificationRequests);
    if (legacyClarification) result.clarification = legacyClarification;
  }
  if (labwareAdditions.length > 0) result.labwareAdditions = labwareAdditions;
  if (labwareRequirements.length > 0) result.labwareRequirements = labwareRequirements;
  return result;
}
