/**
 * adaptation.ts — helper for capturing lab adaptations of a universal
 * protocol as local-protocol `overrides.substitutions` / `bindings`.
 *
 * Per the protocol lifecycle spec §5, local-protocols are ADDITIVE overrides
 * only ("same verbs / same order" invariant): we never reorder/rettype the
 * inherited global steps — we map abstract roles to concrete lab records.
 */

export interface SubstitutionOverride {
  role: string
  material_ref: { kind: 'record'; id: string; type: string }
  rationale?: string
}

export interface BindingOverride {
  role: string
  ref: { kind: 'record'; id: string; type: string }
}

export interface AdaptationDraft {
  /** Role → concrete material/labware/instrument record refs. */
  bindings: BindingOverride[]
  substitutions: SubstitutionOverride[]
}

export const EMPTY_ADAPTATION: AdaptationDraft = {
  bindings: [],
  substitutions: [],
};

/**
 * Add or replace a single role → concrete record binding.
 * Preserves the additive-only invariant (never reorders global steps).
 */
export function upsertBinding(draft: AdaptationDraft, role: string, ref: { kind: 'record'; id: string; type: string }): AdaptationDraft {
  const existing = draft.bindings.findIndex((b) => b.role === role);
  const next: BindingOverride = { role, ref };
  const bindings =
    existing >= 0 ? draft.bindings.map((b, i) => (i === existing ? next : b)) : [...draft.bindings, next];
  return { ...draft, bindings };
}

/**
 * Add or replace a single material substitution (role → concrete material).
 */
export function upsertSubstitution(
  draft: AdaptationDraft,
  role: string,
  materialRef: { kind: 'record'; id: string; type: string },
  rationale?: string
): AdaptationDraft {
  const existing = draft.substitutions.findIndex((s) => s.role === role);
  const next: SubstitutionOverride = {
    role,
    material_ref: materialRef,
    ...(rationale ? { rationale } : {}),
  };
  const substitutions =
    existing >= 0 ? draft.substitutions.map((s, i) => (i === existing ? next : s)) : [...draft.substitutions, next];
  return { ...draft, substitutions };
}

/**
 * Serialize an adaptation draft into a local-protocol `overrides` payload.
 * Keeps the empty additive containers so the local-protocol stays valid
 * against its schema even before any role is bound.
 */
export function serializeOverrides(draft: AdaptationDraft): {
  bindings: BindingOverride[];
  substitutions: SubstitutionOverride[];
} {
  return {
    bindings: draft.bindings,
    substitutions: draft.substitutions,
  };
}
