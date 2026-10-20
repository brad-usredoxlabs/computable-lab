/**
 * AttestationAcceptService — MATRES-ATTEST §2b.
 *
 * The payload-revision pinning + idempotent-accept mechanism ALREADY EXISTS in
 * FormDraftService.compile/accept (reviewHash). This service REUSES that
 * discipline by composition (same DraftError 409 channel, same
 * reviewHash-re-check-then-early-return ORDER), never a parallel accept path
 * and never a fork of FormDraftService's internals.
 *
 * Order matters (reviewer bait 9): the reviewHash re-check (the
 * FormDraftService.ts:168 shape) runs BEFORE the already-accepted early return
 * (the FormDraftService.ts:169 shape). Copying the early return while skipping
 * the reviewHash check that precedes it is the canonical mistake; both orders
 * exist in FormDraftService.ts — this file cites the line pair.
 *
 * Hard rules honored here:
 * - NO `if (kind === 'attestation')` branch anywhere: this module is a WRITER,
 *   not a policy engine. Business rules (chain wall, time pairing, deviation
 *   gate) fire through the LintEngine reading attestation.lint.yaml data.
 * - attestedAt is server-stamped from an INJECTABLE clock (the
 *   lab-sync/outbound/mint.ts:38 precedent) — tests pin it. occurredAt is
 *   NEVER written or synthesized here (Q5 honesty ceiling).
 * - recordId is a deterministic content-hash over the payload revision (the
 *   termId.ts discipline, Q4e): same (draftId, revision, envelope) -> same id.
 *   NEVER Date.now(), NEVER randomUUID in an id path (analysisCompile.ts:337
 *   warning). Double submission therefore lands on the SAME record.
 * - exactOptionalPropertyTypes (server/tsconfig.json:13): every optional field
 *   is absent-or-value via the conditional-spread idiom (FormDraftService.ts:73-77).
 */

import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../store/types.js';
import { contentHash, object } from '../revisions/RecordRevisionService.js';
import { DraftError } from '../drafts/FormDraftService.js';

export const ATTESTATION_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/attestation.schema.yaml';

/** A draft carrying a proposed attestation envelope (+ optional pinned reads). */
export interface AttestationDraft {
  draftId: string;
  revision: number;
  envelope: Record<string, unknown>;
  /**
   * Source refs pinned at compile time (the draft.compiled.reads pattern from
   * FormDraftService): id -> contentHash. Accept re-checks each; a source that
   * moved after review cannot ride the earlier accept (409, zero writes).
   */
  reads?: Record<string, string>;
}

export interface AttestationReview {
  draftId: string;
  revision: number;
  reviewHash: string;
  recordId: string;
  canAccept: boolean;
  diagnostics: string[];
}

export interface AttestationReceipt {
  recordId: string;
  draftId: string;
  revision: number;
  reviewHash: string;
  attestedAt: string;
}

/** Injectable clock (lab-sync/outbound/mint.ts:38 precedent): tests pin it. */
export interface AttestationClock {
  now: () => Date;
}

export class AttestationAcceptService {
  constructor(private readonly ctx: AppContext, private readonly deps: AttestationClock) {}

  /**
   * Deterministic idempotent id (termId law): a pure content hash over the
   * payload revision. Same input -> same id; a double-submitted correction
   * lands on the SAME record (Q4e). No clock, no randomness.
   */
  private stableCore(draft: AttestationDraft): { draftId: string; revision: number; envelope: Record<string, unknown> } {
    return { draftId: draft.draftId, revision: draft.revision, envelope: draft.envelope };
  }

  private reviewHashOf(draft: AttestationDraft): string {
    return contentHash(this.stableCore(draft));
  }

  private recordIdOf(draft: AttestationDraft): string {
    return `ATT-${contentHash(this.stableCore(draft)).slice(0, 32).toUpperCase()}`;
  }

  /** Ajv is the structural authority; the LintEngine is the business-rule authority. */
  private evaluate(draft: AttestationDraft, recordId: string): { canAccept: boolean; diagnostics: string[] } {
    const diagnostics: string[] = [];
    const payload = { ...draft.envelope, recordId };
    const validation = this.ctx.validator.validate(payload, ATTESTATION_SCHEMA_ID);
    if (!validation.valid) {
      diagnostics.push(...(validation.errors ?? []).map(e => `${e.path}: ${e.message}`));
    }
    const lint = this.ctx.lintEngine.lint(payload, ATTESTATION_SCHEMA_ID);
    for (const violation of lint.violations) {
      if (violation.severity === 'error') {
        diagnostics.push(`${violation.ruleId}: ${violation.message}`);
      }
    }
    return { canAccept: validation.valid && lint.valid, diagnostics };
  }

  /**
   * Compile: validate + lint the proposed envelope and pin a reviewHash over
   * the payload revision (the FormDraftService.ts:161 reviewHash shape).
   * Writes nothing canonical.
   */
  compile(draft: AttestationDraft): AttestationReview {
    const recordId = this.recordIdOf(draft);
    const { canAccept, diagnostics } = this.evaluate(draft, recordId);
    return {
      draftId: draft.draftId,
      revision: draft.revision,
      reviewHash: this.reviewHashOf(draft),
      recordId,
      canAccept,
      diagnostics,
    };
  }

  /**
   * Accept: the acceptance IS the attestation (P2).
   *
   * Order (citing the FormDraftService line pair):
   *  1. revision + reviewHash re-check — FormDraftService.ts:168 shape. A
   *     payload mutated after review cannot ride an earlier accept: 409,
   *     ZERO writes (nothing is created before this gate).
   *  2. already-accepted early return — FormDraftService.ts:169 shape: the
   *     stored result returns for an identical (draftId, revision, reviewHash).
   *     The deterministic id makes "already accepted" a store lookup, so the
   *     create-if-absent + content-hash id is STRUCTURAL idempotence.
   *  3. pinned-source re-check (draft.reads) — the draft.compiled.reads
   *     revalidation loop shape: a source whose contentHash moved after
   *     compile is refused (409).
   *  4. full re-validation (schema + lint) before ANY write — the
   *     "nothing writes until the whole plan revalidated" rule.
   *  5. stamp attestedAt from the injected clock, create the record.
   */
  async accept(input: { draft: AttestationDraft; draftId: string; revision: number; reviewHash: string }): Promise<AttestationReceipt> {
    const { draft } = input;
    if (input.draftId !== draft.draftId || input.revision !== draft.revision) {
      throw new DraftError('Draft changed. Review the current revision before accepting.', 409);
    }
    // Gate 1 (FormDraftService.ts:168 shape) — BEFORE any early return.
    if (input.reviewHash !== this.reviewHashOf(draft)) {
      throw new DraftError('Draft changed. Review the current revision before accepting.', 409);
    }

    const recordId = this.recordIdOf(draft);

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

    // Gate 4: revalidate schema + lint before ANY write (lint data carries the
    // business walls — e.g. the entity-substitution deviation gate names the
    // consumed ref in its message).
    const { canAccept, diagnostics } = this.evaluate(draft, recordId);
    if (!canAccept) {
      throw new DraftError(`Attestation draft is blocked. ${diagnostics.join('; ')}`);
    }

    // Gate 5: stamp attestedAt (server-side acceptance time ONLY; occurredAt
    // is drafting-side data and is never touched here) and create.
    const attestedAt = this.deps.now().toISOString();
    const payload = { ...draft.envelope, recordId, attestedAt };
    const envelope: RecordEnvelope = { recordId, schemaId: ATTESTATION_SCHEMA_ID, payload };
    const saved = await this.ctx.store.create({ envelope, message: `Accept attestation draft ${draft.draftId}` });
    if (!saved.success) {
      // Create-if-absent race: a concurrent identical accept already landed the
      // deterministic id — return the stored result, never a duplicate.
      const raced = await this.ctx.store.get(recordId);
      if (raced) return this.receiptOf(raced, draft, input.reviewHash);
      throw new DraftError(`Save incomplete; retry Accept. ${saved.error ?? 'could not save attestation'}`, 503);
    }
    return {
      recordId,
      draftId: draft.draftId,
      revision: draft.revision,
      reviewHash: input.reviewHash,
      attestedAt,
    };
  }

  private receiptOf(envelope: RecordEnvelope, draft: AttestationDraft, reviewHash: string): AttestationReceipt {
    const payload = object(envelope.payload);
    return {
      recordId: envelope.recordId,
      draftId: draft.draftId,
      revision: draft.revision,
      reviewHash,
      attestedAt: typeof payload.attestedAt === 'string' ? payload.attestedAt : '',
    };
  }
}
