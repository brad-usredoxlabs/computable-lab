/**
 * linkClaimsToProject — the project→claim link written when a literature claim
 * is accepted in the Literature Explorer.
 *
 * Direction matters: the link lives on the STUDY (`claimRelationships[]`, typed
 * verbs — schema/studies/study.schema.yaml), NOT on the claim. A claim is a
 * global, reusable meaning holder; the project is the thing that reaches for it.
 *
 * `claimRelationships` items are `{ verb, claimId }`. The default verb is
 * `investigates` — accepting a claim from the literature is the project
 * declaring it is investigating that claim. (The authoritative, provenance-
 * carrying form is a `kind: relationship` record; the inline array is the
 * convenience field the study schema documents for exactly this case.)
 */
import { apiClient } from '../shared/api/client'

export type ClaimRelationshipVerb =
  | 'investigates'
  | 'depends_on'
  | 'aims_to_establish'
  | 'assumes'

export interface ClaimRelationship {
  verb: ClaimRelationshipVerb
  claimId: string
}

export const DEFAULT_CLAIM_VERB: ClaimRelationshipVerb = 'investigates'

/**
 * Pure merge used by the writer: appends a relationship for every claim id not
 * already linked. Existing entries are preserved verbatim (including verbs
 * authored by a human), and duplicates are never added.
 */
export function mergeClaimRelationships(
  existing: unknown,
  claimIds: readonly string[],
  verb: ClaimRelationshipVerb = DEFAULT_CLAIM_VERB,
): { claimRelationships: ClaimRelationship[]; added: string[] } {
  const claimRelationships: ClaimRelationship[] = Array.isArray(existing)
    ? (existing as ClaimRelationship[]).filter(
        (rel) => rel && typeof rel.claimId === 'string' && typeof rel.verb === 'string',
      )
    : []

  const present = new Set(claimRelationships.map((rel) => rel.claimId))
  const added: string[] = []

  for (const claimId of claimIds) {
    if (typeof claimId !== 'string' || claimId.trim().length === 0) continue
    if (present.has(claimId)) continue
    claimRelationships.push({ verb, claimId })
    present.add(claimId)
    added.push(claimId)
  }

  return { claimRelationships, added }
}

export interface LinkClaimsResult {
  /** Claim ids that were newly linked to the study. */
  linked: string[]
}

/**
 * Read the study, append the missing claim relationships, write it back.
 * No-op (and no write) when every claim is already linked.
 */
export async function linkClaimsToProject(
  studyId: string,
  claimIds: readonly string[],
): Promise<LinkClaimsResult> {
  if (!studyId || claimIds.length === 0) return { linked: [] }

  const record = await apiClient.getRecord(studyId)
  const payload = record.payload as Record<string, unknown>

  const { claimRelationships, added } = mergeClaimRelationships(
    payload.claimRelationships,
    claimIds,
  )
  if (added.length === 0) return { linked: [] }

  await apiClient.updateRecord(studyId, { ...payload, claimRelationships })
  return { linked: added }
}
