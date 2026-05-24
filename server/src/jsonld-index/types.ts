/**
 * Public types for the JSON-LD index — the substrate behind `/browser`'s
 * advanced search and the shared slash menu's `/m /l /p` lookups.
 *
 * The query DSL is small on purpose: full-text, type filter, facets, refs,
 * paging. Anything more complex (joins across record types, range queries
 * with units) is out of scope for Phase 1 and lives in dedicated endpoints
 * if it ever becomes load-bearing.
 */

/** Flat, index-ready projection of a record. Output of `JsonLdProjector`. */
export interface IndexableDoc {
  /** Canonical record identity (e.g. "MAT-000123"). */
  recordId: string;
  /** JSON-LD @id IRI derived from recordId. */
  jsonLdId: string;
  /** JSON-LD @type IRI(s). The first entry is the primary type used for filtering. */
  types: string[];
  /** Short kind discriminator from payload (e.g. "material", "labware"). */
  kind: string;
  /** Best human label — title || name || label || recordId. */
  label: string;
  /** Concatenated string content for FTS5 (label, all string fields, refs' labels). */
  fullText: string;
  /** Facet values keyed by ui.yaml column path (e.g. "$.vendor", "$.pH"). */
  facets: Record<string, FacetValue[]>;
  /** Referenced record ids extracted from payload. */
  refs: Array<{ recordId: string; kind?: string }>;
  /** ISO timestamp of last record update; populated from envelope.meta when present. */
  updatedAt: string | null;
}

/** A facet value is either a scalar (number/string/bool) or a small object snapshot. */
export type FacetValue = string | number | boolean;

/** Query DSL submitted to `POST /api/search/jsonld`. */
export interface JsonLdQuery {
  /** Full-text search string. FTS5 syntax is accepted; users get a sanitized form. */
  q?: string;
  /** Restrict to one or more record kinds (e.g. ["material", "labware"]). */
  type?: string | string[];
  /**
   * Facet equality filters. `{ vendor: "Sigma" }` matches when `$.vendor === "Sigma"`.
   * Arrays are OR-equality (`{ vendor: ["Sigma", "Merck"] }`).
   */
  facets?: Record<string, FacetValue | FacetValue[]>;
  /** Only hits that reference at least one of the given record ids. */
  refs?: string[];
  /** Limit per page. Defaults to 50, capped at 500. */
  limit?: number;
  /** Opaque pagination cursor returned from a previous response. */
  cursor?: string;
}

/** One hit in the search response. */
export interface JsonLdHit {
  recordId: string;
  jsonLdId: string;
  kind: string;
  label: string;
  /** A short FTS5 snippet of the matched content, when `q` is supplied. */
  snippet?: string;
  facets: Record<string, FacetValue[]>;
  updatedAt: string | null;
}

/** Response shape for the search endpoint. */
export interface JsonLdSearchResponse {
  hits: JsonLdHit[];
  total: number;
  /** Counts per facet field/value combo computed within the result set. */
  facetCounts: Record<string, Array<{ value: FacetValue; count: number }>>;
  /** Opaque cursor for the next page; absent when no more results. */
  nextCursor?: string;
}

/** Hook interface implemented by `JsonLdIndex` and consumed by `RecordStore`. */
export interface RecordIndexer {
  upsert(doc: IndexableDoc): void;
  tombstone(recordId: string): void;
}
