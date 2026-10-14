/**
 * Simple biology verb expanders.
 * 
 * This module registers expanders for 13 simple biology verbs that can be
 * lowered to primitive event types. Each expander is kept under 20 lines.
 */

import { registerVerbExpander, makeEventId, type BiologyVerbExpander, type PlateEventPrimitive, type VerbInput } from '../BiologyVerbExpander.js';
import { getAssaySpecRegistry } from '../../../registry/AssaySpecRegistry.js';
import { expandWellTokens } from '../../../ai/wellRange.js';

/**
 * Shared helper for verbs that do add_material + incubate.
 * Creates two events: add_material followed by incubate.
 */
function addMaterialAndIncubate(
  verb: string,
  input: VerbInput,
  defaultDurationIso: string,
  defaultTempC: number
): PlateEventPrimitive[] {
  const { params } = input;
  const materialName = (params.material_name || params.reagent || params[`${verb}_reagent`] || `${verb}_agent`) as string;
  const volume = params.volume as string | undefined;
  const duration = (params.incubation_duration || params.duration || defaultDurationIso) as string;
  const temp = (params.temperature ?? defaultTempC) as number;
  
  const events: PlateEventPrimitive[] = [];
  
  // add_material event
  events.push({
    eventId: makeEventId(`${verb}_add`),
    event_type: 'add_material',
    details: {
      material: materialName,
      ...(volume ? { volume } : {}),
    },
    ...((params.labware_id as string | undefined) ? { labwareId: params.labware_id as string } : {}),
  });
  
  // incubate event
  events.push({
    eventId: makeEventId(`${verb}_incubate`),
    event_type: 'incubate',
    details: {
      duration,
      temperature: temp,
      ...(params.atmosphere ? { atmosphere: params.atmosphere } : {}),
    },
    ...((params.labware_id as string | undefined) ? { labwareId: params.labware_id as string } : {}),
    t_offset: duration,
  });
  
  return events;
}

/**
 * seed: add_material event for seeding cells into wells.
 */
export const seedExpander: BiologyVerbExpander = {
  verb: 'seed',
  expand(input) {
    const { params } = input;
    const material = (params.cell_ref || params.material_ref || params.cells) as string;
    const volume = params.volume as string | undefined;
    const labwareId = params.labware_id as string | undefined;
    
    return [{
      eventId: makeEventId('seed'),
      event_type: 'add_material',
      details: {
        material,
        ...(volume ? { volume } : {}),
      },
      labwareId,
    }];
  },
};

/**
 * incubate: single incubate event.
 */
export const incubateExpander: BiologyVerbExpander = {
  verb: 'incubate',
  expand(input) {
    const { params } = input;
    const duration = (params.duration || params.incubation_duration || 'PT1H') as string;
    const temp = (params.temperature ?? 37) as number;
    
    return [{
      eventId: makeEventId('incubate'),
      event_type: 'incubate',
      details: {
        duration,
        temperature: temp,
        ...(params.atmosphere ? { atmosphere: params.atmosphere } : {}),
      },
      labwareId: params.labware_id as string | undefined,
      t_offset: duration,
    }];
  },
};

/**
 * mix: single mix event.
 */
export const mixExpander: BiologyVerbExpander = {
  verb: 'mix',
  expand(input) {
    const { params } = input;
    const volume = params.volume as string | undefined;
    const cycles = params.cycles as number | undefined;
    
    return [{
      eventId: makeEventId('mix'),
      event_type: 'mix',
      details: {
        ...(volume ? { volume } : {}),
        ...(cycles ? { cycles } : {}),
      },
      labwareId: params.labware_id as string | undefined,
    }];
  },
};

/**
 * resuspend: single mix event (same as mix).
 */
export const resuspendExpander: BiologyVerbExpander = {
  verb: 'resuspend',
  expand(input) {
    const { params } = input;
    const volume = params.volume as string | undefined;
    const cycles = params.cycles ?? 10; // default many cycles for resuspend
    
    return [{
      eventId: makeEventId('resuspend'),
      event_type: 'mix',
      details: {
        ...(volume ? { volume } : {}),
        cycles,
      },
      labwareId: params.labware_id as string | undefined,
    }];
  },
};

/**
 * dilute: add_material (diluent) then mix.
 */
export const diluteExpander: BiologyVerbExpander = {
  verb: 'dilute',
  expand(input) {
    const { params } = input;
    const diluentVolume = params.diluent_volume as string | undefined;
    const material = params.diluent || 'diluent';
    const cycles = params.cycles ?? 5;
    
    return [
      {
        eventId: makeEventId('dilute_add'),
        event_type: 'add_material',
        details: {
          material,
          ...(diluentVolume ? { volume: diluentVolume } : {}),
        },
        labwareId: params.labware_id as string | undefined,
      },
      {
        eventId: makeEventId('dilute_mix'),
        event_type: 'mix',
        details: {
          cycles,
        },
        labwareId: params.labware_id as string | undefined,
      },
    ];
  },
};

/**
 * count: single read event with readout='cell_count'.
 */
export const countExpander: BiologyVerbExpander = {
  verb: 'count',
  expand(input) {
    const { params } = input;
    return [{
      eventId: makeEventId('count'),
      event_type: 'read',
      details: {
        readout: 'cell_count',
        ...(params.value ? { value: params.value } : {}),
      },
      labwareId: params.labware_id as string | undefined,
    }];
  },
};

/**
 * stain: add_material (stain) then incubate.
 */
export const stainExpander: BiologyVerbExpander = {
  verb: 'stain',
  expand(input) {
    return addMaterialAndIncubate('stain', input, 'PT15M', 37);
  },
};

/**
 * fix: add_material (fixative) then incubate.
 */
export const fixExpander: BiologyVerbExpander = {
  verb: 'fix',
  expand(input) {
    return addMaterialAndIncubate('fix', input, 'PT15M', 4);
  },
};

/**
 * permeabilize: add_material (permeabilization_buffer) then incubate.
 */
export const permeabilizeExpander: BiologyVerbExpander = {
  verb: 'permeabilize',
  expand(input) {
    return addMaterialAndIncubate('permeabilize', input, 'PT15M', 37);
  },
};

/**
 * block: add_material (blocking_buffer) then incubate.
 */
export const blockExpander: BiologyVerbExpander = {
  verb: 'block',
  expand(input) {
    return addMaterialAndIncubate('block', input, 'PT1H', 20);
  },
};

/**
 * quench: add_material (quencher) then incubate.
 */
export const quenchExpander: BiologyVerbExpander = {
  verb: 'quench',
  expand(input) {
    return addMaterialAndIncubate('quench', input, 'PT10M', 20);
  },
};

/**
 * label: add_material (label_reagent) then incubate.
 */
export const labelExpander: BiologyVerbExpander = {
  verb: 'label',
  expand(input) {
    return addMaterialAndIncubate('label', input, 'PT30M', 37);
  },
};

/**
 * transfect: add_material (transfection_reagent+DNA complex) then incubate.
 */
export const transfectExpander: BiologyVerbExpander = {
  verb: 'transfect',
  expand(input) {
    return addMaterialAndIncubate('transfect', input, 'PT24H', 37);
  },
};

/**
 * read: single read event with instrument metadata.
 * When an assayId is provided, looks up the assay-spec to populate
 * channelMap and analysisRules from the resolved assay definition.
 */
export const readExpander: BiologyVerbExpander = {
  verb: 'read',
  expand(input) {
    const { params } = input;
    const instrument = params.instrument as string | undefined;
    const assayId = params.assayId as string | undefined;
    const well = params.well as string | undefined;
    const wells = params.wells as string[] | undefined;
    const mode = params.mode as string | undefined;
    const wavelengthNm = params.wavelengthNm as number | undefined;
    const integrationMs = params.integrationMs as number | undefined;
    const simulate = params.simulate as boolean | undefined;

    const details: Record<string, unknown> = {
      ...(instrument ? { instrument } : {}),
      ...(well ? { well } : {}),
      ...(wells ? { wells } : {}),
      ...(mode ? { mode } : {}),
      ...(wavelengthNm !== undefined ? { wavelengthNm } : {}),
      ...(integrationMs !== undefined ? { integrationMs } : {}),
      ...(simulate !== undefined ? { simulate } : {}),
    };

    // Optional: resolve assay-spec to populate channelMap and analysisRules
    if (assayId) {
      const assaySpec = getAssaySpecRegistry().get(assayId);
      if (assaySpec) {
        if (assaySpec.channelMaps) {
          details.channelMap = assaySpec.channelMaps;
        }
        if (assaySpec.analysisRules) {
          details.analysisRules = assaySpec.analysisRules;
        }
      }
      // If assay-spec not found, emit read with just instrument (non-fatal)
    }

    return [{
      eventId: makeEventId('read'),
      event_type: 'read',
      details,
      labwareId: params.labware_id as string | undefined,
    }];
  },
};

/**
 * SHORTHAND-COMP-3 (Part I task 3): a mixture the scientist names arrives as
 * `params.composition` — one entry per component. Emit it as the event's
 * `composition_snapshot` (one ledger line per component; the store-write
 * normalization in AddMaterialSupport mints a material record per component
 * and one complex_composition material-spec for the mixture). A `cells`
 * component carries a COUNT, never a volume — no code path here derives a
 * count from a volume or a density.
 *
 * OQ1 ruling (a): the mixture ITSELF gets a draft `material_ref`
 * ({kind:'draft', id:'mint:<label>', label}) so the existing store-write
 * chain (upsertProposedMaterialSpecFromComposition requires details.material_ref
 * at AddMaterialSupport.ts:215) can mint the one composition spec. The label
 * is the model's own mixture name when it gave one, else the joined component
 * labels — the same data-driven naming idiom the chain itself uses
 * (componentLabels.join(' + '), AddMaterialSupport.ts:224-228). No noun
 * literals: every string here comes from the document.
 *
 * Defensive drops (OQ2 ruling): entries without a non-empty string component
 * name are SKIPPED; a non-string role becomes 'other' (the role enum lives in
 * composition-entry.schema.yaml, not in a TS table); fewer than two valid
 * entries ⇒ null (a single component is a plain add).
 */
function compositionSnapshotFromParams(
  composition: unknown,
  declaredMixtureLabel: unknown,
): {
  snapshot: Record<string, unknown>[];
  materialRef: Record<string, unknown>;
  formulationKind: string;
  count?: number;
  counterDensity?: Record<string, unknown>;
} | null {
  if (!Array.isArray(composition) || composition.length < 2) return null;
  const snapshot: Record<string, unknown>[] = [];
  const componentLabels: string[] = [];
  let count: number | undefined;
  let counterDensity: Record<string, unknown> | undefined;
  for (const raw of composition) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const label = typeof entry.material === 'string' ? entry.material.trim() : '';
    if (!label) continue;
    const role = typeof entry.role === 'string' && entry.role.trim() ? entry.role.trim() : 'other';
    // A component with no CURIE is a DRAFT ref — the exact shape
    // MaterialGrounding.ensureLocalMaterialForDraft mints into a MAT- record.
    const componentRef: Record<string, unknown> = { kind: 'draft', id: `mint:${label}`, label };
    snapshot.push({
      component_ref: componentRef,
      role,
      ...(entry.concentration !== undefined ? { concentration: entry.concentration } : {}),
      ...(typeof entry.fraction === 'string' ? { source: `${entry.fraction} of the mixture` } : {}),
    });
    componentLabels.push(label);
    if (role === 'cells') {
      if (typeof entry.count === 'number' && Number.isFinite(entry.count)) count = entry.count;
      const density = entry.counterDensity;
      if (density && typeof density === 'object' && !Array.isArray(density)) {
        counterDensity = density as Record<string, unknown>;
      }
    }
  }
  if (snapshot.length < 2) return null;
  const mixtureLabel =
    typeof declaredMixtureLabel === 'string' && declaredMixtureLabel.trim()
      ? declaredMixtureLabel.trim()
      : componentLabels.join(' + ');
  return {
    snapshot,
    materialRef: { kind: 'draft', id: `mint:${mixtureLabel}`, label: mixtureLabel },
    formulationKind: 'complex_composition',
    ...(count !== undefined ? { count } : {}),
    ...(counterDensity ? { counterDensity } : {}),
  };
}

/**
 * add_material: single add_material event.
 * Supports params: labware_id, well, material (object with kind/materialId/volumeUl),
 * or legacy params: labware, material (string), wells (array).
 * Also supports materialKind as a top-level param for role-based events.
 */
export const addMaterialExpander: BiologyVerbExpander = {
  verb: 'add_material',
  expand(input) {
    const { params } = input;
    const labwareId = (params.labware_id ?? params.labware) as string | undefined;
    const well = params.well as string | undefined;
    const material = params.material as Record<string, unknown> | string | undefined;
    // SHORTHAND-COMP-1 Task 15 (Part III D3): the lowered shorthand candidate
    // can carry `wells` as a compact ADDRESS RANGE string ("A1:H12" — the
    // scalar `targetWells` form; add_material declares no kind:wells arg, so
    // SPINE-7's symbolic-label branch never fires for it). Expand it through
    // the ONE range parser (server/src/ai/wellRange.ts expandWellTokens — the
    // same parser the raw path's expandEventWells uses) BEFORE the
    // Array.isArray branch, so the existing per-well loop fires. A scalar on a
    // DECLARED kind:wells arg is a symbolic label and routes to the spine
    // (normalizeScientistIntent); a range string on an undeclared key is a
    // literal address range and routes here. No second range parser.
    const rawWells = params.wells as string[] | string | undefined;
    const wells = typeof rawWells === 'string' && rawWells.trim()
      ? expandWellTokens([rawWells])
      : rawWells;
    const materialKind = params.materialKind as string | undefined;
    const volumeUl =
      typeof params.volume_uL === 'number'
        ? params.volume_uL
        : typeof params.volume_ul === 'number'
          ? params.volume_ul
          : typeof params.volume === 'number'
            // The wire contract declares `volume` a quantity (schema
            // scientist-intent.schema.yaml `volume: {}`); a bare NUMBER
            // reaches here unexpanded. The serial-dilution lowering already
            // normalizes a numeric wire `volume` as uL (normalizeScientist-
            // Intent serialDilutionPattern) — same rule here, so "add 100ul
            // DMEM" never compiles an amount-less add_material.
            ? params.volume
            : typeof material === 'object' && material !== null && typeof material.volume_uL === 'number'
              ? material.volume_uL
              : undefined;
    // SHORTHAND-COMP-1 Task 14 (Part III D2): the DECLARED quantity object
    // `{value, unit}` rides the candidate as `volume` (normalizeScientistIntent
    // maps ['volume', ['volume']]). It was silently dropped here while
    // transferExpander (below) already reads the exact same shape. Honor it in
    // BOTH emit branches; an explicit object overrides the scalar forms.
    // Unit honesty: NO conversion — `volumeUl` is derived only when the
    // declared unit is literally 'uL'; {value:0.05, unit:'mL'} carries
    // `volume` with no `volumeUl` (the Quantity datatype has no arithmetic).
    const declaredVolume =
      params.volume && typeof params.volume === 'object'
        ? (params.volume as { value: number; unit: string })
        : undefined;
    const resolvedVolumeUl =
      declaredVolume && typeof declaredVolume.value === 'number' && declaredVolume.unit === 'uL'
        ? declaredVolume.value
        : typeof volumeUl === 'number'
          ? volumeUl
          : undefined;
    const volumeDetails: Record<string, unknown> =
      typeof resolvedVolumeUl === 'number'
        ? { volumeUl: resolvedVolumeUl, volume: declaredVolume ?? { value: resolvedVolumeUl, unit: 'uL' } }
        : declaredVolume
          ? { volume: declaredVolume }
          : {};
    // SHORTHAND-COMP-3 (Part I task 3): the declared components ride the open
    // params slot (normalizeScientistIntent carries them; ChatbotCompilePasses
    // hands the whole candidate as `params`). Compute the snapshot ONCE, add it
    // to BOTH emit branches below. A document without params.composition gets
    // `undefined` here and emits byte-identically to before (the spreads are
    // gated on the value).
    const composition = compositionSnapshotFromParams(params.composition, params.material);

    const events: PlateEventPrimitive[] = [];

    if (wells && Array.isArray(wells)) {
      // Legacy shape: material is a string, wells is an array
      for (const w of wells) {
        events.push({
          eventId: makeEventId('add_material'),
          event_type: 'add_material',
          details: {
            well: w,
            material: typeof material === 'string' ? material : undefined,
            ...(typeof material === 'object' && material !== null ? material : {}),
            ...(materialKind ? { materialKind } : {}),
            ...volumeDetails,
            ...(composition
              ? {
                  composition_snapshot: composition.snapshot,
                  formulation_kind: composition.formulationKind,
                  material_ref: composition.materialRef,
                  ...(composition.count !== undefined ? { count: composition.count } : {}),
                  ...(composition.counterDensity ? { counter_density: composition.counterDensity } : {}),
                }
              : {}),
          },
          ...(labwareId ? { labwareId } : {}),
        });
      }
    } else {
      // Modern shape: single event with well and material object
      events.push({
        eventId: makeEventId('add_material'),
        event_type: 'add_material',
        details: {
          ...(well ? { well } : {}),
          ...(typeof material === 'object' && material !== null ? material : {}),
          ...(typeof material === 'string' ? { material } : {}),
          ...(materialKind ? { materialKind } : {}),
          ...volumeDetails,
          ...(composition
            ? {
                composition_snapshot: composition.snapshot,
                formulation_kind: composition.formulationKind,
                material_ref: composition.materialRef,
                ...(composition.count !== undefined ? { count: composition.count } : {}),
                ...(composition.counterDensity ? { counter_density: composition.counterDensity } : {}),
              }
            : {}),
        },
        ...(labwareId ? { labwareId } : {}),
      });
    }

    return events;
  },
};

/**
 * create_container: single create_container event.
 */
export const createContainerExpander: BiologyVerbExpander = {
  verb: 'create_container',
  expand(input) {
    const { params } = input;
    return [{
      eventId: makeEventId('create_container'),
      event_type: 'create_container',
      details: {
        slot: params.slot as string | undefined ?? 'target',
        labwareType: params.labwareType as string | undefined ?? params.labware_type as string | undefined ?? '96-well-plate',
      },
    }];
  },
};

/**
 * transfer: single transfer event.
 *
 * Lowers a high-level "transfer N uL of {source} to {wells} in {labware}" verb
 * into a primitive `transfer` event. Source can be a labware (when the user
 * specifies a source plate) or a material reference (when the user pulls from
 * an aliquot/tube/material mention) — the event details capture whichever was
 * supplied.
 */
export const transferExpander: BiologyVerbExpander = {
  verb: 'transfer',
  expand(input) {
    const { params } = input;

    const targetLabware =
      (params.labware_id ?? params.target_labware_id ?? params.destination_labware ?? params.labware) as string | undefined;
    const sourceLabware =
      (params.source_labware_id ?? params.source_labware) as string | undefined;
    const targetWell = params.well as string | undefined;
    const targetWells = (params.wells ?? params.target_wells) as string[] | undefined;
    const sourceWell = params.source_well as string | undefined;
    const sourceWells = params.source_wells as string[] | undefined;
    // SPINE-7: a scalar well-LABEL lowered by normalizeScientistIntent rides
    // the candidate as `wellRole` (a scientist-intent producer key); the
    // resolve_roles seam (ChatbotCompilePasses :2390/:2410) consumes
    // details.role against the resolve_nouns slot. Passive carrier only: the
    // chatbot chain has no wellRole producer => chatbot lowering byte-identical
    // (a chatbot candidate's own `role` param is NOT lowered into details).
    const wellRole = typeof params.wellRole === 'string' && params.wellRole.trim() ? params.wellRole : undefined;
    const volume_uL = (params.volume_uL ?? params.volume_ul) as number | undefined;
    const volume = params.volume as { value: number; unit: string } | undefined;
    const materialRef = (params.material_ref ?? params.source_material_ref) as
      | { kind?: string; id?: string } | string | undefined;

    return [{
      eventId: makeEventId('transfer'),
      event_type: 'transfer',
      details: {
        ...(sourceLabware ? { source_labware: sourceLabware } : {}),
        ...(targetLabware ? { destination_labware: targetLabware } : {}),
        ...(sourceWell ? { source_well: sourceWell } : {}),
        ...(sourceWells ? { source_wells: sourceWells } : {}),
        ...(targetWell ? { well: targetWell } : {}),
        ...(targetWells ? { wells: targetWells } : {}),
        ...(wellRole ? { role: wellRole } : {}),
        ...(typeof volume_uL === 'number' ? { volumeUl: volume_uL, volume: { value: volume_uL, unit: 'uL' } } : {}),
        ...(volume && typeof volume === 'object' ? { volume } : {}),
        ...(materialRef ? { source_material_ref: materialRef } : {}),
      },
      ...(targetLabware ? { labwareId: targetLabware } : {}),
    }];
  },
};

export const shakeExpander: BiologyVerbExpander = {
  verb: 'shake',
  expand(input) {
    const { params } = input;
    return [{
      eventId: makeEventId('shake'),
      event_type: 'mix',
      details: {
        mode: 'orbital_shaking',
        rpm: (params.rpm as number) ?? 600,
        duration: (params.duration as string) ?? 'PT5M',
        ...(params.temperature !== undefined
          ? { temperature: params.temperature as number }
          : {}),
      },
      ...(params.labware_id ? { labwareId: params.labware_id as string } : {}),
      t_offset: (params.duration as string) ?? 'PT5M',
    }];
  },
};

// Register all expanders at module import time
registerVerbExpander(seedExpander);
registerVerbExpander(incubateExpander);
registerVerbExpander(mixExpander);
registerVerbExpander(resuspendExpander);
registerVerbExpander(diluteExpander);
registerVerbExpander(countExpander);
registerVerbExpander(stainExpander);
registerVerbExpander(fixExpander);
registerVerbExpander(permeabilizeExpander);
registerVerbExpander(blockExpander);
registerVerbExpander(quenchExpander);
registerVerbExpander(labelExpander);
registerVerbExpander(transfectExpander);
registerVerbExpander(addMaterialExpander);
registerVerbExpander(createContainerExpander);
registerVerbExpander(readExpander);
registerVerbExpander(transferExpander);
registerVerbExpander(shakeExpander);
