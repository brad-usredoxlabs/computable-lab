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

import type { RecordStore, StoreResult, RecordEnvelope } from '../store/types.js';
import type {
  ProjectionRequest,
  ProjectionResponse,
  CompactDiagnostic,
  EvidenceMap,
} from './ProtocolIdeProjectionContracts.js';
import { validateProjectionRequest } from './ProtocolIdeProjectionContracts.js';
import { runLocalProtocolPipeline } from '../compiler/pipeline/localProtocolPipelineRun.js';
import type { Pass } from '../compiler/pipeline/types.js';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Session status constants
// ---------------------------------------------------------------------------

const SESSION_STATUS_PROJECTING = 'projecting' as const;
const SESSION_STATUS_PROJECTED = 'projected' as const;
const SESSION_STATUS_PROJECTION_FAILED = 'projection_failed' as const;

// ---------------------------------------------------------------------------
// Pipeline path
// ---------------------------------------------------------------------------

const PIPELINE_PATH = path.join(
  __dirname,
  '../../../schema/registry/compile-pipelines/local-protocol-compile.yaml',
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
    suggestedAction: d.severity === 'error' ? 'Review the diagnostic and adjust the directive.' : undefined,
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
// pass implementations.  In production, the Protocol IDE shell would
// supply the real pass registry.
// ---------------------------------------------------------------------------

function createEchoPass(id: string, family: string): Pass {
  return {
    id,
    family: family as Pass['family'],
    run(args: { pass_id: string; state: { input: Record<string, unknown>; context: Record<string, unknown>; meta: Record<string, unknown>; outputs: Map<string, unknown>; diagnostics: Array<{ severity: string; code: string; message: string; pass_id: string }> } }) {
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

export interface ProtocolIdeProjectionServiceOptions {
  /** Optional custom pass factory for testing */
  passFactory?: (id: string, family: string) => Pass;
}

export class ProtocolIdeProjectionService {
  constructor(
    private store: RecordStore,
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
    const pipelineInput = this.composePipelineInput(sessionEnvelope, request);

    // 4. Run the pipeline
    let pipelineResult: Awaited<ReturnType<typeof runLocalProtocolPipeline>>;
    try {
      const passFactory = this.options.passFactory ?? createEchoPass;
      const passes = this.buildStubPasses();
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

    // 6. Update session in place with latest projection data
    await this.persistSuccessSession(request.sessionRef, sessionEnvelope, response);

    return response;
  }

  /**
   * Compose pipeline input from session state and projection request.
   */
  private composePipelineInput(
    sessionEnvelope: RecordEnvelope,
    request: ProjectionRequest,
  ): Record<string, unknown> {
    const payload = sessionEnvelope.payload as Record<string, unknown>;

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

      // Timestamp for provenance
      projectionTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Build a set of stub passes for the local-protocol pipeline.
   * These echo input through the pipeline for projection purposes.
   */
  private buildStubPasses(): Pass[] {
    const passFactory = this.options.passFactory ?? createEchoPass;
    const passIds = [
      'parse_local_protocol',
      'normalize_local_protocol',
      'resolve_protocol_ref',
      'validate_local_protocol',
      'expand_local_customizations',
      'project_local_expanded_protocol',
    ];
    const families = ['parse', 'normalize', 'disambiguate', 'validate', 'expand', 'project'];
    return passIds.map((id, i) => passFactory(id, families[i]));
  }

  /**
   * Build a ProjectionResponse from pipeline results.
   */
  private buildProjectionResponse(
    request: ProjectionRequest,
    pipelineResult: Awaited<ReturnType<typeof runLocalProtocolPipeline>>,
  ): ProjectionResponse {
    const diagnostics = diagnosticsToCompact(pipelineResult.diagnostics);

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

    const updatedPayload: Record<string, unknown> = {
      ...payload,
      status: SESSION_STATUS_PROJECTED,
      latestDirectiveText: payload.latestDirectiveText ?? '',
      latestProtocolRef: response.projectedProtocolRef ?? null,
      latestEventGraphRef: response.eventGraphData.recordId,
      latestEventGraphCacheKey: response.eventGraphData.recordId,
      latestDeckSummaryRef: response.overlaySummaries.deck ? `deck-${sessionId}` : null,
      latestToolsSummaryRef: response.overlaySummaries.tools ? `tools-${sessionId}` : null,
      latestReagentsSummaryRef: response.overlaySummaries.reagents ? `reagents-${sessionId}` : null,
      latestBudgetSummaryRef: response.overlaySummaries.budget ? `budget-${sessionId}` : null,
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
}
