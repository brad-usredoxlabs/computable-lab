/**
 * analysisArtifactContent — GC-10 OQ-1(a) (RATIFIED (a)): read-only byte read
 * for a data-reference-backed analysis-output-artifact.
 *
 * `GET /api/analysis-artifacts/:id/content` resolves the AOUT-* record ->
 * `payload.dataReferenceRef.id` -> the immutable DREF record ->
 * `storageService.getProvider(deviceId).read(path)` — the EXACT channel
 * analysisRunner.provisionInputs uses (analysisRunner.ts:221-222) — and
 * streams the stored JSON bytes back. The storage path comes ONLY from the
 * pinned DREF record (never a user-supplied path or query param); the route is
 * GET-only and read-only (it writes nothing to the store or storage).
 */
import type { AppContext } from '../server.js';
import { AnalysisServiceError } from '../analysis/analysisService.js';

export interface ArtifactContentResult {
  artifactId: string;
  dataReferenceId: string;
  content: unknown;
}

/** Read the stored JSON bytes of a data-reference-backed analysis artifact. */
export async function getAnalysisArtifactContent(
  ctx: AppContext,
  artifactId: string,
): Promise<ArtifactContentResult> {
  const env = await ctx.store.get(artifactId);
  if (!env) {
    throw new AnalysisServiceError('NOT_FOUND', `analysis-output-artifact not found: ${artifactId}`, 404);
  }
  const payload = env.payload as Record<string, unknown>;
  if (payload.kind !== 'analysis-output-artifact') {
    throw new AnalysisServiceError('NOT_ARTIFACT', `${artifactId} is not an analysis-output-artifact`, 400);
  }

  // The path is pinned in the immutable DREF record — never a user-supplied
  // path: no traversal surface (bait #14).
  const drefId = (payload.dataReferenceRef as { id?: string } | undefined)?.id;
  if (!drefId) {
    throw new AnalysisServiceError(
      'NO_DATA_REFERENCE',
      `artifact ${artifactId} is inline-only — no data-reference to read (use the run record's inlineValue)`,
      404,
    );
  }
  const drefEnv = await ctx.store.get(drefId);
  if (!drefEnv) {
    throw new AnalysisServiceError('NOT_FOUND', `data-reference not found: ${drefId}`, 404);
  }
  const dp = drefEnv.payload as { storageDeviceId?: string; path?: string };
  if (!dp.storageDeviceId || !dp.path) {
    throw new AnalysisServiceError(
      'BAD_DATA_REFERENCE',
      `data-reference ${drefId} has no storageDeviceId/path`,
      404,
    );
  }

  // The provisionInputs provider-read channel (analysisRunner.ts:221-222):
  // import the channel's shape, do not fork it.
  const provider = ctx.storageService.getProvider(dp.storageDeviceId);
  const stream = await provider.read(dp.path);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(chunk);
  let content: unknown;
  try {
    content = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (err) {
    throw new AnalysisServiceError(
      'CONTENT_NOT_JSON',
      `artifact ${artifactId} stored bytes are not JSON: ${err instanceof Error ? err.message : String(err)}`,
      500,
    );
  }
  return { artifactId, dataReferenceId: drefId, content };
}
