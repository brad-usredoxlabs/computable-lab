/**
 * MaterialReceivingAcceptService — MATRES-RECV §2b.
 *
 * The receiving act is ONE reviewed payload: the attestation envelope (the
 * receipt claim) + a PLAN of two writes — [material-receiving record,
 * material-instance record] — accepted ATOMICALLY through the ATTEST
 * discipline (AttestationAcceptService.ts:172-228 shape, which itself rides
 * the FormDraftService reviewHash gates :168/:169). Composition, never a
 * parallel accept path and never a fork of FormDraftService.
 *
 * Hard rules honored here:
 * - NO `if (kind === 'material-receiving')` branch anywhere: this module is
 *   a WRITER, not a policy engine. Business rules (lot-requires-product,
 *   receivedBy pairing, chain wall, deviation gate) fire through the
 *   LintEngine reading material-receiving.lint.yaml data.
 * - The material-instance is created BY the receipt: the instance create is
 *   a planned write of the SAME accept (create-if-absent), never a separate
 *   free-standing mint. A correction NEVER re-runs the planned writes
 *   (supersession is not a second arrival — §5.3 asserts id lists byte-equal).
 * - Deterministic ids (termId/content-hash law): a receipt id is a pure
 *   content hash of the envelope (re-DRAFT of identical content lands the
 *   SAME record — AC-2(ii)); a correction id is content-scoped over
 *   (supersedes + changedFacts + claimTarget.mode) like ATTEST Q4e. NEVER
 *   Date.now(), NEVER randomUUID, NEVER derived from a lot number
 *   (vendor-scoped lot: a bare lot never mints an id).
 * - "Already received?" is a REF EXISTENCE + supersedes check over the
 *   entity ref the draft itself names (arrival identity = the entity ref),
 *   never a fuzzy same-bottle detector and never a lot-keyed Map (§7 bait 6).
 * - attestedAt is server-stamped from an INJECTABLE clock; occurredAt is
 *   drafting-side data and is NEVER written or synthesized here (r2 §1).
 * - exactOptionalPropertyTypes (server/tsconfig.json:13): optional fields
 *   are absent-or-value via the conditional-spread idiom.
 */

import type { AppContext } from '../server.js';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import { contentHash, object } from '../revisions/RecordRevisionService.js';
import { DraftError } from '../drafts/FormDraftService.js';

export const MATERIAL_RECEIVING_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-receiving.schema.yaml';
export const MATERIAL_INSTANCE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-instance.schema.yaml';

/** A draft carrying a proposed receiving envelope + the instance fields. */
export interface MaterialReceivingDraft {
  draftId: string;
  revision: number;
  envelope: Record<string, unknown>;
  /** Display fields for the planned material-instance write (name etc.). */
  instanceFields?: Record<string, unknown>;
  /** Source refs pinned at compile (the draft.compiled.reads pattern). */
  reads?: Record<string, string>;
}

export interface ReceivingReview {
  draftId: string;
  revision: number;
  reviewHash: string;
  recordId: string;
  instanceRecordId: string;
  canAccept: boolean;
  diagnostics: string[];
}

export interface ReceivingReceipt {
  recordId: string;
  instanceRecordId: string;
  draftId: string;
  revision: number;
  reviewHash: string;
  attestedAt: string;
}

/** Injectable clock (AttestationAcceptService.ts:74-77 precedent). */
export interface ReceivingClock {
  now: () => Date;
}

/**
 * The ONE deterministic receipt-id formula (termId law, content-scoped per
 * §2b(ii)), shared by the accept service AND the elicited compile (never two
 * derivations of the same id): a receipt hashes its ENVELOPE (a re-draft of
 * identical content lands the SAME record); a correction hashes
 * (supersedes + changedFacts + claimTarget.mode) exactly like ATTEST Q4e.
 * `attestedAt` is EXCLUDED from the hashed core: it is the server's
 * acceptance stamp, not part of the immutable claim content, so the same
 * claim compiled by either writer lands the same record. Never a clock,
 * never randomness, never derived from a lot (vendor-scoped lot).
 */
export function receivingRecordIdOf(envelope: Record<string, unknown>): string {
  const supersedes = envelope.supersedes;
  const correction = envelope.correction;
  if (supersedes !== undefined && correction !== undefined) {
    const c = object(correction);
    return `RECV-${contentHash({ supersedes, changedFacts: c.changedFacts, mode: object(c.claimTarget).mode }).slice(0, 32).toUpperCase()}`;
  }
  const core = Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== 'attestedAt' && key !== 'recordId'));
  return `RECV-${contentHash(core).slice(0, 32).toUpperCase()}`;
}

/**
 * "Already received?" — a REF EXISTENCE + supersedes check (P8), SHARED by
 * the accept service and the elicited compile (one implementation, never a
 * second copy): a CURRENT (un-superseded) receipt about the SAME entity ref
 * blocks a new draft that carries no supersedes. A correction (supersedes
 * present) passes; a genuinely distinct arrival names a DIFFERENT entity ref
 * and passes. No lot-keyed lookup, no fuzzy matching, no kind-branch.
 */
export async function alreadyReceivedDiagnostic(store: RecordStore, entity: string, supersedesPresent: boolean): Promise<string | null> {
  if (entity === '') return null;
  if (supersedesPresent) return null;
  const receipts = await store.list({ kind: 'material-receiving' });
  const superseded = new Set(
    receipts
      .map(r => object(r.payload).supersedes as Record<string, unknown> | undefined)
      .filter((s): s is Record<string, unknown> => s !== undefined)
      .map(s => String(s.id)),
  );
  const current = receipts.filter(r => {
    if (superseded.has(r.recordId)) return false;
    const claims = Array.isArray(object(r.payload).claims) ? (object(r.payload).claims as Array<Record<string, unknown>>) : [];
    return claims.some(c => String(object(object(c.assertion).about ?? {}).id) === entity);
  });
  if (current.length === 0) return null;
  return `Entity ${entity} is already received (record ${current[0]!.recordId}) — submit a correction (supersedes) or a genuinely distinct arrival (a new instance entity ref)`;
}

export class MaterialReceivingAcceptService {
  constructor(private readonly ctx: AppContext, private readonly deps: ReceivingClock) {}

  /** Draft-scoped stable core: the payload revision the reviewHash pins. */
  private stableCore(draft: MaterialReceivingDraft): { draftId: string; revision: number; envelope: Record<string, unknown> } {
    return { draftId: draft.draftId, revision: draft.revision, envelope: draft.envelope };
  }

  private reviewHashOf(draft: MaterialReceivingDraft): string {
    return contentHash(this.stableCore(draft));
  }

  /** The ONE receipt-id formula (see receivingRecordIdOf below). */
  private recordIdOf(draft: MaterialReceivingDraft): string {
    return receivingRecordIdOf(draft.envelope);
  }

  /** The entity this receipt brings into custody (arrival identity = entity ref). */
  private entityRef(draft: MaterialReceivingDraft): string {
    const created = draft.envelope.createdInstanceRef;
    return created === undefined ? '' : String(object(created).id ?? '');
  }

  private instanceIdOf(draft: MaterialReceivingDraft): string {
    return this.entityRef(draft);
  }

  /**
   * The planned material-instance payload, derived from the receipt claim
   * (vendor_product_ref + vendor-scoped lot ride the EXISTING schema —
   * material-instance.schema.yaml is NOT touched by this item).
   */
  private instancePayload(draft: MaterialReceivingDraft): Record<string, unknown> {
    const instanceId = this.instanceIdOf(draft);
    const claims = Array.isArray(draft.envelope.claims) ? (draft.envelope.claims as Array<Record<string, unknown>>) : [];
    const assertion = claims.length > 0 ? object(claims[0]!.assertion) : {};
    const fields = draft.instanceFields ?? {};
    const payload: Record<string, unknown> = {
      kind: 'material-instance',
      id: instanceId,
      name: typeof fields.name === 'string' && fields.name.length > 0
        ? fields.name
        : `Received material ${instanceId}`,
    };
    const vendorProductRef = assertion.vendorProductRef;
    if (vendorProductRef !== undefined) payload.vendor_product_ref = vendorProductRef;
    const lot = assertion.lot;
    if (lot !== undefined) {
      const lotObj = object(lot);
      const instanceLot: Record<string, unknown> = {};
      if (typeof lotObj.lot_number === 'string') instanceLot.lot_number = lotObj.lot_number;
      // material-instance.lot uses snake_case expiration_date (existing schema).
      if (typeof lotObj.expirationDate === 'string') instanceLot.expiration_date = lotObj.expirationDate;
      if (Object.keys(instanceLot).length > 0) payload.lot = instanceLot;
    }
    if (typeof fields.tags === 'string' || Array.isArray(fields.tags)) {
      payload.tags = Array.isArray(fields.tags) ? fields.tags : [String(fields.tags)];
    }
    return payload;
  }

  /** Gate 4 wrapper over the SHARED already-received check (below). */
  private async alreadyReceivedDiagnostic(draft: MaterialReceivingDraft): Promise<string | null> {
    return alreadyReceivedDiagnostic(this.ctx.store, this.entityRef(draft), draft.envelope.supersedes !== undefined);
  }

  /** Ajv is the structural authority; the LintEngine is the business-rule authority. */
  private async evaluate(draft: MaterialReceivingDraft, recordId: string): Promise<{ canAccept: boolean; diagnostics: string[] }> {
    const diagnostics: string[] = [];
    const payload = { ...draft.envelope, recordId };
    const validation = this.ctx.validator.validate(payload, MATERIAL_RECEIVING_SCHEMA_ID);
    if (!validation.valid) {
      diagnostics.push(...(validation.errors ?? []).map(e => `${e.path}: ${e.message}`));
    }
    const lint = this.ctx.lintEngine.lint(payload, MATERIAL_RECEIVING_SCHEMA_ID);
    for (const violation of lint.violations) {
      if (violation.severity === 'error') {
        diagnostics.push(`${violation.ruleId}: ${violation.message}`);
      }
    }
    // The planned instance write is validated too: nothing writes until the
    // WHOLE plan revalidates (FormDraftService.ts:185-197 rule).
    const instanceId = this.instanceIdOf(draft);
    if (instanceId === '') {
      diagnostics.push('createdInstanceRef: a receiving draft must name the material-instance entity it brings into custody');
    } else {
      const instanceValidation = this.ctx.validator.validate(this.instancePayload(draft), MATERIAL_INSTANCE_SCHEMA_ID);
      if (!instanceValidation.valid) {
        diagnostics.push(...(instanceValidation.errors ?? []).map(e => `planned instance ${instanceId}${e.path}: ${e.message}`));
      }
    }
    const already = await this.alreadyReceivedDiagnostic(draft);
    if (already !== null) diagnostics.push(already);
    return { canAccept: diagnostics.length === 0, diagnostics };
  }

  /** Compile: validate + lint the plan and pin a reviewHash. Writes nothing canonical. */
  async compile(draft: MaterialReceivingDraft): Promise<ReceivingReview> {
    const recordId = this.recordIdOf(draft);
    const instanceRecordId = this.instanceIdOf(draft);
    const { canAccept, diagnostics } = await this.evaluate(draft, recordId);
    return {
      draftId: draft.draftId,
      revision: draft.revision,
      reviewHash: this.reviewHashOf(draft),
      recordId,
      instanceRecordId,
      canAccept,
      diagnostics,
    };
  }

  /**
   * Accept: the acceptance IS the attestation (P2), atomically writing the
   * plan [receipt, instance]. Gate order mirrors AttestationAcceptService
   * (the FormDraftService :168-before-:169 shape):
   *  1. revision + reviewHash re-check — a payload mutated after review is
   *     409 with ZERO writes.
   *  2. already-accepted early return — the deterministic id makes "already
   *     accepted" a store lookup (structural idempotence, AC-2(i)/(ii)).
   *  3. pinned-source re-check (draft.reads).
   *  4. full re-validation (schema + lint + already-received gate) before ANY write.
   *  5. stamp attestedAt (injectable clock; occurredAt untouched) and create
   *     the plan create-if-absent. A correction NEVER re-creates the instance
   *     as a second arrival: the instance write is create-if-absent on the
   *     SAME entity id the superseded receipt already created.
   */
  async accept(input: { draft: MaterialReceivingDraft; draftId: string; revision: number; reviewHash: string }): Promise<ReceivingReceipt> {
    const { draft } = input;
    if (input.draftId !== draft.draftId || input.revision !== draft.revision) {
      throw new DraftError('Draft changed. Review the current revision before accepting.', 409);
    }
    // Gate 1 (FormDraftService.ts:168 shape) — BEFORE any early return.
    if (input.reviewHash !== this.reviewHashOf(draft)) {
      throw new DraftError('Draft changed. Review the current revision before accepting.', 409);
    }

    const recordId = this.recordIdOf(draft);
    const instanceRecordId = this.instanceIdOf(draft);

    // Gate 2 (FormDraftService.ts:169 shape) — stored result for an identical revision.
    const existing = await this.ctx.store.get(recordId);
    if (existing) {
      return this.receiptOf(existing, draft, input.reviewHash);
    }

    // Gate 3: pinned sources must not have moved after compile.
    if (draft.reads !== undefined) {
      for (const [sourceId, hash] of Object.entries(draft.reads)) {
        const record = await this.ctx.store.get(sourceId);
        if (!record || contentHash(record.payload) !== hash) {
          throw new DraftError('Source changed. Reload and review the draft.', 409);
        }
      }
    }

    // Gate 4: revalidate the WHOLE plan before ANY write.
    const { canAccept, diagnostics } = await this.evaluate(draft, recordId);
    if (!canAccept) {
      throw new DraftError(`Receiving draft is blocked. ${diagnostics.join('; ')}`);
    }

    // Gate 5: stamp attestedAt (server-side acceptance time ONLY; occurredAt
    // is drafting-side data and is never touched here) and write the plan.
    const attestedAt = this.deps.now().toISOString();
    const payload = { ...draft.envelope, recordId, attestedAt };
    const envelope: RecordEnvelope = { recordId, schemaId: MATERIAL_RECEIVING_SCHEMA_ID, payload };
    const saved = await this.ctx.store.create({ envelope, message: `Accept receiving draft ${draft.draftId}` });
    if (!saved.success) {
      const raced = await this.ctx.store.get(recordId);
      if (raced) return this.receiptOf(raced, draft, input.reviewHash);
      throw new DraftError(`Save incomplete; retry Accept. ${saved.error ?? 'could not save receiving record'}`, 503);
    }
    // The instance the receipt brings into custody (create-if-absent: a
    // correction re-uses the SAME entity id — never a second arrival).
    if (instanceRecordId !== '' && !(await this.ctx.store.get(instanceRecordId))) {
      const instanceEnvelope: RecordEnvelope = {
        recordId: instanceRecordId,
        schemaId: MATERIAL_INSTANCE_SCHEMA_ID,
        payload: this.instancePayload(draft),
      };
      const savedInstance = await this.ctx.store.create({ envelope: instanceEnvelope, message: `Accept receiving draft ${draft.draftId}: created instance` });
      if (!savedInstance.success) {
        const racedInstance = await this.ctx.store.get(instanceRecordId);
        if (!racedInstance) {
          throw new DraftError(`Save incomplete; retry Accept. ${savedInstance.error ?? `could not save instance ${instanceRecordId}`}`, 503);
        }
      }
    }
    return {
      recordId,
      instanceRecordId,
      draftId: draft.draftId,
      revision: draft.revision,
      reviewHash: input.reviewHash,
      attestedAt,
    };
  }

  private receiptOf(envelope: RecordEnvelope, draft: MaterialReceivingDraft, reviewHash: string): ReceivingReceipt {
    const payload = object(envelope.payload);
    return {
      recordId: envelope.recordId,
      instanceRecordId: this.instanceIdOf(draft),
      draftId: draft.draftId,
      revision: draft.revision,
      reviewHash,
      attestedAt: typeof payload.attestedAt === 'string' ? payload.attestedAt : '',
    };
  }
}
