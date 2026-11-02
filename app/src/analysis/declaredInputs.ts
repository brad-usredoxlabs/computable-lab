/**
 * declaredInputs (FAME-7, lane 1) — pure helpers that turn a revision's
 * DECLARED input contract (analysis-revision `inputs` items) into the Run-method
 * card's staging state and the createRun `inputs` body.
 *
 * Pure: no React, no fetch, zero analyte/compound literal (R8 — names appear
 * only as declared DATA values read from the revision payload, never as
 * constants or branches in this file). The server (server/src/analysis/
 * declaredInputs.ts) is the validation authority; this module only BUILDS the
 * body and NAMES the block lines (client-side pre-submit gate — the named
 * visible block line the spec requires; it never substitutes for the server's
 * named rejection).
 */

export interface DeclaredInput {
  name: string
  description?: string
  dataKind?: string
  required?: boolean
  /** FAME-7 (OQ-3): the record `type` strings this slot admits (absent ⇒ the
   *  global config `inputKinds` gate — the page shows the declared list when
   *  present; it does not load the config). */
  acceptsKinds?: string[]
  /** FAME-7 (OQ-3): the producer artifact payload `name` values this slot
   *  accepts. */
  acceptedArtifactNames?: string[]
}

/** The staged ref for a declared slot (what "Bind…" records before submit). */
export interface StagedInputRef {
  kind: 'record'
  id: string
  type: string
  /** The promoted data-reference id, when the bound artifact is DREF-backed
   *  (the frozen identity the page shows before submit — bait #9's answer).
   *  ABSENT when `id`/`type` already IS the DREF (the FAME-7 promote-route
   *  stages the DREF ref itself — the run body then CONTAINS the DREF). */
  dataReferenceId?: string
  /** The producer ARTIFACT record id, when `id` is the promoted DREF (the
   *  frozen identity keeps the artifact id visible before submit — D1). */
  producerArtifactId?: string
  /** Producer-run frozen identity shown before submit. */
  producerRunId?: string
  producerContentSha?: string
  /** The promoted artifact's DREF contentHash (the stored-bytes digest the
   *  immutability leg re-verifies). */
  contentHash?: string
}

/** Builds the `inputs` object for a createRun body from declared slots + the
 *  staged refs. ONLY declared slots with a staged ref are emitted; an empty
 *  body is returned (NOT `inputs: {}` hardcoded by the caller — this builder
 *  is the single source of the body value). Conditional-spread discipline:
 *  no `key: undefined` anywhere. */
export function boundInputs(
  declared: DeclaredInput[],
  staged: Record<string, StagedInputRef>,
): Record<string, { kind: 'record'; id: string; type: string }> {
  const out: Record<string, { kind: 'record'; id: string; type: string }> = {}
  for (const slot of declared) {
    const ref = staged[slot.name]
    if (!ref) continue
    out[slot.name] = { kind: ref.kind, id: ref.id, type: ref.type }
  }
  return out
}

export interface InputGateResult {
  blocked: boolean
  /** NAMED block lines (one per violated slot; empty when unblocked). */
  reasons: string[]
}

/** The client-side pre-submit gate: named reasons per violated declared slot
 *  (required unbound; staged ref whose type is not admitted by the slot's own
 *  `acceptsKinds` when declared — the config gate is the server's call, the
 *  page does not load the config). */
export function inputGate(declared: DeclaredInput[], staged: Record<string, StagedInputRef>): InputGateResult {
  const reasons: string[] = []
  for (const slot of declared) {
    const ref = staged[slot.name]
    if (!ref) {
      if (slot.required) {
        reasons.push(`required input '${slot.name}' is not bound`)
      }
      continue
    }
    if (slot.acceptsKinds && slot.acceptsKinds.length > 0 && !slot.acceptsKinds.includes(ref.type)) {
      reasons.push(`input '${slot.name}' accepts kinds ${slot.acceptsKinds.join(', ')} — got '${ref.type}'`)
    }
  }
  return { blocked: reasons.length > 0, reasons }
}

/** The declared inputs of a revision payload (ABSENT ⇒ [] — zero rows on the
 *  card; the OQ-3 server-side skip is the record's semantics, the page simply
 *  renders nothing for an undeclared contract). */
export function declaredInputsOf(payload: unknown): DeclaredInput[] {
  const raw = (payload as { inputs?: unknown } | null | undefined)?.inputs
  if (!Array.isArray(raw)) return []
  return (raw as DeclaredInput[]).filter((d): d is DeclaredInput => typeof d?.name === 'string' && d.name.length > 0)
}

/** DECLARED-DATA slot matching for "Use result downstream" routing (W5e):
 *  the artifact's payload `name` must be in the slot's `acceptedArtifactNames`
 *  (when declared) AND the slot must admit the artifact record kind. Returns
 *  the matching declared slot NAMES — the caller picks when ≥2 match, reports
 *  when 0 match (named, no silent drop). */
export function matchingSlotsForArtifact(
  declared: DeclaredInput[],
  artifactName: string | undefined,
  artifactKind: string,
): string[] {
  const out: string[] = []
  for (const slot of declared) {
    const kindAdmits = slot.acceptsKinds && slot.acceptsKinds.length > 0
      ? slot.acceptsKinds.includes(artifactKind)
      : true
    const nameAdmits = slot.acceptedArtifactNames && slot.acceptedArtifactNames.length > 0
      ? typeof artifactName === 'string' && slot.acceptedArtifactNames.includes(artifactName)
      : true
    if (kindAdmits && nameAdmits) out.push(slot.name)
  }
  return out
}
