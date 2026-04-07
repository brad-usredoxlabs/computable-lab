import type { RecordEnvelope, RecordStore } from '../store/types.js';
import { ArtifactBlobStore } from './ArtifactBlobStore.js';
import { buildIngestionArtifactEnvelope, buildIngestionJobEnvelope, createRecordRef, createSourceRef } from './records.js';
import { IngestionWorkerShell } from './IngestionWorker.js';
import {
  INGESTION_SCHEMA_IDS,
  type CreateIngestionArtifactInput,
  type CreateIngestionJobInput,
  type IngestionArtifactPayload,
  type IngestionBundlePayload,
  type IngestionCandidatePayload,
  type IngestionIssuePayload,
  type IngestionJobDetail,
  type IngestionJobPayload,
  type IngestionPublishResult,
  type IngestionJobSummary,
} from './types.js';

function resultError(result: {
  error?: string | undefined;
  validation?: { errors?: Array<{ path: string; message: string }> | undefined } | undefined;
}): string {
  if (result.validation?.errors?.length) {
    return result.validation.errors.map((item) => `${item.path}: ${item.message}`).join('; ');
  }
  return result.error ?? 'Operation failed';
}

function refId(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return typeof (value as Record<string, unknown>).id === 'string'
    ? ((value as Record<string, unknown>).id as string)
    : undefined;
}

function asJobEnvelope(envelope: RecordEnvelope | null): RecordEnvelope<IngestionJobPayload> | null {
  return envelope?.schemaId === INGESTION_SCHEMA_IDS.job ? envelope as RecordEnvelope<IngestionJobPayload> : null;
}

function asArtifactEnvelope(envelope: RecordEnvelope | null): RecordEnvelope<IngestionArtifactPayload> | null {
  return envelope?.schemaId === INGESTION_SCHEMA_IDS.artifact ? envelope as RecordEnvelope<IngestionArtifactPayload> : null;
}

function asBundleEnvelope(envelope: RecordEnvelope | null): RecordEnvelope<IngestionBundlePayload> | null {
  return envelope?.schemaId === INGESTION_SCHEMA_IDS.bundle ? envelope as RecordEnvelope<IngestionBundlePayload> : null;
}

function asCandidateEnvelope(envelope: RecordEnvelope | null): RecordEnvelope<IngestionCandidatePayload> | null {
  return envelope?.schemaId === INGESTION_SCHEMA_IDS.candidate ? envelope as RecordEnvelope<IngestionCandidatePayload> : null;
}

function asIssueEnvelope(envelope: RecordEnvelope | null): RecordEnvelope<IngestionIssuePayload> | null {
  return envelope?.schemaId === INGESTION_SCHEMA_IDS.issue ? envelope as RecordEnvelope<IngestionIssuePayload> : null;
}

async function loadEnvelopesByRefs<T extends RecordEnvelope>(
  refs: Array<Record<string, unknown>> | undefined,
  loader: (envelope: RecordEnvelope | null) => T | null,
  store: RecordStore,
): Promise<T[]> {
  const ids = (refs ?? []).map((entry) => refId(entry)).filter((value): value is string => Boolean(value));
  const loaded = await Promise.all(ids.map((id) => store.get(id)));
  return loaded.map((envelope) => loader(envelope)).filter((value): value is T => value !== null);
}

function blockingIssueCount(issues: Array<RecordEnvelope<IngestionIssuePayload>>): number {
  return issues.filter((issue) => issue.payload.severity === 'error' && issue.payload.resolution_status === 'open').length;
}

export class RecordBackedIngestionService {
  readonly worker: IngestionWorkerShell;

  constructor(
    private readonly store: RecordStore,
    private readonly blobStore: ArtifactBlobStore,
  ) {
    this.worker = new IngestionWorkerShell(store, blobStore);
  }

  async createJob(input: CreateIngestionJobInput): Promise<IngestionJobDetail> {
    const envelope = buildIngestionJobEnvelope(input);
    const result = await this.store.create({
      envelope,
      message: `Create ingestion job ${envelope.recordId}`,
    });
    if (!result.success || !result.envelope) {
      throw new Error(resultError(result));
    }

    if (input.source) {
      await this.addArtifact(envelope.recordId, input.source);
    }

    const detail = await this.getJob(envelope.recordId);
    if (!detail) throw new Error(`Failed to load ingestion job ${envelope.recordId}`);
    return detail;
  }

  async runJob(jobId: string, source?: CreateIngestionArtifactInput): Promise<IngestionJobDetail> {
    const result = await this.worker.runJob(jobId, source);
    if (!result) {
      throw new Error(`Ingestion job not found: ${jobId}`);
    }
    const detail = await this.getJob(jobId);
    if (!detail) throw new Error(`Failed to load ingestion job ${jobId}`);
    return detail;
  }

  async approveBundle(jobId: string, bundleId: string): Promise<IngestionJobDetail> {
    const result = await this.worker.approveBundle(jobId, bundleId);
    if (!result) {
      throw new Error(`Ingestion bundle not found: ${bundleId}`);
    }
    const detail = await this.getJob(jobId);
    if (!detail) throw new Error(`Failed to load ingestion job ${jobId}`);
    return detail;
  }

  async publishBundle(jobId: string, bundleId: string): Promise<{ detail: IngestionJobDetail; publishResult: IngestionPublishResult }> {
    const publishResult = await this.worker.publishBundle(jobId, bundleId);
    const detail = await this.getJob(jobId);
    if (!detail) throw new Error(`Failed to load ingestion job ${jobId}`);
    return { detail, publishResult };
  }

  async addArtifact(jobId: string, input: CreateIngestionArtifactInput): Promise<RecordEnvelope<IngestionArtifactPayload>> {
    const job = asJobEnvelope(await this.store.get(jobId));
    if (!job) throw new Error(`Ingestion job not found: ${jobId}`);

    const artifactEnvelope = buildIngestionArtifactEnvelope(job.payload, input);

    if (input.contentBase64) {
      const persisted = await this.blobStore.save({
        artifactId: artifactEnvelope.recordId,
        ...(input.fileName ? { fileName: input.fileName } : {}),
        contentBase64: input.contentBase64,
      });
      artifactEnvelope.payload = buildIngestionArtifactEnvelope(job.payload, {
        ...input,
        storedPath: persisted.storedPath,
        sha256: persisted.sha256,
        sizeBytes: persisted.sizeBytes,
      }).payload;
    }

    const artifactResult = await this.store.create({
      envelope: artifactEnvelope,
      message: `Attach artifact ${artifactEnvelope.recordId} to ingestion job ${jobId}`,
    });
    if (!artifactResult.success || !artifactResult.envelope) {
      throw new Error(resultError(artifactResult));
    }

    const updatedPayload: IngestionJobPayload = {
      ...job.payload,
      artifact_refs: [
        ...(job.payload.artifact_refs ?? []),
        createRecordRef(artifactEnvelope.recordId, 'ingestion-artifact', input.fileName?.trim() || input.sourceUrl?.trim() || artifactEnvelope.recordId),
      ],
      source_refs: [
        ...(job.payload.source_refs ?? []),
        createSourceRef(artifactEnvelope.recordId, input.fileName?.trim() || input.sourceUrl?.trim() || artifactEnvelope.recordId),
      ],
    };

    const updateResult = await this.store.update({
      envelope: {
        ...job,
        payload: updatedPayload,
      },
      message: `Link artifact ${artifactEnvelope.recordId} to ingestion job ${jobId}`,
    });
    if (!updateResult.success) {
      throw new Error(resultError(updateResult));
    }

    return artifactResult.envelope as RecordEnvelope<IngestionArtifactPayload>;
  }

  async listJobs(): Promise<IngestionJobSummary[]> {
    const jobs = await this.store.list({ schemaId: INGESTION_SCHEMA_IDS.job, limit: 1000 });

    return (jobs as Array<RecordEnvelope<IngestionJobPayload>>)
      .map(async (job) => {
        const jobArtifacts = await loadEnvelopesByRefs(job.payload.artifact_refs, asArtifactEnvelope, this.store);
        const jobBundles = await loadEnvelopesByRefs(job.payload.bundle_refs, asBundleEnvelope, this.store);
        const jobIssues = await loadEnvelopesByRefs(job.payload.issue_refs, asIssueEnvelope, this.store);
        const jobCandidates = jobBundles.flatMap((bundle) =>
          (bundle.payload.candidate_refs ?? [])
            .map((entry) => refId(entry))
            .filter((value): value is string => Boolean(value)),
        );
        return {
          id: job.recordId,
          name: job.payload.name,
          sourceKind: job.payload.source_kind,
          stage: job.payload.stage,
          status: job.payload.status,
          submittedAt: job.payload.submitted_at,
          ...(job.payload.started_at ? { startedAt: job.payload.started_at } : {}),
          ...(job.payload.completed_at ? { completedAt: job.payload.completed_at } : {}),
          ...(job.payload.progress ? { progress: job.payload.progress } : {}),
          artifactCount: jobArtifacts.length,
          bundleCount: jobBundles.length,
          candidateCount: jobCandidates.length,
          issueCount: jobIssues.length,
          blockingIssueCount: blockingIssueCount(jobIssues),
        };
      })
      .reduce(async (promise, jobPromise) => {
        const items = await promise;
        items.push(await jobPromise);
        return items;
      }, Promise.resolve([] as IngestionJobSummary[]))
      .then((items) => items.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)));
  }

  async getJob(jobId: string): Promise<IngestionJobDetail | null> {
    const job = asJobEnvelope(await this.store.get(jobId));
    if (!job) return null;

    const artifacts = await loadEnvelopesByRefs(job.payload.artifact_refs, asArtifactEnvelope, this.store);
    const bundles = await loadEnvelopesByRefs(job.payload.bundle_refs, asBundleEnvelope, this.store);
    const issuesFromJob = await loadEnvelopesByRefs(job.payload.issue_refs, asIssueEnvelope, this.store);
    const candidateRefs = bundles.flatMap((bundle) => bundle.payload.candidate_refs ?? []);
    const issueRefsFromBundles = bundles.flatMap((bundle) => bundle.payload.issue_refs ?? []);
    let candidates = await loadEnvelopesByRefs(candidateRefs, asCandidateEnvelope, this.store);
    let issuesFromBundles = await loadEnvelopesByRefs(issueRefsFromBundles, asIssueEnvelope, this.store);
    if ((bundles.length > 0 && candidates.length === 0) || issuesFromBundles.length === 0) {
      const [allCandidates, allIssues] = await Promise.all([
        this.store.list({ schemaId: INGESTION_SCHEMA_IDS.candidate, limit: 20000 }),
        this.store.list({ schemaId: INGESTION_SCHEMA_IDS.issue, limit: 20000 }),
      ]);
      if (bundles.length > 0 && candidates.length === 0) {
        const bundleIds = new Set(bundles.map((bundle) => bundle.recordId));
        candidates = (allCandidates as Array<RecordEnvelope<IngestionCandidatePayload>>)
          .filter((candidate) => {
            const bundleRefId = refId(candidate.payload.bundle_ref);
            return Boolean(bundleRefId && bundleIds.has(bundleRefId));
          });
      }
      if (issuesFromBundles.length === 0) {
        const bundleIds = new Set(bundles.map((bundle) => bundle.recordId));
        issuesFromBundles = (allIssues as Array<RecordEnvelope<IngestionIssuePayload>>)
          .filter((issue) => {
            const bundleRefId = refId(issue.payload.bundle_ref);
            return Boolean(bundleRefId && bundleIds.has(bundleRefId));
          });
      }
    }
    const issuesById = new Map<string, RecordEnvelope<IngestionIssuePayload>>();
    for (const issue of [...issuesFromJob, ...issuesFromBundles]) issuesById.set(issue.recordId, issue);

    return {
      job,
      artifacts,
      bundles,
      candidates,
      issues: Array.from(issuesById.values()),
    };
  }
}

export function createIngestionService(store: RecordStore, blobStore: ArtifactBlobStore): RecordBackedIngestionService {
  return new RecordBackedIngestionService(store, blobStore);
}
