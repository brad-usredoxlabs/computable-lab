/**
 * JsonLdIndex — sqlite FTS5 store for the JSON-LD projection of records.
 *
 * This is the substrate behind `/browser` advanced search and the shared
 * slash menu's `/m /l /p` lookups. It is intentionally in-process: one
 * `index.sqlite` file under the workspace, no sidecar service, and a single
 * implementation handles writes (from `RecordStore` hooks), full rebuilds,
 * and reads.
 *
 * Update model:
 * - `upsert(doc)` replaces the row + its facets + its refs + its FTS row in
 *   a single transaction; the `tombstone` flag is cleared.
 * - `tombstone(recordId)` flips the row to tombstone and purges facets/refs/
 *   FTS content; the row stays so streaming consumers can observe the
 *   deletion. (Phase 1 has no streaming consumer yet — it costs nothing.)
 *
 * Query model:
 * - Full-text via the FTS5 virtual table; results joined back to `records`
 *   by rowid for type/facet/ref filters.
 * - Facet equality filters compile to `EXISTS` subqueries against
 *   `record_facets` so the SQL is small regardless of facet count.
 * - Facet counts are computed in a second pass over the unpaged result set.
 */

import Database, { type Database as Db } from 'better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { migrate } from './schema.js';
import type {
  FacetValue,
  IndexableDoc,
  JsonLdHit,
  JsonLdQuery,
  JsonLdSearchResponse,
  RecordIndexer,
} from './types.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export interface JsonLdIndexOptions {
  /** Absolute path to the sqlite file. Parent dir is created if missing. */
  dbPath: string;
}

export class JsonLdIndex implements RecordIndexer {
  private readonly db: Db;

  constructor(options: JsonLdIndexOptions) {
    mkdirSync(dirname(options.dbPath), { recursive: true });
    this.db = new Database(options.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    migrate(this.db);
  }

  /** Close the underlying sqlite handle. */
  close(): void {
    this.db.close();
  }

  /**
   * Fetch refs for a set of record ids from the record_refs table.
   * Returns a map from record_id to its outgoing references.
   */
  getRefs(
    recordIds: string[],
  ): Map<string, Array<{ recordId: string; kind?: string }>> {
    const out = new Map<string, Array<{ recordId: string; kind?: string }>>();
    if (recordIds.length === 0) return out;
    const placeholders = recordIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare<string[], { record_id: string; target_id: string; target_kind: string | null }>(
        `SELECT record_id, target_id, target_kind FROM record_refs
          WHERE record_id IN (${placeholders})`,
      )
      .all(...recordIds);
    for (const r of rows) {
      const entry: { recordId: string; kind?: string } = { recordId: r.target_id };
      if (r.target_kind) {
        entry.kind = r.target_kind;
      }
      let bucket = out.get(r.record_id);
      if (!bucket) {
        bucket = [];
        out.set(r.record_id, bucket);
      }
      bucket.push(entry);
    }
    return out;
  }

  /** Total number of live (non-tombstoned) records currently indexed. */
  size(): number {
    const row = this.db
      .prepare<unknown[], { c: number }>(
        `SELECT COUNT(*) AS c FROM records WHERE tombstone = 0`,
      )
      .get();
    return row?.c ?? 0;
  }

  // ---- Writes -------------------------------------------------------------

  upsert(doc: IndexableDoc): void {
    const tx = this.db.transaction(() => {
      this.purgeAuxiliary(doc.recordId);

      const insertRecord = this.db.prepare(
        `INSERT INTO records (record_id, json_ld_id, kind, primary_type, types_json, label, updated_at, tombstone)
         VALUES (@record_id, @json_ld_id, @kind, @primary_type, @types_json, @label, @updated_at, 0)
         ON CONFLICT(record_id) DO UPDATE SET
           json_ld_id   = excluded.json_ld_id,
           kind         = excluded.kind,
           primary_type = excluded.primary_type,
           types_json   = excluded.types_json,
           label        = excluded.label,
           updated_at   = excluded.updated_at,
           tombstone    = 0`,
      );
      insertRecord.run({
        record_id: doc.recordId,
        json_ld_id: doc.jsonLdId,
        kind: doc.kind,
        primary_type: doc.types[0] ?? doc.kind,
        types_json: JSON.stringify(doc.types),
        label: doc.label,
        updated_at: doc.updatedAt,
      });

      const rowid = this.getRowId(doc.recordId);

      // Refresh FTS content for this rowid.
      this.db.prepare(`DELETE FROM records_fts WHERE rowid = ?`).run(rowid);
      this.db
        .prepare(`INSERT INTO records_fts(rowid, full_text) VALUES (?, ?)`)
        .run(rowid, doc.fullText);

      // Facets — fan out multivalued.
      const insertFacet = this.db.prepare(
        `INSERT OR IGNORE INTO record_facets(record_id, field, value) VALUES (?, ?, ?)`,
      );
      for (const [field, values] of Object.entries(doc.facets)) {
        for (const v of values) {
          insertFacet.run(doc.recordId, field, facetToString(v));
        }
      }

      // Refs.
      const insertRef = this.db.prepare(
        `INSERT OR IGNORE INTO record_refs(record_id, target_id, target_kind) VALUES (?, ?, ?)`,
      );
      for (const ref of doc.refs) {
        insertRef.run(doc.recordId, ref.recordId, ref.kind ?? null);
      }
    });
    tx();
  }

  tombstone(recordId: string): void {
    const tx = this.db.transaction(() => {
      const rowid = this.getRowIdOrNull(recordId);
      if (rowid === null) return;
      this.purgeAuxiliary(recordId);
      this.db.prepare(`DELETE FROM records_fts WHERE rowid = ?`).run(rowid);
      this.db
        .prepare(`UPDATE records SET tombstone = 1 WHERE rowid = ?`)
        .run(rowid);
    });
    tx();
  }

  /** Wipe everything; used by reindex. */
  clear(): void {
    const tx = this.db.transaction(() => {
      this.db.exec(`DELETE FROM records_fts`);
      this.db.exec(`DELETE FROM record_facets`);
      this.db.exec(`DELETE FROM record_refs`);
      this.db.exec(`DELETE FROM records`);
    });
    tx();
  }

  // ---- Reads --------------------------------------------------------------

  query(query: JsonLdQuery): JsonLdSearchResponse {
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = decodeCursor(query.cursor);

    const filters = this.buildFilters(query);
    const allFilters = ['r.tombstone = 0', ...filters.where];

    let fromClause = `records r`;
    if (query.q !== undefined && query.q.trim().length > 0) {
      fromClause += ` JOIN records_fts fts ON fts.rowid = r.rowid`;
      allFilters.push(`fts.full_text MATCH @q`);
      filters.params.q = sanitizeFtsQuery(query.q);
    }

    const whereSql = `WHERE ${allFilters.join(' AND ')}`;

    // Count total (unpaged) first — used for facet computation and response.
    const totalRow = this.db
      .prepare<Record<string, unknown>, { c: number }>(
        `SELECT COUNT(*) AS c FROM ${fromClause} ${whereSql}`,
      )
      .get(filters.params);
    const total = totalRow?.c ?? 0;

    // Page of hits.
    const hitsSql =
      query.q !== undefined && query.q.trim().length > 0
        ? `SELECT r.record_id, r.json_ld_id, r.kind, r.label, r.updated_at,
                  snippet(records_fts, 0, '<mark>', '</mark>', '…', 24) AS snippet,
                  bm25(records_fts) AS score
             FROM ${fromClause} ${whereSql}
             ORDER BY score ASC
             LIMIT @limit OFFSET @offset`
        : `SELECT r.record_id, r.json_ld_id, r.kind, r.label, r.updated_at,
                  NULL AS snippet, NULL AS score
             FROM ${fromClause} ${whereSql}
             ORDER BY r.updated_at DESC, r.record_id ASC
             LIMIT @limit OFFSET @offset`;

    const rows = this.db
      .prepare<
        Record<string, unknown>,
        {
          record_id: string;
          json_ld_id: string;
          kind: string;
          label: string;
          updated_at: string | null;
          snippet: string | null;
        }
      >(hitsSql)
      .all({ ...filters.params, limit, offset });

    const recordIds = rows.map((r) => r.record_id);
    const facetsByRecord = this.fetchFacetsForRecords(recordIds);
    const hits: JsonLdHit[] = rows.map((row) => {
      const hit: JsonLdHit = {
        recordId: row.record_id,
        jsonLdId: row.json_ld_id,
        kind: row.kind,
        label: row.label,
        facets: facetsByRecord.get(row.record_id) ?? {},
        updatedAt: row.updated_at,
      };
      if (row.snippet) hit.snippet = row.snippet;
      return hit;
    });

    const facetCounts = this.computeFacetCounts(fromClause, whereSql, filters.params);

    const response: JsonLdSearchResponse = { hits, total, facetCounts };
    if (offset + hits.length < total) {
      response.nextCursor = encodeCursor(offset + hits.length);
    }
    return response;
  }

  // ---- Internals ----------------------------------------------------------

  private getRowId(recordId: string): number {
    const row = this.db
      .prepare<[string], { rowid: number }>(
        `SELECT rowid FROM records WHERE record_id = ?`,
      )
      .get(recordId);
    if (!row) {
      throw new Error(`JsonLdIndex: row missing for record_id=${recordId}`);
    }
    return row.rowid;
  }

  private getRowIdOrNull(recordId: string): number | null {
    const row = this.db
      .prepare<[string], { rowid: number }>(
        `SELECT rowid FROM records WHERE record_id = ?`,
      )
      .get(recordId);
    return row?.rowid ?? null;
  }

  private purgeAuxiliary(recordId: string): void {
    this.db
      .prepare(`DELETE FROM record_facets WHERE record_id = ?`)
      .run(recordId);
    this.db
      .prepare(`DELETE FROM record_refs WHERE record_id = ?`)
      .run(recordId);
  }

  private buildFilters(query: JsonLdQuery): {
    where: string[];
    params: Record<string, unknown>;
  } {
    const where: string[] = [];
    const params: Record<string, unknown> = {};

    if (query.type !== undefined) {
      const kinds = Array.isArray(query.type) ? query.type : [query.type];
      if (kinds.length > 0) {
        const placeholders = kinds.map((_, i) => `@kind${i}`).join(', ');
        where.push(`r.kind IN (${placeholders})`);
        kinds.forEach((kind, i) => {
          params[`kind${i}`] = kind;
        });
      }
    }

    if (query.facets) {
      let i = 0;
      for (const [field, raw] of Object.entries(query.facets)) {
        const values = Array.isArray(raw) ? raw : [raw];
        if (values.length === 0) continue;
        const valuePlaceholders = values
          .map((_, j) => `@facetv_${i}_${j}`)
          .join(', ');
        where.push(
          `EXISTS (SELECT 1 FROM record_facets f${i}
             WHERE f${i}.record_id = r.record_id
               AND f${i}.field = @facetf_${i}
               AND f${i}.value IN (${valuePlaceholders}))`,
        );
        params[`facetf_${i}`] = field;
        values.forEach((v, j) => {
          params[`facetv_${i}_${j}`] = facetToString(v);
        });
        i++;
      }
    }

    if (query.refs && query.refs.length > 0) {
      const placeholders = query.refs.map((_, i) => `@ref${i}`).join(', ');
      where.push(
        `EXISTS (SELECT 1 FROM record_refs rr
            WHERE rr.record_id = r.record_id
              AND rr.target_id IN (${placeholders}))`,
      );
      query.refs.forEach((id, i) => {
        params[`ref${i}`] = id;
      });
    }

    return { where, params };
  }

  private fetchFacetsForRecords(
    recordIds: string[],
  ): Map<string, Record<string, FacetValue[]>> {
    const out = new Map<string, Record<string, FacetValue[]>>();
    if (recordIds.length === 0) return out;
    const placeholders = recordIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare<string[], { record_id: string; field: string; value: string }>(
        `SELECT record_id, field, value FROM record_facets
          WHERE record_id IN (${placeholders})`,
      )
      .all(...recordIds);
    for (const r of rows) {
      let bucket = out.get(r.record_id);
      if (!bucket) {
        bucket = {};
        out.set(r.record_id, bucket);
      }
      const list = bucket[r.field] ?? [];
      list.push(parseFacetString(r.value));
      bucket[r.field] = list;
    }
    return out;
  }

  private computeFacetCounts(
    fromClause: string,
    whereSql: string,
    params: Record<string, unknown>,
  ): Record<string, Array<{ value: FacetValue; count: number }>> {
    const rows = this.db
      .prepare<
        Record<string, unknown>,
        { field: string; value: string; c: number }
      >(
        `SELECT f.field AS field, f.value AS value, COUNT(*) AS c
           FROM ${fromClause}
           JOIN record_facets f ON f.record_id = r.record_id
           ${whereSql}
           GROUP BY f.field, f.value
           ORDER BY f.field ASC, c DESC`,
      )
      .all(params);

    const out: Record<string, Array<{ value: FacetValue; count: number }>> = {};
    for (const row of rows) {
      const list = out[row.field] ?? [];
      list.push({ value: parseFacetString(row.value), count: row.c });
      out[row.field] = list;
    }
    return out;
  }
}

// ---- helpers --------------------------------------------------------------

function facetToString(v: FacetValue): string {
  // Numbers and booleans are serialized with a discriminator so they survive
  // the round-trip into facet counts without becoming strings.
  if (typeof v === 'number') return `n:${v}`;
  if (typeof v === 'boolean') return `b:${v ? '1' : '0'}`;
  return `s:${v}`;
}

function parseFacetString(s: string): FacetValue {
  if (s.startsWith('n:')) {
    const n = Number(s.slice(2));
    return Number.isNaN(n) ? s.slice(2) : n;
  }
  if (s.startsWith('b:')) return s.slice(2) === '1';
  if (s.startsWith('s:')) return s.slice(2);
  return s;
}

/**
 * Sanitize FTS5 query strings so user input can be passed directly. We
 * accept the user's words but strip operators that would let them
 * accidentally produce invalid syntax (unmatched parens, bare prefix
 * operators) which would otherwise throw at query time. We deliberately
 * stop short of a full FTS5 parser — power users can still wrap individual
 * tokens in quotes if they need exact phrasing.
 */
function sanitizeFtsQuery(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Strip control characters; collapse whitespace; drop bare punctuation
  // that FTS5 treats as syntactic but the user almost certainly meant as
  // a literal.
  const tokens = trimmed
    .replace(/[\x00-\x1f]/g, ' ')
    .replace(/["()*:^<>-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return '';
  // Prefix-match every token so users typing "tris" match "tris-hcl" too.
  return tokens.map((t) => `${t}*`).join(' ');
}

function encodeCursor(offset: number): string {
  return Buffer.from(`offset:${offset}`).toString('base64url');
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    if (decoded.startsWith('offset:')) {
      const n = Number(decoded.slice('offset:'.length));
      if (Number.isFinite(n) && n >= 0) return Math.floor(n);
    }
  } catch {
    // fall through
  }
  return 0;
}
