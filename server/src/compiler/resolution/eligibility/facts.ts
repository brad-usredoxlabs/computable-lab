/**
 * MATRES-ELIG — the declared-fact envelope (spec §7.2; P8 "no new resolution
 * intelligence").
 *
 * A PURE DATA ASSEMBLY per (candidate, request): every field is adapter-
 * exposed presence, never inference. Biological-equivalence inference, grade-
 * suitability guessing, or an `isCompatible`-style TS field are FORBIDDEN —
 * the envelope states what the adapters already declared, nothing more.
 *
 * referentLevel derivation (OQ-1 ruling, as-stanced): a candidate's OWN level
 * is normalized through materialRefFields' EXISTING alias table
 * (materialLayerOf — LAYER_ALIASES data) and then mapped to the canonical
 * level through the eligibility data's `levelSpellings` table. NO new TS level
 * list, NO tier-as-truth (tier===4 never implies vendor-product — that is the
 * exact defect class). A hit whose level is the spine's undeclared spelling
 * keeps it (harvest H3: vendor candidates arrive level unknown/concept) ⇒ bind
 * predicates go INCOMPLETE (honest), never PASS-by-default.
 *
 * exactOptionalPropertyTypes: every optional member is built by CONDITIONAL
 * SPREAD (vocabulary.ts:47 is the in-repo law) — absent-or-value, never
 * :undefined.
 */
import { materialLayerOf } from '../../../ai/materialRefFields.js';
import type { RankedCandidate } from '../../../resolve/types.js';
import type { ScientistIntentArgContract } from '../../scientistIntent/vocabulary.js';
import type { MaterialEligibilityPolicy } from './policy.js';

/** The envelope root the predicate DSL evaluates against (§7.2 shape). */
export interface EligibilityEnvelope {
  demanded: {
    /** The single utterance-demanded referent level, from the vocabulary's
     *  DECLARED `level` slot (SPINE-8) canonicalized through the data's
     *  levelSpellings table; the undeclared spelling when no single level is
     *  demanded (memo Q1: "Absent = unconstrained (today's behavior)"). */
    referentLevel: string;
    /** DECLARED-presence discriminator (data-computed against the policy's
     *  undeclaredLevelSpelling — never a level literal in TS): true iff a
     *  single referent level is demanded. The policies branch on THIS boolean,
     *  not on level names. */
    levelDeclared: boolean;
    /** [referentLevel] as a collection — the demanded-level membership set the
     *  suppress/bind asserts read (allIn over a scalar path selects one value). */
    demandedLevelSet: readonly string[];
    /** Vocabulary arg-contract `levels` slot [memo Q1, RATIFIED]; ABSENT =
     *  unconstrained (today's behavior, backwards-compatible). */
    allowedLevels?: readonly string[];
    /** DECLARED-presence discriminator (fact-builder read of the contract's
     *  `levels` slot): true iff an allowed-set IS declared. The policies read
     *  THIS instead of an `exists` probe — an absent allowed-set is a DECLARED
     *  unconstrained state, never missing evidence (spec bait §3: the
     *  missing-evidence law is about evidence a verdict depends on, not about
     *  an optional declaration slot). */
    allowedDeclared: boolean;
    /** Panel pre-selection hint (memo Q1): NEVER a filter, never suppression —
     *  carried for disclosure only, no policy reads it. */
    preferred?: string;
    /** Tier legality for this purpose (from the policy data's tierLegality
     *  row; ABSENT when no row matches — the policies then read the missing
     *  legality as INCOMPLETE, never a default). */
    queryTiers?: readonly number[];
    displayTiers?: readonly number[];
    identityOnlyTiers?: readonly number[];
    /** The tier-legality key actually used (demanded level, or the identity
     *  level when the allowed-set names one and no single level is demanded —
     *  a generic intersection with the data's identityLevels list). */
    tierLegalityLevel: string;
    /** DECLARED discriminator: the tier-legality purpose is an IDENTITY
     *  purpose (its level is one of the data's identityLevels). */
    identityPurpose: boolean;
    /** Tiers whose result may never serve as custody/use evidence (P4). */
    custodyNeverTiers: readonly number[];
    /** Vendor-scoped identifiers DECLARED in the utterance context (the review
     *  interaction supplies these; compilation supplies none — absence is a
     *  declared state, never an inference). */
    scopedIdentifiers?: readonly string[];
    /** Required spec attributes from the arg contract / draft slot context. */
    requiredAttributes?: readonly string[];
    /** The spine's undeclared-level spelling (data, so the policies' unknown
     *  guards read it instead of a TS literal). */
    undeclaredLevelSpelling: string;
  };
  campaignMode: string;
  candidate: {
    /** Canonical referent level derived through the EXISTING alias tables
     *  (see module header); the undeclared spelling when nothing declares it. */
    referentLevel: string;
    /** DECLARED-presence discriminator (data-computed): true iff the
     *  candidate's own level resolved to a canonical referent level. An
     *  undeclared level is MISSING EVIDENCE for the demanded-level policies —
     *  never a silent mismatch, never a pass (bait §5). */
    levelDeclared: boolean;
    /** Verbatim RankedCandidate.tier. */
    tier: number;
    /** Verbatim RankedCandidate.source. */
    source: string;
    curie?: string;
    /** Vendor-scope of candidate identifiers (unknown = declared, never
     *  inferred). Absent when nothing declares a scope. */
    identityScopes?: readonly string[];
    observedAttributes?: readonly string[];
    /** Relationship evidence (vendor-product.material_ref joins, supplies/
     *  conforms facts) when present in the store. Declared presence only. */
    relationshipEvidence?: readonly string[];
    completeness: {
      identityKnown: boolean;
      vendorKnown: boolean;
      /** Tier-4 (and every custody-never tier) is declared false — a catalog
       *  hit is never custody evidence (P4). From DECLARED presence only. */
      custodyEvidence: boolean;
    };
  };
}

/** Map a materialLayerOf-normalized layer spelling to the canonical level via
 *  the eligibility data's levelSpellings table. Generic table read — no TS
 *  level list. An unmapped spelling returns the undeclared spelling (honest
 *  unknown, never a guessed level). */
export function canonicalLevelForLayerSpelling(
  policy: MaterialEligibilityPolicy,
  layerSpelling: string,
): string {
  const row = policy.levelSpellings().find((r) => r.layerSpellings.includes(layerSpelling));
  return row?.canonical ?? policy.undeclaredLevelSpelling();
}

/** The single utterance-demanded referent level: the vocabulary's DECLARED
 *  `level` slot (SPINE-8), canonicalized through the data's spelling table;
 *  else a `levels` allowed-set that names EXACTLY ONE canonical level (a
 *  single-member allowed-set IS a demand — memo Q1's binding rule read to its
 *  limit); else the undeclared spelling (unconstrained = today). Generic read
 *  of the declared slots; zero verb/arg/level NAME branches. */
export function demandedReferentLevel(
  policy: MaterialEligibilityPolicy,
  contract: ScientistIntentArgContract,
): string {
  if (contract.level !== undefined) return canonicalLevelForLayerSpelling(policy, materialLayerOf(contract.level));
  if (contract.levels !== undefined && contract.levels.length === 1
      && policy.referentLevels().includes(contract.levels[0]!)) {
    return contract.levels[0]!;
  }
  return policy.undeclaredLevelSpelling();
}

/** The tier-legality key: the demanded level when one is declared; otherwise
 *  the IDENTITY level the allowed-set names (generic intersection with the
 *  data's identityLevels — a product-level demand reaches the identity row
 *  even without a single demanded level); otherwise the undeclared spelling. */
export function tierLegalityLevelFor(
  policy: MaterialEligibilityPolicy,
  demandedLevel: string,
  allowedLevels: readonly string[] | undefined,
): string {
  if (demandedLevel !== policy.undeclaredLevelSpelling()) return demandedLevel;
  if (allowedLevels !== undefined) {
    const identity = allowedLevels.find((level) => policy.identityLevels().includes(level));
    if (identity !== undefined) return identity;
  }
  return policy.undeclaredLevelSpelling();
}

/**
 * Assemble the envelope for one (candidate, request). Pure presence reads:
 * the candidate's own fields, the contract's declared slots, the policy data's
 * legality row. Nothing is inferred.
 */
export function buildEligibilityEnvelope(opts: {
  policy: MaterialEligibilityPolicy;
  candidate: RankedCandidate;
  contract: ScientistIntentArgContract;
  campaignMode?: string;
  /** Vendor-scoped identifiers DECLARED in the utterance context (the review
   *  interaction supplies these; compilation supplies none). */
  utteranceScopedIdentifiers?: readonly string[];
  /** Relationship evidence DECLARED for the candidate's record (store-supplied
   *  joins/facts; absent = none declared). */
  candidateRelationshipEvidence?: readonly string[];
  /** Required spec attributes DECLARED by the consuming context. */
  requiredAttributes?: readonly string[];
}): EligibilityEnvelope {
  const { policy, candidate, contract } = opts;
  const campaignMode = opts.campaignMode ?? policy.defaultCampaignMode();
  const undeclared = policy.undeclaredLevelSpelling();

  const demandedLevel = demandedReferentLevel(policy, contract);
  const levelDeclared = demandedLevel !== undeclared;
  const legalityLevel = tierLegalityLevelFor(policy, demandedLevel, contract.levels);
  const row = policy.tierLegalityRow(legalityLevel, campaignMode);

  // Candidate level: derive through the EXISTING alias table (OQ-1 ruling).
  // When the candidate carries a LOCAL record ref, its OWN record kind
  // (RankedCandidate.termKind — the canonical-term taxonomy value, e.g.
  // 'vendor' for a vendor-product record) is the ref-type spelling and rides
  // materialLayerOf first; otherwise the spine's own level spelling rides it.
  // A hit whose level is the undeclared spelling keeps it — remote/ontology
  // vendor hits arrive level unknown (providers/vendorExa.ts) or concept
  // (providers/ols4.ts); NO tier-as-truth, NO new mapping list.
  const spineLevel = candidate.level;
  const localRef = candidate.curie.startsWith('local:');
  // A LOCAL record ref declares its own kind (termKind, the canonical-term
  // taxonomy value) — that ref-type spelling rides materialLayerOf first
  // (OQ-1: "derive from the candidate's OWN record kind / ref-type when the
  // candidate carries a local record ref"). A remote hit with no local ref
  // keeps the spine's undeclared spelling when it has one — honest unknown,
  // never a fabricated level (bait §5).
  const refTypeSpelling = localRef && candidate.termKind !== undefined
    ? materialLayerOf(candidate.termKind)
    : undefined;
  const candidateLevel = spineLevel === undeclared && refTypeSpelling === undefined
    ? undeclared
    : canonicalLevelForLayerSpelling(
        policy,
        refTypeSpelling ?? materialLayerOf(spineLevel),
      );
  const candidateLevelDeclared = candidateLevel !== undeclared;

  const identityKnown = candidate.curie !== undefined && candidate.curie !== '';
  // Vendor-knownness is DECLARED scope presence only (an utterance-declared
  // scope) — never inferred from a token's shape.
  const vendorKnown = (opts.utteranceScopedIdentifiers?.length ?? 0) > 0;
  // Custody evidence is declared presence; a custody-never tier is declared
  // false forever (P4).
  const custodyNever = policy.custodyNeverTiers().includes(candidate.tier);
  const custodyEvidence = !custodyNever && identityKnown && candidateLevelDeclared;

  return {
    demanded: {
      referentLevel: demandedLevel,
      levelDeclared,
      demandedLevelSet: [demandedLevel],
      ...(contract.levels !== undefined && contract.levels.length > 0 ? { allowedLevels: contract.levels } : {}),
      allowedDeclared: contract.levels !== undefined && contract.levels.length > 0,
      ...(contract.preferred !== undefined ? { preferred: contract.preferred } : {}),
      ...(row !== undefined ? {
        queryTiers: row.queryTiers,
        displayTiers: row.displayTiers,
        identityOnlyTiers: row.identityOnlyTiers,
      } : {}),
      tierLegalityLevel: legalityLevel,
      identityPurpose: policy.identityLevels().includes(legalityLevel),
      custodyNeverTiers: policy.custodyNeverTiers(),
      ...(opts.utteranceScopedIdentifiers !== undefined && opts.utteranceScopedIdentifiers.length > 0
        ? { scopedIdentifiers: opts.utteranceScopedIdentifiers }
        : {}),
      ...(opts.requiredAttributes !== undefined && opts.requiredAttributes.length > 0
        ? { requiredAttributes: opts.requiredAttributes }
        : {}),
      undeclaredLevelSpelling: undeclared,
    },
    campaignMode,
    candidate: {
      referentLevel: candidateLevel,
      levelDeclared: candidateLevelDeclared,
      tier: candidate.tier,
      source: candidate.source,
      ...(identityKnown ? { curie: candidate.curie } : {}),
      ...(candidate.namespace !== undefined && candidate.namespace !== 'local'
        ? { identityScopes: [candidate.namespace] }
        : {}),
      ...(opts.candidateRelationshipEvidence !== undefined && opts.candidateRelationshipEvidence.length > 0
        ? { relationshipEvidence: opts.candidateRelationshipEvidence }
        : {}),
      completeness: {
        identityKnown,
        vendorKnown,
        custodyEvidence,
      },
    },
  };
}
