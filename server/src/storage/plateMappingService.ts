/**
 * plateMappingService — tie an acquired data-reference's rows back to a plate
 * layout by WELL IDENTITY.
 *
 * Reads the raw file from its storage device (it never lives in git),
 * extracts the well column, and runs the pure `mapRowsToPlate` join against the
 * plate layout's well set (from an optional plate-snapshot record, or an
 * explicit well list). Ambiguous identity → the result requires user mapping.
 */
import type { AppContext } from '../server.js';
import { StorageError } from './types.js';
import { mapRowsToPlate, type PlateMappingResult } from './plateMapping.js';

export interface ReturnDataMappingInput {
  /** data-reference record id (DREF-...) whose bytes live on a storage device. */
  dataReferenceId: string;
  /** Header/column name in the file that holds the well ids (e.g. "well"). */
  wellColumn: string;
  /** Resolved plate layout well set. Optional if plateSnapshotId is given. */
  plateWells?: string[];
  /** A plate-snapshot record id whose `wells[].well` defines the plate layout. */
  plateSnapshotId?: string;
}

export interface PlateWellSource {
  source: 'provided' | 'plate-snapshot';
  plateSnapshotId?: string;
  wells: string[];
}

/** Read a data-reference's raw text from its storage device (never git). */
export async function readDataReferenceText(
  ctx: AppContext,
  dataReferenceId: string,
): Promise<{ path: string; text: string }> {
  const env = await ctx.store.get(dataReferenceId);
  if (!env) {
    throw new StorageError('NOT_FOUND', `data-reference not found: ${dataReferenceId}`);
  }
  const payload = env.payload as {
    storageDeviceId?: string;
    path?: string;
  };
  const deviceId = payload.storageDeviceId;
  const path = payload.path;
  if (!deviceId || !path) {
    throw new StorageError('MISSING_CONFIG', `data-reference ${dataReferenceId} has no storageDeviceId/path`);
  }
  const provider = ctx.storageService.getProvider(deviceId);
  const stream = await provider.read(path);
  let text = '';
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    text += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
  }
  return { path, text };
}

/** Resolve the plate layout well set from a plate-snapshot record. */
export async function resolvePlateWells(
  ctx: AppContext,
  plateSnapshotId: string,
): Promise<string[]> {
  const env = await ctx.store.get(plateSnapshotId);
  if (!env) {
    throw new StorageError('NOT_FOUND', `plate-snapshot not found: ${plateSnapshotId}`);
  }
  const payload = env.payload as { wells?: Array<{ well?: string }> };
  return (payload.wells ?? []).map((w) => w.well ?? '').filter((w) => w.length > 0);
}

/**
 * Minimal delimited parser: reads a header row, finds the column whose header
 * matches `wellColumn`, then collects every non-empty cell in that column.
 * Returns raw well ids (still in original casing; matching normalizes).
 */
export function parseWellColumn(text: string, wellColumn: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const first = lines[0] ?? '';
  const delimiter = first.includes('\t') ? '\t' : ',';
  const split = (line: string) => line.split(delimiter).map((c) => c.replace(/^"|"$/g, '').trim());
  const header = split(first);
  const idx = header.findIndex((h) => h.toLowerCase() === wellColumn.toLowerCase());
  if (idx === -1) return [];

  const wells: string[] = [];
  for (const line of lines.slice(1)) {
    const cells = split(line);
    const cell = cells[idx];
    if (cell && cell.length > 0) wells.push(cell);
  }
  return wells;
}

/** Orchestrate the return-data → plate-layout mapping. */
export async function mapReturnDataToPlate(
  ctx: AppContext,
  input: ReturnDataMappingInput,
): Promise<{
  fileWells: string[];
  wellSource: PlateWellSource;
  mapping: PlateMappingResult;
}> {
  const { text } = await readDataReferenceText(ctx, input.dataReferenceId);
  const fileWells = parseWellColumn(text, input.wellColumn);

  let wellSource: PlateWellSource;
  if (input.plateSnapshotId) {
    wellSource = {
      source: 'plate-snapshot',
      plateSnapshotId: input.plateSnapshotId,
      wells: await resolvePlateWells(ctx, input.plateSnapshotId),
    };
  } else if (input.plateWells) {
    wellSource = { source: 'provided', wells: input.plateWells };
  } else {
    throw new StorageError('MISSING_CONFIG', 'either plateWells or plateSnapshotId is required');
  }

  const mapping = mapRowsToPlate(fileWells, wellSource.wells);
  return { fileWells, wellSource, mapping };
}