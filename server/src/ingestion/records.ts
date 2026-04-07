import { createHash } from 'node:crypto';
import type { RecordEnvelope } from '../store/types.js';
import {
  INGESTION_SCHEMA_IDS,
  type CreateIngestionArtifactInput,
  type CreateIngestionJobInput,
  type IngestionArtifactPayload,
  type IngestionBundlePayload,
  type IngestionCandidatePayload,
  type IngestionIssuePayload,
  type IngestionJobPayload,
} from './types.js';

const DEFAULT_INGESTION_ONTOLOGY_PREFERENCES = ['chebi', 'ncit'];

function nowIso(): string {
  return new Date().toISOString();
}

function compactSlug(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 16) || 'INGEST';
}

function suffix(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function compactId(prefix: string, value: string): string {
  const core = compactSlug(value).slice(0, 12) || 'INGEST';
  const digest = createHash('sha1').update(value).digest('hex').slice(0, 6).toUpperCase();
  return `${prefix}-${core}-${digest}`;
}

export function createRecordRef(id: string, type: string, label?: string): Record<string, unknown> {
  return {
    kind: 'record',
    id,
    type,
    ...(label ? { label } : {}),
  };
}

export function createSourceRef(artifactId: string, label?: string): Record<string, unknown> {
  return {
    artifact_ref: createRecordRef(artifactId, 'ingestion-artifact', label),
  };
}

export function buildIngestionJobEnvelope(input: CreateIngestionJobInput): RecordEnvelope<IngestionJobPayload> {
  const id = `ING-${compactSlug(input.sourceKind)}-${suffix()}`;
  const ontologyPreferences = (input.ontologyPreferences ?? DEFAULT_INGESTION_ONTOLOGY_PREFERENCES)
    .map((value) => value.trim().toLowerCase())
    .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);
  const payload: IngestionJobPayload = {
    kind: 'ingestion-job',
    id,
    name: input.name?.trim() || `Ingestion ${input.sourceKind.replaceAll('_', ' ')}`,
    status: 'queued',
    stage: 'collect',
    source_kind: input.sourceKind,
    submitted_at: nowIso(),
    artifact_refs: [],
    bundle_refs: [],
    issue_refs: [],
    source_refs: [],
    progress: {
      phase: 'queued',
      current: 0,
      total: 1,
      unit: 'job',
      percent: 0,
      message: 'Queued for ingestion',
      updated_at: nowIso(),
    },
    metrics: {
      issues_open: 0,
      issues_blocking: 0,
    },
    ...(input.adapterKind?.trim() ? { adapter_kind: input.adapterKind.trim() } : {}),
    ...(ontologyPreferences.length > 0 ? { ontology_preferences: ontologyPreferences } : {}),
    ...(input.submittedBy?.trim() ? { submitted_by: input.submittedBy.trim() } : {}),
  };
  return {
    recordId: id,
    schemaId: INGESTION_SCHEMA_IDS.job,
    payload,
  };
}

export function buildIngestionArtifactEnvelope(
  job: IngestionJobPayload,
  input: CreateIngestionArtifactInput,
): RecordEnvelope<IngestionArtifactPayload> {
  const id = `IAR-${suffix()}`;
  const trimmedSourceUrl = input.sourceUrl?.trim();
  const trimmedFileName = input.fileName?.trim();
  const trimmedMediaType = input.mediaType?.trim();
  const trimmedSha = input.sha256?.trim();

  const payload: IngestionArtifactPayload = {
    kind: 'ingestion-artifact',
    id,
    job_ref: createRecordRef(job.id, 'ingestion-job', job.name),
    artifact_role: 'primary_source',
    ...(trimmedSourceUrl ? { source_url: trimmedSourceUrl } : {}),
    ...(trimmedMediaType ? { media_type: trimmedMediaType } : {}),
    ...(trimmedSha ? { sha256: trimmedSha } : {}),
    provenance: {
      source_type: trimmedSourceUrl ? 'url' : 'upload',
      added_at: nowIso(),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    },
    ...((trimmedFileName || trimmedMediaType || typeof input.sizeBytes === 'number' || trimmedSha || trimmedSourceUrl)
      ? {
          file_ref: {
            file_name: trimmedFileName || 'uploaded-source',
            media_type: trimmedMediaType || 'application/octet-stream',
            ...(typeof input.sizeBytes === 'number' ? { size_bytes: input.sizeBytes } : {}),
            ...(trimmedSha ? { sha256: trimmedSha } : {}),
            ...(input.storedPath?.trim() ? { stored_path: input.storedPath.trim() } : {}),
            ...(trimmedSourceUrl ? { source_url: trimmedSourceUrl } : {}),
          },
        }
      : {}),
  };

  return {
    recordId: id,
    schemaId: INGESTION_SCHEMA_IDS.artifact,
    payload,
  };
}

export function buildIngestionBundleEnvelope(input: {
  job: IngestionJobPayload;
  title: string;
  bundleType: IngestionBundlePayload['bundle_type'];
  summary?: string;
  metrics?: Record<string, unknown>;
  publishPlan?: Record<string, unknown>;
}): RecordEnvelope<IngestionBundlePayload> {
  const recordId = compactId('IBN', input.title);
  return {
    recordId,
    schemaId: INGESTION_SCHEMA_IDS.bundle,
    payload: {
      kind: 'ingestion-candidate-bundle',
      id: recordId,
      job_ref: createRecordRef(input.job.id, 'ingestion-job', input.job.name),
      title: input.title,
      bundle_type: input.bundleType,
      status: 'in_review',
      ...(input.summary ? { summary: input.summary } : {}),
      candidate_refs: [],
      issue_refs: [],
      ...(input.metrics ? { metrics: input.metrics } : {}),
      ...(input.publishPlan ? { publish_plan: input.publishPlan } : {}),
    },
  };
}

export function buildIngestionCandidateEnvelope(input: {
  job: IngestionJobPayload;
  bundle: IngestionBundlePayload;
  candidateType: IngestionCandidatePayload['candidate_type'];
  title: string;
  payload: Record<string, unknown>;
  confidence?: number;
  normalizedName?: string;
  sourceRefs?: Array<Record<string, unknown>>;
  proposedRecordKind?: string;
  proposedSchemaId?: string;
  matchRefs?: Array<Record<string, unknown>>;
}): RecordEnvelope<IngestionCandidatePayload> {
  const recordId = compactId('ICD', `${input.candidateType}-${input.title}`);
  return {
    recordId,
    schemaId: INGESTION_SCHEMA_IDS.candidate,
    payload: {
      kind: 'ingestion-candidate',
      id: recordId,
      job_ref: createRecordRef(input.job.id, 'ingestion-job', input.job.name),
      bundle_ref: createRecordRef(input.bundle.id, 'ingestion-candidate-bundle', input.bundle.title),
      candidate_type: input.candidateType,
      title: input.title,
      status: 'needs_review',
      ...(input.sourceRefs ? { source_refs: input.sourceRefs } : {}),
      ...(typeof input.confidence === 'number' ? { confidence: input.confidence } : {}),
      ...(input.normalizedName ? { normalized_name: input.normalizedName } : {}),
      payload: input.payload,
      ...(input.proposedRecordKind ? { proposed_record_kind: input.proposedRecordKind } : {}),
      ...(input.proposedSchemaId ? { proposed_schema_id: input.proposedSchemaId } : {}),
      ...(input.matchRefs ? { match_refs: input.matchRefs } : {}),
    },
  };
}

export function buildIngestionIssueEnvelope(input: {
  job: IngestionJobPayload;
  bundle?: IngestionBundlePayload;
  candidate?: IngestionCandidatePayload;
  severity: IngestionIssuePayload['severity'];
  issueType: IngestionIssuePayload['issue_type'];
  title: string;
  detail?: string;
  suggestedAction?: string;
  evidenceRefs?: Array<Record<string, unknown>>;
}): RecordEnvelope<IngestionIssuePayload> {
  const recordId = compactId('IIS', `${input.issueType}-${input.title}`);
  return {
    recordId,
    schemaId: INGESTION_SCHEMA_IDS.issue,
    payload: {
      kind: 'ingestion-issue',
      id: recordId,
      job_ref: createRecordRef(input.job.id, 'ingestion-job', input.job.name),
      ...(input.bundle ? { bundle_ref: createRecordRef(input.bundle.id, 'ingestion-candidate-bundle', input.bundle.title) } : {}),
      ...(input.candidate ? { candidate_ref: createRecordRef(input.candidate.id, 'ingestion-candidate', input.candidate.title) } : {}),
      severity: input.severity,
      issue_type: input.issueType,
      title: input.title,
      resolution_status: 'open',
      ...(input.detail ? { detail: input.detail } : {}),
      ...(input.suggestedAction ? { suggested_action: input.suggestedAction } : {}),
      ...(input.evidenceRefs ? { evidence_refs: input.evidenceRefs } : {}),
    },
  };
}
