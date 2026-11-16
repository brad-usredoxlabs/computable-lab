/**
 * resolveRawFile — ONE resolver for the raw measurement bytes behind a path.
 *
 * Two stores can hold a raw file:
 *  1. the git records repository (CSV/txt dropped into the worktree), and
 *  2. the DEVICE blob store, where the binary upload arm writes .cdf/.raw files
 *     (`ArtifactBlobStore` with prefix 'measurements', returning
 *     `measurements/<artifact>/<file>` as its storedPath).
 *
 * Both parser consumers (validate-parser and ingest) previously consulted only
 * arm 1, so a path returned by an upload dead-ended with NOT_FOUND (GC-BUNDLE r2
 * F4). This helper is that single seam — the order is git first, device second,
 * and a device miss keeps the existing NOT_FOUND at the call site.
 *
 * L2-GC-AIA-CDF-PARSER-1 u2bind: the git arm's adapters decode as utf-8, which
 * mangles binary raw files (a .cdf fixture lost its structure). The arm now
 * verifies the utf-8 decode is byte-identical (the round-trip equals the raw
 * bytes) and, when it is not, hands the parser the raw bytes latin1-mapped —
 * the same byte-exact contract the device arm already used. Valid UTF-8 text
 * files pass the check and keep exactly today's content.
 *
 * The device arm is guarded by the upload's own path shape so an arbitrary
 * caller-supplied path can never be pulled out of the device store.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ArtifactBlobStore } from '../ingestion/ArtifactBlobStore.js';
import type { AppContext } from '../server.js';

/** The prefix the measurement upload arm writes under (MeasurementHandlers). */
export const MEASUREMENTS_BLOB_PREFIX = 'measurements';

/** Where the bytes came from — informative only; both arms hand the parser text. */
export type RawFileSource = 'git' | 'device';

export interface ResolvedRawFile {
  /** Text handed to `parser.parse(...)`; latin1 keeps device bytes byte-identical. */
  content: string;
  source: RawFileSource;
}

/** Read path never records, so the recorder is a no-op (save() is not called). */
const noopRecorder = async (): Promise<{ drefId: string }> => ({ drefId: '' });

/**
 * True only for a device-relative storedPath produced by the upload arm:
 * `measurements/<artifact>/<file>`. Rejects absolute paths, backslashes, empty
 * segments and any `..` traversal (defence in depth — safeSegment already
 * prevents them at write time).
 */
export function isMeasurementDevicePath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (path.startsWith('/') || path.includes('\\')) return false;
  const segments = path.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) return false;
  return segments[0] === MEASUREMENTS_BLOB_PREFIX && segments.length >= 2;
}

/**
 * Raw bytes of a file the git arm just resolved, read from the repository
 * worktree — null when they cannot be read. The join matches the adapters'
 * own resolvePath (same base via ctx.workspaceRoot, same path), so no new
 * trust boundary opens: whatever the adapter could read, this reads too.
 */
async function readRawRepoBytes(ctx: AppContext, path: string): Promise<Buffer | null> {
  try {
    return await readFile(join(ctx.workspaceRoot, path));
  } catch {
    return null;
  }
}

/**
 * Resolve raw file text for `path`, or null when neither store holds it.
 * Null always preserves the caller's existing NOT_FOUND message.
 */
export async function resolveRawFile(ctx: AppContext, path: string): Promise<ResolvedRawFile | null> {
  // Arm 1 — git repository.
  const file = await ctx.repoAdapter.getFile(path);
  if (file) {
    // The adapters decode as utf-8 — lossless ONLY for valid UTF-8 text.
    // A binary .cdf is not: the decode replaces invalid bytes with U+FFFD,
    // so aiaCdfParser refused the mangled structure (L2-GC-AIA-CDF-PARSER-1
    // u2bind RED). The decode is byte-identical iff the utf-8 round-trip
    // equals the raw bytes; when it is not, hand the parser the raw bytes
    // latin1-mapped — the same byte-exact contract the device arm uses.
    const bytes = await readRawRepoBytes(ctx, path);
    if (bytes !== null) {
      if (Buffer.from(file.content, 'utf-8').equals(bytes)) {
        return { content: file.content, source: 'git' };
      }
      return { content: bytes.toString('latin1'), source: 'git' };
    }
    // The raw read failed although the adapter just read it (a race) —
    // keep the adapter's content, exactly today's behaviour.
    return { content: file.content, source: 'git' };
  }

  // Arm 2 — device blob store. Absent storage keeps pure git behaviour.
  const storage = ctx.storageService;
  if (!storage || !isMeasurementDevicePath(path)) return null;

  let base64: string;
  try {
    const blobStore = new ArtifactBlobStore(storage, MEASUREMENTS_BLOB_PREFIX, noopRecorder);
    base64 = await blobStore.loadBase64(path);
  } catch {
    // Missing device / missing blob / IO error: the caller still reports
    // NOT_FOUND for this path, exactly as it did before.
    return null;
  }
  if (!base64) return null;

  // latin1 round-trips bytes exactly and is the same decode aiaCdfParser.parse
  // applies internally, so both arms reach the parser through one surface.
  return { content: Buffer.from(base64, 'base64').toString('latin1'), source: 'device' };
}
