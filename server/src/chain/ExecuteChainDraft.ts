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
 *   physical claims, and for a fulfillment claim it declares `completed` only
 *   when the DATA policy's evaluations are all compatible, `unknown` when a
 *   declared fact is missing (honest incompleteness is legal, P8). The accept
 *   path never rewrites it.
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
 *   re-declares the fulfilledBy/verb/verdict vocabulary in TS (the values ride
 *   FULFIL's lint data + its shared evaluator, imported read-only). A plan
 *   whose requirements lack ids yields ZERO fulfillment claims + an honest
 *   note.
 * - OQ-1(a) ruling: consumption is staged at CREATION (status consumed on the
 *   create) for the born-in-session aliquot; a cross-session consume ref is
 *   REFUSED by the lint rule, never silently converted (bait 12).
 */

import type { RecordStore } from '../store/types.js';
import { contentHash, object } from '../revisions/RecordRevisionService.js';
import { canonicalReadStore } from '../drafts/workstateCompile.js';
import type { AppContext } from '../server.js';
import { resolvePath } from '../lint/PathResolver.js';
import { evaluateCompatibility } from '../fulfillment/evaluateCompatibility.js';
import { loadFulfillmentCompatibilityPolicy, defaultFulfillmentPolicyPath } from '../fulfillment/fulfillmentPolicy.js';
import { loadChainArithmeticPolicy, evaluateChainArithmetic, defaultChainArithmeticPath } from './chainArithmetic.js';
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
}

function trimmed(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

function asObject(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
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

  const artifactKind = trimmed(intent.artifactKind) ?? 'plan-slot-reference';
  const isAttestedChain = artifactKind === 'attestation-chain';
  const prepared = object(intent.prepared);
  const preparedName = trimmed(prepared.name) ?? '';
  const preparedVolume = object(prepared.volume);
  const sourceSpecRef = asObject(prepared.sourceSpecRef);
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
  const claims: Record<string, unknown>[] = [];
  const physicalClaimStatus = isAttestedChain ? (claimStatus ?? 'unknown') : 'proposed';

  const timeFields = (statusRaw: unknown, atRaw: unknown, approxRaw: unknown): Record<string, unknown> => {
    const status = trimmed(statusRaw) ?? 'unknown';
    const at = trimmed(atRaw);
    const approx = trimmed(approxRaw);
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
        verb: 'prepared',
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
          verb: disposition === 'consumed' ? 'consumed' : 'aliquoted',
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
    // CHAIN; this envelope is plan-slot-reference, so proposed is its honest
    // label).
    claims.push({
      claimStatus: 'proposed',
      assertion: {
        verb: 'prepared',
        about: { kind: 'record', type: 'material-instance', id: instanceRecordId },
        volume: { value: preparedVolume.value, unit: String(preparedVolume.unit ?? '') },
      },
      occurredAtStatus: 'unknown',
    });
    aliquots.forEach((_a, i) => {
      claims.push({
        claimStatus: 'proposed',
        assertion: {
          verb: 'aliquoted',
          about: { kind: 'record', type: 'aliquot', id: aliquotRecordIds[i]! },
        },
        occurredAtStatus: 'unknown',
      });
    });
  }

  // §7.6 FULFIL ride: fulfillment claims ONLY for REQE- occurrences the PINNED
  // plan already declares. The evaluations are the DATA policy's verdicts
  // (fulfillment-compatibility.yaml via FULFIL's shared evaluator — imported
  // read-only, zero vocabulary re-declaration). claimStatus for a fulfillment
  // is the drafting side's honest declaration: completed ONLY when every
  // declared evaluation is compatible; otherwise unknown (P8: honest
  // incompleteness is legal, presented-as-completed is not).
  let fulfillmentNote: string | undefined;
  if (isAttestedChain && occurrences.length > 0) {
    const policy = loadFulfillmentCompatibilityPolicy(deps.fulfillmentPolicyPath ?? defaultFulfillmentPolicyPath());
    for (const { event, requirement, requirementId } of occurrences) {
      const evaluations = evaluateCompatibility(policy, 'derivation', requirement, derivationPayload);
      const allCompatible = evaluations.length > 0 && evaluations.every(e => e.verdict === policy.verdicts()[0]);
      claims.push({
        claimStatus: allCompatible ? 'completed' : 'unknown',
        assertion: {
          verb: 'fulfills',
          about: { kind: 'record', type: 'event-requirement', id: requirementId },
          fulfilledBy: 'derivation',
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
    return { ok: false, diagnostics, envelope, derivationPayload, instancePayload, aliquotPayloads, recordId, derivationRecordId, instanceRecordId, aliquotRecordIds, reads, durableAcceptedIds, ...(fulfillmentNote !== undefined ? { fulfillmentNote } : {}), summary };
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
    ...(isAttestedChain ? {} : { attestsNothingPhysical: true }),
    summary,
  };
}
