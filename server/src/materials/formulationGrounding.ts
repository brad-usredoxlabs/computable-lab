/**
 * formulationGrounding — FIND-THEN-AUTHOR seam for single-active formulations.
 *
 * Given a solute material ref + concentration + solvent label, finds an existing
 * material-spec that declares that exact identity, or authors one. Second
 * identical call returns the same ids with zero new writes.
 *
 * The function is the contract both RESOLVE (find) and AUTHOR (present) arms
 * drive against — the identity-keyed seam for L2-PROMPT2-RESOLVE-OR-AUTHOR-1.
 */

import type { RecordEnvelope, RecordStore } from '../store/types.js';
import type { ProviderHit } from '../resolve/types.js';
import {
  ensureLocalMaterialForOntology,
  type RefShape,
  toRecordMaterialRef,
} from './MaterialGrounding.js';

const MATERIAL_SPEC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface FormulationGroundingDeps {
  store: RecordStore;
  /** Tier-3 or stub ontology search — mirrors searchOls4 signature. */
  searchOntology: (term: string, limit: number, signal: AbortSignal, ontologies?: string[]) => Promise<ProviderHit[]>;
}

export interface ConcentrationObj {
  value: number;
  unit: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function asPayload(env: RecordEnvelope | null): Record<string, unknown> | null {
  return env?.payload && typeof env.payload === 'object' && !Array.isArray(env.payload)
    ? env.payload as Record<string, unknown>
    : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Structural check: concentration and solvent_ref both present as non-null
 * objects on the formulation block. Mirrors records.ts declaresFormulation.
 */
function declaresFormulation(payload: Record<string, unknown>): boolean {
  const form = payload.formulation;
  if (typeof form !== 'object' || form === null) return false;
  const conc = (form as Record<string, unknown>).concentration;
  const solvent = (form as Record<string, unknown>).solvent_ref;
  return typeof conc === 'object' && conc !== null
    && typeof solvent === 'object' && solvent !== null;
}

function concEqual(a: unknown, b: ConcentrationObj): boolean {
  const obj = asObject(a);
  if (!obj) return false;
  return Number(obj.value) === b.value && String(obj.unit) === b.unit;
}

/**
 * Check if the concept referenced by a material-spec matches the given
 * solute concept. Matches by material_ref pointing to the same CURIE-bearing
 * record, or by the record's class array containing the same ontology CURIE.
 */
async function conceptMatches(
  store: RecordStore,
  specPayload: Record<string, unknown>,
  soluteCurie: string,
): Promise<boolean> {
  const materialRef = asObject(specPayload.material_ref);
  if (!materialRef || typeof materialRef.id !== 'string') return false;

  // Direct CURIE match on the ref itself (e.g. if the concept is an ontology ref stored in material_ref)
  if (materialRef.kind === 'ontology' && materialRef.id === soluteCurie) return true;

  // Resolve the material record and check its class CURIEs
  const matEnv = await store.get(materialRef.id);
  const matPayload = asPayload(matEnv);
  if (!matPayload) return false;

  if (Array.isArray(matPayload.class)) {
    for (const cls of matPayload.class) {
      const c = asObject(cls);
      if (c?.kind === 'ontology' && c.id === soluteCurie) return true;
    }
  }

  return false;
}

/* ------------------------------------------------------------------ */
/*  FIND                                                               */
/* ------------------------------------------------------------------ */

/**
 * Scan existing material-specs for one that declares the same
 * solute concept + solvent + concentration identity. Returns the matching
 * spec env, or null if none found.
 */
async function findExistingFormulation(
  store: RecordStore,
  soluteCurie: string,
  concentration: ConcentrationObj,
  solventRef: RefShape | null,
): Promise<RecordEnvelope | null> {
  const specs = await store.list({ kind: 'material-spec', limit: 10000 });
  for (const env of specs) {
    const payload = asPayload(env);
    if (!payload || !declaresFormulation(payload)) continue;

    // formulation_kind must be compatible — skip non-single-active specs
    if (payload.formulation_kind && typeof payload.formulation_kind === 'string'
        && payload.formulation_kind !== 'single_active') {
      continue;
    }

    const form = payload.formulation as Record<string, unknown>;

    // Check concentration matches
    if (!concEqual(form.concentration, concentration)) continue;

    // Check solute concept matches
    if (!await conceptMatches(store, payload, soluteCurie)) continue;

    // Check solvent matches — different solvent means a different formulation
    if (solventRef) {
      const existingSolvent = asObject(form.solvent_ref);
      if (!existingSolvent || typeof existingSolvent.id !== 'string') continue;
      if (existingSolvent.id !== solventRef.id) continue;
    }

    return env;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  AUTHOR — Solvent lookup                                            */
/* ------------------------------------------------------------------ */

/**
 * Find an existing solvent material record by name/synonym match.
 * The seed DMSO record has synonyms ['DMSO', 'dimethyl sulfoxide'].
 */
async function findSolventMaterial(
  store: RecordStore,
  label: string,
): Promise<RefShape | null> {
  const needle = label.toLowerCase();
  const materials = await store.list({ kind: 'material', limit: 10000 });
  for (const env of materials) {
    const p = asPayload(env);
    if (!p) continue;
    const nameMatch = typeof p.name === 'string' && p.name.toLowerCase().includes(needle);
    if (nameMatch) return toRecordMaterialRef(env.recordId, String(p.name));
    if (Array.isArray(p.synonyms)) {
      const synMatch = p.synonyms.some(
        (s: unknown) => typeof s === 'string' && s.toLowerCase().includes(needle),
      );
      if (synMatch) return toRecordMaterialRef(env.recordId, String(p.name));
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Errors                                                             */
/* ------------------------------------------------------------------ */

/**
 * Thrown when solvent resolution fails — no local material found and no
 * ontology hit. Callers may catch this to fall through to per-journey paths.
 */
export class SolventUnresolvableError extends Error {
  constructor(solventLabel: string) {
    super(`Cannot resolve solvent "${solventLabel}" from local materials or ontology.`);
    this.name = 'SolventUnresolvableError';
  }
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

/**
 * FIND-THEN-AUTHOR: given a solute concept ref, concentration, and solvent
 * label, returns a material-spec ref. If a matching spec already exists,
 * returns its ref (ZERO writes). If absent, authors the concept (from
 * ontology), finds/creates the solvent, and creates the formulation spec.
 */
export async function findOrAuthorFormulation(
  deps: FormulationGroundingDeps,
  materialRef: RefShape,
  concentration: ConcentrationObj,
  solventLabel: string,
): Promise<RefShape> {
  const { store, searchOntology } = deps;

  /* ---- Extract the concept CURIE / label from the materialRef ---- */
  let soluteCurie: string | null = null;
  let soluteLabel: string;

  if (materialRef.kind === 'ontology') {
    soluteCurie = materialRef.id;
    soluteLabel = materialRef.label || soluteCurie;
  } else {
    soluteLabel = materialRef.label || materialRef.id;
    // If it's a record ref, try to resolve its class CURIE
    if (materialRef.kind === 'record') {
      const matEnv = await store.get(materialRef.id);
      const matPayload = asPayload(matEnv);
      if (matPayload && Array.isArray(matPayload.class)) {
        for (const cls of matPayload.class) {
          const c = asObject(cls);
          if (c?.kind === 'ontology' && typeof c.id === 'string') {
            soluteCurie = c.id;
            break;
          }
        }
      }
    }
  }

  /* ---- Resolve solvent BEFORE find, so we can compare in FIND ---- */
  let solventRef: RefShape | null = await findSolventMaterial(store, solventLabel);
  if (!solventRef) {
    const hits = await searchOntology(solventLabel, 1, new AbortController().signal);
    const firstHit = hits[0];
    if (firstHit) {
      solventRef = await ensureLocalMaterialForOntology(store, {
        kind: 'ontology',
        id: firstHit.curie,
        label: firstHit.label,
      }, { createdBy: 'formulation-grounding' });
    } else {
      throw new SolventUnresolvableError(solventLabel);
    }
  }

  /* ---- FIND: check existing specs (with solvent awareness) ---- */
  if (soluteCurie) {
    const existing = await findExistingFormulation(store, soluteCurie, concentration, solventRef);
    if (existing) {
      const specPayload = asPayload(existing);
      return {
        kind: 'record',
        id: existing.recordId,
        type: 'material-spec',
        ...(specPayload && typeof specPayload.name === 'string' ? { label: specPayload.name } : {}),
      };
    }
  }

  /* ---- AUTHOR: concept ---- */
  // D2 fix: when soluteCurie is null, use the record ref directly instead of
  // fabricating an ontology term from a record id.
  const conceptRef: RefShape = soluteCurie
    ? await ensureLocalMaterialForOntology(store, {
        kind: 'ontology',
        id: soluteCurie,
        label: soluteLabel,
      }, { createdBy: 'formulation-grounding' })
    : toRecordMaterialRef(materialRef.id, soluteLabel);

  /* ---- AUTHOR: material-spec formulation ---- */
  const concLabel = `${concentration.value} ${concentration.unit} `;
  const specName = `${concLabel}${soluteLabel}`.trim();
  const soluteSlug = soluteLabel.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase();
  const solventSlug = (solventRef.id).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase();
  const specId = `MSP-${soluteSlug}-${concentration.value}-${concentration.unit.replace(/\//g, 'p')}-IN-${solventSlug}`;

  const specPayload: Record<string, unknown> = {
    kind: 'material-spec',
    id: specId,
    name: specName,
    material_ref: conceptRef,
    formulation_kind: 'single_active',
    status: 'proposed',
    lifecycleId: 'lab-vocabulary-control',
    provenance: {
      source: 'compiler',
      sourceLabel: specName,
      createdBy: 'formulation-grounding',
      createdAt: new Date().toISOString(),
      note: `Created as a proposed single-active formulation: ${soluteLabel} at ${concentration.value} ${concentration.unit} in ${solventLabel}.`,
    },
    formulation: {
      concentration: { value: concentration.value, unit: concentration.unit },
      solvent_ref: solventRef,
      composition: [
        { component_ref: conceptRef, role: 'solute', concentration: { value: concentration.value, unit: concentration.unit } },
        { component_ref: solventRef, role: 'solvent' },
      ],
    },
    tags: ['formulation-grounding', 'single_active'],
  };

  // Check if this spec already exists (race/idempotency guard)
  const alreadyExists = await store.get(specId);
  if (!alreadyExists) {
    const created = await store.create({
      envelope: {
        recordId: specId,
        schemaId: MATERIAL_SPEC_SCHEMA_ID,
        payload: specPayload,
        meta: { kind: 'material-spec' },
      },
      message: `Create single-active formulation ${specId}: ${specName}`,
    });
    if (!created.success) {
      throw new Error(`Failed to create formulation spec ${specId}: ${created.error ?? 'unknown error'}`);
    }
  }

  return {
    kind: 'record',
    id: specId,
    type: 'material-spec',
    label: specName,
  };
}
