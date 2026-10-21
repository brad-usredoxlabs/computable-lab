/**
 * MaterialReceivingDraft — MATRES-RECV §2b/§2c: compiles the ELICITED
 * receiving intent (the `compose_receiving` envelope on the ONE forced
 * agent_intent tool) into the attestation envelope + the two planned writes
 * (material-receiving receipt + the material-instance it brings into
 * custody), staged through the staging store — nothing durable before the
 * reviewHash-verified accept.
 *
 * Hard rules honored here:
 * - NO `if (kind === 'material-receiving')` TS branch and NO business-rule
 *   TS check: the lot-requires-product wall, the receivedBy pairing, and the
 *   chain wall fire through the LintEngine reading material-receiving.lint.yaml
 *   data (the staging store runs the REAL validate + lint at create).
 * - Vendor lookup is for CATALOG IDENTITY ONLY (P4/r2): the catalog hit may
 *   only fill `vendorProductRef`. It is NEVER evidence of custody and never
 *   populates a receivedBy/evidence/time field. The receipt, attested by the
 *   named scientist, is the custody assertion.
 * - claimStatus is a DECLARATION of the drafting side, never a server
 *   derivation at the accept wall (ATTEST OQ-4 inherited): the elicited
 *   compile IS the drafting side for chat — it declares `proposed` when the
 *   catalog identity is unresolved (the honest "not yet resolved" label) and
 *   `completed` when the scientist attests their own received fact against a
 *   resolved product. The accept path never rewrites it.
 * - The lot-without-product lint ERROR gates ACCEPTANCE only (r2 discard
 *   boundary): the draft keeps the reported lot inscription VERBATIM while
 *   blocked; nothing is silently dropped.
 * - Deterministic ids (termId law): the instance entity id is a content hash
 *   of the scientist's stated entity facts — NEVER a clock, NEVER randomness,
 *   NEVER derived from a lot number alone (vendor-scoped lot). A correction
 *   (supersedesRecordId) reads the entity id from the SUPERSEDED receipt:
 *   a correction never mints a second instance (never a second arrival).
 * - occurredAt is ONLY ever the date the scientist stated; the server never
 *   synthesizes it (r2 §1). RATIFIED posture (architect ruling MATRESRECV
 *   D1/D2, option (a)): ABSENT-BEFORE-ACCEPT — the compile output (the draft
 *   envelope) carries NO attestedAt at all; the accepted receipt's attestedAt
 *   is the server's ACCEPTANCE time, stamped by the receiving adapter's
 *   onAccept hook from the rail's accept clock (attestedAt is when the
 *   acceptance happened; occurredAt is when the fact occurred, Q8).
 * - exactOptionalPropertyTypes (server/tsconfig.json:13): optional fields are
 *   absent-or-value via the conditional-spread idiom.
 */

import type { RecordStore, RecordEnvelope } from '../store/types.js';
import { contentHash, object } from '../revisions/RecordRevisionService.js';
import { canonicalReadStore } from '../drafts/workstateCompile.js';
import type { AppContext } from '../server.js';
import { MATERIAL_RECEIVING_SCHEMA_ID, MATERIAL_INSTANCE_SCHEMA_ID, alreadyReceivedDiagnostic, receivingRecordIdOf } from './receivingIdentity.js';

// ============================================================================
// The compile-side authority for the elicited receiving envelope — the twin
// of the tool-declared `receiving` property in submitSuggestionTool.ts
// (same required keys, same additionalProperties:false). The lockstep is
// pinned in receiving/ReceiveElicitation.test.ts (the
// recordDraftEnvelopeLockstep.test.ts precedent): the model-facing contract
// can never drift looser than the compile-side Ajv authority.
// ============================================================================

export const RECEIVING_INTENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['operation', 'claim'],
  properties: {
    operation: { type: 'string', enum: ['compose-receiving'] },
    // Compiler-injected extra (the recordDraftCompile.ts requestId precedent —
    // FormDraftService stamps intent.requestId before stage; the lockstep
    // test allows ONLY this extra on the compile side).
    requestId: { type: 'string' },
    claim: {
      type: 'object',
      additionalProperties: false,
      required: ['vendor', 'receivedByStatus', 'occurredAtStatus'],
      properties: {
        vendor: { type: 'string', minLength: 1 },
        catalogNumber: { type: 'string', minLength: 1 },
        productLabel: { type: 'string', minLength: 1 },
        lotNumber: { type: 'string', minLength: 1 },
        expirationDate: { type: 'string', minLength: 1 },
        receivedByLabel: { type: 'string', minLength: 1 },
        receivedByStatus: { type: 'string', enum: ['known', 'approximate', 'unknown'] },
        occurredAtStatus: { type: 'string', enum: ['known', 'approximate', 'unknown'] },
        occurredAt: { type: 'string', minLength: 1 },
        approximation: { type: 'string', minLength: 1 },
        evidenceFileNames: { type: 'array', items: { type: 'string', minLength: 1 } },
        supersedesRecordId: { type: 'string', minLength: 1 },
        correctionNote: { type: 'string', minLength: 1 },
      },
    },
  },
} as const;

export interface ReceivingClaim {
  vendor: string;
  catalogNumber?: string;
  productLabel?: string;
  lotNumber?: string;
  expirationDate?: string;
  receivedByLabel?: string;
  receivedByStatus: 'known' | 'approximate' | 'unknown';
  occurredAtStatus: 'known' | 'approximate' | 'unknown';
  occurredAt?: string;
  approximation?: string;
  evidenceFileNames?: string[];
  supersedesRecordId?: string;
  correctionNote?: string;
}

export interface ReceivingCompileDeps {
  /** Canonical READ-ONLY store (the exported canonicalReadStore view — the
   *  same reader workstate/analysis reuse, never a second reader). Vendor
   *  lookup + superseded-receipt lookup ride it; it can never write. */
  canonical: RecordStore;
  /** Ajv is the structural authority (ctx.validator). */
  validate: (doc: unknown, schemaId: string) => { valid: boolean; errors?: Array<{ path: string; message: string }> };
  /** Ajv against an inline schema (the recordDraftCompile validateWithSchema
   *  precedent) — used for the RECEIVING_INTENT_SCHEMA lockstep check. */
  validateWithSchema: (doc: unknown, schema: Record<string, unknown>) => { valid: boolean; errors?: Array<{ path: string; message: string }> };
  /** The LintEngine is the BUSINESS-RULE authority (material-receiving.lint.yaml
   *  data): the card names the fired rule (e.g. material-receiving-lot-requires-
   *  product) instead of only the structural diagnostic. The same walls fire
   *  again at the staging create and at the accept re-evaluation. */
  lint: (payload: Record<string, unknown>, schemaId: string) => { valid: boolean; violations: Array<{ ruleId: string; severity: string; message: string }> };
}

export function receivingDepsFromContext(ctx: AppContext): ReceivingCompileDeps {
  return {
    canonical: canonicalReadStore(ctx),
    validate: (doc, schemaId) => ctx.validator.validate(doc, schemaId),
    validateWithSchema: (doc, schema) => ctx.validator.validateWithSchema(doc, schema as never),
    lint: (payload, schemaId) => ctx.lintEngine.lint(payload, schemaId),
  };
}

export interface CompiledReceivingDraft {
  ok: boolean;
  diagnostics: string[];
  /** The draft-state attestation envelope (schema-shaped; NO attestedAt —
   *  absent-before-accept is ratified: the accept hook stamps the acceptance
   *  time; occurredAt is ONLY the scientist's stated date). */
  envelope?: Record<string, unknown>;
  /** The planned material-instance payload (rides the EXISTING schema —
   *  material-instance.schema.yaml is NOT touched by this item). */
  instancePayload?: Record<string, unknown>;
  recordId?: string;
  instanceRecordId?: string;
  /** Pinned canonical sources (id -> contentHash): the vendor-product the
   *  catalog identity rode, and (for a correction) the superseded receipt. */
  reads?: Record<string, string>;
  /** True when this draft supersedes an existing receipt: the planned
   *  instance write is NOT staged (supersession is never a second arrival —
   *  the entity already exists; §7 bait 9). */
  isCorrection: boolean;
  /** True when the deterministic id names a record the durable store ALREADY
   *  holds with content equal modulo the server's acceptance stamp (ruling
   *  item B: "if a store lookup shows the receipt already exists with content
   *  equal modulo attestedAt, that IS the accepted form"). The adapter then
   *  skips the staged receipt create; the rail's volatile-field prior-
   *  comparison treats the prior as already accepted (no second gate, no
   *  second record — AC-2(ii)). Read via the canonical LIST view (the repo
   *  scan, never the staging proxy's get) so it pins nothing in the
   *  reviewHash's read set and the accept re-evaluation reproduces it. */
  alreadyAcceptedForm?: boolean;
  /** True when the entity record the receipt would create already exists
   *  durably (create-if-absent identity: a re-draft never re-mints the
   *  instance; the entity already arrived). */
  durableInstanceExists?: boolean;
}

function trimmed(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

/**
 * Catalog-identity lookup (P4): find the vendor-product the scientist's
 * words name. Matching is DECLARED-FIELD equality only (catalog_number
 * equality when stated; case-insensitive vendor/product-label containment
 * otherwise) — no fuzzy scoring, no ranking, no vendor inference from
 * strings beyond containment (P8). A hit fills vendorProductRef and NOTHING
 * else; a miss leaves the receipt vendor-unresolved (the lot lint rule then
 * gates acceptance while the inscription survives).
 */
async function lookupVendorProduct(canonical: RecordStore, claim: ReceivingClaim): Promise<RecordEnvelope | null> {
  const products = await canonical.list({ kind: 'vendor-product' });
  const vendorNeedle = claim.vendor.toLowerCase();
  for (const env of products) {
    const p = object(env.payload);
    const catalog = trimmed(p.catalog_number);
    const vendor = trimmed(p.vendor) ?? '';
    const name = trimmed(p.name) ?? '';
    if (claim.catalogNumber !== undefined) {
      if (catalog === claim.catalogNumber && vendor.toLowerCase().includes(vendorNeedle)) return env;
      continue;
    }
    if (!vendor.toLowerCase().includes(vendorNeedle)) continue;
    if (claim.productLabel !== undefined && name.toLowerCase().includes(claim.productLabel.toLowerCase())) return env;
    if (claim.productLabel === undefined) return env;
  }
  return null;
}

/**
 * Deterministic instance entity id (termId law): content hash of the
 * scientist's stated ENTITY facts (product identity + lot + label). NEVER a
 * clock, NEVER randomness, NEVER the lot number alone (vendor-scoped lot: a
 * bare lot never mints an id — the product identity is in the hashed core).
 * occurredAt is deliberately NOT in the hash: a corrected arrival TIME must
 * not mint a new entity (the entity is the bottle, not the story about it).
 */
function instanceIdOf(claim: ReceivingClaim, vendorProductId: string | null): string {
  const core = {
    vendorProductId,
    vendor: claim.vendor,
    ...(claim.catalogNumber !== undefined ? { catalogNumber: claim.catalogNumber } : {}),
    ...(claim.productLabel !== undefined ? { productLabel: claim.productLabel } : {}),
    ...(claim.lotNumber !== undefined ? { lotNumber: claim.lotNumber } : {}),
  };
  return `MINST-${contentHash(core).slice(0, 32).toUpperCase()}`;
}

/**
 * Compile the elicited receiving intent into the envelope + the two planned
 * writes. Runs the REAL schema validate (Ajv) on both payloads; the lint
 * walls (lot-requires-product, receivedBy pairing, chain wall) fire when the
 * staged writes are created through the staging store (StagingStore.ts:22-30
 * runs backing.validate + backing.lint) — the adapter surfaces a failed
 * stage as a blocked card (canAccept:false) with the inscription intact.
 */
export async function compileReceivingIntent(
  intent: Record<string, unknown>,
  deps: ReceivingCompileDeps,
): Promise<CompiledReceivingDraft> {
  const diagnostics: string[] = [];

  // The INTENT itself is structurally checked against RECEIVING_INTENT_SCHEMA
  // (the compile-side Ajv authority, twin of the tool-declared `receiving`
  // property — lockstep-pinned in ReceiveElicitation.test.ts).
  const intentValidation = deps.validateWithSchema(intent, RECEIVING_INTENT_SCHEMA);
  if (!intentValidation.valid) {
    return {
      ok: false,
      diagnostics: (intentValidation.errors ?? []).map((e: { path: string; message: string }) => `receiving envelope${e.path}: ${e.message}`),
      isCorrection: false,
    };
  }
  const op = trimmed(intent.operation);
  const rawClaim = intent.claim;
  if (op !== 'compose-receiving' || rawClaim === null || typeof rawClaim !== 'object' || Array.isArray(rawClaim)) {
    return { ok: false, diagnostics: ['receiving: expected {operation:"compose-receiving", claim:{...}} — the scientist\'s stated facts only'], isCorrection: false };
  }
  const c = object(rawClaim);
  const vendor = trimmed(c.vendor);
  const receivedByStatus = trimmed(c.receivedByStatus);
  const occurredAtStatus = trimmed(c.occurredAtStatus);
  if (vendor === undefined || receivedByStatus === undefined || occurredAtStatus === undefined) {
    return { ok: false, diagnostics: ['receiving.claim: vendor, receivedByStatus and occurredAtStatus are required — "I don\'t know" is a COMPLETE answer (unknown), never an omission to fill'], isCorrection: false };
  }
  if (!['known', 'approximate', 'unknown'].includes(receivedByStatus) || !['known', 'approximate', 'unknown'].includes(occurredAtStatus)) {
    return { ok: false, diagnostics: ['receiving.claim: occurredAtStatus/receivedByStatus must be known|approximate|unknown (the envelope triple, declared not inferred)'], isCorrection: false };
  }
  const claim: ReceivingClaim = {
    vendor,
    ...(trimmed(c.catalogNumber) !== undefined ? { catalogNumber: trimmed(c.catalogNumber)! } : {}),
    ...(trimmed(c.productLabel) !== undefined ? { productLabel: trimmed(c.productLabel)! } : {}),
    ...(trimmed(c.lotNumber) !== undefined ? { lotNumber: trimmed(c.lotNumber)! } : {}),
    ...(trimmed(c.expirationDate) !== undefined ? { expirationDate: trimmed(c.expirationDate)! } : {}),
    ...(trimmed(c.receivedByLabel) !== undefined ? { receivedByLabel: trimmed(c.receivedByLabel)! } : {}),
    receivedByStatus: receivedByStatus as ReceivingClaim['receivedByStatus'],
    occurredAtStatus: occurredAtStatus as ReceivingClaim['occurredAtStatus'],
    // occurredAt is ONLY ever the date the scientist stated. The server never
    // synthesizes it (r2 §1): an absent/unknown arrival stays absent.
    ...(trimmed(c.occurredAt) !== undefined ? { occurredAt: trimmed(c.occurredAt)! } : {}),
    ...(trimmed(c.approximation) !== undefined ? { approximation: trimmed(c.approximation)! } : {}),
    ...(Array.isArray(c.evidenceFileNames) && c.evidenceFileNames.length > 0 ? { evidenceFileNames: c.evidenceFileNames.map(String) } : {}),
    ...(trimmed(c.supersedesRecordId) !== undefined ? { supersedesRecordId: trimmed(c.supersedesRecordId)! } : {}),
    ...(trimmed(c.correctionNote) !== undefined ? { correctionNote: trimmed(c.correctionNote)! } : {}),
  };

  const reads: Record<string, string> = {};

  // Catalog identity ONLY (P4): the lookup result may fill vendorProductRef
  // and nothing else — never custody, never evidence, never a receiver, never
  // a time.
  const product = await lookupVendorProduct(deps.canonical, claim);
  const vendorProductRef = product !== null
    ? { kind: 'record', type: 'vendor-product', id: product.recordId }
    : undefined;
  if (product !== null) reads[product.recordId] = contentHash(product.payload);

  // Entity identity: a correction reads the entity from the SUPERSEDED
  // receipt (a correction never mints a second instance); a fresh arrival
  // derives it deterministically from the stated entity facts.
  let instanceRecordId: string;
  if (claim.supersedesRecordId !== undefined) {
    const superseded = await deps.canonical.get(claim.supersedesRecordId);
    if (!superseded) {
      return { ok: false, diagnostics: [`receiving.claim.supersedesRecordId: superseded record ${claim.supersedesRecordId} not found — a correction must name an existing receipt/attestation`], isCorrection: true };
    }
    const priorInstance = object(object(superseded.payload).createdInstanceRef);
    if (typeof priorInstance.id !== 'string' || priorInstance.id.length === 0) {
      return { ok: false, diagnostics: [`receiving: superseded record ${claim.supersedesRecordId} names no instance entity — a correction keeps the SAME entity (never a second arrival)`], isCorrection: true };
    }
    instanceRecordId = priorInstance.id;
    reads[superseded.recordId] = contentHash(superseded.payload);
  } else {
    instanceRecordId = instanceIdOf(claim, product?.recordId ?? null);
  }

  // Drafting-side claimStatus DECLARATION (OQ-4: the accept wall never
  // derives or rewrites it): the scientist attesting their own received fact
  // against a RESOLVED catalog identity is `completed`; an unresolved catalog
  // identity is honestly `proposed` — the chain lint wall then keeps the
  // draft blocked (canAccept false) with the lot inscription VERBATIM (r2).
  const claimStatus = vendorProductRef !== undefined ? 'completed' : 'proposed';

  const assertion: Record<string, unknown> = {
    verb: 'received',
    about: { kind: 'record', type: 'material-instance', id: instanceRecordId },
    ...(vendorProductRef !== undefined ? { vendorProductRef } : {}),
    ...(claim.lotNumber !== undefined
      ? { lot: { lot_number: claim.lotNumber, ...(claim.expirationDate !== undefined ? { expirationDate: claim.expirationDate } : {}) } }
      : {}),
    receivedByStatus: claim.receivedByStatus,
    ...(claim.receivedByLabel !== undefined && claim.receivedByStatus !== 'unknown'
      ? { receivedBy: { kind: 'record', type: 'person', id: `PER-${contentHash({ label: claim.receivedByLabel }).slice(0, 32).toUpperCase()}` } }
      : {}),
    // Evidence NAMES ride the claim assertion verbatim (the loose-shape
    // assertion is RECV's vocabulary on the envelope wrapper). evidenceRefs
    // (the file-ref datatype) belong to an upload path that does not exist
    // yet — names are data references, never inline blobs.
    ...(claim.evidenceFileNames !== undefined ? { evidenceFileNames: claim.evidenceFileNames } : {}),
  };

  const claimObj: Record<string, unknown> = {
    claimStatus,
    assertion,
    occurredAtStatus: claim.occurredAtStatus,
    ...(claim.occurredAt !== undefined ? { occurredAt: claim.occurredAt } : {}),
    ...(claim.approximation !== undefined ? { approximation: claim.approximation } : {}),
  };

  const envelope: Record<string, unknown> = {
    kind: 'material-receiving',
    artifactKind: 'attestation-chain',
    claims: [claimObj],
    createdInstanceRef: { kind: 'record', type: 'material-instance', id: instanceRecordId },
    // ABSENT-BEFORE-ACCEPT (ratified, architect ruling MATRESRECV D1/D2):
    // the draft envelope carries NO attestedAt — the compile output is the
    // scientist's claim content only. The accepted receipt's attestedAt is
    // the server's ACCEPTANCE stamp, added by the receiving adapter's
    // onAccept hook at accept time (never model-supplied, never derived
    // from occurredAt). occurredAt remains the scientist's stated date (or
    // ABSENT with status unknown) — presence-shape + value-inequality-when-
    // present on the ACCEPTED record, never an accident.
    ...(claim.supersedesRecordId !== undefined
      ? {
          supersedes: { kind: 'record', type: 'material-receiving', id: claim.supersedesRecordId },
          correction: {
            claimTarget: { mode: 'same-entity-reattribute' },
            changedFacts: {
              ...(claim.lotNumber !== undefined ? { lot: claim.lotNumber } : {}),
              ...(claim.receivedByLabel !== undefined ? { receivedBy: claim.receivedByLabel } : {}),
            },
            ...(claim.correctionNote !== undefined ? { resolutionNote: claim.correctionNote } : {}),
          },
        }
      : {}),
  };

  const instancePayload: Record<string, unknown> = {
    kind: 'material-instance',
    id: instanceRecordId,
    name: claim.productLabel !== undefined
      ? `${claim.productLabel}${claim.lotNumber !== undefined ? ` (lot ${claim.lotNumber})` : ''}`
      : `Received material ${instanceRecordId}`,
    ...(vendorProductRef !== undefined ? { vendor_product_ref: vendorProductRef } : {}),
    ...(claim.lotNumber !== undefined
      ? { lot: { lot_number: claim.lotNumber, ...(claim.expirationDate !== undefined ? { expiration_date: claim.expirationDate } : {}) } }
      : {}),
  };

  const isCorrection = claim.supersedesRecordId !== undefined;

  // The SAME exported id formula the accept rail uses (one derivation,
  // never two): content-scoped, attestedAt- and recordId-excluded (an id
  // never hashes itself). Embedded in the payload BEFORE validation: the
  // schema declares recordId as required (the recordDraftCompile precedent
  // embeds the derived id the same way).
  const recordId = receivingRecordIdOf(envelope);
  envelope.recordId = recordId;

  // Idempotence lookup (ruling item B): "if a store lookup shows the receipt
  // already exists with content equal modulo attestedAt, that IS the accepted
  // form". Read through the canonical LIST view (the repo scan) — never the
  // staging proxy's get — so the lookup pins NOTHING in the reviewHash's
  // read set and the accept re-evaluation reproduces the same flags.
  const durableReceipts = await deps.canonical.list({ kind: 'material-receiving' });
  const durableReceipt = durableReceipts.find(r => r.recordId === recordId);
  const alreadyAcceptedForm = durableReceipt !== undefined
    && durableReceipt.schemaId === MATERIAL_RECEIVING_SCHEMA_ID
    && contentHash(Object.fromEntries(Object.entries(object(durableReceipt.payload)).filter(([key]) => key !== 'attestedAt'))) === contentHash(envelope);
  const durableInstanceExists = (await deps.canonical.list({ kind: 'material-instance' })).some(r => r.recordId === instanceRecordId);

  // Structural authority (Ajv) on both planned payloads. The lint walls fire
  // at the staging-store create (the REAL validate + lint run there); a
  // blocked wall surfaces as a blocked card, never a discarded inscription.
  const receiptValidation = deps.validate({ ...envelope, recordId }, MATERIAL_RECEIVING_SCHEMA_ID);
  if (!receiptValidation.valid) {
    diagnostics.push(...(receiptValidation.errors ?? []).map(e => `${e.path}: ${e.message}`));
  }
  const instanceValidation = deps.validate(instancePayload, MATERIAL_INSTANCE_SCHEMA_ID);
  if (!instanceValidation.valid) {
    diagnostics.push(...(instanceValidation.errors ?? []).map(e => `planned instance${e.path}: ${e.message}`));
  }
  // The BUSINESS walls (lint YAML data) are named on the card too: the
  // scientist sees WHICH rule blocks the receipt (vendor-scoped lot, chain
  // wall, receivedBy pairing), not an opaque failure.
  const lintResult = deps.lint({ ...envelope, recordId }, MATERIAL_RECEIVING_SCHEMA_ID);
  for (const violation of lintResult.violations) {
    if (violation.severity === 'error') diagnostics.push(`${violation.ruleId}: ${violation.message}`);
  }

  // The SHARED already-received gate (one implementation, never a second
  // copy): a fresh elicitation about an entity that already has a CURRENT
  // receipt is refused with the named correction-or-distinct-arrival
  // diagnostic — idempotent-or-supersession at the card. The gate routes
  // through CurrentAssertionView (D4: one fold, one authority) and exempts
  // the idempotent case: this draft's own deterministic id IS the current
  // receipt's id when the content is identical (a re-draft lands the SAME
  // record, never a second arrival).
  const already = await alreadyReceivedDiagnostic(deps.canonical, instanceRecordId, claim.supersedesRecordId !== undefined, recordId);
  if (already !== null) diagnostics.push(already);

  if (diagnostics.length > 0) {
    // Structural failure: the card is blocked; the scientist's words survive
    // verbatim in the stored draft input (FormDraftService stores
    // input.intent untouched).
    return { ok: false, diagnostics, envelope, instancePayload, recordId, instanceRecordId, reads, isCorrection, alreadyAcceptedForm, durableInstanceExists };
  }
  return { ok: true, diagnostics, envelope, instancePayload, recordId, instanceRecordId, reads, isCorrection, alreadyAcceptedForm, durableInstanceExists };
}
