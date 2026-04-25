/**
 * Curated vendor configuration for Protocol IDE discovery.
 *
 * This allowlist restricts vendor search to document- and PDF-oriented
 * results rather than generic product catalog search.  The list is
 * intentionally scoped in v1 and easy to extend later.
 *
 * Runtime vendor membership is backed by the YAML registry
 * (schema/registry/curated-vendors/).  The `ProtocolIdeVendorId` type
 * remains a string union for compile-time autocomplete.
 */

import { getCuratedVendorRegistry } from '../registry/CuratedVendorRegistry.js';

// ---------------------------------------------------------------------------
// Vendor identifiers used by the Protocol IDE discovery layer.
// ---------------------------------------------------------------------------

export type ProtocolIdeVendorId =
  | 'thermo'
  | 'sigma'
  | 'fisher'
  | 'vwr'
  | 'cayman'
  | 'thomas';

// ---------------------------------------------------------------------------
// Document-oriented result shape for Protocol IDE picker.
// ---------------------------------------------------------------------------

export type ProtocolIdeDocumentResult = {
  /** Stable vendor identifier (e.g. 'thermo') */
  vendor: ProtocolIdeVendorId;
  /** Human-readable document title */
  title: string;
  /** Direct URL to the PDF document (if available) */
  pdfUrl?: string;
  /** Landing / product page URL */
  landingUrl: string;
  /** Short snippet or summary text for the picker */
  snippet?: string;
  /** Document type classification */
  documentType: 'protocol' | 'application_note' | 'white_paper' | 'manual' | 'other';
  /** Stable identifier for session creation */
  sessionIdHint?: string;
};

// ---------------------------------------------------------------------------
// Helper: check whether a vendor is in the curated list.
// ---------------------------------------------------------------------------

export function isCuratedVendor(vendor: string): vendor is ProtocolIdeVendorId {
  return getCuratedVendorRegistry().get(vendor) !== undefined;
}

// ---------------------------------------------------------------------------
// Helper: filter a vendor name string against the curated list.
// ---------------------------------------------------------------------------

export function filterCuratedVendors(vendors: string[]): ProtocolIdeVendorId[] {
  return vendors.filter(isCuratedVendor);
}
