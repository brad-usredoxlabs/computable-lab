/**
 * SQLite schema + migrations for the JSON-LD index.
 *
 * Tables:
 * - `schema_version` — single-row migration tracker.
 * - `records`        — one row per record; tombstones stay here so callers
 *                      can detect deletes when streaming changes.
 * - `records_fts`    — FTS5 virtual table mirroring `records.full_text`;
 *                      tied to records by rowid so JOIN ... ON r.rowid = fts.rowid
 *                      is the only retrieval pattern.
 * - `record_facets`  — wide table of (record_id, field, value) tuples. One
 *                      row per facet value (multivalued facets fan out).
 *                      Indexed by (field, value) for fast equality filtering
 *                      and by record_id for purge-on-upsert.
 * - `record_refs`    — (record_id, target_id) tuples. Indexed both ways.
 *
 * Indexes are deliberately conservative: this index is small (single-digit
 * MB for 166 records), so over-indexing costs nothing meaningful.
 */

import type { Database } from 'better-sqlite3';

export const CURRENT_VERSION = 1;

const MIGRATIONS: Array<{ version: number; statements: string[] }> = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_version (
         version INTEGER PRIMARY KEY
       )`,
      `CREATE TABLE IF NOT EXISTS records (
         rowid       INTEGER PRIMARY KEY AUTOINCREMENT,
         record_id   TEXT NOT NULL UNIQUE,
         json_ld_id  TEXT NOT NULL,
         kind        TEXT NOT NULL,
         primary_type TEXT NOT NULL,
         types_json  TEXT NOT NULL,
         label       TEXT NOT NULL,
         updated_at  TEXT,
         tombstone   INTEGER NOT NULL DEFAULT 0
       )`,
      `CREATE INDEX IF NOT EXISTS records_kind_idx ON records(kind)`,
      `CREATE INDEX IF NOT EXISTS records_primary_type_idx ON records(primary_type)`,
      `CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(full_text)`,
      `CREATE TABLE IF NOT EXISTS record_facets (
         record_id TEXT NOT NULL,
         field     TEXT NOT NULL,
         value     TEXT NOT NULL,
         PRIMARY KEY (record_id, field, value)
       )`,
      `CREATE INDEX IF NOT EXISTS record_facets_field_value_idx
         ON record_facets(field, value)`,
      `CREATE INDEX IF NOT EXISTS record_facets_record_idx
         ON record_facets(record_id)`,
      `CREATE TABLE IF NOT EXISTS record_refs (
         record_id  TEXT NOT NULL,
         target_id  TEXT NOT NULL,
         target_kind TEXT,
         PRIMARY KEY (record_id, target_id)
       )`,
      `CREATE INDEX IF NOT EXISTS record_refs_target_idx ON record_refs(target_id)`,
    ],
  },
];

export function migrate(db: Database): number {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)`,
  );
  const row = db
    .prepare<unknown[], { version: number }>(
      `SELECT version FROM schema_version LIMIT 1`,
    )
    .get();
  const current = row?.version ?? 0;

  const pending = MIGRATIONS.filter((m) => m.version > current);
  if (pending.length === 0) return current;

  const tx = db.transaction(() => {
    for (const step of pending) {
      for (const sql of step.statements) {
        db.exec(sql);
      }
    }
    db.prepare(`DELETE FROM schema_version`).run();
    db.prepare(`INSERT INTO schema_version(version) VALUES (?)`).run(CURRENT_VERSION);
  });
  tx();
  return CURRENT_VERSION;
}
