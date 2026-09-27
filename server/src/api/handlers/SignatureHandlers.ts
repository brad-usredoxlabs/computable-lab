/**
 * SignatureHandlers — e-signature minting with password re-authentication.
 *
 * A signature binds a person (from the SESSION, never the request body), an
 * explicit meaning, and the exact git version of the subject record at
 * signing time. Signatures are append-only governance records.
 *
 * Route registration lives in routes.ts (wired by the server bootstrap).
 */

import { randomUUID } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordStore } from '../../store/types.js';
import type { CredentialStore } from '../../security/CredentialStore.js';
import { verifyPassword } from '../../security/CredentialStore.js';
import type { LocalIdentityService } from '../../security/LocalIdentityService.js';
import type { AuditEventService } from '../../governance/AuditEventService.js';

const SIGNATURE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/signature.schema.yaml';

export interface SignatureHandlerOptions {
  store: RecordStore;
  credentialStore: CredentialStore;
  identityService: LocalIdentityService;
  auditService?: AuditEventService;
}

export interface MintSignatureBody {
  subject: { recordId: string; lifecycleId?: string; targetState?: string };
  action: string;
  statement?: string;
  password: string;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function createSignatureHandlers(options: SignatureHandlerOptions) {
  const { store, credentialStore, identityService, auditService } = options;

  return {
    /**
     * POST /signatures
     * Mint an electronic signature over a subject record after verifying the
     * caller's password (step-up re-auth). The signer identity ALWAYS comes
     * from the resolved session user — body fields claiming a signer are
     * ignored.
     */
    async mintSignature(
      request: FastifyRequest<{ Body: MintSignatureBody }>,
      reply: FastifyReply,
    ): Promise<unknown> {
      try {
        const body = request.body ?? ({} as MintSignatureBody);
        const subjectRecordId = asString(body.subject?.recordId);
        const action = asString(body.action);
        const password = asString(body.password);

        const user = await identityService.resolveRequestUser(request);
        if (!user.userId) {
          reply.status(401);
          return { error: 'UNAUTHENTICATED', message: 'A signed-in user is required to sign' };
        }

        if (!subjectRecordId || !action || !password) {
          reply.status(400);
          return { error: 'BAD_REQUEST', message: 'subject.recordId, action and password are required' };
        }

        const subject = await store.get(subjectRecordId);
        if (!subject) {
          reply.status(404);
          return { error: 'SUBJECT_NOT_FOUND', message: `Subject record not found: ${subjectRecordId}` };
        }

        // Step-up re-auth: the password must verify against the CURRENT user's
        // credential. Uniform failure message — never leak which check missed.
        const verifier = await credentialStore.getVerifier(user.userId);
        if (!verifier || !verifyPassword(password, verifier)) {
          reply.status(403);
          return { error: 'REAUTH_FAILED', message: 'Re-authentication failed' };
        }

        // Bind the signature to the exact git version of the subject at
        // signing time (RecordStoreImpl stamps meta.commitSha on get()).
        const gitCommit = asString(subject.meta?.commitSha);

        const now = new Date().toISOString();
        const recordId = `SIG-${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`;
        const statement = asString(body.statement);
        const lifecycleId = asString(body.subject?.lifecycleId);
        const targetState = asString(body.subject?.targetState);

        const result = await store.create({
          envelope: {
            recordId,
            schemaId: SIGNATURE_SCHEMA_ID,
            payload: {
              kind: 'signature',
              recordId,
              signedBy: user.userId,
              action,
              meaning: {
                code: action,
                ...(statement !== undefined ? { statement } : {}),
              },
              subject: {
                recordId: subjectRecordId,
                ...(gitCommit !== undefined ? { gitCommit } : {}),
                ...(lifecycleId !== undefined ? { lifecycleId } : {}),
                ...(targetState !== undefined ? { targetState } : {}),
              },
              signedAt: now,
              authentication: { method: 'password_reauthentication' },
            },
            meta: { createdAt: now, updatedAt: now, createdBy: user.userId },
          },
          message: `Sign ${subjectRecordId} (${action})`,
        });

        if (!result.success) {
          reply.status(422);
          return {
            success: false,
            error: result.error || 'Failed to create signature',
            ...(result.validation !== undefined ? { validation: result.validation } : {}),
            ...(result.lint !== undefined ? { lint: result.lint } : {}),
          };
        }

        // Best-effort audit trail (append swallows its own failures).
        await auditService?.append({
          actor: user.userId,
          action: 'signature_applied',
          subjectType: 'signature',
          subjectId: recordId,
          data: {
            subjectRecordId,
            ...(gitCommit !== undefined ? { gitCommit } : {}),
          },
        });

        return {
          success: true,
          signatureId: recordId,
          subject: {
            recordId: subjectRecordId,
            ...(gitCommit !== undefined ? { gitCommit } : {}),
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(500);
        return { error: 'INTERNAL_ERROR', message: `Failed to create signature: ${message}` };
      }
    },
  };
}

export type SignatureHandlers = ReturnType<typeof createSignatureHandlers>;
