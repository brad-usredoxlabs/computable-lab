/**
 * artifactPromotion — turn any analysis-output-artifact into a `data-reference`
 * so a NEW analysis run can consume it directly as an input (A06 "Use Result in
 * New Analysis").
 *
 * If the artifact already has a dataReferenceRef (model/emitted/large), that ref
 * is returned idempotently. Otherwise (small inline table/metric) the inline
 * value is written to the default storage device + a data-reference minted, and
 * the artifact is updated to carry the ref. Bytes never enter git.
 */
import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import { AnalysisServiceError } from '../analysis/analysisService.js';

const ARTIFACT_SCHEMA = 'https://computable-lab.com/schema/computable-lab/analysis-output-artifact.schema.yaml';
const DREF_SCHEMA = 'https://computable-lab.com/schema/computable-lab/data-reference.schema.yaml';

export interface PromoteResult {
  artifactId: string;
  dataReferenceId: string;
  created: boolean;
}

async function nextDataReferenceId(ctx: AppContext): Promise<string> {
  const existing = await ctx.store.list({ kind: 'data-reference', limit: 5000 });
  let max = 0;
  for (const e of existing) {
    const m = /^DREF-(\d+)$/.exec(e.recordId);
    if (m) {
      const n = Number.parseInt(m[1] ?? '0', 10);
      if (n > max) max = n;
    }
  }
  return `DREF-${String(max + 1).padStart(6, '0')}`;
}

/** Promote an artifact to a consumable data-reference (idempotent). */
export async function promoteArtifact(
  ctx: AppContext,
  artifactId: string,
): Promise<PromoteResult> {
  const env: RecordEnvelope | null = await ctx.store.get(artifactId);
  if (!env) {
    throw new AnalysisServiceError('NOT_FOUND', `analysis-output-artifact not found: ${artifactId}`, 404);
  }
  const payload = env.payload as Record<string, unknown>;
  if (payload.kind !== 'analysis-output-artifact') {
    throw new AnalysisServiceError('NOT_ARTIFACT', `${artifactId} is not an analysis-output-artifact`, 400);
  }

  // Already promoted → idempotent returns the same dref (if it still exists).
  const existingRef = payload.dataReferenceRef as { id?: string } | undefined;
  if (existingRef?.id) {
    const drefEnv = await ctx.store.get(existingRef.id);
    if (drefEnv) {
      return { artifactId, dataReferenceId: existingRef.id, created: false };
    }
  }

  // Otherwise materialize the inline value (or error if no inline value).
  const inlineValue = payload.inlineValue;
  if (inlineValue === undefined) {
    throw new AnalysisServiceError(
      'BAD_ARTIFACT',
      `artifact ${artifactId} has neither a dataReferenceRef nor an inlineValue to promote`,
      400,
    );
  }

  const deviceId = ctx.storageService.defaultDeviceId();
  const provider = ctx.storageService.getProvider(deviceId);
  const bytes = Buffer.from(typeof inlineValue === 'string' ? inlineValue : JSON.stringify(inlineValue));
  const name = (payload.name as string) ?? 'artifact';
  const storagePath = `analysis-artifacts/promoted/${artifactId}/${name}.json`;

  const { Readable } = await import('node:stream');
  const { createHash } = await import('node:crypto');
  await provider.write(storagePath, Readable.from(bytes));
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  const drefId = await nextDataReferenceId(ctx);
  const drefPayload: Record<string, unknown> = {
    kind: 'data-reference',
    id: drefId,
    title: `${name} (promoted)`,
    storageDeviceId: deviceId,
    path: storagePath,
    contentHash: sha256,
    sizeBytes: bytes.byteLength,
    dataKind: (payload.dataKind as string) ?? 'table',
    ...(payload.format ? { format: payload.format } : {}),
    acquiredAt: new Date().toISOString(),
  };
  const drefResult = await ctx.store.create({
    envelope: { recordId: drefId, schemaId: DREF_SCHEMA, payload: drefPayload },
    message: `Promote artifact ${artifactId} → ${drefId}`,
  });
  if (!drefResult.success) {
    throw new AnalysisServiceError('PROMOTE_FAILED', drefResult.error ?? 'failed to create data-reference', 500);
  }

  // Update the artifact to carry the dataReferenceRef (and keep inline for display).
  const updatedPayload: Record<string, unknown> = {
    ...payload,
    dataReferenceRef: { kind: 'record', id: drefId, type: 'data-reference' },
  };
  const upd = await ctx.store.update({
    envelope: { recordId: artifactId, schemaId: ARTIFACT_SCHEMA, payload: updatedPayload },
    message: `Link artifact ${artifactId} → ${drefId}`,
  });
  if (!upd.success) {
    throw new AnalysisServiceError('PROMOTE_FAILED', upd.error ?? 'failed to update artifact', 500);
  }

  return { artifactId, dataReferenceId: drefId, created: true };
}