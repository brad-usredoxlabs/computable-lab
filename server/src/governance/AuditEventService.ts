import { randomUUID } from 'node:crypto';
import type { RecordStore } from '../store/types.js';

export interface AuditEventInput {
  actor: string;
  action: string;
  subjectType: string;
  subjectId: string;
  data?: Record<string, unknown>;
}

/** Best-effort append; never fails the business operation. */
export class AuditEventService {
  constructor(private readonly store: RecordStore) {}

  async append(input: AuditEventInput): Promise<void> {
    const now = new Date().toISOString();
    const recordId = `EVT-${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`;
    try {
      await this.store.create({
        envelope: {
          recordId,
          schemaId: 'https://computable-lab.com/schema/computable-lab/audit-event.schema.yaml',
          payload: {
            kind: 'audit-event',
            recordId,
            actor: input.actor,
            action: input.action,
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            occurredAt: now,
            ...(input.data !== undefined ? { data: input.data } : {}),
          },
          meta: { createdAt: now, updatedAt: now, createdBy: input.actor },
        },
        message: `Audit event: ${input.action}`,
      });
    } catch (err) {
      console.error(`Failed to append audit event ${input.action} on ${input.subjectId}:`, err);
    }
  }
}
