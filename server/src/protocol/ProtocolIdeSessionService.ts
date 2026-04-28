/**
 * ProtocolIdeSessionService — manages Protocol IDE session lifecycle.
 *
 * This service is responsible for:
 * - Creating new protocol-ide-session records from intake requests
 * - Enforcing the one-source-per-session invariant
 * - Persisting sessions via the record store
 * - Returning shell-ready session metadata
 *
 * Import and projection details belong to later specs.
 */

import type { RecordStore, StoreResult } from '../store/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type {
  ProtocolIdeIntakeRequest,
  ProtocolIdeSource,
} from './ProtocolIdeIntakeContracts.js';

// ---------------------------------------------------------------------------
// Session status constants
// ---------------------------------------------------------------------------

/** Initial status assigned when a session is bootstrapped */
const SESSION_STATUS_IMPORTING = 'importing' as const;

/** Schema ID for protocol-ide-session records */
const PROTOCOL_IDE_SESSION_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/workflow/protocol-ide-session.schema.yaml';

// ---------------------------------------------------------------------------
// Source-mode mapping: intake sourceKind → session sourceMode
// ---------------------------------------------------------------------------

function intakeSourceKindToSessionSourceMode(
  sourceKind: string,
): 'vendor_search' | 'pdf_url' | 'upload' | 'directive' {
  switch (sourceKind) {
    case 'vendor_document':
      return 'vendor_search';
    case 'pasted_url':
      return 'pdf_url';
    case 'uploaded_pdf':
      return 'upload';
    default:
      return 'directive';
  }
}

// ---------------------------------------------------------------------------
// Source summary helpers
// ---------------------------------------------------------------------------

function buildSourceSummary(source: ProtocolIdeSource): string {
  switch (source.sourceKind) {
    case 'vendor_document':
      return `${source.vendor} — ${source.title}`;
    case 'pasted_url':
      return `PDF URL: ${source.url}`;
    case 'uploaded_pdf':
      return `Uploaded: ${source.fileName}`;
  }
}

// ---------------------------------------------------------------------------
// Session creation payload builder
// ---------------------------------------------------------------------------

function buildSessionEnvelope(
  sessionId: string,
  request: ProtocolIdeIntakeRequest,
): RecordEnvelope {
  const source = request.source;
  const sourceMode = intakeSourceKindToSessionSourceMode(source.sourceKind);

  // Only include fields the schema knows about, and only when they have
  // meaningful values. The schema uses additionalProperties:false and
  // expects refs / URIs to be objects/strings — never null — so pending
  // fields are simply omitted and added later by import/projection steps.
  const payload: Record<string, unknown> = {
    kind: 'protocol-ide-session',
    recordId: sessionId,
    sourceMode,
    status: SESSION_STATUS_IMPORTING,
    latestDirectiveText: request.directiveText,
    sourceSummary: buildSourceSummary(source),
    evidenceRefs: [],
    rollingIssueSummary: '',
    issueCardRefs: [],
    notes: `Session bootstrapped from ${source.sourceKind} source.`,
  };

  // Populate source-specific fields (only when present)
  switch (source.sourceKind) {
    case 'vendor_document':
      payload.vendor = source.vendor;
      payload.title = source.title;
      if (source.pdfUrl) payload.pdfUrl = source.pdfUrl;
      payload.landingUrl = source.landingUrl;
      break;
    case 'pasted_url':
      payload.pdfUrl = source.url;
      break;
    case 'uploaded_pdf':
      payload.uploadedAssetRef = {
        file_name: source.fileName,
        media_type: source.mediaType,
        size_bytes: 0, // will be set by upload service
      };
      break;
  }

  return {
    schemaId: PROTOCOL_IDE_SESSION_SCHEMA_ID,
    recordId: sessionId,
    payload,
    meta: {
      kind: 'protocol-ide-session',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Shell-ready response shape
// ---------------------------------------------------------------------------

export interface ProtocolIdeSessionShellResponse {
  sessionId: string;
  status: string;
  sourceSummary: string;
  latestDirectiveText: string;
  sourceEvidenceRef: null;
  graphReviewRef: null;
  issueCardsRef: null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ProtocolIdeSessionService {
  constructor(private store: RecordStore) {}

  /**
   * Bootstrap a new Protocol IDE session from an intake request.
   *
   * Enforces:
   * - One session per source PDF (new source → new session)
   * - Non-empty directive text
   * - Valid intake payload
   *
   * @param request — validated intake request
   * @returns shell-ready session metadata
   */
  async bootstrapSession(
    request: ProtocolIdeIntakeRequest,
  ): Promise<ProtocolIdeSessionShellResponse> {
    // Generate a unique session ID
    const sessionId = `PIS-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // Build the session envelope
    const envelope = buildSessionEnvelope(sessionId, request);

    // Persist the session
    const result = await this.store.create({
      envelope,
      message: `Create protocol-ide-session ${sessionId} from ${request.source.sourceKind} source`,
      skipLint: true,
    });

    if (!result.success) {
      throw new Error(
        `Failed to persist session ${sessionId}: ${result.error ?? 'unknown error'}`,
      );
    }

    // Build shell-ready response
    return {
      sessionId,
      status: SESSION_STATUS_IMPORTING,
      sourceSummary: buildSourceSummary(request.source),
      latestDirectiveText: request.directiveText,
      sourceEvidenceRef: null,
      graphReviewRef: null,
      issueCardsRef: null,
    };
  }

  /**
   * Check whether a session already exists for a given source hint.
   *
   * This is used by the handler to reject attempts to attach a second source
   * to an existing session.
   *
   * @param sessionIdHint — optional hint from the intake source
   * @returns the existing session envelope if found, null otherwise
   */
  async getSessionByHint(
    sessionIdHint: string | undefined,
  ): Promise<RecordEnvelope | null> {
    if (!sessionIdHint) {
      return null;
    }

    // Look up by recordId prefix
    const sessions = await this.store.list({
      kind: 'protocol-ide-session',
      idPrefix: sessionIdHint,
      limit: 1,
    });

    return sessions.length > 0 ? sessions[0] : null;
  }

  /**
   * Get a session by its record ID.
   */
  async getSession(sessionId: string): Promise<RecordEnvelope | null> {
    return this.store.get(sessionId);
  }
}
