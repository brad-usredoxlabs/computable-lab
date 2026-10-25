/**
 * ExecuteChainDraft — MATRES-CHAIN §7.1-§7.4/§7.6: compiles the elicited
 * execute-chain intent (the `compose_execute_chain` envelope on the ONE forced
 * agent_intent tool) into the chain record-graph — material-derivation +
 * material-instance + N aliquots + ONE attestation-chain envelope (with the
 * FULFIL fulfillment claims riding INSIDE the same envelope, D2) — staged
 * through the staging store; nothing durable before the reviewHash-verified
 * accept.
 *
 * Hard rules honored here:
 * - NO `kind ===`/`adapter ===` business branch and NO arithmetic literal in
 *   TS: the draft walls (orphan-parent mixed shape, elicitation wall, occurred
 *   pairing, cross-session refusal) fire through the LintEngine reading
 *   chain-draft.lint.yaml data; the arithmetic ACs (sum<=prepared, count
 *   reconcile) fire through the PURE evaluator reading
 *   config/drafting/execute-chain-arithmetic.yaml data (OQ-2 ruling (b)). A
 *   fired rule becomes a NAMED diagnostic -> canAccept:false (the generic gate).
 * - Deterministic ids ONLY (D4/bait 3): chainIdentity.ts seed-hashes over
 *   (draft content, plan coordinate). NEVER token(), NEVER randomUUID, NEVER
 *   Date.now().
 * - claimStatus is a DECLARATION of the drafting side, never a server
 *   derivation at the accept wall (OQ-4 inherited): the elicited compile IS
 *   the drafting side for chat — it carries the scientist's declared label for
 *   physical claims, and for a fulfillment claim it declares the DATA label
 *   (adapters.yaml claimLabels.fulfillmentSatisfied) only when every declared
 *   evaluation carries the DATA satisfied verdict
 *   (policy.verdictFor('satisfied') — never a positional verdict comparison),
 *   and the DATA fulfillmentIncomplete label when a declared fact is missing
 *   (honest incompleteness is legal, P8). The accept path never rewrites it.
 *   The label VOCABULARY itself is declared data (config/drafting/adapters.yaml
 *   chain.claimLabels — bait-8 repair, fix-run 1): the compiler echoes declared
 *   values and fails with a named diagnostic when the declaration is absent;
 *   zero claimStatus/verb/fulfilledBy string literals live in this file.
 * - ABSENT-before-accept (ratified, Q8 mechanism ruling): the envelope carries
 *   NO attestedAt; the chain adapter's onAccept hook stamps the acceptance time
 *   (adapters.ts hook). occurredAt is ONLY ever the scientist's stated time;
 *   `unknown` is terminal (Q5) — no time fields ride it.
 * - exactOptionalPropertyTypes (server/tsconfig.json:13): optional fields are
 *   absent-or-value via the conditional-spread idiom, never key:undefined
 *   (bait 4: protocol_ref ABSENT on a one-off prep).
 * - §7.6 FULFIL ride: CHAIN reads the pinned plan's REQE- requirement
 *   occurrences (never mints them — FULFIL's normalizer owns ids), never
 *   mutates the plan, never touches plate-event.add-material*, never
 *   re-declares the fulfilledBy/verb/verdict vocabulary in TS (the tokens are
 *   READ out of FULFIL's declared lint vocabulary (schema/lab/attestation.lint
 *   .yaml: fulfil-verb-vocabulary / fulfil-fulfilledby-vocabulary) and the
 *   verdicts out of fulfillment-compatibility.yaml via its shared evaluator,
 *   imported read-only). A plan whose requirements lack ids yields ZERO
 *   fulfillment claims + an honest note.
 * - OQ-1(a) ruling: consumption is staged at CREATION (status consumed on the
 *   create) for the born-in-session aliquot; a cross-session consume ref is
 *   REFUSED by the lint rule, never silently converted (bait 12).
 */

import type { RecordStore } from '../store/types.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { contentHash, object } from '../revisions/RecordRevisionService.js';
import { canonicalReadStore, LAB_SESSION_SCHEMA_ID } from '../drafts/workstateCompile.js';
import { createResolveSpine } from '../resolve/ResolveSpine.js';
import { createRecordProvider } from '../resolve/providers/records.js';
import type { AppContext } from '../server.js';
import { resolvePath } from '../lint/PathResolver.js';
import { evaluateCompatibility } from '../fulfillment/evaluateCompatibility.js';
import { loadFulfillmentCompatibilityPolicy, defaultFulfillmentPolicyPath } from '../fulfillment/fulfillmentPolicy.js';
import { loadChainArithmeticPolicy, evaluateChainArithmetic, defaultChainArithmeticPath, loadChainCardCopy, chainArithmeticReadout } from './chainArithmetic.js';
import {
  ALIQUOT_SCHEMA_ID,
  ATTESTATION_SCHEMA_ID,
  CHAIN_DRAFT_SCHEMA_ID,
  MATERIAL_DERIVATION_SCHEMA_ID,
  MATERIAL_INSTANCE_SCHEMA_ID,
  chainAliquotId,
  chainAttestationId,
  chainDerivationId,
  chainInstanceId,
  chainPersonId,
} from './chainIdentity.js';

const REQUIREMENT_ID_PATTERN = /^REQE-[a-z0-9-]+$/;

/** Production adapters.yaml location (module-relative, the per-call-load
 *  precedent — the config/ dir lives at the repo root, three levels above
 *  server/src/chain). */
function defaultAdaptersPath(): string {
  return fileURLToPath(new URL('../../../config/drafting/adapters.yaml', import.meta.url));
}

/** §7.5 landing policy — DATA (config/drafting/adapters.yaml, the chain
 *  block's `landing:` sub-key; the record-drafting landing precedent, plus the
 *  workstate-tab-kinds.yaml idField/idPrefix shape). Loaded PER CALL (presence
 *  checks only; no surface knowledge lives in TypeScript). Returns the chain
 *  block's declared landing shape, or null when the block or the landing key
 *  is absent: the compile then fails honestly with a LANDING_TAB_KIND_UNDECLARED
 *  diagnostic and ZERO writes — the compiler never defaults a surface. */
export interface ChainLandingPolicy {
  tabKind: string;
  idField: string;
  idPrefix: string;
}

export function loadChainLandingPolicy(adaptersPath = defaultAdaptersPath()): ChainLandingPolicy | null {
  let raw: string;
  try {
    raw = readFileSync(adaptersPath, 'utf8');
  } catch {
    return null;
  }
  const parsed = parseYaml(raw) as unknown;
  const block = (parsed as { adapters?: Record<string, unknown> } | null)?.adapters?.['chain'];
  const landing = (block as { landing?: Record<string, unknown> } | undefined)?.landing;
  const tabKind = landing?.tabKind;
  const idField = landing?.idField;
  const idPrefix = landing?.idPrefix;
  if (typeof tabKind !== 'string' || tabKind.trim().length === 0) return null;
  if (typeof idField !== 'string' || idField.trim().length === 0) return null;
  if (typeof idPrefix !== 'string' || idPrefix.trim().length === 0) return null;
  return { tabKind: tabKind.trim(), idField: idField.trim(), idPrefix: idPrefix.trim() };
}

/** §7.2 claim-label vocabulary (DATA, bait-8 repair fix-run 1): the labels the
 *  compiler ECHOES live in the chain adapter block's `claimLabels` — never as
 *  TypeScript literals. Absent declaration => null => the compile refuses with
 *  a named diagnostic (the landing-policy precedent: the compiler never
 *  defaults a label). */
export interface ChainClaimLabels {
  /** Plan-side label for an INSTRUCTED (plan-slot-reference) payload (§7.2). */
  instructed: string;
  /** Echoed when an attested posture was declared but named no claimStatus. */
  declaredFallback: string;
  /** Label for a fulfillment claim whose evaluations all carry the DATA
   *  satisfied verdict (policy.verdictFor('satisfied') — never positional). */
  fulfillmentSatisfied: string;
  /** Label for a fulfillment claim with a missing/incomplete declared fact (P8). */
  fulfillmentIncomplete: string;
}

export interface ChainFulfillmentVocabulary {
  /** The fulfillment verb (FULFIL's declared vocabulary, pinned by lock test). */
  verb: string;
  /** The evidence family this chain emits (FULFIL's fulfilledBy vocabulary). */
  fulfilledBy: string;
}

/** Physical claim verbs (DATA): the drafting side's assertion verbs for the
 *  chain's physical claims, echoed by the compiler (bait-8 repair). */
export interface ChainClaimVerbs {
  prepared: string;
  stored: string;
  consumed: string;
}

function chainAdapterBlock(adaptersPath: string): Record<string, unknown> | null {
  let raw: string;
  try {
    raw = readFileSync(adaptersPath, 'utf8');
  } catch {
    return null;
  }
  const parsed = parseYaml(raw) as unknown;
  const block = (parsed as { adapters?: Record<string, unknown> } | null)?.adapters?.['chain'];
  return block !== null && typeof block === 'object' && !Array.isArray(block)
    ? (block as Record<string, unknown>)
    : null;
}

export function loadChainClaimLabels(adaptersPath = defaultAdaptersPath()): ChainClaimLabels | null {
  const labels = asObjectOrNull(chainAdapterBlock(adaptersPath)?.claimLabels);
  if (labels === null) return null;
  const instructed = labels.instructed;
  const declaredFallback = labels.declaredFallback;
  const fulfillmentSatisfied = labels.fulfillmentSatisfied;
  const fulfillmentIncomplete = labels.fulfillmentIncomplete;
  if (typeof instructed !== 'string' || instructed.trim().length === 0) return null;
  if (typeof declaredFallback !== 'string' || declaredFallback.trim().length === 0) return null;
  if (typeof fulfillmentSatisfied !== 'string' || fulfillmentSatisfied.trim().length === 0) return null;
  if (typeof fulfillmentIncomplete !== 'string' || fulfillmentIncomplete.trim().length === 0) return null;
  return {
    instructed: instructed.trim(),
    declaredFallback: declaredFallback.trim(),
    fulfillmentSatisfied: fulfillmentSatisfied.trim(),
    fulfillmentIncomplete: fulfillmentIncomplete.trim(),
  };
}

/** §7.6 fulfillment emission tokens as DECLARED DATA (bait-8/D3 repair): the
 *  chain's declared verb + evidence family, lock-tested against FULFIL's
 *  declared vocabulary (attestation.lint.yaml fulfil-verb-vocabulary /
 *  fulfil-fulfilledby-vocabulary + fulfillment-compatibility.yaml checks) so
 *  the two data sources cannot drift. The compiler reads them; zero literals. */
export function loadChainFulfillmentVocabulary(adaptersPath = defaultAdaptersPath()): ChainFulfillmentVocabulary | null {
  const vocab = asObjectOrNull(chainAdapterBlock(adaptersPath)?.fulfillment);
  if (vocab === null) return null;
  const verb = vocab.verb;
  const fulfilledBy = vocab.fulfilledBy;
  if (typeof verb !== 'string' || verb.trim().length === 0) return null;
  if (typeof fulfilledBy !== 'string' || fulfilledBy.trim().length === 0) return null;
  return { verb: verb.trim(), fulfilledBy: fulfilledBy.trim() };
}

export function loadChainClaimVerbs(adaptersPath = defaultAdaptersPath()): ChainClaimVerbs | null {
  const verbs = asObjectOrNull(chainAdapterBlock(adaptersPath)?.claimVerbs);
  if (verbs === null) return null;
  const prepared = verbs.prepared;
  const stored = verbs.stored;
  const consumed = verbs.consumed;
  if (typeof prepared !== 'string' || prepared.trim().length === 0) return null;
  if (typeof stored !== 'string' || stored.trim().length === 0) return null;
  if (typeof consumed !== 'string' || consumed.trim().length === 0) return null;
  return { prepared: prepared.trim(), stored: stored.trim(), consumed: consumed.trim() };
}

export interface ChainCompileDeps {
  /** Canonical READ-ONLY store (the exported canonicalReadStore view — the
   *  same reader workstate/analysis/receiving reuse). The idempotence scan
   *  rides it; it pins NOTHING in the reviewHash read set (the RECV law). */
  canonical: RecordStore;
  /** The staging proxy (context.store during compile): plan/spec reads through
   *  it pin into the reviewHash read set so a post-review source edit 409s at
   *  accept (the rail's pinned-source gate). */
  staging: RecordStore;
  /** Ajv against a registered corpus schema (the structural authority). */
  validate: (doc: unknown, schemaId: string) => { valid: boolean; errors?: Array<{ path: string; message: string }> };
  /** The LintEngine is the BUSINESS-RULE authority (chain-draft.lint.yaml +
   *  the shipped attestation.lint.yaml walls): the card names the fired rule. */
  lint: (payload: Record<string, unknown>, schemaId: string) => { valid: boolean; violations: Array<{ ruleId: string; severity: string; message: string }> };
  /** Fixture-injectable arithmetic policy path (per-call load). */
  arithmeticPolicyPath?: string;
  /** Fixture-injectable FULFIL compatibility policy path (per-call load). */
  fulfillmentPolicyPath?: string;
  /** Fixture-injectable adapters.yaml path for the landing policy (per-call load). */
  adaptersPath?: string;
}

export function chainDepsFromContext(ctx: AppContext): ChainCompileDeps {
  return {
    canonical: canonicalReadStore(ctx),
    staging: ctx.store,
    validate: (doc, schemaId) => ctx.validator.validate(doc, schemaId),
    lint: (payload, schemaId) => ctx.lintEngine.lint(payload, schemaId),
  };
}

export interface CompiledChainDraft {
  ok: boolean;
  diagnostics: string[];
  /** The draft-state attestation envelope (NO attestedAt — absent-before-accept). */
  envelope?: Record<string, unknown>;
  derivationPayload?: Record<string, unknown>;
  instancePayload?: Record<string, unknown>;
  aliquotPayloads?: Record<string, unknown>[];
  recordId?: string;
  derivationRecordId?: string;
  instanceRecordId?: string;
  aliquotRecordIds?: string[];
  /** Pinned canonical sources (id -> contentHash): the pinned plan + the read
   *  material-spec. The rail's pinned-source gate 409s post-review drift. */
  reads?: Record<string, string>;
  /** Idempotence (the RECV ruling item B shape): record ids the durable store
   *  ALREADY holds with content equal modulo the server's acceptance stamp (the
   *  attestation) or byte-equal (the physical records). The adapter then
   *  tolerates the staged create refusal — the already-accepted record IS the
   *  plan's outcome (no second chain). A DIFFERENT payload under the same id is
   *  a real collision and stays a stage failure. */
  durableAcceptedIds?: Set<string>;
  /** Honest §7.6 disclosure when the drafting carries no fulfillment claims. */
  fulfillmentNote?: string;
  /** §7.2: an instructed (plan-side) acceptance attests NOTHING physical. */
  attestsNothingPhysical?: boolean;
  summary?: string;
  /**
   * §7.5 landing document: the surface the accepted chain re-focuses, built
   * from the chain adapter block's declared `landing.tabKind` in
   * config/drafting/adapters.yaml (DATA, never a TS literal — the
   * record-drafting landing precedent) and re-validated against the REGISTERED
   * lab-session $id. An absent landing key fails the compile honestly with a
   * named diagnostic; the compiler never defaults a surface.
   */
  sessionDocument?: { version: 1; tabs: Array<Record<string, unknown>>; activeTabId: string | null };
  /**
   * §7.5 — the SERVER-BUILT review card document (the recordFields doctrine:
   * the client renders it verbatim and maps nothing by kind name). Every
   * string here is either the draft's own DECLARED value or a copy read out
   * of config/drafting/execute-chain-arithmetic.yaml — zero card copy lives in
   * TypeScript (bait 8/10). The claim table shows each claim's label VERBATIM
   * as stored; the identity triple renders absence as the DATA unknown label,
   * never the acceptor.
   */
  card?: ChainCardDocument;
}

export interface ChainCardClaim {
  /** The claimStatus VERBATIM (proposed|completed|unknown|reported-by-other). */
  label: string;
  verb: string;
  aboutId: string;
  aboutType: string;
  occurredAtStatus: string;
  occurredAt?: string;
  approximation?: string;
  /** The DECLARED identity triple (P3): absent renders as the unknown label,
   *  and performer is NEVER pre-filled with the attestor. */
  identity: { performer: string; accountSupplier: string; attestor: string };
}

export interface ChainCardDocument {
  /** artifactKind in the header (Q2: a default is visible, never invisible). */
  artifactKind: string;
  claims: ChainCardClaim[];
  /** The arithmetic reconciliation readout (numbers from the DATA scale
   *  table); absent when the policy declares no sumCompare rule. */
  reconciliation?: {
    title: string;
    sumScaled: number;
    preparedScaled: number;
    counts: Array<{ label: string; count: number }>;
  };
  /** The §7.4 r2 honesty ceiling — REQUIRED card text, loaded from DATA. */
  ceilingNote: string;
  fulfillmentNote?: string;
}

function trimmed(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

function asObject(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function asObjectOrNull(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Copy the pinned plan's composition component refs for one event (the FULFIL
 *  F6 stance, mirrored read-side: top-level entries AND one level of nested
 *  composition entries; deeper nesting is a RECORDED limitation). CHAIN copies;
 *  it never mints and never mutates (AC-5). */
function copyComponentRefs(event: Record<string, unknown>, requirement: Record<string, unknown>): string[] {
  const collected = new Set<string>();
  const snapshots = [
    ...(Array.isArray(object(event.details).composition_snapshot) ? (object(event.details).composition_snapshot as unknown[]) : []),
    ...(Array.isArray(requirement.composition_snapshot) ? (requirement.composition_snapshot as unknown[]) : []),
  ];
  for (const entry of snapshots) {
    const entryObj = object(entry);
    const topRef = resolvePath(entryObj, 'component_ref.id');
    if (topRef.found && typeof topRef.value === 'string') collected.add(topRef.value);
    if (Array.isArray(entryObj.composition)) {
      for (const nested of entryObj.composition as unknown[]) {
        const nestedRef = resolvePath(object(nested), 'component_ref.id');
        if (nestedRef.found && typeof nestedRef.value === 'string') collected.add(nestedRef.value);
      }
    }
  }
  return [...collected].sort();
}

interface RequirementOccurrence {
  event: Record<string, unknown>;
  requirement: Record<string, unknown>;
  requirementId: string;
}

/** Read the pinned plan's requirement occurrences WITH declared REQE- ids.
 *  A requirement without an id is COUNTED for the honest note — the chain side
 *  never mints one (§7.6; FULFIL's normalizer owns the mint). */
function readRequirementOccurrences(planPayload: Record<string, unknown>): { occurrences: RequirementOccurrence[]; idlessCount: number } {
  const events = Array.isArray(planPayload.events) ? (planPayload.events as Record<string, unknown>[]) : [];
  const occurrences: RequirementOccurrence[] = [];
  let idlessCount = 0;
  for (const event of events) {
    const requirement = asObject(object(event.details).material_source_requirement);
    if (!requirement) continue;
    const id = trimmed(requirement.requirementId);
    if (id !== undefined && REQUIREMENT_ID_PATTERN.test(id)) {
      occurrences.push({ event, requirement, requirementId: id });
    } else {
      idlessCount += 1;
    }
  }
  return { occurrences, idlessCount };
}

/**
 * Compile the elicited chain intent into the planned writes + the ONE
 * attestation envelope. Structural authority (Ajv) on every payload; the draft
 * walls (lint YAML data) and the arithmetic (policy YAML data) run at COMPILE
 * and name the fired rule on the card; the same walls fire again at the staging
 * create and at the accept re-evaluation.
 */
export async function compileExecuteChainIntent(
  intent: Record<string, unknown>,
  deps: ChainCompileDeps,
): Promise<CompiledChainDraft> {
  const diagnostics: string[] = [];
  const reads: Record<string, string> = {};

  // 1. Structural authority on the elicited composite (the registered draft
  //    schema — the compile-side twin of the tool-declared `chain` property;
  //    the lockstep is pinned in ChainEmission.test.ts).
  const draftValidation = deps.validate(intent, CHAIN_DRAFT_SCHEMA_ID);
  if (!draftValidation.valid) {
    return {
      ok: false,
      diagnostics: (draftValidation.errors ?? []).map(e => `chain draft${e.path}: ${e.message}`),
    };
  }

  // 2. The DRAFT walls (chain-draft.lint.yaml DATA): mixed-parentage orphan
  //    shape, the elicitation wall, occurred pairing, the OQ-1(a) cross-session
  //    refusal. Named rule ids surface on the card.
  const draftLint = deps.lint(intent, CHAIN_DRAFT_SCHEMA_ID);
  for (const violation of draftLint.violations) {
    if (violation.severity === 'error') diagnostics.push(`${violation.ruleId}: ${violation.message}`);
  }

  // 3. The arithmetic walls (execute-chain-arithmetic.yaml DATA via the PURE
  //    evaluator, OQ-2 ruling (b)): sum<=prepared (unit scale is data) and the
  //    count reconcile. Absent policy = LOUD off (console.warn names the path).
  const arithmetic = loadChainArithmeticPolicy(deps.arithmeticPolicyPath ?? defaultChainArithmeticPath());
  if (arithmetic !== null) {
    for (const violation of evaluateChainArithmetic(arithmetic, intent)) {
      diagnostics.push(violation.message);
    }
  }

  // 3b. The claim-label vocabulary + the fulfillment emission tokens are
  //     DECLARED DATA (config/drafting/adapters.yaml chain.claimLabels /
  //     chain.fulfillment — bait-8 repair, fix-run 1 D2/D3): the compiler
  //     ECHOES declared values and refuses with a named diagnostic when the
  //     declaration is absent (the landing-policy precedent — the compiler
  //     never defaults a label and carries zero label/verb literals in TS).
  const claimLabels = loadChainClaimLabels(deps.adaptersPath ?? defaultAdaptersPath());
  const fulfilVocab = loadChainFulfillmentVocabulary(deps.adaptersPath ?? defaultAdaptersPath());
  const claimVerbs = loadChainClaimVerbs(deps.adaptersPath ?? defaultAdaptersPath());
  if (claimLabels === null || fulfilVocab === null || claimVerbs === null) {
    return {
      ok: false,
      diagnostics: [...diagnostics, 'CHAIN_CLAIM_VOCAB_UNDECLARED: the chain adapter block in config/drafting/adapters.yaml declares no claimLabels {instructed, declaredFallback, fulfillmentSatisfied, fulfillmentIncomplete}, no fulfillment {verb, fulfilledBy}, and/or no claimVerbs {prepared, stored, consumed}, so the compile cannot echo the §7.2/§7.6 claim vocabulary from DATA. Nothing was staged; declare the vocabulary in the adapter block.'],
    };
  }

  const artifactKind = trimmed(intent.artifactKind) ?? 'plan-slot-reference';
  const isAttestedChain = artifactKind === 'attestation-chain';
  const prepared = object(intent.prepared);
  const preparedName = trimmed(prepared.name) ?? '';
  const preparedVolume = object(prepared.volume);
  let sourceSpecRef = asObject(prepared.sourceSpecRef);
  const aliquots = Array.isArray(intent.aliquots) ? (intent.aliquots as Record<string, unknown>[]) : [];

  // 4. The pinned plan (READ, never written): its REQE- occurrences are the
  //    fulfillment claims' referents; the read pins the reviewHash source set.
  const planBlock = asObject(intent.plan);
  const planRecordId = planBlock !== undefined ? trimmed(planBlock.recordId) : undefined;
  let occurrences: RequirementOccurrence[] = [];
  let idlessCount = 0;
  let planHash: string | undefined;
  if (planRecordId !== undefined) {
    const plan = await deps.staging.get(planRecordId);
    if (!plan) {
      diagnostics.push(`chain.plan: pinned plan ${planRecordId} not found — a chain drafted against a plan must name an existing plan record`);
    } else {
      planHash = contentHash(plan.payload);
      reads[planRecordId] = planHash;
      ({ occurrences, idlessCount } = readRequirementOccurrences(object(plan.payload)));
    }
  }

  // The material-spec the prep realizes (READ, never written).
  let specRecordId: string | undefined;
  if (sourceSpecRef !== undefined && sourceSpecRef.kind === 'record' && typeof sourceSpecRef.id === 'string') {
    specRecordId = sourceSpecRef.id;
    const spec = await deps.staging.get(specRecordId);
    if (spec) reads[specRecordId] = contentHash(spec.payload);
  }

  // fix-run 4 D2(b): the LIVE emission names the prep by NAME only (prepared
  // {name, volume} with no sourceSpecRef), so the instance payload would never
  // gain material_spec_ref and would fail the shipped material-instance anyOf.
  // The compiler attempts a DATA resolution of the declared name against the
  // lab's existing material-spec records through the SHIPPED name->record
  // mechanism — the resolve spine's tier-1 record provider
  // (server/src/resolve/providers/records.ts, the provider createResolveSpine
  // composes for every name->record binding: server.ts:802,
  // server/src/ai/resolveDraftMaterials.ts). Local tiers only (the
  // resolveDraftMaterials localOnly doctrine — offline-safe, deterministic).
  // Binding law (the resolveDraftMaterials/lookupVendorProduct doctrine):
  // exactly one distinct record binds; ZERO matches and MORE THAN ONE distinct
  // match are NOT resolvable — the compiler never fuzzy-guesses across distinct
  // records and never mints a spec. An unresolvable name leaves the compile
  // legitimately blocked with a NAMED diagnostic (the blocked wall, D3).
  if (isAttestedChain && specRecordId === undefined && preparedName.length > 0) {
    const spine = createResolveSpine({
      recordProvider: createRecordProvider(deps.canonical, ['material-spec']),
    });
    const candidates = await spine.resolve(preparedName, { localOnly: true, level: 'spec' });
    const specIds = [...new Set(
      candidates
        .filter(c => c.tier === 1 && c.level === 'spec' && c.curie.startsWith('local:'))
        .map(c => c.curie.slice('local:'.length))
        .filter(id => id.length > 0),
    )].sort();
    if (specIds.length === 1) {
      specRecordId = specIds[0]!;
      sourceSpecRef = { kind: 'record', type: 'material-spec', id: specRecordId };
      const spec = await deps.staging.get(specRecordId);
      if (spec) reads[specRecordId] = contentHash(spec.payload);
    } else if (specIds.length === 0) {
      diagnostics.push(`chain.prepared.sourceSpecRef: no material-spec record names the declared prep '${preparedName}' — the compiler resolves the prep's material through the lab's name->record spine (resolve/providers/records tier 1) and NEVER guesses or mints a spec; name the material the prep realizes so the spine can bind it`);
    } else {
      diagnostics.push(`chain.prepared.sourceSpecRef: the declared prep name '${preparedName}' is ambiguous — ${String(specIds.length)} distinct material-spec records match (${specIds.join(', ')}); the compiler binds a name only when exactly one record matches and NEVER fuzzy-guesses across distinct records`);
    }
  }

  // 5. Deterministic ids (D4): seed-hashes over (draft content, plan coordinate).
  const entityCore: Record<string, unknown> = {
    preparedName,
    preparedVolume,
    ...(specRecordId !== undefined ? { specRecordId } : {}),
    planCoordinate: planRecordId ?? null,
    artifactKind,
  };
  const instanceRecordId = chainInstanceId(entityCore);
  const derivationRecordId = chainDerivationId({ entityCore, instanceRecordId });
  const aliquotRecordIds = aliquots.map((a, i) =>
    chainAliquotId({
      instanceRecordId,
      ordinal: i,
      disposition: trimmed(a.disposition) ?? null,
      volume: object(a.volume),
      storage: asObject(a.storage) ?? null,
    }),
  );

  // 6. The attested posture (DECLARED, never derived) + the identity triple
  //    (P3: labels are the scientist's words; absence means UNKNOWN).
  const attested = asObject(intent.attested);
  const claimStatus = attested !== undefined ? trimmed(attested.claimStatus) : undefined;
  const occurredAtStatus = attested !== undefined ? trimmed(attested.occurredAtStatus) : undefined;
  const occurredAt = attested !== undefined ? trimmed(attested.occurredAt) : undefined;
  const approximation = attested !== undefined ? trimmed(attested.approximation) : undefined;
  const attestorLabel = attested !== undefined ? trimmed(attested.attestorLabel) : undefined;
  const performerLabel = attested !== undefined ? trimmed(attested.performerLabel) : undefined;
  const accountSupplierLabel = attested !== undefined ? trimmed(attested.accountSupplierLabel) : undefined;

  const personRef = (label: string | undefined): Record<string, unknown> | undefined =>
    label !== undefined ? { kind: 'record', type: 'person', id: chainPersonId(label) } : undefined;

  // 7. The record-graph payloads (§7.1). Every edge a declared field.
  const derivationPayload: Record<string, unknown> = {
    kind: 'material-derivation',
    id: derivationRecordId,
    name: `Preparation of ${preparedName}`,
    derivation_type: 'preparation',
    inputs: sourceSpecRef !== undefined ? [sourceSpecRef] : [],
    // outputs name BOTH the realized formulation and the prepared entity — the
    // FULFIL spec-identity check reads outputs[*].id against the requirement's
    // declared material_spec_ref (merged compatibility data is authority).
    outputs: [
      ...(specRecordId !== undefined ? [{ kind: 'record', type: 'material-spec', id: specRecordId }] : []),
      { kind: 'record', type: 'material-instance', id: instanceRecordId },
    ],
    // protocol_ref ABSENT for a one-off prep (legal per the schema's optional;
    // bait 4 asserts its absence). source_event_graph_ref = the pinned plan.
    ...(planRecordId !== undefined ? { source_event_graph_ref: { kind: 'record', type: 'event-graph', id: planRecordId } } : {}),
  };

  const instancePayload: Record<string, unknown> = {
    kind: 'material-instance',
    id: instanceRecordId,
    name: preparedName,
    ...(sourceSpecRef !== undefined ? { material_spec_ref: sourceSpecRef } : {}),
    derivation_ref: { kind: 'record', type: 'material-derivation', id: derivationRecordId },
    volume: { value: preparedVolume.value, unit: String(preparedVolume.unit ?? '') },
    status: 'available',
    // prepared_on rides the scientist's DECLARED occurrence time only (never a
    // synthesized now — r2 §1).
    ...(occurredAt !== undefined ? { prepared_on: occurredAt } : {}),
  };

  const aliquotPayloads: Record<string, unknown>[] = aliquots.map((a, i) => {
    const disposition = trimmed(a.disposition);
    const storage = asObject(a.storage);
    const volume = object(a.volume);
    return {
      kind: 'aliquot',
      id: aliquotRecordIds[i]!,
      name: `${preparedName} aliquot ${i + 1}`,
      parent_material_instance_ref: { kind: 'record', type: 'material-instance', id: instanceRecordId },
      ...(sourceSpecRef !== undefined ? { material_spec_ref: sourceSpecRef } : {}),
      volume: { value: volume.value, unit: String(volume.unit ?? '') },
      ...(storage !== undefined ? { storage } : {}),
      // OQ-1(a)/D4: the born-in-session consumed aliquot is consumed AT
      // CREATION — a create, never an update to a pre-existing record (bait 12).
      status: disposition === 'consumed' ? 'consumed' : 'available',
    };
  });

  // 8. The claims (§7.2 labels + §7.6 fulfillment claims in the SAME envelope).
  //    Every label is a DECLARED value echoed from DATA (adapters.yaml
  //    chain.claimLabels — bait-8 repair): the scientist's own attested.claimStatus
  //    when declared, the DATA instructed label for a plan-side payload, the
  //    DATA fallback when an attested posture named no label. The server NEVER
  //    derives or rewrites a declared claimStatus (OQ-4 law inherited).
  const claims: Record<string, unknown>[] = [];
  const physicalClaimStatus = isAttestedChain ? (claimStatus ?? claimLabels.declaredFallback) : claimLabels.instructed;

  // fix-run 4 D2(a): the compiler NEVER emits approximate-without-occurredAt.
  // The shipped pairing wall (attestation.lint.yaml
  // attestation-occurred-approximate-needs-approximation) requires BOTH
  // occurredAt and approximation on an approximate claim, and no declared
  // data/config resolves a relative approximation token ('today', 'yesterday')
  // to a concrete timestamp — inventing one would be a synthesized occurrence
  // time, which the Q5/Q8 law forbids (occurredAt is ONLY ever the
  // scientist's stated time). So an approximate claim with no stated
  // occurredAt downgrades to the terminal 'unknown' (Q5: "I don't know" is a
  // complete answer) and the human approximation note is RETAINED for the
  // review card only (display), never on the stored claim (the
  // unknown-is-terminal wall forbids time fields on unknown).
  // timeApproximationNotes is index-aligned with the PHYSICAL claims the
  // attested branch builds (the prepared claim first, then one per aliquot —
  // the same order the §9b card claims render before any fulfillment claims).
  const timeApproximationNotes: Array<string | undefined> = [];
  const timeFields = (statusRaw: unknown, atRaw: unknown, approxRaw: unknown): Record<string, unknown> => {
    let status = trimmed(statusRaw) ?? 'unknown';
    const at = trimmed(atRaw);
    const approx = trimmed(approxRaw);
    if (status === 'approximate' && at === undefined) {
      status = 'unknown';
      timeApproximationNotes.push(approx);
      return { occurredAtStatus: status };
    }
    timeApproximationNotes.push(undefined);
    return {
      occurredAtStatus: status,
      ...(status !== 'unknown' && at !== undefined ? { occurredAt: at } : {}),
      ...(status === 'approximate' && approx !== undefined ? { approximation: approx } : {}),
    };
  };

  if (isAttestedChain) {
    claims.push({
      claimStatus: physicalClaimStatus,
      assertion: {
        verb: claimVerbs.prepared,
        about: { kind: 'record', type: 'material-instance', id: instanceRecordId },
        ...(sourceSpecRef !== undefined ? { materialSpecRef: sourceSpecRef } : {}),
        volume: { value: preparedVolume.value, unit: String(preparedVolume.unit ?? '') },
      },
      ...timeFields(occurredAtStatus, occurredAt, approximation),
      ...(personRef(attestorLabel) !== undefined ? { attestor: personRef(attestorLabel)! } : {}),
      ...(personRef(performerLabel) !== undefined ? { performer: personRef(performerLabel)! } : {}),
      ...(personRef(accountSupplierLabel) !== undefined ? { accountSupplier: personRef(accountSupplierLabel)! } : {}),
    });
    aliquots.forEach((a, i) => {
      const disposition = trimmed(a.disposition);
      claims.push({
        claimStatus: physicalClaimStatus,
        assertion: {
          // The consumption FACT is a DECLARED claim (verb consumed, about the
          // aliquot) — never inferred from the status field alone (bait 10).
          verb: disposition === 'consumed' ? claimVerbs.consumed : claimVerbs.stored,
          about: { kind: 'record', type: 'aliquot', id: aliquotRecordIds[i]! },
          volume: { value: object(a.volume).value, unit: String(object(a.volume).unit ?? '') },
          ...(asObject(a.storage) !== undefined ? { storage: asObject(a.storage)! } : {}),
        },
        ...timeFields(a.occurredAtStatus, a.occurredAt, a.approximation),
      });
    });
  } else {
    // Instructed (plan-side): proposed claims describe the PLAN; acceptance
    // attests NOTHING physical (P2 — the shipped wall keeps proposed off a
    // CHAIN; this envelope is plan-slot-reference, so the DATA instructed
    // label is its honest label).
    claims.push({
      claimStatus: claimLabels.instructed,
      assertion: {
        verb: claimVerbs.prepared,
        about: { kind: 'record', type: 'material-instance', id: instanceRecordId },
        volume: { value: preparedVolume.value, unit: String(preparedVolume.unit ?? '') },
      },
      occurredAtStatus: 'unknown',
    });
    aliquots.forEach((_a, i) => {
      claims.push({
        claimStatus: claimLabels.instructed,
        assertion: {
          verb: claimVerbs.stored,
          about: { kind: 'record', type: 'aliquot', id: aliquotRecordIds[i]! },
        },
        occurredAtStatus: 'unknown',
      });
    });
  }

  // §7.6 FULFIL ride: fulfillment claims ONLY for REQE- occurrences the PINNED
  // plan already declares. The evaluations are the DATA policy's verdicts
  // (fulfillment-compatibility.yaml via FULFIL's shared evaluator — imported
  // read-only, zero vocabulary re-declaration). The claim's label is the DATA
  // declaration (adapters.yaml chain.claimLabels): fulfillmentSatisfied ONLY
  // when every declared evaluation carries the DATA satisfied verdict —
  // resolved through policy.verdictFor('satisfied'), NEVER a positional
  // comparison against the verdict list (fix-run 1 D4: a verdict-list reorder
  // cannot flip the label) — and fulfillmentIncomplete otherwise (P8: honest
  // incompleteness is legal, presented-as-completed is not).
  let fulfillmentNote: string | undefined;
  if (isAttestedChain && occurrences.length > 0) {
    const policy = loadFulfillmentCompatibilityPolicy(deps.fulfillmentPolicyPath ?? defaultFulfillmentPolicyPath());
    const satisfiedVerdict = policy.verdictFor('satisfied');
    for (const { event, requirement, requirementId } of occurrences) {
      const evaluations = evaluateCompatibility(policy, fulfilVocab.fulfilledBy, requirement, derivationPayload);
      const allSatisfied = evaluations.length > 0 && evaluations.every(e => e.verdict === satisfiedVerdict);
      claims.push({
        claimStatus: allSatisfied ? claimLabels.fulfillmentSatisfied : claimLabels.fulfillmentIncomplete,
        assertion: {
          verb: fulfilVocab.verb,
          about: { kind: 'record', type: 'event-requirement', id: requirementId },
          fulfilledBy: fulfilVocab.fulfilledBy,
          evidence: { kind: 'record', type: 'material-derivation', id: derivationRecordId },
          // Citation law (FULFIL §7.6): the claim cites the evidence it rests on.
          cites: derivationRecordId,
          requirementIds: [requirementId],
          componentRefs: copyComponentRefs(event, requirement),
          evaluations,
        },
        occurredAtStatus: 'unknown',
      });
    }
  } else if (isAttestedChain) {
    fulfillmentNote = planRecordId === undefined
      ? 'No pinned plan — this chain carries no fulfillment claims (a fulfillment is scoped to a pinned plan\'s requirement occurrence).'
      : idlessCount > 0
        ? `The pinned plan carries ${idlessCount} requirement occurrence(s) without REQE- ids — no fulfillment claims drafted; requirement ids are minted by FULFIL's normalizer, never by the chain.`
        : 'The pinned plan declares no requirement occurrences — no fulfillment claims drafted.';
  }

  // 9. The ONE attestation envelope (attestation.schema.yaml UNTOUCHED — CHAIN
  //    adds no envelope fields). NO attestedAt (absent-before-accept).
  const envelope: Record<string, unknown> = {
    kind: 'attestation',
    artifactKind,
    title: `Execute chain: ${preparedName}`,
    claims,
    ...(planRecordId !== undefined && planHash !== undefined
      ? {
          // Q3 reference-copy pinning (the merged $defs/Against fields).
          against: {
            eventGraphRef: { kind: 'record', type: 'event-graph', id: planRecordId },
            graphRevision: planHash,
          },
        }
      : {}),
  };

  // The SAME exported id formula the accept rail uses (one derivation, never
  // two): content-scoped, attestedAt + recordId excluded. Embedded BEFORE
  // validation (the schema declares recordId required).
  const recordId = chainAttestationId(envelope);
  envelope.recordId = recordId;

  // 9b. The §7.5 SERVER-BUILT review card document (the recordFields doctrine:
  //     the client renders it verbatim and maps nothing by kind name). Labels
  //     are the claims' claimStatus VERBATIM; the reconciliation numbers come
  //     from the DATA scale table; the ceiling note is loaded from the SAME
  //     policy file (required card text — bait 10). The identity triple renders
  //     the DECLARED labels only — absence is the DATA unknown label, and
  //     performer is NEVER pre-filled with the attestor (bait 9).
  const cardCopy = loadChainCardCopy(deps.arithmeticPolicyPath ?? defaultChainArithmeticPath());
  const unknownLabel = cardCopy?.unknownLabel ?? '';
  const cardClaims: ChainCardClaim[] = claims.map((claim, i) => {
    const assertion = object(claim.assertion);
    const about = object(assertion.about);
    // fix-run 4 D2(a): a downgraded claim (approximate-without-occurredAt ->
    // terminal unknown) keeps its HUMAN APPROXIMATION NOTE on the card — the
    // scientist's own word ('today'/'yesterday') rendered for review. The note
    // is display-only: the stored claim carries neither occurredAt nor
    // approximation (the unknown-is-terminal wall).
    const retainedNote = trimmed(claim.approximation) ?? timeApproximationNotes[i];
    return {
      label: String(claim.claimStatus ?? ''),
      verb: String(assertion.verb ?? ''),
      aboutId: String(about.id ?? ''),
      aboutType: String(about.type ?? ''),
      occurredAtStatus: String(claim.occurredAtStatus ?? 'unknown'),
      ...(trimmed(claim.occurredAt) !== undefined ? { occurredAt: trimmed(claim.occurredAt)! } : {}),
      ...(retainedNote !== undefined ? { approximation: retainedNote } : {}),
      identity: {
        performer: performerLabel ?? unknownLabel,
        accountSupplier: accountSupplierLabel ?? unknownLabel,
        attestor: attestorLabel ?? unknownLabel,
      },
    };
  });
  const readout = arithmetic !== null ? chainArithmeticReadout(arithmetic, intent, cardCopy) : null;
  const card: ChainCardDocument = {
    artifactKind,
    claims: cardClaims,
    ...(readout !== null && cardCopy !== null
      ? {
          reconciliation: {
            title: cardCopy.reconciliationTitle,
            sumScaled: readout.collectionSumScaled,
            preparedScaled: readout.againstScaled,
            counts: readout.counts.map(c => ({ label: c.label, count: c.count })),
          },
        }
      : {}),
    ceilingNote: cardCopy?.ceilingNote ?? '',
    ...(fulfillmentNote !== undefined ? { fulfillmentNote } : {}),
  };

  // 9c. The §7.5 landing document (the record-drafting landing precedent): the
  //     tab shape is the chain adapter block's declared landing (tabKind +
  //     idField + idPrefix — DATA), the id VALUE is the attestation's derived
  //     recordId, and the activeTabId rides the declared idPrefix so
  //     app/src/shared/session/tabId.ts re-derives the same slot id. Re-
  //     validated against the REGISTERED lab-session $id. An absent landing
  //     declaration fails the compile honestly — the compiler never defaults a
  //     surface.
  const landingPolicy = loadChainLandingPolicy(deps.adaptersPath ?? defaultAdaptersPath());
  let sessionDocument: { version: 1; tabs: Array<Record<string, unknown>>; activeTabId: string | null } | undefined;
  if (landingPolicy === null) {
    diagnostics.push('LANDING_TAB_KIND_UNDECLARED: the chain adapter declares no landing.tabKind/idField/idPrefix in config/drafting/adapters.yaml, so the compile cannot name the surface the accepted chain lands on. Nothing was staged; declare the landing shape in the chain adapter block.');
  } else {
    const built = {
      version: 1 as const,
      tabs: [{ kind: landingPolicy.tabKind, [landingPolicy.idField]: recordId, title: String(envelope.title ?? recordId) }],
      activeTabId: `${landingPolicy.idPrefix}:${recordId}`,
    };
    const landingValidation = deps.validate(built, LAB_SESSION_SCHEMA_ID);
    if (!landingValidation.valid) {
      diagnostics.push(...(landingValidation.errors ?? []).map(e => `chain landing${e.path}: ${e.message}`));
    } else {
      sessionDocument = built;
    }
  }

  // 10. Structural authority (Ajv) on every planned payload + the shipped
  //     attestation walls (attestation.lint.yaml: the chain-no-proposed wall,
  //     the occurred pairing, FULFIL's fulfil-* rules) named on the card.
  const envelopeValidation = deps.validate(envelope, ATTESTATION_SCHEMA_ID);
  if (!envelopeValidation.valid) {
    diagnostics.push(...(envelopeValidation.errors ?? []).map(e => `chain envelope${e.path}: ${e.message}`));
  }
  const envelopeLint = deps.lint(envelope, ATTESTATION_SCHEMA_ID);
  for (const violation of envelopeLint.violations) {
    if (violation.severity === 'error') diagnostics.push(`${violation.ruleId}: ${violation.message}`);
  }
  if (!isAttestedChain) {
    for (const [payload, schemaId, label] of [[derivationPayload, MATERIAL_DERIVATION_SCHEMA_ID, 'derivation'], [instancePayload, MATERIAL_INSTANCE_SCHEMA_ID, 'instance']] as const) {
      if (diagnostics.length === 0) {
        // Instructed drafts stage ZERO physical records; validate them only when
        // they would be staged (attested posture). Skipped here by design.
        void payload; void schemaId; void label;
      }
    }
  } else {
    const checks: Array<[Record<string, unknown>, string, string]> = [
      [derivationPayload, MATERIAL_DERIVATION_SCHEMA_ID, 'derivation'],
      [instancePayload, MATERIAL_INSTANCE_SCHEMA_ID, 'instance'],
      ...aliquotPayloads.map((p, i): [Record<string, unknown>, string, string] => [p, ALIQUOT_SCHEMA_ID, `aliquot ${i + 1}`]),
    ];
    for (const [payload, schemaId, label] of checks) {
      const v = deps.validate(payload, schemaId);
      if (!v.valid) diagnostics.push(...(v.errors ?? []).map(e => `planned ${label}${e.path}: ${e.message}`));
    }
  }

  // 11. Idempotence scan (the RECV ruling item B shape, via the canonical LIST
  //     view — pins nothing): ids the durable store already holds with content
  //     equal modulo the acceptance stamp (attestation) / byte-equal (physical).
  const durableAcceptedIds = new Set<string>();
  const durableAttestations = await deps.canonical.list({ kind: 'attestation' });
  const durableAtt = durableAttestations.find(r => r.recordId === recordId);
  if (durableAtt !== undefined
    && durableAtt.schemaId === ATTESTATION_SCHEMA_ID
    && contentHash(Object.fromEntries(Object.entries(object(durableAtt.payload)).filter(([key]) => key !== 'attestedAt'))) === contentHash(envelope)) {
    durableAcceptedIds.add(recordId);
  }
  for (const [payload, kind] of [[derivationPayload, 'material-derivation'], [instancePayload, 'material-instance'], ...aliquotPayloads.map(p => [p, 'aliquot'] as const)] as const) {
    if (!isAttestedChain) break;
    const durable = (await deps.canonical.list({ kind })).find(r => r.recordId === String(payload.id));
    if (durable !== undefined && contentHash(durable.payload) === contentHash(payload)) durableAcceptedIds.add(String(payload.id));
  }

  const summary = isAttestedChain
    ? `Attested execute chain: ${preparedName} (${String(aliquotPayloads.length)} aliquots) — derivation + instance + aliquots + ONE attestation-chain; review the claim labels; nothing is written until you accept.`
    : `Planned execute chain: ${preparedName} (${String(aliquots.length)} planned aliquots) — plan-side only; acceptance attests NOTHING physical.`;

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics, envelope, derivationPayload, instancePayload, aliquotPayloads, recordId, derivationRecordId, instanceRecordId, aliquotRecordIds, reads, durableAcceptedIds, ...(fulfillmentNote !== undefined ? { fulfillmentNote } : {}), card, ...(sessionDocument !== undefined ? { sessionDocument } : {}), summary };
  }
  return {
    ok: true,
    diagnostics,
    envelope,
    derivationPayload,
    instancePayload,
    aliquotPayloads,
    recordId,
    derivationRecordId,
    instanceRecordId,
    aliquotRecordIds,
    reads,
    durableAcceptedIds,
    ...(fulfillmentNote !== undefined ? { fulfillmentNote } : {}),
    card,
    ...(sessionDocument !== undefined ? { sessionDocument } : {}),
    ...(isAttestedChain ? {} : { attestsNothingPhysical: true }),
    summary,
  };
}
