/**
 * SeedProtocols — Phase F: persist reusable seeded universal protocols into the
 * lab data store so they ARE selectable (Protocol tab / lab-wide protocols).
 *
 * The repo's `records/seed/**` seed directories auto-merge only for singular
 * kind dirs (`records/seed/labware`, ...); protocol fixtures live under the
 * plural `records/seed/protocols/` and are NOT auto-merged. So we materialize
 * the ones we want available (e.g. the Biological Material Transfer template)
 * into the store here, idempotently — data declared in YAML, TS conforms it to
 * the record schema, mirroring seedBiologicalTerms.
 */
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { RecordStore } from '../store/types.js';

export const PROTOCOL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';

/** Seed protocol files (relative to records/seed/protocols) to materialize. */
const SEED_PROTOCOL_FILES = ['prt-seed-biological-transfer.yaml'] as const;

export function loadSeedProtocol(seedProtocolsDir: string, file: string): Record<string, unknown> | null {
  const fullPath = `${seedProtocolsDir}/${file}`;
  if (!existsSync(fullPath)) return null;
  const parsed = parse(readFileSync(fullPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = { ...(parsed as Record<string, unknown>) };
  // `$schema` is a doc annotation; the store validates the payload, which must
  // not carry it (unevaluatedProperties).
  delete record.$schema;
  const recordId = typeof record.recordId === 'string' ? record.recordId : '';
  if (!recordId) return null;
  return record;
}

export interface SeedProtocolsResult {
  created: string[];
  reused: string[];
}

/**
 * Ensure the named seed protocols exist in the store (idempotent by recordId).
 */
export async function ensureSeedProtocols(
  store: RecordStore,
  seedProtocolsDir: string,
  files: readonly string[] = SEED_PROTOCOL_FILES,
): Promise<SeedProtocolsResult> {
  const result: SeedProtocolsResult = { created: [], reused: [] };
  for (const file of files) {
    const record = loadSeedProtocol(seedProtocolsDir, file);
    if (!record) continue;
    const recordId = String(record.recordId);
    const existing = await store.get(recordId);
    // A SEED fallback (meta.commitSha === 'seed') is the read-only seed-defined
    // envelope — it is NOT a durable lab record and won't surface in lists /
    // protocol-context. Only a commitSha !== 'seed' record counts as persisted.
    const isSeedFallback = existing?.meta?.commitSha === 'seed';
    if (existing && !isSeedFallback) {
      result.reused.push(recordId);
      continue;
    }
    const created = await store.create({
      envelope: { recordId, schemaId: PROTOCOL_SCHEMA_ID, payload: record, meta: { kind: 'protocol' } },
      message: `Seed reusable protocol ${recordId}`,
    });
    if (!created.success && created.error) {
      // Surface so the operator sees why the protocol couldn't be materialized.
      console.warn(`Seed protocol ${recordId} create failed: ${created.error}`);
      continue;
    }
    if (created.success || created.envelope) {
      result.created.push(recordId);
    }
  }
  return result;
}