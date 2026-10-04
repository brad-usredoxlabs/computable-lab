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

import { gateEquipmentPlacementEvents, preferNamedEquipment } from './equipmentPlacementGate.js';
import type {
  AgentResult,
  AgentClarification,
  AgentClarificationOption,
  AgentClarificationRequest,
  AgentLabwareAddition,
  AgentLabwareRequirement,
  AgentAlsoPlace,
  AgentRecordCreation,
  AgentRecordCreationKind,
  AgentEquipmentRequirement,
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
  "- Ground every material/reagent/noun before referencing it. A {curie} is legitimate ONLY when it came from the `resolve` tool or appears in <resolved_context>. When `resolve` is available, call it first and use the top-ranked CURIE; when it is not (draft mode), NEVER recall, guess, or reconstruct a CURIE from memory.",
    '- For a named material you cannot ground to a resolved/known CURIE, GROUND IT with {mint:{label:<the user\'s exact words>,domain}} — it becomes a local proposed record, and the system then asks the user to confirm it. Do NOT guess a CURIE, and do NOT author the clarification yourself.',
    '- Finish by calling the `agent_intent` tool exactly once (intent "event_graph" to draft events, or "deck_layout" to switch the deck layout). Do NOT print JSON in your text reply.',
  "- In each event's `materials[]`, reference a material only as {curie} (from `resolve`) or {mint:{label,domain}} when no ontology term fits — never a bare free-text name. Use `role` for mixture semantics such as cells, buffer_component, or additive, `concentration` for component contributions such as 10% FBS, and `count` for absolute cell counts.",
  '- For requested labware, prefer `labwareRequirements[]` with a computable classCurie such as CL:96_well_plate, CL:384_well_plate, CL:96_deepwell_plate, CL:8_well_reservoir_horizontal, CL:12_well_reservoir_vertical, CL:single_well_reservoir_sbs, CL:16_well_reservoir_horizontal_384_pitch, CL:24_well_reservoir_vertical_384_pitch, or CL:tube_rack_15ml.',
  '- Do not ask which vendor/catalog/plate subtype for a generic request like "a 96-well plate". Emit a generic labwareRequirement and let the user refine it later.',
  '- Ask a labware clarification only when no baseline classCurie can be inferred at all.',
  '- Use `labwareAdditions[]` only when you have a concrete known labware record or definition id. Never invent LBW-* record ids.',
  '- If the context includes an active deck scope, do not propose labwareRequirements, labwareAdditions, deckSlot values, or lawn placements outside that scope. Ask for a layout-switch clarification instead.',
  '- MATERIALS ARE NEVER A CLARIFICATION YOU AUTHOR. Always DRAFT the add_material event and {mint} any material you cannot ground. Do NOT emit material clarificationRequests, do NOT invent their options (CURIEs/formulation ids/mint-pseudo-ids), and do NOT return events:[] for an add-materials request — the system confirms each minted material with the user via a live search.',
  '- Reserve `clarificationRequests[]` for genuinely non-material ambiguities you truly cannot draft past (and never to confirm a quantity/concentration the user already stated).',
  '- Do not ask the user to choose aliquots, vials, inventory sources, lots, or physical instances unless the user explicitly asked for a specific physical source. Draft concept/formulation additions first; inventory binding is a later refinement.',
  '- Never combine unrelated questions into one multiple-choice clarification. For example, concentration ambiguity and well-range ambiguity must be separate clarificationRequests.',
].join('\n');

const GROUNDED_REF_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      required: ['mint'],
      additionalProperties: false,
      properties: {
        mint: {
          type: 'object',
          description: 'DEFAULT in draft mode: mint a local material from the user\'s own words. label is the user\'s phrasing verbatim (e.g. "CHO cells").',
          required: ['label'],
          additionalProperties: false,
          properties: {
            label: { type: 'string' },
            domain: { type: 'string', description: 'cell_line | chemical | media | reagent | organism | sample | other' },
          },
        },
      },
    },
    {
      type: 'object',
      required: ['curie'],
      additionalProperties: false,
      properties: {
        curie: { type: 'string', description: 'ONLY a CURIE that appeared in <resolved_context> or was returned by resolve this session (e.g. "CHEBI:5001", "local:MAT-..."). NEVER a CURIE recalled from memory — mint instead.' },
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
      'Every material you reference MUST be grounded in the event\'s materials[]. In this draft mode the resolve tool is ' +
      'NOT available, so the default grounding is {mint:{label,domain}} using the user\'s OWN WORDS as the label — minting a ' +
      'named material (e.g. {mint:{label:"CHO cells",domain:"cell_line"}}) is the correct, expected action, not "inventing" it. ' +
      'Use {curie} ONLY for a CURIE that appears verbatim in <resolved_context> or that resolve returned this session. ' +
      'NEVER write an ontology id (CHEBI:/EFO:/NCBITaxon:/…) recalled from memory — that is a hallucination. When unsure which ' +
      'specific record the user means, {mint} it with their words and let the system ask — do NOT author the clarification or invent its options.',
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
                      'Display reference mirroring the grounded materials[] entry. For a minted material use the user\'s ' +
                      'wording, e.g. {"kind":"local","label":"CHO cells"}; only use {"kind":"ontology","id":"CHEBI:5001",…} ' +
                      'when that exact CURIE came from <resolved_context>. ALWAYS include the human-readable label, and never ' +
                      'put an ontology id recalled from memory here.',
                  },
                },
              },
              materials: {
                type: 'array',
                description: 'Grounded material references for this event. Prefer {mint:{label,domain}} with the user\'s wording; use {curie} only for a CURIE present in <resolved_context>.',
                items: {
                  type: 'object',
                  required: ['ref'],
                  additionalProperties: false,
                  properties: {
                    slot: { type: 'string', description: 'e.g. "source", "target", "reagent".' },
                    role: { type: 'string', description: 'Composition role, e.g. cells, buffer_component, additive, solute, solvent, other.' },
                    count: { type: 'number', description: 'Absolute material count when the user specifies one, e.g. 10000 cells.' },
                    volume: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['value', 'unit'],
                      description: 'Amount to add when the user specified a VOLUME (e.g. "200 µL"). Use this for media/reagent/solvent additions — do NOT file a volume as `count`.',
                      properties: {
                        value: { type: 'number' },
                        unit: { type: 'string', description: 'e.g. uL, mL, L.' },
                      },
                    },
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
          description: 'Atomic follow-up questions for ambiguous materials, labware, equipment, concentrations, or wells — including a named material/cell line/reagent/instrument you cannot confidently ground. Use one request per ambiguity. Use menuProvider /m for named material/ontology choices, /l for labware choices, and /e for equipment (instruments): ask with /e whenever the user names an instrument you cannot resolve to a record — the app searches your laboratory records AND the web, so the user picks a REAL instrument instead of you inventing one. Any options you list must be candidates taken from the provided context (a recordId you were given) — never invent an option id, and never offer an entity you made up; if you have no grounded candidate, omit options and let the app search. Do not ask for aliquots, vials, inventory sources, lots, or physical instances unless the user explicitly requested a physical source.',
          items: {
            type: 'object',
            required: ['id', 'kind', 'prompt'],
            properties: {
              id: { type: 'string' },
              kind: { type: 'string', enum: ['material', 'aliquot', 'labware', 'vendor-product', 'ontology', 'parameter', 'well-selection', 'sequence', 'general'] },
              prompt: { type: 'string' },
              entityType: { type: 'string' },
              menuProvider: { type: 'string', enum: ['/m', '/l', '/e', 'choice'] },
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
        equipmentRequirements: {
          type: 'array',
          description:
            'Bench EQUIPMENT to place on the bench (water bath, heat block, heater-shaker, orbital shaker, rocker, vortex, qPCR machine, plate reader). Equipment is NOT labware: it has no wells and no addressing, and it is never placed in a deck slot — say that plainly instead of refusing in prose. '
            + 'Records-first: if the lab already owns it, use `recordId` (an EQP- id from the provided context) and warn if the user asks to create something that already exists. '
            + 'Otherwise use `classCurie`, spelled `equipment:<kind>` for a generic kind (equipment:water_bath, equipment:heat_block, equipment:heater_shaker, equipment:orbital_shaker, equipment:rocker, equipment:vortex_mixer, equipment:qpcr, equipment:plate_reader) or an EQC- id for a specific evidenced model — never invent a CL: class CURIE (it is derived). '
            + '`settings` carries the values the equipment is set to, keyed by the class settingsDefinition (e.g. {"temperature_c":55} for a water bath, {"temperature_c":70,"rpm":300} for a heater-shaker); settings the user states belong here, and a later change of setting is its own event, not a rewrite of this one. '
            + 'Do not describe what the equipment accepts — acceptance is decided by the capability/seat data, not by the model. Never emit a seat relationship (seatOn/placedIn): the editor cannot render it yet.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              classCurie: {
                type: 'string',
                description: 'Generic equipment kind as equipment:<kind>, or an EQC- equipment-class record id. Never a CL: CURIE.',
              },
              recordId: {
                type: 'string',
                description: 'An EQP- equipment record id when the lab already owns this equipment (records-first).',
              },
              handle: { type: 'string', description: 'Optional user-visible handle matching the user\'s words, e.g. "bath 55".' },
              reason: { type: 'string' },
              settings: {
                type: 'object',
                additionalProperties: true,
                description: 'Values this instance is set to, keyed by the class settingsDefinition (temperature_c, rpm, timer_s…).',
              },
              source: { type: 'string', description: 'Attribution: where this model came from (user description, Exa search, existing record).' },
            },
          },
        },
        records: {
          type: 'array',
          minItems: 1,
          description:
            'Records the lab does NOT have yet, which the user wants added — the AUTHORING act, for intent "create_record". This is not a placement: putting something you already have on the bench is equipmentRequirements / labwareRequirements inside intent "event_graph", and a record the lab already owns must be PLACED, not re-created. '
            + 'Nothing is written when you emit this: the user reviews the proposal and Accept creates the record, warning instead of duplicating if the lab turns out to have it. '
            + 'One entry per record, with `kind` naming what it is: "equipment" (an instrument — water bath, heater-shaker, incubator, plate reader), "material" (a reagent, chemical, cell line, medium) or "labware" (a plate, reservoir, tube, rack). '
            + 'NEVER downgrade a named product into a generic kind: if the user names a specific model you cannot resolve (e.g. "the lab\'s Benchmark Incu-Mixer MP4"), ask with an /e clarification, or state where the specification came from in `source` — classKind alone is only for a kind the user actually spoke generically ("add a water bath"). '
            + 'ALWAYS set `source` to the attribution: "user-description" for the user\'s own words, "exa:<url>" for a web-grounded specification, "record:<id>" when reusing a record you were given. An entry with no source is still recorded, but it is flagged as ungrounded for the user to fix. '
            + 'Do not claim facts no source stated: omit `settings`/`format` rather than guessing, and say what is unknown in `reason`.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'name'],
            properties: {
              kind: { type: 'string', enum: ['equipment', 'material', 'labware'] },
              name: { type: 'string', description: 'The name as the lab/user says it, e.g. "Benchmark Incu-Mixer MP4".' },
              handle: { type: 'string', description: 'Optional short handle used to refer to it in later turns.' },
              classKind: {
                type: 'string',
                description: 'equipment only: the generic kind as equipment:<kind> (equipment:water_bath, equipment:heater_shaker, …) — only when the user spoke generically. Never a CL: CURIE.',
              },
              classRecordId: {
                type: 'string',
                description: 'equipment only: an EQC- equipment-class record id when a matching class already exists locally (records-first).',
              },
              curie: {
                type: 'string',
                description: 'material only: an ontology id (CHEBI:/CL:/NCBITaxon:…) when the material IS that known entity, and it appeared in <resolved_context>.',
              },
              domain: {
                type: 'string',
                enum: ['chemical', 'cell_line', 'organism', 'reagent', 'other'],
                description: 'material only: what kind of material this is.',
              },
              labwareType: {
                type: 'string',
                enum: ['plate', 'deepwell', 'reservoir', 'tube', 'tiprack', 'rack'],
                description: 'labware only: the vessel type.',
              },
              format: {
                type: 'object',
                additionalProperties: false,
                description: 'labware only: the well layout when it is known (e.g. 96 = 8 rows x 12 cols).',
                properties: {
                  rows: { type: 'number' },
                  cols: { type: 'number' },
                  wellCount: { type: 'number' },
                },
              },
              settings: {
                type: 'object',
                additionalProperties: true,
                description: 'equipment only: values stated by the source, keyed by the class settingsDefinition (temperature_c, rpm, …). Omit what was not stated.',
              },
              source: { type: 'string', description: 'Attribution: "user-description" | "exa:<url>" | "record:<id>".' },
              reason: { type: 'string', description: 'Why this is being added, and what remains unknown/for the user to confirm.' },
            },
          },
        },
        alsoPlace: {
          type: 'object',
          additionalProperties: false,
          description:
            'intent "create_record" only, and only for equipment or labware (a material has no bench position): put the record you just created on the bench in this same turn. Creating and placing are two decisions — leaving this out means the record is created and NOT placed.',
          properties: {
            surface: { type: 'string', enum: ['lawn', 'slot'] },
            slotId: { type: 'string', description: 'Required when surface is "slot" (e.g. B2).' },
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

/** The draft tool's event-graph arg fields, reused verbatim inside agent_intent's
 *  event_graph branch so the model fills the same schema it does today. */
const DRAFT_ARGS_PROPERTIES: Record<string, unknown> = (
  COMPILE_EVENT_GRAPH_DRAFT_TOOL_DEF.function.parameters as {
    properties?: Record<string, unknown>;
  }
).properties ?? {};

/**
 * agent_intent — the single forced emission tool in draft mode.
 *
 * The model MUST call exactly this one tool each turn, and inside it pick ONE
 * intent from a small constrained menu (never a free prose answer):
 *   - `event_graph`: draft events onto the current deck (existing draft args).
 *   - `deck_layout`: switch the run deck platform/variant (e.g. to the freeform
 *     bench). No event drafting — the client applies the change to the editor.
 *   - `protocol_edit`: propose declarative edits to the ATTACHED protocol via
 *     the `ops` envelope (PROTO-AI-2 schema). The server validates the payload
 *     against the REGISTERED schema and emits the proposal; it runs nothing
 *     else — propose, never write (PROTO-AI-7).
 *
 * Keeping a single forced tool (tool_choice) preserves the hard constraint that
 * the model emits structured output every turn, while widening the menu beyond
 * the lone draft tool.
 */
export const AGENT_INTENT_TOOL_NAME = 'agent_intent';

export const AGENT_INTENT_TOOL_DEF: ToolDefinition = {
  type: 'function',
  function: {
    name: AGENT_INTENT_TOOL_NAME,
    description:
      'Emit EXACTLY ONE declarative agent intent for this turn. Choose `event_graph` to compile a draft event graph onto the current deck, `deck_layout` to switch the deck layout (platform/variant — e.g. variant `manual_freeform` is the freeform bench / "Manual Bench"), or `protocol_edit` to propose declarative edits to the ATTACHED protocol (an `ops` envelope — nothing is written until the user accepts the proposal). Fill only the fields that belong to the intent you chose; never mix intents.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['intent'],
      properties: {
        intent: {
          type: 'string',
          enum: ['event_graph', 'deck_layout', 'create_record', 'protocol_edit'],
          description:
            'event_graph: compile a draft event graph (ghostable events / clarification gaps). deck_layout: change the run deck layout — set platformId/variantId and leave the event fields empty. protocol_edit: propose edits to the attached protocol via `ops` — cite only stepIds/roleIds from the ATTACHED PROTOCOL block; the server validates the envelope and PROPOSES it (it writes nothing).',
        },
        platformId: {
          type: 'string',
          description: 'deck_layout only: target deck platform id (omit to keep the current platform).',
        },
        variantId: {
          type: 'string',
          description: 'deck_layout only: target deck variant id, e.g. "manual_freeform" (the freeform bench / Manual Bench).',
        },
        protocolId: {
          type: 'string',
          description: 'protocol_edit only (optional): target protocol record id (e.g. "PRT-000123"). Omit when the proposal rides the attached-protocol scope — the scope already binds the target.',
        },
        ops: {
          type: 'array',
          minItems: 1,
          description:
            'protocol_edit only: the ordered edit operations against the attached protocol. The server validates this against the registered protocol-edit-op schema; an invalid op is rejected back to you, never applied. Cite ONLY stepIds/roleIds shown in the ATTACHED PROTOCOL block.',
          items: {
            type: 'object',
            required: ['op'],
            properties: {
              op: {
                type: 'string',
                enum: [
                  'step_update',
                  'step_insert',
                  'step_delete',
                  'labware_add',
                  'labware_update',
                  'labware_delete',
                  'equipment_add',
                  'equipment_update',
                  'equipment_delete',
                ],
              },
              stepId: { type: 'string', description: 'step_update / step_delete: existing step id (^[a-z][a-z0-9-]*$).' },
              afterStepId: { type: 'string', description: 'step_insert: anchor — insert after this existing step (exactly one of afterStepId/beforeStepId).' },
              beforeStepId: { type: 'string', description: 'step_insert: anchor — insert before this existing step.' },
              roleId: { type: 'string', description: 'labware_* / equipment_*: declared role id (^[a-z0-9][a-z0-9_-]*$).' },
              label: { type: 'string', description: 'step_update: replacement label; step_insert: label of the new step.' },
              description: { type: 'string', description: 'Replacement/added plain-text description (rich text is derived at apply time, never proposed).' },
              notes: { type: 'string', description: 'step_update: replacement operator notes.' },
              kind: { type: 'string', enum: ['add_material', 'transfer', 'mix', 'wash', 'incubate', 'read', 'harvest', 'other'], description: 'step kind — only the base ProtocolStep kinds.' },
              settings: {
                type: 'array',
                items: { type: 'object', additionalProperties: true },
                description: 'step_update: replacement step settings — ALWAYS the array form (Setting objects), even for kind read.',
              },
              expectedLabwareKinds: { type: 'array', items: { type: 'string' }, description: 'labware_add/update: compatible labware DESIGN record ids.' },
              allowedInstrumentIds: { type: 'array', items: { type: 'string' }, description: 'equipment_add/update: allowable instrument DESIGN record ids.' },
            },
          },
        },
        events: DRAFT_ARGS_PROPERTIES['events'],
        notes: DRAFT_ARGS_PROPERTIES['notes'],
        unresolvedRefs: DRAFT_ARGS_PROPERTIES['unresolvedRefs'],
        clarification: DRAFT_ARGS_PROPERTIES['clarification'],
        clarificationRequests: DRAFT_ARGS_PROPERTIES['clarificationRequests'],
        labwareRequirements: DRAFT_ARGS_PROPERTIES['labwareRequirements'],
        equipmentRequirements: DRAFT_ARGS_PROPERTIES['equipmentRequirements'],
        records: DRAFT_ARGS_PROPERTIES['records'],
        alsoPlace: DRAFT_ARGS_PROPERTIES['alsoPlace'],
        labwareAdditions: DRAFT_ARGS_PROPERTIES['labwareAdditions'],
      },
    },
  },
};

export interface AgentIntentArgs {
  intent: 'event_graph' | 'deck_layout' | 'create_record' | 'protocol_edit' | 'unknown';
  platformId?: string;
  variantId?: string;
  /**
   * protocol_edit only: the ops envelope EXACTLY as the model emitted it. The
   * parser retains the array by reference — no copy, filter, or reorder — so
   * the schema validator sees the model's own answer, and the emission path
   * re-emits that same validated array. (Parsing happens BEFORE validation;
   * any "help" here would silently mutate the proposal under audit.)
   */
  ops?: unknown[];
  /** protocol_edit only: explicit target protocol record id, if stated. */
  protocolId?: string;
}

/** Decode the selected intent from an agent_intent args payload. */
export function parseAgentIntentArgs(args: Record<string, unknown>): AgentIntentArgs {
  const intent = args.intent;
  if (intent === 'event_graph' || intent === 'deck_layout' || intent === 'create_record' || intent === 'protocol_edit') {
    return {
      intent,
      ...(typeof args.platformId === 'string' && args.platformId.trim().length > 0 ? { platformId: args.platformId.trim() } : {}),
      ...(typeof args.variantId === 'string' && args.variantId.trim().length > 0 ? { variantId: args.variantId.trim() } : {}),
      ...(intent === 'protocol_edit' && Array.isArray(args.ops) ? { ops: args.ops } : {}),
      ...(intent === 'protocol_edit' && typeof args.protocolId === 'string' && args.protocolId.trim().length > 0
        ? { protocolId: args.protocolId.trim() }
        : {}),
    };
  }
  return { intent: 'unknown' };
}


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
      const volume = parseQuantityObject(r.volume);
      if (volume) m.volume = volume;
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
        const volume = parseQuantityObject(r.volume);
        if (volume) m.volume = volume;
        const concentration = parseConcentrationValue(r.concentration);
        if (concentration) m.concentration = concentration;
        out.push(m);
      }
    }
  }
  return out;
}

/** Read `{value,unit}` (with optional commas) from a draft volume object. */
function parseQuantityObject(raw: unknown): { value: number; unit: string } | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const value = typeof record.value === 'number' && Number.isFinite(record.value) ? record.value
    : typeof record.value === 'string' && record.value.trim() ? parseCommaNumber(record.value) : NaN;
  if (!Number.isFinite(value)) return undefined;
  if (typeof record.unit !== 'string' || record.unit.trim().length === 0) return undefined;
  return { value, unit: record.unit.trim() };
}

function parseCommaNumber(text: string): number {
  const cleaned = text.replace(/[,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
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
    if (c.menuProvider === '/m' || c.menuProvider === '/l' || c.menuProvider === '/e' || c.menuProvider === 'choice') result.menuProvider = c.menuProvider;
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
 * Bench equipment requirements. Equipment is not labware: an entry names either an
 * `EQP-` record (records-first) or a class — `equipment:<kind>` for a generic kind,
 * or an `EQC-` id for a specific evidenced model. A malformed entry is DROPPED, not
 * coerced: inventing equipment the user never asked for is worse than a skip.
 */
function parseEquipmentRequirements(raw: unknown): AgentEquipmentRequirement[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentEquipmentRequirement[] = [];
  for (const item of raw) {
    const r = asRecord(item);
    if (!r) continue;
    const classCurie = typeof r.classCurie === 'string' && r.classCurie.length > 0 ? r.classCurie : undefined;
    const recordId = typeof r.recordId === 'string' && r.recordId.length > 0 ? r.recordId : undefined;
    if (!classCurie && !recordId) continue;
    const entry: AgentEquipmentRequirement = {};
    if (classCurie) entry.classCurie = classCurie;
    if (recordId) entry.recordId = recordId;
    if (typeof r.handle === 'string') entry.handle = r.handle;
    if (typeof r.reason === 'string') entry.reason = r.reason;
    if (typeof r.source === 'string') entry.source = r.source;
    const settings = asRecord(r.settings);
    if (settings) entry.settings = settings;
    out.push(entry);
  }
  return out;
}

/**
 * Equipment the draft wants AUTHORED (the add, as opposed to a placement of
 * something that exists). An entry without a name is dropped — a nameless
 * instrument cannot be created honestly.
 */
/** Every field the emission contract recognises. Anything else is reported back. */
const KNOWN_SUBMISSION_KEYS = new Set([
  'intent', 'platformId', 'variantId',
  'ops', 'protocolId',
  'events', 'notes', 'unresolvedRefs', 'clarification', 'clarificationRequests',
  'labwareRequirements', 'labwareAdditions', 'equipmentRequirements',
  'records', 'alsoPlace',
]);

export function parseRecordCreations(raw: unknown): AgentRecordCreation[] {
  if (!Array.isArray(raw)) return [];
  const str = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  /** A class token must look like one: `equipment:<kind>` or an EQ[PC]- id. */
  const classToken = (value: unknown): string | undefined => {
    const token = str(value);
    return token && /^(equipment:|EQ[PC]-)/i.test(token) ? token : undefined;
  };
  const out: AgentRecordCreation[] = [];
  for (const item of raw) {
    const r = asRecord(item);
    if (!r) continue;
    // Local models do not always use our exact key names. The contract's job is to
    // capture the intent, so the obvious spellings are accepted — and anything still
    // unusable is REPORTED (see the empty-submission note) rather than dropped in
    // silence.
    const name = str(r.name) ?? str(r.equipmentName) ?? str(r.label) ?? str(r.title);
    if (!name) continue;
    const kind = creationKind(r.kind ?? r.recordKind ?? r.type);
    if (!kind) continue;
    const entry: AgentRecordCreation = { kind, name };
    if (typeof r.handle === 'string') entry.handle = r.handle;
    const classKind = classToken(r.classKind) ?? classToken(r.class);
    if (classKind) entry.classKind = classKind;
    const classRecordId = str(r.classRecordId) ?? str(r.classId);
    if (classRecordId) entry.classRecordId = classRecordId;
    const curie = str(r.curie) ?? str(r.ontologyId);
    if (curie) entry.curie = curie;
    const domain = str(r.domain);
    if (domain) entry.domain = domain;
    const labwareType = str(r.labwareType) ?? str(r.type_);
    if (labwareType) entry.labwareType = labwareType;
    const format = asRecord(r.format);
    if (format) {
      // Pick the fields the contract declares, so a stray key cannot ride along.
      const picked: NonNullable<AgentRecordCreation['format']> = {};
      if (typeof format.rows === 'number') picked.rows = format.rows;
      if (typeof format.cols === 'number') picked.cols = format.cols;
      if (typeof format.wellCount === 'number') picked.wellCount = format.wellCount;
      if (Object.keys(picked).length > 0) entry.format = picked;
    }
    if (typeof r.source === 'string') entry.source = r.source;
    if (typeof r.reason === 'string') entry.reason = r.reason;
    const settings = asRecord(r.settings);
    if (settings) entry.settings = settings;
    out.push(entry);
  }
  return out;
}

/** The creation kinds, tolerantly (a record `kind` is sometimes the only cue). */
function creationKind(value: unknown): AgentRecordCreationKind | undefined {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'equipment' || raw === 'instrument' || raw === 'device') return 'equipment';
  if (raw === 'material' || raw === 'reagent' || raw === 'chemical' || raw === 'cell_line') return 'material';
  if (raw === 'labware' || raw === 'plate' || raw === 'reservoir' || raw === 'tube' || raw === 'rack') return 'labware';
  return undefined;
}

/** `alsoPlace` — the explicit "put what you just created on the bench". */
export function parseAlsoPlace(raw: unknown): AgentAlsoPlace | undefined {
  const r = asRecord(raw);
  if (!r) return undefined;
  const surface = typeof r.surface === 'string' ? r.surface.trim().toLowerCase() : '';
  const slotId = typeof r.slotId === 'string' ? r.slotId.trim() : undefined;
  if (surface !== 'lawn' && surface !== 'slot' && !slotId) return undefined;
  const placement: AgentAlsoPlace = {};
  if (surface === 'lawn' || surface === 'slot') placement.surface = surface;
  else if (slotId) placement.surface = 'slot';
  if (slotId) placement.slotId = slotId;
  return placement;
}

/** True for the equipment spelling: `equipment:<kind>` (or `EQP-`/`EQC-` ids). */
function isEquipmentToken(token: unknown): boolean {
  return typeof token === 'string' && /^(equipment:|EQ[PC]-)/i.test(token);
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
  /**
   * `namedEquipmentIds` are the instruments the USER named this turn (an
   * `[[equipment:EQP-…]]` mention). They are ground truth: if the draft references
   * an instrument as if it were labware, the named one wins.
   */
  options: { namedEquipmentIds?: string[]; namedEquipmentLabels?: Record<string, string> } = {},
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
  // A misfiled equipment token must never reach labware minting (it would collapse
  // into `tubeset_24` via labwareRequirement.ts). Route it to the equipment field.
  const requestedLabwareRequirements = parseLabwareRequirements(args.labwareRequirements);
  const misfiledEquipment = requestedLabwareRequirements.filter((requirement) => isEquipmentToken(requirement.classCurie));
  const keptLabwareRequirements = requestedLabwareRequirements.filter((requirement) => !isEquipmentToken(requirement.classCurie));
  const labwareRequirements = [
    ...keptLabwareRequirements,
    ...inferredLabwareRequirements,
    ...(labwareClarificationRequirement ? [labwareClarificationRequirement] : []),
  ];
  // Equipment: what the model asked for directly, plus anything it misfiled into
  // labwareRequirements. `EQP-`/`EQC-` tokens keep their id; `equipment:<kind>`
  // keeps its kind spelling (the client derives the CL: class CURIE).
  const equipmentRequirements = [
    ...parseEquipmentRequirements(args.equipmentRequirements),
    ...misfiledEquipment.map((requirement): AgentEquipmentRequirement => {
      const entry: AgentEquipmentRequirement = {};
      if (isEquipmentToken(requirement.classCurie)) {
        if (/^EQ[PC]-/i.test(requirement.classCurie)) entry.recordId = requirement.classCurie;
        else entry.classCurie = requirement.classCurie;
      }
      if (requirement.handle) entry.handle = requirement.handle;
      if (requirement.reason) entry.reason = requirement.reason;
      return entry;
    }),
  ];

  // An instrument is never an event: convert a draft that references one from a
  // tube/transfer event into the placement channel, and say so (see
  // equipmentPlacementGate). Runs before the result is built so every downstream
  // consumer sees the corrected shape.
  const gated = gateEquipmentPlacementEvents(events as Array<{
    eventId?: string;
    event_type?: string;
    verb?: string;
    details?: Record<string, unknown>;
    notes?: string;
  }>, options);
  const acceptedEvents = gated.events as typeof events;
  // The instruments the user NAMED outrank a generic stand-in the draft reached for.
  const preferred = preferNamedEquipment(
    [...gated.equipmentRequirements, ...equipmentRequirements],
    options,
  );
  const allEquipmentRequirements = preferred.equipmentRequirements;
  const allNotes = [...notes, ...gated.notes, ...preferred.notes];

  const result: AgentResult = {
    success: true,
    events: acceptedEvents,
    notes: allNotes,
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
  if (allEquipmentRequirements.length > 0) result.equipmentRequirements = allEquipmentRequirements;

  // A submission that proposes NOTHING must say so. Reported failure (2026-09-19):
  // the user answered the assistant's question, the model called agent_intent with
  // no usable fields, and the panel showed a bare "(no response)" — which reads as a
  // crash rather than "the model proposed nothing, here is what it sent".
  const proposedSomething =
    acceptedEvents.length > 0
    || allNotes.length > 0
    || labwareAdditions.length > 0
    || labwareRequirements.length > 0
    || allEquipmentRequirements.length > 0
    || clarificationRequests.length > 0
    || clarification !== undefined
    || labwareClarificationRequirement !== null;
  if (!proposedSomething) {
    const unknownKeys = Object.keys(args).filter((key) => !KNOWN_SUBMISSION_KEYS.has(key));
    const detail = unknownKeys.length > 0
      ? `Unrecognized fields: ${unknownKeys.join(', ')}. `
      : '';
    result.notes = [
      ...(result.notes ?? []),
      `The model called ${AGENT_INTENT_TOOL_NAME} but proposed nothing this turn. ${detail}`
      + 'Nothing was placed: answer it, or rephrase the request so it can emit a field.',
    ];
  }
  return result;
}
