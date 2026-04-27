/**
 * ProtocolIdeProjectionContracts — latest-state projection contracts for
 * directive-driven Protocol IDE reruns.
 *
 * These types define the shape of a **latest-state** rerun request and its
 * corresponding response.  The model is intentionally narrow:
 *
 *   • The user always works from the **latest** session state.
 *   • Prior human feedback enters through a hidden `rollingIssueSummary`.
 *   • No immutable run-history, branching bases, or compare timelines.
 *
 * See spec-069 for the full acceptance criteria.
 */

// ---------------------------------------------------------------------------
// Source refs — what the projection needs to compile from the current session
// ---------------------------------------------------------------------------

/**
 * A reference to a record that the projection pipeline may need to resolve
 * during compilation (e.g. extracted text, evidence snippets, prior protocol).
 */
export interface SourceRef {
  /** Stable record identifier */
  recordId: string;
  /** Human-readable label */
  label: string;
  /** Kind of record (e.g. 'ingestion-artifact', 'document', 'evidence') */
  kind: string;
}

// ---------------------------------------------------------------------------
// Overlay summary toggles — which summaries the client wants in the response
// ---------------------------------------------------------------------------

/**
 * Flags controlling which overlay summaries are included in the projection
 * response.  All default to `true` so the client gets the full picture
 * unless it explicitly opts out.
 */
export interface OverlaySummaryToggles {
  /** Include deck layout summary (default: true) */
  includeDeckSummary?: boolean;
  /** Include tools summary (default: true) */
  includeToolsSummary?: boolean;
  /** Include reagents summary (default: true) */
  includeReagentsSummary?: boolean;
  /** Include budget summary (default: true) */
  includeBudgetSummary?: boolean;
}

// ---------------------------------------------------------------------------
// ProjectionRequest — the rerun request payload
// ---------------------------------------------------------------------------

/**
 * A latest-state rerun request.  The client sends this to ask the projection
 * service to re-compile from the current session state with an updated
 * directive.
 *
 * Non-negotiable invariants:
 *   - `sessionRef` identifies the session to rerun.
 *   - `directiveText` is the updated user directive.
 *   - `rollingIssueSummary` is **hidden** from the UI — it carries prior
 *     feedback into the next projection automatically.
 *   - `sourceRefs` carry the references needed to compile from the current
 *     session (extracted text, evidence, prior protocol, etc.).
 *   - `overlaySummaryToggles` let the client control which summary slots
 *     are populated.
 */
export interface ProjectionRequest {
  /** Session identifier (e.g. "PIS-abc123") */
  sessionRef: string;
  /** Updated directive text that drives the rerun */
  directiveText: string;
  /** Hidden rolling summary of prior issue cards — not shown to the user */
  rollingIssueSummary: string;
  /** Source refs needed to compile from the current session */
  sourceRefs: SourceRef[];
  /** Toggles for which overlay summaries to include */
  overlaySummaryToggles?: OverlaySummaryToggles;
  /** Per-request thinking-mode override for LLM calls */
  enableThinking?: boolean;
}

// ---------------------------------------------------------------------------
// Evidence map — per-node evidence for the review surface
// ---------------------------------------------------------------------------

/**
 * Evidence attached to a single event-graph node or overlay element.
 */
export interface EvidenceEntry {
  /** Reference to the evidence snippet */
  evidenceRef: string;
  /** Short human-readable description */
  description: string;
  /** Source page or section (if applicable) */
  sourceLocation?: string;
}

/**
 * Map from a graph node ID (or overlay key) to its evidence entries.
 */
export type EvidenceMap = Record<string, EvidenceEntry[]>;

// ---------------------------------------------------------------------------
// Overlay summary slots — compact summaries for the review surface
// ---------------------------------------------------------------------------

/**
 * A compact deck layout summary for the review surface.
 */
export interface DeckSummarySlot {
  /** Human-readable summary of the deck layout */
  summary: string;
  /** Number of deck slots in use */
  slotsInUse: number;
  /** Total deck slots available */
  totalSlots: number;
}

/**
 * A compact tools summary for the review surface.
 */
export interface ToolsSummarySlot {
  /** Human-readable summary of tools used */
  summary: string;
  /** Pipette types and channel counts */
  pipettes: Array<{ type: string; channels: number }>;
}

/**
 * A compact reagents summary for the review surface.
 */
export interface ReagentsSummarySlot {
  /** Human-readable summary of reagents */
  summary: string;
  /** Total reagent count */
  reagentCount: number;
}

/**
 * A compact budget summary for the review surface.
 */
export interface BudgetSummarySlot {
  /** Human-readable summary of the budget */
  summary: string;
  /** Total estimated cost */
  totalCost?: number;
  /** Currency code (e.g. "USD") */
  currency?: string;
}

// ---------------------------------------------------------------------------
// Compact diagnostics — for behind-the-scenes issue-card generation
// ---------------------------------------------------------------------------

/**
 * A compact diagnostic produced during projection.  These are suitable for
 * feeding into the issue-card generator (spec-073) but are not themselves
 * issue cards.
 */
export interface CompactDiagnostic {
  /** Severity level */
  severity: 'info' | 'warning' | 'error';
  /** Short title */
  title: string;
  /** Detailed description */
  detail: string;
  /** Suggested action (optional) */
  suggestedAction?: string;
}

// ---------------------------------------------------------------------------
// Lab context — resolved from defaults, directive, or manual overrides
// ---------------------------------------------------------------------------

/**
 * Per-field provenance for a resolved lab context value.
 */
export type LabContextSource = 'default' | 'directive' | 'manual';

/**
 * Resolved lab context exposed by the projection pipeline.
 * Produced by lab_context_resolve pass; enriched with provenance by the
 * projection service.
 */
export interface LabContextProjection {
  /** Kind of labware (e.g. '96-well-plate', '384-well-plate') */
  labwareKind: string;
  /** Number of plates */
  plateCount: number;
  /** Number of samples */
  sampleCount: number;
  /** Per-field provenance: where each value came from */
  source: {
    labwareKind: LabContextSource;
    plateCount: LabContextSource;
    sampleCount: LabContextSource;
  };
}

/**
 * A variant summary exposed during the candidate-review step.
 */
export interface VariantSummary {
  /** Zero-based index of this variant in the extraction-draft candidates */
  index: number;
  /** Human-readable display name for the variant */
  displayName: string;
  /** Variant label (e.g. 'cell culture', 'plant matter') or null */
  variantLabel: string | null;
  /** Number of sections in this variant's extraction draft */
  sectionCount: number;
}

/**
 * Payload returned when the pipeline pauses for variant selection.
 */
export interface AwaitingVariantSelection {
  /** Reference to the extraction-draft record holding the candidates */
  extractionDraftRef: string;
  /** List of candidate variants for the user to choose from */
  variants: VariantSummary[];
}

// ---------------------------------------------------------------------------
// ProjectionResponse — the rerun response payload
// ---------------------------------------------------------------------------

/**
 * A latest-state projection response.  The projection service returns this
 * after compiling from the current session state.
 *
 * The response exposes review-surface payloads:
 *   - `eventGraphData` — the latest event-graph payload
 *   - `projectedProtocolRef` / `projectedRunRef` — refs to protocol/run records
 *   - `evidenceMap` — per-node evidence for graph nodes and overlays
 *   - `overlaySummaries` — deck, tools, reagents, budget summary slots
 *   - `diagnostics` — compact diagnostics for issue-card generation
 *   - `labContext` — resolved lab context with provenance (optional)
 *   - `status` — latest-state status of the projection
 */
export interface ProjectionResponse {
  /** Latest-state status of the projection */
  status: 'success' | 'partial' | 'failed' | 'awaiting_variant_selection';
  /** Latest event-graph payload or ref */
  eventGraphData: {
    /** Stable record identifier for the event graph */
    recordId: string;
    /** Event count */
    eventCount: number;
    /** Brief description of the graph contents */
    description: string;
  };
  /** Reference to the projected protocol (local-protocol or protocol) */
  projectedProtocolRef?: string;
  /** Reference to the projected run (planned-run) */
  projectedRunRef?: string;
  /** Evidence map for graph nodes and overlays */
  evidenceMap: EvidenceMap;
  /** Overlay summary slots (only those requested via toggles) */
  overlaySummaries: {
    deck?: DeckSummarySlot;
    tools?: ToolsSummarySlot;
    reagents?: ReagentsSummarySlot;
    budget?: BudgetSummarySlot;
  };
  /** Compact diagnostics for behind-the-scenes issue generation */
  diagnostics: CompactDiagnostic[];
  /** Resolved lab context with provenance (optional — present when lab_context_resolve ran) */
  labContext?: LabContextProjection;
  /** Present when the pipeline paused for variant selection (spec-029) */
  awaitingVariantSelection?: AwaitingVariantSelection;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate a ProjectionRequest payload.
 *
 * Returns a typed result so callers can handle errors without throwing.
 */
export function validateProjectionRequest(
  input: unknown,
):
  | { valid: true; request: ProjectionRequest }
  | { valid: false; error: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, error: 'Request body must be an object.' };
  }

  const obj = input as Record<string, unknown>;

  // sessionRef is required and must be a non-empty string
  const sessionRef = obj['sessionRef'];
  if (typeof sessionRef !== 'string' || sessionRef.trim().length === 0) {
    return { valid: false, error: 'sessionRef is required and must be a non-empty string.' };
  }

  // directiveText is required and must be a non-empty string
  const directiveText = obj['directiveText'];
  if (typeof directiveText !== 'string' || directiveText.trim().length === 0) {
    return { valid: false, error: 'directiveText is required and must be a non-empty string.' };
  }

  // rollingIssueSummary is required (hidden field)
  const rollingIssueSummary = obj['rollingIssueSummary'];
  if (typeof rollingIssueSummary !== 'string') {
    return { valid: false, error: 'rollingIssueSummary is required and must be a string.' };
  }

  // sourceRefs is required and must be an array
  const sourceRefs = obj['sourceRefs'];
  if (!Array.isArray(sourceRefs)) {
    return { valid: false, error: 'sourceRefs is required and must be an array.' };
  }

  // Validate each source ref
  for (let i = 0; i < sourceRefs.length; i++) {
    const ref = sourceRefs[i];
    if (ref === null || typeof ref !== 'object' || Array.isArray(ref)) {
      return { valid: false, error: `sourceRefs[${i}] must be an object.` };
    }
    const r = ref as Record<string, unknown>;
    if (typeof r['recordId'] !== 'string' || r['recordId'].trim().length === 0) {
      return { valid: false, error: `sourceRefs[${i}].recordId is required.` };
    }
    if (typeof r['label'] !== 'string' || r['label'].trim().length === 0) {
      return { valid: false, error: `sourceRefs[${i}].label is required.` };
    }
    if (typeof r['kind'] !== 'string' || r['kind'].trim().length === 0) {
      return { valid: false, error: `sourceRefs[${i}].kind is required.` };
    }
  }

  // overlaySummaryToggles is optional — validate if present
  const toggles = obj['overlaySummaryToggles'];
  if (toggles !== undefined && toggles !== null) {
    if (typeof toggles !== 'object' || Array.isArray(toggles)) {
      return { valid: false, error: 'overlaySummaryToggles must be an object.' };
    }
    const t = toggles as Record<string, unknown>;
    const toggleKeys = ['includeDeckSummary', 'includeToolsSummary', 'includeReagentsSummary', 'includeBudgetSummary'];
    for (const key of toggleKeys) {
      if (key in t && typeof t[key] !== 'boolean') {
        return { valid: false, error: `overlaySummaryToggles.${key} must be a boolean.` };
      }
    }
  }

  // ── Reject forbidden fields ──────────────────────────────────────────
  // The contract must NOT accept run-history arrays, branch selection,
  // or compare-view payloads.
  const forbiddenKeys = ['runHistory', 'branchSelection', 'compareView', 'branchBase', 'timeline'];
  for (const key of forbiddenKeys) {
    if (key in obj) {
      return {
        valid: false,
        error: `Field '${key}' is not allowed in a latest-state projection request. This contract does not support run history, branching, or compare views.`,
      };
    }
  }

  return {
    valid: true,
    request: {
      sessionRef: sessionRef.trim(),
      directiveText: directiveText.trim(),
      rollingIssueSummary,
      sourceRefs: sourceRefs.map((r: Record<string, unknown>) => ({
        recordId: (r['recordId'] as string).trim(),
        label: (r['label'] as string).trim(),
        kind: (r['kind'] as string).trim(),
      })),
      overlaySummaryToggles: toggles
        ? {
            includeDeckSummary: (toggles as Record<string, unknown>)['includeDeckSummary'] ?? true,
            includeToolsSummary: (toggles as Record<string, unknown>)['includeToolsSummary'] ?? true,
            includeReagentsSummary: (toggles as Record<string, unknown>)['includeReagentsSummary'] ?? true,
            includeBudgetSummary: (toggles as Record<string, unknown>)['includeBudgetSummary'] ?? true,
          }
        : undefined,
      enableThinking: typeof obj['enableThinking'] === 'boolean' ? (obj['enableThinking'] as boolean) : undefined,
    },
  };
}

/**
 * Validate a ProjectionResponse payload.
 */
export function validateProjectionResponse(
  input: unknown,
):
  | { valid: true; response: ProjectionResponse }
  | { valid: false; error: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, error: 'Response body must be an object.' };
  }

  const obj = input as Record<string, unknown>;

  // status is required
  const status = obj['status'];
  if (status !== 'success' && status !== 'partial' && status !== 'failed' && status !== 'awaiting_variant_selection') {
    return { valid: false, error: 'status must be one of: success, partial, failed, awaiting_variant_selection.' };
  }

  // eventGraphData is required
  const eventGraphData = obj['eventGraphData'];
  if (eventGraphData === null || typeof eventGraphData !== 'object' || Array.isArray(eventGraphData)) {
    return { valid: false, error: 'eventGraphData is required and must be an object.' };
  }
  const egd = eventGraphData as Record<string, unknown>;
  if (typeof egd['recordId'] !== 'string') {
    return { valid: false, error: 'eventGraphData.recordId is required.' };
  }
  if (typeof egd['eventCount'] !== 'number') {
    return { valid: false, error: 'eventGraphData.eventCount is required and must be a number.' };
  }

  // evidenceMap is required
  const evidenceMap = obj['evidenceMap'];
  if (evidenceMap === null || typeof evidenceMap !== 'object' || Array.isArray(evidenceMap)) {
    return { valid: false, error: 'evidenceMap is required and must be an object.' };
  }

  // diagnostics is required and must be an array
  const diagnostics = obj['diagnostics'];
  if (!Array.isArray(diagnostics)) {
    return { valid: false, error: 'diagnostics is required and must be an array.' };
  }

  // overlaySummaries is optional but must be an object if present
  const overlaySummaries = obj['overlaySummaries'];
  if (overlaySummaries !== undefined && overlaySummaries !== null) {
    if (typeof overlaySummaries !== 'object' || Array.isArray(overlaySummaries)) {
      return { valid: false, error: 'overlaySummaries must be an object.' };
    }
  }

  // labContext is optional but must be an object with the correct shape if present
  const labContext = obj['labContext'];
  let lc: Record<string, unknown> | undefined;
  let src: Record<string, unknown> | undefined;
  if (labContext !== undefined && labContext !== null) {
    if (typeof labContext !== 'object' || Array.isArray(labContext)) {
      return { valid: false, error: 'labContext must be an object.' };
    }
    lc = labContext as Record<string, unknown>;
    // labwareKind is required
    if (typeof lc['labwareKind'] !== 'string') {
      return { valid: false, error: 'labContext.labwareKind is required and must be a string.' };
    }
    // plateCount is required and must be a number
    if (typeof lc['plateCount'] !== 'number') {
      return { valid: false, error: 'labContext.plateCount is required and must be a number.' };
    }
    // sampleCount is required and must be a number
    if (typeof lc['sampleCount'] !== 'number') {
      return { valid: false, error: 'labContext.sampleCount is required and must be a number.' };
    }
    // source is required and must be an object
    const source = lc['source'];
    if (source === null || typeof source !== 'object' || Array.isArray(source)) {
      return { valid: false, error: 'labContext.source is required and must be an object.' };
    }
    src = source as Record<string, unknown>;
    const sourceKeys = ['labwareKind', 'plateCount', 'sampleCount'];
    const validSources = ['default', 'directive', 'manual'];
    for (const key of sourceKeys) {
      if (!(key in src) || !validSources.includes(src[key] as string)) {
        return { valid: false, error: `labContext.source.${key} must be one of: ${validSources.join(', ')}.` };
      }
    }
  }

  // ── Reject forbidden fields ──────────────────────────────────────────
  const forbiddenKeys = ['runHistory', 'branchSelection', 'compareView', 'branchBase', 'timeline'];
  for (const key of forbiddenKeys) {
    if (key in obj) {
      return {
        valid: false,
        error: `Field '${key}' is not allowed in a latest-state projection response.`,
      };
    }
  }

  return {
    valid: true,
    response: {
      status: status as 'success' | 'partial' | 'failed' | 'awaiting_variant_selection',
      eventGraphData: {
        recordId: (egd['recordId'] as string).trim(),
        eventCount: egd['eventCount'] as number,
        description: typeof egd['description'] === 'string' ? (egd['description'] as string).trim() : '',
      },
      projectedProtocolRef: typeof obj['projectedProtocolRef'] === 'string' ? (obj['projectedProtocolRef'] as string) : undefined,
      projectedRunRef: typeof obj['projectedRunRef'] === 'string' ? (obj['projectedRunRef'] as string) : undefined,
      evidenceMap: evidenceMap as EvidenceMap,
      overlaySummaries: overlaySummaries as ProjectionResponse['overlaySummaries'] ?? {},
      diagnostics: diagnostics as CompactDiagnostic[],
      labContext: labContext !== undefined && labContext !== null
        ? {
            labwareKind: (lc['labwareKind'] as string).trim(),
            plateCount: lc['plateCount'] as number,
            sampleCount: lc['sampleCount'] as number,
            source: {
              labwareKind: (src['labwareKind'] as 'default' | 'directive' | 'manual'),
              plateCount: (src['plateCount'] as 'default' | 'directive' | 'manual'),
              sampleCount: (src['sampleCount'] as 'default' | 'directive' | 'manual'),
            },
          }
        : undefined,
      awaitingVariantSelection: obj['awaitingVariantSelection'] !== undefined && obj['awaitingVariantSelection'] !== null
        ? {
            extractionDraftRef: (obj['awaitingVariantSelection'] as Record<string, unknown>)['extractionDraftRef'] as string,
            variants: (obj['awaitingVariantSelection'] as Record<string, unknown>)['variants'] as VariantSummary[],
          }
        : undefined,
    },
  };
}
