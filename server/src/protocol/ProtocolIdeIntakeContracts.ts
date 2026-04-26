/**
 * Protocol IDE intake contracts.
 *
 * These types define the shape of a Protocol IDE creation request.
 * The request must accept **exactly one** source mode:
 *   1. A selected vendor document result (from curated search)
 *   2. A pasted PDF URL
 *   3. An uploaded PDF reference
 *
 * Every request must also carry `directiveText`.
 */

import type { ProtocolIdeVendorId } from '../vendor-documents/protocolIdeVendors.js';

// ---------------------------------------------------------------------------
// Shared fields
// ---------------------------------------------------------------------------

/** Human-readable directive that guides the Protocol IDE session */
export type DirectiveText = string;

// ---------------------------------------------------------------------------
// Source mode: selected vendor document result
// ---------------------------------------------------------------------------

export type VendorDocumentSource = {
  /** Discriminant – must be 'vendor_document' */
  sourceKind: 'vendor_document';
  /** Vendor identifier */
  vendor: ProtocolIdeVendorId;
  /** Document title */
  title: string;
  /** Direct PDF URL (if available) */
  pdfUrl?: string;
  /** Landing / product page URL */
  landingUrl: string;
  /** Short snippet or summary */
  snippet?: string;
  /** Document type */
  documentType: string;
  /** Stable identifier for session creation */
  sessionIdHint?: string;
};

// ---------------------------------------------------------------------------
// Source mode: pasted PDF URL
// ---------------------------------------------------------------------------

export type PastedUrlSource = {
  /** Discriminant – must be 'pasted_url' */
  sourceKind: 'pasted_url';
  /** The pasted PDF URL */
  url: string;
};

// ---------------------------------------------------------------------------
// Source mode: uploaded PDF reference
// ---------------------------------------------------------------------------

export type UploadedPdfSource = {
  /** Discriminant – must be 'uploaded_pdf' */
  sourceKind: 'uploaded_pdf';
  /** Server-side reference to the uploaded PDF */
  uploadId: string;
  /** Original file name */
  fileName: string;
  /** MIME type of the uploaded file */
  mediaType: string;
  /** Base64-encoded PDF bytes (stripped of data-URI prefix) */
  contentBase64: string;
};

// ---------------------------------------------------------------------------
// Union type – exactly one source mode must be present
// ---------------------------------------------------------------------------

export type ProtocolIdeSource =
  | VendorDocumentSource
  | PastedUrlSource
  | UploadedPdfSource;

// ---------------------------------------------------------------------------
// Full intake request
// ---------------------------------------------------------------------------

export type ProtocolIdeIntakeRequest = {
  /** The directive that guides the session */
  directiveText: DirectiveText;
  /** Exactly one source mode */
  source: ProtocolIdeSource;
  /** Per-request thinking-mode override for LLM calls during session creation */
  enableThinking?: boolean;
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a ProtocolIdeIntakeRequest has exactly one source mode
 * and a non-empty directiveText.
 */
export function validateIntakeRequest(
  input: unknown,
): { valid: true; request: ProtocolIdeIntakeRequest } | { valid: false; error: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, error: 'Request body must be an object.' };
  }

  const obj = input as Record<string, unknown>;

  // directiveText is required and must be a non-empty string
  const directiveText = obj['directiveText'];
  if (
    typeof directiveText !== 'string' ||
    directiveText.trim().length === 0
  ) {
    return { valid: false, error: 'directiveText is required and must be a non-empty string.' };
  }

  // source is required
  const source = obj['source'];
  if (source === undefined || source === null || typeof source !== 'object') {
    return { valid: false, error: 'source is required.' };
  }

  const src = source as Record<string, unknown>;
  const sourceKind = src['sourceKind'];

  if (typeof sourceKind !== 'string') {
    return { valid: false, error: 'source.sourceKind must be a string.' };
  }

  // Validate exactly one source mode
  switch (sourceKind) {
    case 'vendor_document': {
      const vendor = src['vendor'];
      const title = src['title'];
      const landingUrl = src['landingUrl'];
      if (typeof vendor !== 'string' || vendor.trim().length === 0) {
        return { valid: false, error: 'vendor_document.source.vendor is required.' };
      }
      if (typeof title !== 'string' || title.trim().length === 0) {
        return { valid: false, error: 'vendor_document.source.title is required.' };
      }
      if (typeof landingUrl !== 'string' || landingUrl.trim().length === 0) {
        return { valid: false, error: 'vendor_document.source.landingUrl is required.' };
      }
      return {
        valid: true,
        request: {
          directiveText: directiveText.trim(),
          source: {
            sourceKind: 'vendor_document',
            vendor: vendor as ProtocolIdeVendorId,
            title: title.trim(),
            pdfUrl: typeof src['pdfUrl'] === 'string' ? src['pdfUrl'] : undefined,
            landingUrl: landingUrl.trim(),
            snippet: typeof src['snippet'] === 'string' ? src['snippet'] : undefined,
            documentType: typeof src['documentType'] === 'string' ? src['documentType'] : 'other',
            sessionIdHint: typeof src['sessionIdHint'] === 'string' ? src['sessionIdHint'] : undefined,
          },
          ...(typeof obj['enableThinking'] === 'boolean' ? { enableThinking: obj['enableThinking'] as boolean } : {}),
        },
      };
    }

    case 'pasted_url': {
      const url = src['url'];
      if (typeof url !== 'string' || url.trim().length === 0) {
        return { valid: false, error: 'pasted_url.source.url is required.' };
      }
      return {
        valid: true,
        request: {
          directiveText: directiveText.trim(),
          source: {
            sourceKind: 'pasted_url',
            url: url.trim(),
          },
          ...(typeof obj['enableThinking'] === 'boolean' ? { enableThinking: obj['enableThinking'] as boolean } : {}),
        },
      };
    }

    case 'uploaded_pdf': {
      const uploadId = src['uploadId'];
      const fileName = src['fileName'];
      const mediaType = src['mediaType'];
      const contentBase64 = src['contentBase64'];
      if (typeof uploadId !== 'string' || uploadId.trim().length === 0) {
        return { valid: false, error: 'uploaded_pdf.source.uploadId is required.' };
      }
      if (typeof fileName !== 'string' || fileName.trim().length === 0) {
        return { valid: false, error: 'uploaded_pdf.source.fileName is required.' };
      }
      if (typeof mediaType !== 'string' || mediaType.trim().length === 0) {
        return { valid: false, error: 'uploaded_pdf.source.mediaType is required.' };
      }
      if (typeof contentBase64 !== 'string' || contentBase64.trim().length === 0) {
        return { valid: false, error: 'uploaded_pdf.source.contentBase64 is required.' };
      }
      return {
        valid: true,
        request: {
          directiveText: directiveText.trim(),
          source: {
            sourceKind: 'uploaded_pdf',
            uploadId: uploadId.trim(),
            fileName: fileName.trim(),
            mediaType: mediaType.trim(),
            contentBase64: contentBase64.trim(),
          },
          ...(typeof obj['enableThinking'] === 'boolean' ? { enableThinking: obj['enableThinking'] as boolean } : {}),
        },
      };
    }

    default:
      return {
        valid: false,
        error: `Unknown sourceKind '${sourceKind}'. Must be one of: vendor_document, pasted_url, uploaded_pdf.`,
      };
  }
}

/**
 * Check that exactly one source mode is present (no ambiguity).
 * This is enforced by the discriminated union, but the helper is
 * available for callers that receive a raw object.
 */
export function hasExactlyOneSourceMode(obj: Record<string, unknown>): boolean {
  const kinds = [
    obj['sourceKind'] === 'vendor_document',
    obj['sourceKind'] === 'pasted_url',
    obj['sourceKind'] === 'uploaded_pdf',
  ];
  return kinds.filter(Boolean).length === 1;
}
