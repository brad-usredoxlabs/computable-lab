import type { RecordEnvelope, RecordStore } from '../store/types.js';
import { ArtifactBlobStore } from './ArtifactBlobStore.js';
import { extractVendorFormulationHtml } from './adapters/vendorFormulationHtml.js';
import { buildVendorFormulationBundle } from './pipelines/vendorFormulationPipeline.js';
import { publishCaymanLibraryBundle } from './publishers/CaymanLibraryPublisher.js';
import { publishVendorFormulationBundle } from './publishers/VendorFormulationPublisher.js';
import { buildIngestionIssueEnvelope, createRecordRef } from './records.js';
import {
  INGESTION_SCHEMA_IDS,
  type CreateIngestionArtifactInput,
  type IngestionArtifactPayload,
  type IngestionBundlePayload,
  type IngestionCandidatePayload,
  type IngestionIssuePayload,
  type IngestionJobProgress,
  type IngestionJobPayload,
  type IngestionPublishResult,
} from './types.js';
import { ExtractionRunnerService } from '../extract/ExtractionRunnerService.js';

function resolveTargetKindFromArtifact(artifact: RecordEnvelope<IngestionArtifactPayload>): string {
  // adapter_kind is typically on the job, but may be stored in the artifact's file_ref
  // For now, default to 'material-spec' unless we have explicit adapter_kind hints
  const fileRef = artifact.payload.file_ref;
  if (fileRef && typeof fileRef === 'object') {
    const refAsRecord = fileRef as Record<string, unknown>;
    const adapterKind = refAsRecord.adapter_kind;
    if (adapterKind === 'protocol_pdf' || adapterKind === 'protocol_html') return 'protocol';
  }
  return 'material-spec';   // default
}

function asJobEnvelope(envelope: RecordEnvelope | null): RecordEnvelope<IngestionJobPayload> | null {
  return envelope?.schemaId === INGESTION_SCHEMA_IDS.job ? envelope as RecordEnvelope<IngestionJobPayload> : null;
}

function asArtifactEnvelope(envelope: RecordEnvelope | null): RecordEnvelope<IngestionArtifactPayload> | null {
  return envelope?.schemaId === INGESTION_SCHEMA_IDS.artifact ? envelope as RecordEnvelope<IngestionArtifactPayload> : null;
}

function refId(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return typeof (value as Record<string, unknown>).id === 'string'
    ? ((value as Record<string, unknown>).id as string)
    : undefined;
}

function storeErrorDetail(
  result: {
    error?: string | undefined;
    validation?: { errors?: Array<{ path: string; message: string }> | undefined } | undefined;
    lint?: { violations?: Array<{ path?: string | undefined; message: string; severity: string }> | undefined } | undefined;
  },
  fallback: string,
): string {
  const parts: string[] = [];
  if (result.validation?.errors?.length) {
    parts.push(`validation: ${result.validation.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`);
  }
  if (result.lint?.violations?.length) {
    const errs = result.lint.violations.filter((v) => v.severity === 'error');
    if (errs.length > 0) {
      parts.push(`lint: ${errs.map((v) => `${v.path ?? '/'}: ${v.message}`).join('; ')}`);
    }
  }
  if (parts.length > 0) return `${fallback} — ${parts.join(' | ')}`;
  return result.error ? `${fallback}: ${result.error}` : fallback;
}

export class IngestionWorker {
  constructor(
    private readonly store: RecordStore,
    private readonly blobStore: ArtifactBlobStore,
    private readonly extractionRunner: ExtractionRunnerService,
  ) {}

  private async resolveStoredContentBase64(
    artifact: RecordEnvelope<IngestionArtifactPayload>,
    source?: CreateIngestionArtifactInput,
  ): Promise<string | undefined> {
    if (source?.contentBase64) return source.contentBase64;
    const fileRef = artifact.payload.file_ref;
    const storedPath = fileRef && typeof fileRef === 'object' && typeof (fileRef as Record<string, unknown>).stored_path === 'string'
      ? ((fileRef as Record<string, unknown>).stored_path as string)
      : undefined;
    if (!storedPath) return undefined;
    return this.blobStore.loadBase64(storedPath);
  }

  private buildProgress(progress: Omit<IngestionJobProgress, 'percent' | 'updated_at'>): IngestionJobProgress {
    const percent = progress.total > 0 ? Math.max(0, Math.min(100, (progress.current / progress.total) * 100)) : 0;
    return {
      ...progress,
      percent,
      updated_at: new Date().toISOString(),
    };
  }

  private async updateJobEnvelope(
    job: RecordEnvelope<IngestionJobPayload>,
    message: string,
    mutate: (payload: IngestionJobPayload) => IngestionJobPayload,
  ): Promise<RecordEnvelope<IngestionJobPayload>> {
    const result = await this.store.update({
      envelope: {
        ...job,
        payload: mutate(job.payload),
      },
      message,
      skipLint: true,
    });
    if (!result.success || !result.envelope) {
      throw new Error(storeErrorDetail(result, `Failed to update ingestion job ${job.recordId}`));
    }
    return result.envelope as RecordEnvelope<IngestionJobPayload>;
  }

  async markRunning(jobId: string): Promise<RecordEnvelope<IngestionJobPayload> | null> {
    const envelope = await this.store.get(jobId);
    if (!envelope || envelope.schemaId !== INGESTION_SCHEMA_IDS.job) return null;

    const payload = envelope.payload as IngestionJobPayload;
    const updated: IngestionJobPayload = {
      ...payload,
      status: 'running',
      started_at: payload.started_at ?? new Date().toISOString(),
      progress: this.buildProgress({
        phase: 'collect',
        current: 0,
        total: 1,
        unit: 'job',
        message: 'Starting ingestion job',
      }),
    };
    const result = await this.store.update({
      envelope: {
        ...envelope,
        payload: updated,
      },
      message: `Mark ingestion job ${jobId} as running`,
      skipLint: true,
    });
    return (result.envelope as RecordEnvelope<IngestionJobPayload> | undefined) ?? null;
  }

  async runJob(jobId: string, source?: CreateIngestionArtifactInput): Promise<RecordEnvelope<IngestionJobPayload> | null> {
    const running = await this.markRunning(jobId);
    if (!running) return null;

    // Handle ai_assisted source kind separately - it has its own extraction flow
    if (running.payload.source_kind === 'ai_assisted') {
      // ai_assisted jobs are handled below in the main extraction flow
    } else if (
      running.payload.source_kind !== 'vendor_plate_map_pdf'
      && running.payload.source_kind !== 'vendor_formulation_html'
      && running.payload.source_kind !== 'vendor_plate_map_spreadsheet'
    ) {
      // B4: Instrument and vendor_protocol_pdf source kinds have stub parsers — create an info issue
      // so the user knows extraction is not yet automated for this source kind.
      const isInstrument = running.payload.source_kind.startsWith('instrument_');
      const isVendorProtocolPdf = running.payload.source_kind === 'vendor_protocol_pdf';
      if (isInstrument || isVendorProtocolPdf) {
        const stubIssue = buildIngestionIssueEnvelope({
          job: running.payload,
          severity: 'info',
          issueType: 'parser_not_implemented',
          title: isVendorProtocolPdf
            ? 'Protocol PDF adapter is under development'
            : `Parser not yet implemented for ${running.payload.source_kind.replace(/_/g, ' ')}`,
          detail: isVendorProtocolPdf
            ? 'Protocol PDF adapter is under development. The job has been moved to review so you can inspect the uploaded artifacts manually.'
            : `Automated extraction for "${running.payload.source_kind}" is not yet available. The job has been moved to review so you can inspect the uploaded artifacts manually. A dedicated parser will be added in a future release.`,
          suggestedAction: 'Review uploaded artifacts manually and create candidates by hand, or wait for parser support.',
        });
        await this.store.create({
          envelope: stubIssue,
          message: `Create stub parser issue for ${running.payload.source_kind}`,
          skipLint: true,
        });
      }

      const progressMessage = isInstrument || isVendorProtocolPdf
        ? `No automated parser for ${running.payload.source_kind.replace(/_/g, ' ')} yet — ready for manual review`
        : 'Ready for review';

      return this.updateJobEnvelope(
        running,
        `Advance ingestion job ${jobId} to review`,
        (payload) => ({
          ...payload,
          stage: 'review',
          status: 'waiting_for_review',
          progress: this.buildProgress({
            phase: 'review',
            current: 1,
            total: 1,
            unit: 'job',
            message: progressMessage,
          }),
        }),
      );
    }

    const primaryArtifactId = refId((running.payload.artifact_refs ?? [])[0]);
    if (!primaryArtifactId) throw new Error(`Ingestion job ${jobId} has no primary artifact.`);

    const artifact = asArtifactEnvelope(await this.store.get(primaryArtifactId));
    if (!artifact) throw new Error(`Primary artifact not found for ingestion job ${jobId}.`);

    let currentJob = await this.updateJobEnvelope(
      running,
      `Advance ingestion job ${jobId} to extract`,
      (payload) => ({
        ...payload,
        stage: 'extract',
        progress: this.buildProgress({
          phase: 'extracting',
          current: 0,
          total: 1,
          unit: 'source',
          message: 'Extracting source content',
        }),
      }),
    );
    let artifactPayload: IngestionArtifactPayload;
    let pipeline: {
      bundle: RecordEnvelope<IngestionBundlePayload>;
      candidates: Array<RecordEnvelope<IngestionCandidatePayload>>;
      issues: Array<RecordEnvelope<IngestionIssuePayload>>;
    } = { bundle: {} as RecordEnvelope<IngestionBundlePayload>, candidates: [], issues: [] };
    let metrics: Record<string, number> = {};

    if (running.payload.source_kind === 'ai_assisted') {
      // AI-assisted extraction flow - always use extractionRunner
      const persistedBase64 = await this.resolveStoredContentBase64(artifact, source);
      if (!persistedBase64) {
        throw new Error('AI-assisted ingestion requires source.contentBase64.');
      }

      const sourceFileName = String(source?.fileName ?? (artifact.payload.file_ref as Record<string, unknown> | undefined)?.file_name ?? 'unknown');
      const fileContent = Buffer.from(persistedBase64, 'base64').toString('utf8');
      
      const draftBody = await this.extractionRunner.run({
        target_kind: resolveTargetKindFromArtifact(artifact),
        text: fileContent,
        source: {
          kind: 'file',
          id: artifact.recordId,
          locator: sourceFileName,
        },
      });

      // Persist the extraction-draft record
      const draftEnvelope: RecordEnvelope<Record<string, unknown>> = {
        recordId: draftBody.recordId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/extraction-draft.schema.yaml',
        payload: draftBody as unknown as Record<string, unknown>,
      };
      const draftResult = await this.store.create({
        envelope: draftEnvelope,
        message: `Persist extraction-draft ${draftBody.recordId}`,
        skipLint: true,
      });
      if (!draftResult.success) {
        throw new Error(storeErrorDetail(draftResult, 'Failed to persist extraction-draft'));
      }
      // Record the draft link on the artifact's text_extract metadata
      const artifactUpdateResult = await this.store.update({
        envelope: {
          ...artifact,
          payload: {
            ...artifact.payload,
            text_extract: {
              ...(artifact.payload.text_extract as Record<string, unknown> ?? {}),
              extracted_at: new Date().toISOString(),
              method: 'extraction_pipeline',
              draft_record_id: draftBody.recordId,
            },
          },
        },
        message: `Attach extraction-draft reference to artifact ${artifact.recordId}`,
        skipLint: true,
      });
      if (!artifactUpdateResult.success || !artifactUpdateResult.envelope) {
        throw new Error(storeErrorDetail(artifactUpdateResult, 'Failed to update ingestion artifact'));
      }
      const updatedArtifact = artifactUpdateResult.envelope as RecordEnvelope<IngestionArtifactPayload>;
      artifactPayload = updatedArtifact.payload;
      // Short-circuit: skip the legacy bundle/candidate path. Mark the job
      // 'awaiting_review' and return. The dispatch block below (beyond the
      // ai_assisted branch) must NOT run for this case.
      pipeline = { bundle: draftEnvelope as unknown as typeof pipeline.bundle, candidates: [], issues: [] };
      metrics = { rows_extracted: 0, issues_found: 0, candidates_created: draftBody.candidates.length, issues_open: 0, issues_blocking: 0 };
      // Continue to the common finalization block at end of ai_assisted branch.
    } else if (running.payload.source_kind === 'vendor_plate_map_pdf' || running.payload.source_kind === 'vendor_plate_map_spreadsheet') {
      const persistedBase64 = await this.resolveStoredContentBase64(artifact, source);
      const extraction = await extractVendorFormulationHtml({
        ...(persistedBase64 ? { contentBase64: persistedBase64 } : {}),
        ...(source?.sourceUrl ? { sourceUrl: source.sourceUrl } : {}),
        ...(!source?.sourceUrl && artifact.payload.source_url ? { sourceUrl: artifact.payload.source_url } : {}),
      });
      const artifactUpdate = await this.store.update({
        envelope: {
          ...artifact,
          payload: {
            ...artifact.payload,
            sha256: artifact.payload.sha256 ?? extraction.sha256,
            text_extract: {
              extracted_at: new Date().toISOString(),
              method: 'html_section_parser',
              excerpt: extraction.htmlExcerpt,
            },
            html_extract: {
              extracted_at: new Date().toISOString(),
              method: 'html_section_parser',
              title: extraction.title,
              variant_count: extraction.variants.length,
              vendor: extraction.vendor,
            },
            ...(extraction.sourceUrl ? {
              fetch_metadata: {
                fetched_at: new Date().toISOString(),
                final_url: extraction.sourceUrl,
              },
            } : {}),
          },
        },
        message: `Attach vendor formulation extraction to artifact ${artifact.recordId}`,
        skipLint: true,
      });
      if (!artifactUpdate.success || !artifactUpdate.envelope) {
        throw new Error(storeErrorDetail(artifactUpdate, 'Failed to update ingestion artifact'));
      }
      artifactPayload = artifactUpdate.envelope.payload as IngestionArtifactPayload;

      pipeline = await buildVendorFormulationBundle({
        store: this.store,
        job: currentJob.payload,
        artifact: artifactPayload,
        extraction,
      });
      metrics = {
        variants_detected: extraction.variants.length,
        materials_detected: Number(pipeline.bundle.payload.metrics?.materials_detected ?? 0),
        issues_open: pipeline.issues.length,
        issues_blocking: pipeline.issues.filter((issue) => issue.payload.severity === 'error').length,
      };
    } else {
      // Fallback for any other source kinds - just mark as ready for review
      return this.updateJobEnvelope(
        currentJob,
        `Advance ingestion job ${jobId} to review`,
        (payload) => ({
          ...payload,
          stage: 'review',
          status: 'waiting_for_review',
          progress: this.buildProgress({
            phase: 'review',
            current: 1,
            total: 1,
            unit: 'job',
            message: 'Ready for review',
          }),
        }),
      );
    }

    const bundleCreate = await this.store.create({
      envelope: pipeline.bundle,
      message: `Create ingestion bundle ${pipeline.bundle.recordId}`,
      skipLint: true,
    });
    if (!bundleCreate.success) throw new Error(storeErrorDetail(bundleCreate, `Failed to create bundle ${pipeline.bundle.recordId}`));
    for (const candidate of pipeline.candidates) {
      const candidateCreate = await this.store.create({
        envelope: candidate,
        message: `Create ingestion candidate ${candidate.recordId}`,
        skipLint: true,
      });
      if (!candidateCreate.success) throw new Error(storeErrorDetail(candidateCreate, `Failed to create candidate ${candidate.recordId}`));
    }
    for (const issue of pipeline.issues) {
      const issueCreate = await this.store.create({
        envelope: issue,
        message: `Create ingestion issue ${issue.recordId}`,
        skipLint: true,
      });
      if (!issueCreate.success) throw new Error(storeErrorDetail(issueCreate, `Failed to create issue ${issue.recordId}`));
    }

    const bundleWithRefs = await this.store.update({
      envelope: {
        ...pipeline.bundle,
        payload: {
          ...pipeline.bundle.payload,
          candidate_refs: pipeline.candidates.map((candidate) => createRecordRef(candidate.recordId, 'ingestion-candidate', candidate.payload.title)),
          issue_refs: pipeline.issues.map((issue) => createRecordRef(issue.recordId, 'ingestion-issue', issue.payload.title)),
        },
      },
      message: `Attach candidate and issue refs to ingestion bundle ${pipeline.bundle.recordId}`,
      skipLint: true,
    });
    if (!bundleWithRefs.success || !bundleWithRefs.envelope) {
      throw new Error(storeErrorDetail(bundleWithRefs, `Failed to update bundle ${pipeline.bundle.recordId} with refs`));
    }
    const persistedBundle = bundleWithRefs.envelope as RecordEnvelope<IngestionBundlePayload>;

    return this.updateJobEnvelope(
      currentJob,
      `Advance ingestion job ${jobId} to review`,
      (payload) => ({
        ...payload,
        stage: 'review',
        status: 'waiting_for_review',
        bundle_refs: [createRecordRef(persistedBundle.recordId, 'ingestion-candidate-bundle', persistedBundle.payload.title)],
        issue_refs: pipeline.issues.map((issue) => createRecordRef(issue.recordId, 'ingestion-issue', issue.payload.title)),
        metrics,
        progress: this.buildProgress({
          phase: 'review',
          current: 1,
          total: 1,
          unit: 'bundle',
          message: `Ready for review with ${pipeline.candidates.length} candidates`,
        }),
      }),
    );
  }

  async approveBundle(jobId: string, bundleId: string): Promise<RecordEnvelope<IngestionBundlePayload> | null> {
    const job = asJobEnvelope(await this.store.get(jobId));
    if (!job) return null;
    const bundleEnvelope = await this.store.get(bundleId);
    if (!bundleEnvelope || bundleEnvelope.schemaId !== INGESTION_SCHEMA_IDS.bundle) return null;
    const bundle = bundleEnvelope as RecordEnvelope<IngestionBundlePayload>;
    const issues = await this.store.list({ schemaId: INGESTION_SCHEMA_IDS.issue, limit: 5000 }) as Array<RecordEnvelope<IngestionIssuePayload>>;
    const blocking = issues.filter((issue) => refId(issue.payload.bundle_ref) === bundleId && issue.payload.resolution_status === 'open' && issue.payload.severity === 'error');
    if (blocking.length > 0) {
      throw new Error(`Cannot approve bundle ${bundleId} with ${blocking.length} blocking issue(s).`);
    }
    const result = await this.store.update({
      envelope: {
        ...bundle,
        payload: {
          ...bundle.payload,
          status: 'approved',
          review_snapshot: {
            summary: 'Bundle approved for publish.',
            captured_at: new Date().toISOString(),
          },
        },
      },
      message: `Approve ingestion bundle ${bundleId}`,
      skipLint: true,
    });
    await this.store.update({
      envelope: {
        ...job,
        payload: {
          ...job.payload,
          status: 'approved_for_publish',
          progress: this.buildProgress({
            phase: 'publish',
            current: 0,
            total: 1,
            unit: 'bundle',
            message: 'Approved for publish',
          }),
        },
      },
      message: `Mark ingestion job ${jobId} approved for publish`,
      skipLint: true,
    });
    return (result.envelope as RecordEnvelope<IngestionBundlePayload> | undefined) ?? null;
  }

  async publishBundle(jobId: string, bundleId: string): Promise<IngestionPublishResult> {
    const job = asJobEnvelope(await this.store.get(jobId));
    if (!job) throw new Error(`Ingestion job not found: ${jobId}`);
    const bundleEnvelope = await this.store.get(bundleId);
    if (!bundleEnvelope || bundleEnvelope.schemaId !== INGESTION_SCHEMA_IDS.bundle) throw new Error(`Ingestion bundle not found: ${bundleId}`);
    const bundle = bundleEnvelope as RecordEnvelope<IngestionBundlePayload>;
    if (bundle.payload.status !== 'approved') {
      throw new Error(`Bundle ${bundleId} must be approved before publish.`);
    }

    const candidates = await this.store.list({ schemaId: INGESTION_SCHEMA_IDS.candidate, limit: 10000 }) as Array<RecordEnvelope<IngestionCandidatePayload>>;
    const bundleCandidates = candidates.filter((candidate) => refId(candidate.payload.bundle_ref) === bundleId);
    const result = bundle.payload.bundle_type === 'formulation_family'
      ? await publishVendorFormulationBundle({
          store: this.store,
          bundle,
          candidates: bundleCandidates,
        })
      : await publishCaymanLibraryBundle({
          store: this.store,
          bundle,
          candidates: bundleCandidates,
        });

    for (const candidate of bundleCandidates) {
      await this.store.update({
        envelope: {
          ...candidate,
          payload: {
            ...candidate.payload,
            status: 'published',
            publish_result: {
              published: true,
              published_at: new Date().toISOString(),
            },
          },
        },
        message: `Mark ingestion candidate ${candidate.recordId} published`,
        skipLint: true,
      });
    }

    await this.store.update({
      envelope: {
        ...bundle,
        payload: {
          ...bundle.payload,
          status: 'published',
        },
      },
      message: `Mark ingestion bundle ${bundleId} published`,
      skipLint: true,
    });

    await this.store.update({
      envelope: {
        ...job,
        payload: {
          ...job.payload,
          stage: 'publish',
          status: 'published',
          completed_at: new Date().toISOString(),
          progress: this.buildProgress({
            phase: 'publish',
            current: 1,
            total: 1,
            unit: 'bundle',
            message: 'Publish complete',
          }),
          publish_summary: {
            published_bundle_count: 1,
            published_record_count: result.createdRecordIds.length,
            last_published_at: new Date().toISOString(),
          },
        },
      },
      message: `Mark ingestion job ${jobId} published`,
      skipLint: true,
    });

    return result;
  }
}
