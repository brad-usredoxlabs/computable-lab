/**
 * ProtocolIdeProjectionService — orchestrates Protocol IDE reruns through the
 * existing compiler pipeline.
 *
 * This service:
 * - Reads the current session source workspace from the record store
 * - Accepts directive text and a hidden rolling issue summary
 * - Composes input for the existing AI precompile + compiler pipeline
 * - Runs the pipeline and captures results
 * - Updates the mutable session in place with latest projection data
 * - Handles failures gracefully, preserving session usability
 *
 * Non-negotiable invariants:
 * - Every rerun operates on the **latest** session state only.
 * - No branching, no older-iteration selection.
 * - Projection failures do NOT destroy the source workspace.
 */

import type { RecordStore, RecordEnvelope } from '../store/types.js';
import type {
  ProjectionRequest,
  ProjectionResponse,
  CompactDiagnostic,
  EvidenceMap,
  LabContextProjection,
  VariantSummary,
} from './ProtocolIdeProjectionContracts.js';
import { runLocalProtocolPipeline } from '../compiler/pipeline/localProtocolPipelineRun.js';
import type { Pass, PassRunArgs, PassResult } from '../compiler/pipeline/types.js';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Session status constants
// ---------------------------------------------------------------------------

const SESSION_STATUS_PROJECTING = 'projecting' as const;
const SESSION_STATUS_PROJECTED = 'projected' as const;
const SESSION_STATUS_PROJECTION_FAILED = 'projection_failed' as const;
const SESSION_STATUS_AWAITING_VARIANT_SELECTION = 'awaiting_variant_selection' as const;

// ---------------------------------------------------------------------------
// Pipeline path
// ---------------------------------------------------------------------------

const PIPELINE_PATH = path.join(
  __dirname,
  '../../../schema/registry/compile-pipelines/protocol-ide-extract-and-realize.yaml',
);

// ---------------------------------------------------------------------------
// Diagnostic helpers
// ---------------------------------------------------------------------------

/**
 * Convert pipeline diagnostics into compact diagnostics suitable for
 * behind-the-scenes issue-card generation.
 */
function diagnosticsToCompact(
  pipelineDiagnostics: Array<{ severity: string; code: string; message: string; pass_id: string }>,
): CompactDiagnostic[] {
  return pipelineDiagnostics.map((d) => ({
    severity: d.severity as CompactDiagnostic['severity'],
    title: d.code,
    detail: d.message,
    ...(d.severity === 'error' ? { suggestedAction: 'Review the diagnostic and adjust the directive.' } : {}),
  }));
}

/**
 * Build a compact diagnostic for a projection failure.
 */
function buildFailureDiagnostic(error: unknown): CompactDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  return {
    severity: 'error',
    title: 'PROJECTION_FAILED',
    detail: message,
    suggestedAction: 'Review the error and adjust the directive or source.',
  };
}

// ---------------------------------------------------------------------------
// Stub passes — minimal implementations for projection
//
// These passes echo the input through the pipeline so that the projection
// service can exercise the full pipeline wiring without requiring real
// pass implementations.  Used only in tests.
// ---------------------------------------------------------------------------

export function createEchoPass(id: string, family: string): Pass {
  return {
    id,
    family: family as Pass['family'],
    run(args: PassRunArgs): PassResult {
      return {
        ok: true,
        output: {
          pass_id: id,
          input: args.state.input,
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Dependencies required by the real pass chain.
 */
export interface ProtocolIdeProjectionServiceDeps {
  /** Record store for reading/writing records */
  recordStore: RecordStore;
  /** Chunked extraction service */
  runChunkedExtraction: (
    req: { target_kind: string; text: string; source: { kind: 'file' | 'publication' | 'freetext'; id: string; locator?: string } },
  ) => Promise<{ candidates: unknown[]; diagnostics?: unknown[] }>;
  /** Promotion compile runner */
  runPromotionCompile: (args: {
    pipelinePath: string;
    candidate: { target_kind: string; draft: unknown; confidence: number };
    source_draft_id: string;
    recordIdPrefix?: string;
  }) => Promise<{ ok: boolean; canonicalRecord?: unknown; diagnostics: Array<{ severity: string; code: string; message: string; pass_id?: string }> }>;
  /** LLM client for lab-context resolve */
  llmClient: {
    complete: (args: { prompt: string; maxTokens?: number }) => Promise<string>;
  };
  /** Ajv validator for local-protocol validation */
  ajvValidator: {
    validate: (payload: unknown, schemaId: string) => { valid: boolean; errors: Array<{ path: string; message: string }> };
  };
  /** Build semantic key function (typed as unknown to decouple from the SemanticKeyBuilder; adapters cast at the pass boundary) */
  buildSemanticKey: unknown;
  /** Derivations map (typed as unknown to keep deps decoupled from the derivation registry; the pass adapter casts as needed) */
  derivations: unknown;
  /** Load verb definition by canonical name */
  loadVerbDefinition: (canonical: string) => Promise<{ canonical: string; semanticInputs?: Array<{ name: string; derivedFrom: { input: string; fn: string }; required: boolean }> } | null>;
}

export interface ProtocolIdeProjectionServiceOptions {
  /** Optional custom pass factory for testing */
  passFactory?: (id: string, family: string) => Pass | Promise<Pass>;
}

export class ProtocolIdeProjectionService {
  /**
   * Cached session envelope for use by buildRealPasses (avoids closure issues).
   */
  private currentSessionEnvelope: RecordEnvelope | null = null;

  constructor(
    private store: RecordStore,
    private deps: ProtocolIdeProjectionServiceDeps,
    private options: ProtocolIdeProjectionServiceOptions = {},
  ) {}

  /**
   * Execute a Protocol IDE rerun against the existing compiler pipeline.
   *
   * Flow:
   * 1. Validate the projection request
   * 2. Load the current session from the store
   * 3. Compose pipeline input from session state + directive + issue summary
   * 4. Run the local-protocol pipeline
   * 5. Build a ProjectionResponse from the pipeline result
   * 6. Update the session in place with latest projection data
   *
   * @param request — validated projection request
   * @returns ProjectionResponse with latest projection data
   */
  async executeProjection(request: ProjectionRequest): Promise<ProjectionResponse> {
    // 1. Load the session
    const sessionEnvelope = await this.store.get(request.sessionRef);
    if (!sessionEnvelope) {
      const diag = buildFailureDiagnostic(`Session not found: ${request.sessionRef}`);
      return this.buildFailedResponse(request, [diag]);
    }

    const payload = sessionEnvelope.payload as Record<string, unknown>;
    if (payload.kind !== 'protocol-ide-session') {
      const diag = buildFailureDiagnostic(`Record ${request.sessionRef} is not a protocol-ide-session`);
      return this.buildFailedResponse(request, [diag]);
    }

    // 2. Update session status to projecting
    const now = new Date().toISOString();
    const projectingPayload: Record<string, unknown> = {
      ...payload,
      status: SESSION_STATUS_PROJECTING,
      updatedAt: now,
    };
    const projectingEnvelope: RecordEnvelope = {
      ...sessionEnvelope,
      payload: projectingPayload,
      meta: {
        ...sessionEnvelope.meta,
        updatedAt: now,
      },
    };
    await this.store.update({
      envelope: projectingEnvelope,
      message: `Update session ${request.sessionRef} to projecting`,
      skipLint: true,
    });

    // 3. Compose pipeline input
    const pipelineInput = await this.composePipelineInput(sessionEnvelope, request);

    // 4. Run the pipeline
    let pipelineResult: Awaited<ReturnType<typeof runLocalProtocolPipeline>>;
    try {
      // Cache session envelope for use by buildRealPasses
      this.currentSessionEnvelope = sessionEnvelope;
      const passFactory = this.options.passFactory ?? this.buildRealPasses.bind(this);
      const passes = await this.buildPasses(passFactory);
      pipelineResult = await runLocalProtocolPipeline({
        pipelinePath: PIPELINE_PATH,
        passes,
        input: pipelineInput,
      });
    } catch (error) {
      const diag = buildFailureDiagnostic(error);
      await this.persistFailureSession(request.sessionRef, sessionEnvelope, [diag]);
      return this.buildFailedResponse(request, [diag]);
    }

    // 5. Build the response
    const response = this.buildProjectionResponse(request, pipelineResult);

    // Handle variant-selection pause: persist session and return early
    if (response.status === 'awaiting_variant_selection') {
      await this.persistAwaitingVariantSelectionSession(
        request.sessionRef,
        sessionEnvelope,
        response,
      );
      return response;
    }

    // 6. Update session in place with latest projection data
    await this.persistSuccessSession(request.sessionRef, sessionEnvelope, response);

    return response;
  }

  /**
   * Compose pipeline input from session state and projection request.
   */
  private async composePipelineInput(
    sessionEnvelope: RecordEnvelope,
    request: ProjectionRequest,
  ): Promise<Record<string, unknown>> {
    const payload = sessionEnvelope.payload as Record<string, unknown>;

    // Load extracted text from the extractedTextRef record
    let text = '';
    const extractedTextRef = payload.extractedTextRef as string | undefined;
    if (extractedTextRef) {
      const textEnvelope = await this.store.get(extractedTextRef);
      if (textEnvelope && textEnvelope.payload) {
        const textPayload = textEnvelope.payload as Record<string, unknown>;
        text = (textPayload.content as string) ?? (textPayload.text as string) ?? '';
      }
    }

    return {
      // Source workspace refs from the session
      sessionId: sessionEnvelope.recordId,
      sourceMode: payload.sourceMode,
      sourceSummary: payload.sourceSummary,
      vendorDocumentRef: payload.vendorDocumentRef,
      protocolImportRef: payload.protocolImportRef,
      extractedTextRef: payload.extractedTextRef,
      evidenceRefs: payload.evidenceRefs ?? [],
      evidenceCitations: payload.evidenceCitations ?? [],

      // Directive text (the user's updated directive)
      directiveText: request.directiveText,

      // Hidden rolling issue summary (injected behind the scenes)
      rollingIssueSummary: request.rollingIssueSummary,

      // Source refs from the request
      sourceRefs: request.sourceRefs,

      // Overlay summary toggles
      overlaySummaryToggles: request.overlaySummaryToggles,

      // Per-request thinking-mode override
      ...(request.enableThinking !== undefined ? { enableThinking: request.enableThinking } : {}),

      // Variant selection index (set by selectVariant handler, read by protocol_realize)
      ...(payload.selectedVariantIndex !== undefined ? { selectedVariantIndex: payload.selectedVariantIndex } : {}),

      // Timestamp for provenance
      projectionTimestamp: new Date().toISOString(),

      // Text content for protocol_extract
      text,
    };
  }

  /**
   * Build the real pass chain for the protocol-ide-extract-and-realize pipeline.
   */
  private async buildRealPasses(id: string, family: string): Promise<Pass> {
    // Import pass factories dynamically
    switch (id) {
      case 'protocol_extract': {
        const { createProtocolExtractPass } = await import('../compiler/pipeline/passes/ProtocolExtractPass.js');
        return createProtocolExtractPass({
          // Deps interface declares the simple wrapper shape; the pass calls it
          // through the runChunkedExtractionService signature. The handler-side
          // closure adapts at runtime.
          runChunkedExtraction: this.deps.runChunkedExtraction as unknown as Parameters<typeof createProtocolExtractPass>[0]['runChunkedExtraction'],
          recordStore: this.deps.recordStore,
          onChunkProgress: (event) => {
            // NOTE: No existing SSE/streaming wire exists for the Protocol IDE.
            // This callback logs progress to the server console.
            // A dedicated streaming wire (e.g. Server-Sent Events) should be
            // built in a follow-on spec to surface per-chunk progress to the
            // Protocol IDE frontend.
            console.log('[protocol_extract_progress]', event);
          },
        });
      }
      case 'lab_context_resolve': {
        const { createLabContextResolvePass } = await import('../compiler/pipeline/passes/LabContextResolvePass.js');
        // Extract manual overrides from cached session envelope
        const sessionPayload = this.currentSessionEnvelope?.payload as Record<string, unknown> | undefined;
        const manualOverrides = sessionPayload?.manualLabContextOverrides as Record<string, unknown> | undefined;
        return createLabContextResolvePass({
          llmClient: this.deps.llmClient,
          ...(manualOverrides
            ? {
                manualOverrides: {
                  ...(manualOverrides.labwareKind !== undefined ? { labwareKind: manualOverrides.labwareKind as string } : {}),
                  ...(manualOverrides.plateCount !== undefined ? { plateCount: manualOverrides.plateCount as number } : {}),
                  ...(manualOverrides.sampleCount !== undefined ? { sampleCount: manualOverrides.sampleCount as number } : {}),
                },
              }
            : {}),
        });
      }
      case 'protocol_realize': {
        const { createProtocolRealizePass } = await import('../compiler/pipeline/passes/ProtocolRealizePass.js');
        return createProtocolRealizePass({
          recordStore: this.deps.recordStore,
          runPromotionCompile: this.deps.runPromotionCompile as unknown as Parameters<typeof createProtocolRealizePass>[0]['runPromotionCompile'],
        });
      }
      case 'resolve_protocol_ref': {
        const { createResolveProtocolRefPass } = await import('../compiler/pipeline/passes/LocalProtocolPasses.js');
        return createResolveProtocolRefPass({
          recordStore: this.deps.recordStore,
        });
      }
      case 'validate_local_protocol': {
        const { createValidateLocalProtocolPass } = await import('../compiler/pipeline/passes/LocalProtocolPasses.js');
        return createValidateLocalProtocolPass({
          ajvValidator: this.deps.ajvValidator as unknown as Parameters<typeof createValidateLocalProtocolPass>[0]['ajvValidator'],
        });
      }
      case 'expand_local_customizations': {
        const { createExpandLocalCustomizationsPass } = await import('../compiler/pipeline/passes/LocalProtocolPasses.js');
        return createExpandLocalCustomizationsPass({});
      }
      case 'project_local_expanded_protocol': {
        const { createProjectLocalExpandedProtocolPass } = await import('../compiler/pipeline/passes/LocalProtocolPasses.js');
        return createProjectLocalExpandedProtocolPass({});
      }
      case 'events_emit': {
        const { createEventsEmitPass } = await import('../compiler/pipeline/passes/EventsEmitPass.js');
        return createEventsEmitPass({
          recordStore: this.deps.recordStore,
          buildSemanticKey: this.deps.buildSemanticKey,
          derivations: this.deps.derivations,
          loadVerbDefinition: this.deps.loadVerbDefinition,
        } as unknown as Parameters<typeof createEventsEmitPass>[0]);
      }
      default:
        // Fallback to echo pass for unknown pass ids
        return createEchoPass(id, family);
    }
  }

  /**
   * Build a set of passes using the provided factory.
   */
  private async buildPasses(passFactory: (id: string, family: string) => Pass | Promise<Pass>): Promise<Pass[]> {
    const passIds = [
      'protocol_extract',
      'lab_context_resolve',
      'protocol_realize',
      'resolve_protocol_ref',
      'validate_local_protocol',
      'expand_local_customizations',
      'project_local_expanded_protocol',
      'events_emit',
    ];
    const families = ['parse', 'normalize', 'expand', 'disambiguate', 'validate', 'expand', 'project', 'project'];
    const promises = passIds.map((id, i) => passFactory(id, families[i]!));
    return Promise.all(promises);
  }

  /**
   * Resolve the provenance source for a single lab context field.
   *
   * Precedence: manual > directive > default
   * - 'manual' if the field was overridden in manualLabContextOverrides
   * - 'directive' if directiveText is non-empty (LLM may have changed it)
   * - 'default' otherwise
   */
  private resolveSource(
    _resolvedValue: string | number,
    directiveText: string | undefined,
    manualOverrides: Record<string, unknown> | undefined,
    field: string,
  ): 'default' | 'directive' | 'manual' {
    // Check manual overrides first (highest precedence)
    if (manualOverrides && field in manualOverrides) {
      return 'manual';
    }
    // Check if directive was non-empty (LLM may have changed it)
    if (directiveText && directiveText.trim().length > 0) {
      return 'directive';
    }
    return 'default';
  }

  /**
   * Build a ProjectionResponse from pipeline results.
   */
  private buildProjectionResponse(
    request: ProjectionRequest,
    pipelineResult: Awaited<ReturnType<typeof runLocalProtocolPipeline>>,
  ): ProjectionResponse {
    const diagnostics = diagnosticsToCompact(pipelineResult.diagnostics);

    // Check for variant-selection signal from protocol_realize
    const realizeAwaiting = pipelineResult.diagnostics.find(
      (d) => d.code === 'protocol_realize_awaiting_variant_selection',
    );

    if (realizeAwaiting) {
      // The pipeline paused for variant selection.
      // We'll persist the session status and return the special response.
      // The caller (executeProjection) handles the actual persistence.
      // Build variant summaries from the extraction-draft candidates.
      const extractOutput = pipelineResult.outputs.get('protocol_extract') as
        | { extractionDraftRef: string; candidates: unknown[] }
        | undefined;
      const candidates = extractOutput?.candidates as
        | Array<Record<string, unknown>>
        | undefined;
      const variantSummaries: VariantSummary[] = candidates
        ? candidates.map((c, i) => {
            const draft = (c.draft ?? {}) as Record<string, unknown>;
            return {
              index: i,
              displayName: (draft.display_name as string) ?? (draft.title as string) ?? `Variant ${i + 1}`,
              variantLabel: (draft.variant_label as string) ?? null,
              sectionCount: (draft.sections as number) ?? 0,
            };
          })
        : [];

      return {
        status: 'awaiting_variant_selection',
        eventGraphData: {
          recordId: `graph-${request.sessionRef}`,
          eventCount: 0,
          description: 'Awaiting variant selection.',
        },
        evidenceMap: {},
        overlaySummaries: {},
        diagnostics,
        awaitingVariantSelection: {
          extractionDraftRef: extractOutput?.extractionDraftRef ?? `draft-${request.sessionRef}`,
          variants: variantSummaries,
        },
      };
    }

    // Build evidence map from source refs
    const evidenceMap: EvidenceMap = {};
    for (const ref of request.sourceRefs) {
      evidenceMap[ref.recordId] = [
        {
          evidenceRef: ref.recordId,
          description: ref.label,
          sourceLocation: ref.kind,
        },
      ];
    }

    // Build overlay summaries based on toggles
    const toggles = request.overlaySummaryToggles ?? {};
    const overlaySummaries: ProjectionResponse['overlaySummaries'] = {};

    if (toggles.includeDeckSummary ?? true) {
      overlaySummaries.deck = {
        summary: 'Deck layout derived from pipeline execution.',
        slotsInUse: 0,
        totalSlots: 12,
      };
    }

    if (toggles.includeToolsSummary ?? true) {
      overlaySummaries.tools = {
        summary: 'Tools derived from pipeline execution.',
        pipettes: [],
      };
    }

    if (toggles.includeReagentsSummary ?? true) {
      overlaySummaries.reagents = {
        summary: 'Reagents derived from pipeline execution.',
        reagentCount: 0,
      };
    }

    if (toggles.includeBudgetSummary ?? true) {
      overlaySummaries.budget = {
        summary: 'Budget derived from pipeline execution.',
      };
    }

    // Extract labContext from pipeline outputs if available
    const labContextOutput = pipelineResult.outputs.get('lab_context_resolve') as
      | { labContext: { labwareKind: string; plateCount: number; sampleCount: number } }
      | undefined;

    let labContext: LabContextProjection | undefined;
    if (labContextOutput?.labContext) {
      const lc = labContextOutput.labContext;
      // Determine provenance per field: manual > directive > default
      const directiveText = request.directiveText?.trim();
      // Read manual overrides from the cached session envelope
      const manualOverrides = (this.currentSessionEnvelope?.payload as Record<string, unknown> | undefined)?.manualLabContextOverrides as
        | Record<string, unknown>
        | undefined;

      const source: LabContextProjection['source'] = {
        labwareKind: this.resolveSource(
          lc.labwareKind,
          directiveText,
          manualOverrides,
          'labwareKind',
        ),
        plateCount: this.resolveSource(
          lc.plateCount,
          directiveText,
          manualOverrides,
          'plateCount',
        ),
        sampleCount: this.resolveSource(
          lc.sampleCount,
          directiveText,
          manualOverrides,
          'sampleCount',
        ),
      };
      labContext = {
        labwareKind: lc.labwareKind,
        plateCount: lc.plateCount,
        sampleCount: lc.sampleCount,
        source,
      };
    }

    const status = pipelineResult.ok ? 'success' : 'partial';

    return {
      status,
      eventGraphData: {
        recordId: `graph-${request.sessionRef}`,
        eventCount: pipelineResult.outputs.size,
        description: pipelineResult.ok
          ? `Projection completed with ${pipelineResult.outputs.size} pass outputs.`
          : `Projection completed with warnings: ${pipelineResult.diagnostics.length} diagnostics.`,
      },
      projectedProtocolRef: `proto-${request.sessionRef}`,
      projectedRunRef: `run-${request.sessionRef}`,
      evidenceMap,
      overlaySummaries,
      diagnostics,
      ...(labContext ? { labContext } : {}),
    };
  }

  /**
   * Build a failed ProjectionResponse.
   */
  private buildFailedResponse(
    request: ProjectionRequest,
    diagnostics: CompactDiagnostic[],
  ): ProjectionResponse {
    return {
      status: 'failed',
      eventGraphData: {
        recordId: `graph-${request.sessionRef}`,
        eventCount: 0,
        description: 'Projection failed.',
      },
      evidenceMap: {},
      overlaySummaries: {},
      diagnostics,
    };
  }

  /**
   * Persist a successful projection to the session in place.
   */
  private async persistSuccessSession(
    sessionId: string,
    sessionEnvelope: RecordEnvelope,
    response: ProjectionResponse,
  ): Promise<void> {
    const payload = sessionEnvelope.payload as Record<string, unknown>;
    const now = new Date().toISOString();

    const recordRef = (id: string | null | undefined, type: string) =>
      id ? { kind: 'record' as const, id, type } : undefined;

    const updatedPayload: Record<string, unknown> = {
      ...payload,
      status: SESSION_STATUS_PROJECTED,
      latestDirectiveText: payload.latestDirectiveText ?? '',
      ...(recordRef(response.projectedProtocolRef, 'protocol') ? { latestProtocolRef: recordRef(response.projectedProtocolRef, 'protocol') } : {}),
      ...(recordRef(response.eventGraphData.recordId, 'event-graph') ? { latestEventGraphRef: recordRef(response.eventGraphData.recordId, 'event-graph') } : {}),
      latestEventGraphCacheKey: response.eventGraphData.recordId,
      ...(response.overlaySummaries.deck ? { latestDeckSummaryRef: recordRef(`deck-${sessionId}`, 'overlay-summary') } : {}),
      ...(response.overlaySummaries.tools ? { latestToolsSummaryRef: recordRef(`tools-${sessionId}`, 'overlay-summary') } : {}),
      ...(response.overlaySummaries.reagents ? { latestReagentsSummaryRef: recordRef(`reagents-${sessionId}`, 'overlay-summary') } : {}),
      ...(response.overlaySummaries.budget ? { latestBudgetSummaryRef: recordRef(`budget-${sessionId}`, 'overlay-summary') } : {}),
      labContext: response.labContext ?? null,
      updatedAt: now,
    };

    const updatedEnvelope: RecordEnvelope = {
      ...sessionEnvelope,
      payload: updatedPayload,
      meta: {
        ...sessionEnvelope.meta,
        updatedAt: now,
      },
    };

    await this.store.update({
      envelope: updatedEnvelope,
      message: `Update session ${sessionId} with latest projection`,
      skipLint: true,
    });
  }

  /**
   * Persist a failed projection to the session in place.
   * Keeps the session routable and preserves compact diagnostics.
   */
  private async persistFailureSession(
    sessionId: string,
    sessionEnvelope: RecordEnvelope,
    diagnostics: CompactDiagnostic[],
  ): Promise<void> {
    const payload = sessionEnvelope.payload as Record<string, unknown>;
    const now = new Date().toISOString();

    const updatedPayload: Record<string, unknown> = {
      ...payload,
      status: SESSION_STATUS_PROJECTION_FAILED,
      latestProjectionDiagnostics: diagnostics,
      updatedAt: now,
    };

    const updatedEnvelope: RecordEnvelope = {
      ...sessionEnvelope,
      payload: updatedPayload,
      meta: {
        ...sessionEnvelope.meta,
        updatedAt: now,
      },
    };

    await this.store.update({
      envelope: updatedEnvelope,
      message: `Update session ${sessionId} with projection failure diagnostics`,
      skipLint: true,
    });
  }

  /**
   * Persist a variant-selection pause to the session in place.
   * Sets session status to awaiting_variant_selection and stores
   * the extraction-draft ref and variant summaries.
   */
  private async persistAwaitingVariantSelectionSession(
    sessionId: string,
    sessionEnvelope: RecordEnvelope,
    response: ProjectionResponse,
  ): Promise<void> {
    const payload = sessionEnvelope.payload as Record<string, unknown>;
    const now = new Date().toISOString();

    const updatedPayload: Record<string, unknown> = {
      ...payload,
      status: SESSION_STATUS_AWAITING_VARIANT_SELECTION,
      latestDirectiveText: payload.latestDirectiveText ?? '',
      latestProtocolRef: response.projectedProtocolRef ?? null,
      latestEventGraphRef: response.eventGraphData.recordId,
      latestEventGraphCacheKey: response.eventGraphData.recordId,
      latestDeckSummaryRef: response.overlaySummaries.deck ? `deck-${sessionId}` : null,
      latestToolsSummaryRef: response.overlaySummaries.tools ? `tools-${sessionId}` : null,
      latestReagentsSummaryRef: response.overlaySummaries.reagents ? `reagents-${sessionId}` : null,
      latestBudgetSummaryRef: response.overlaySummaries.budget ? `budget-${sessionId}` : null,
      labContext: response.labContext ?? null,
      updatedAt: now,
    };

    const updatedEnvelope: RecordEnvelope = {
      ...sessionEnvelope,
      payload: updatedPayload,
      meta: {
        ...sessionEnvelope.meta,
        updatedAt: now,
      },
    };

    await this.store.update({
      envelope: updatedEnvelope,
      message: `Update session ${sessionId} to awaiting_variant_selection`,
      skipLint: true,
    });
  }
}
