/**
 * acquisitionPackage — register an instrument .D acquisition DIRECTORY that
 * lives on an EXTERNAL storage device (a read-only local-mount NAS) as an
 * `acquisition-package` record: a pointer + file-role declarations over
 * per-file `data-reference` records (the DREFs remain the integrity anchors),
 * plus one MANIFEST data-reference (dataKind `signal-collection`) whose
 * contentHash pins the whole .D — the data-plane/control-plane boundary
 * extended to a whole .D (GC-4, spec D1-D10).
 *
 * Reuses acquisition.ts UNMODIFIED (acquireDataReference / hashStream / the
 * DataKind union, which already carries `signal-collection`). The symlink
 * hardening (lstat + realpath containment against the CONFIG mount root)
 * lives HERE, in the registration layer: the provider's lexical containment
 * is symlink-blind, so the service touches raw fs alongside the provider
 * (additive hardening; the provider is untouched).
 *
 * Honest boundary (spec D7 / OQ-1): `packageAnalysisInputs` refuses at
 * RESOLVE/VERIFY time (verify-first). It does NOT re-hash inside the runner's
 * provisionInputs — a NAS-side post-submit drift re-check at EXECUTE is
 * GC-5's runner-side edit. provisionInputs is NOT modified here.
 */
import { createHash } from 'node:crypto';
import { lstat, realpath, stat } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { acquireDataReference, hashStream } from './acquisition.js';
import { classifyAcquisitionPackageStatus } from './acquisitionPackageStatus.js';
import type { AppContext } from '../server.js';
import { assertSafeRelativePath, StorageError } from './types.js';
import type { StorageDeviceConfig, StorageEntry } from './types.js';

const ACQP_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/acquisition-package.schema.yaml';
const DATA_REFERENCE_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/data-reference.schema.yaml';

export type PackageFileRole =
  | 'signal_channel'
  | 'sample_metadata'
  | 'run_log'
  | 'method_asset'
  | 'uninterpreted';

/**
 * S1 marker rule (data, not a code branch): the in-progress marker file the
 * wave header defines. GC-1 observed it ABSENT in the current corpus — absence
 * is not evidence the rule is dead; the marker name stays declared data.
 */
export const ACQUIRING_MARKER = 'ACQUIRING.TXT';

/**
 * D10 — the default role map (declarative data). Maps ONLY the names GC-1's
 * inventory verified; anything else is `uninterpreted` (GC-1(e): preserve
 * bytes, don't parse) — unknown names are NEVER rejected and NEVER silently
 * dropped. Method-dir membership (ACQ.M/*, DA.M/*) is declared separately as
 * a directory-prefix rule below.
 */
export const DEFAULT_ROLE_MAP: Record<string, PackageFileRole> = {
  'FID1A.CH': 'signal_channel',
  'SAMPLE.XML': 'sample_metadata',
  'SAMPLE.MAC.bak': 'sample_metadata',
  'RUN.LOG': 'run_log',
  'ACQRES.REG': 'uninterpreted',
  'SINGLE.B': 'uninterpreted',
};

/** Method-dir prefixes whose members are method_asset (D10). */
export const METHOD_DIR_NAMES: readonly string[] = ['ACQ.M', 'DA.M'];

/** S4 required-by-default membership (spec D6 step 5 / D9). */
export const REQUIRED_MEMBERS: readonly string[] = ['FID1A.CH', 'SAMPLE.XML'];

/**
 * Named registration/verify failure tokens (spec D6). PACKAGE_NOT_A_FILE is
 * thrown by the S8/S9 root-shape check (a directoryKey that resolves to a
 * regular file). PACKAGE_HASH_MISMATCH is the D6-declared acquire-time
 * integrity code: the acquire path verifies internally (every per-file DREF
 * pins hash+size and post-pin drift surfaces as PACKAGE_HASH_DRIFT at
 * verify), so it is KEPT in the union per D6 as the named cause an
 * acquire-time integrity leg can use without a union change.
 */
export const ACQUISITION_PACKAGE_ERROR_CODES = [
  'PACKAGE_ACQUIRING',
  'PACKAGE_SYMLINK_ESCAPE',
  'PACKAGE_PATH_ESCAPE',
  'PACKAGE_FILE_MISSING',
  'PACKAGE_NOT_A_FILE',
  'PACKAGE_HASH_MISMATCH',
  'PACKAGE_HASH_DRIFT',
  'PACKAGE_DEVICE_MISSING',
] as const;

export type AcquisitionPackageErrorCode = (typeof ACQUISITION_PACKAGE_ERROR_CODES)[number];

export class AcquisitionPackageError extends Error {
  constructor(
    public readonly code: AcquisitionPackageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AcquisitionPackageError';
  }
}

/** An analysis-run `inputs` entry: a data-reference record ref. */
export interface RunInputRef {
  kind: 'record';
  id: string;
  type: 'data-reference';
}

export type RunInputs = Record<string, RunInputRef>;

/** name → data-reference record ref, as analysis-run.schema.yaml `inputs`. */
export interface PackageAnalysisInputs {
  /** The .CH file data-reference(s) — the per-file path the runner already provisions. */
  signal: RunInputRef;
  /** The manifest (signal-collection) data-reference — provenance for GC-5 collections. */
  package: RunInputRef;
}

function basenameOf(key: string): string {
  const parts = key.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? key;
}

function dirBasenameOf(key: string): string | undefined {
  const parts = key.split('/').filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : undefined;
}

/** D10 role resolution: explicit caller map > default map > method-dir > .CH > uninterpreted. */
function roleFor(
  relativePath: string,
  roles: Record<string, PackageFileRole> | undefined,
): PackageFileRole {
  const explicit = roles?.[relativePath] ?? roles?.[basenameOf(relativePath)];
  if (explicit) return explicit;
  const byName = DEFAULT_ROLE_MAP[basenameOf(relativePath)];
  if (byName) return byName;
  const dir = dirBasenameOf(relativePath);
  if (dir && METHOD_DIR_NAMES.includes(dir)) return 'method_asset';
  if (basenameOf(relativePath).toLowerCase().endsWith('.ch')) return 'signal_channel';
  return 'uninterpreted';
}

/** D5 canonical manifest string: files sorted by relativePath. */
function manifestStringOf(
  members: Array<{ relativePath: string; contentHash: string; sizeBytes: number }>,
): string {
  return [...members]
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    .map((m) => `${m.relativePath}\n${m.contentHash}\n${m.sizeBytes}\n`)
    .join('');
}

interface ManifestMembers {
  relativePath: string;
  recordId: string;
  contentHash: string;
  sizeBytes: number;
}

async function loadFileDref(ctx: AppContext, recordId: string): Promise<ManifestMembers & { relativePath: string }> {
  const env = await ctx.store.get(recordId);
  if (!env) {
    throw new AcquisitionPackageError(
      'PACKAGE_FILE_MISSING',
      `file data-reference record missing: ${recordId}`,
    );
  }
  const p = env.payload as { path?: string; contentHash?: string; sizeBytes?: number };
  if (typeof p.path !== 'string' || !p.contentHash || typeof p.sizeBytes !== 'number') {
    throw new AcquisitionPackageError(
      'PACKAGE_FILE_MISSING',
      `file data-reference ${recordId} has no path/contentHash/sizeBytes`,
    );
  }
  return {
    relativePath: p.path.split('/').pop() ?? recordId,
    recordId,
    contentHash: p.contentHash,
    sizeBytes: p.sizeBytes,
  };
}

/** The CONFIG mount root for a device (the containment anchor for S2). */
function mountRootFor(deviceId: string, device: StorageDeviceConfig): string {
  const mountPath = device.mountPath;
  if (device.kind !== 'local-mount' || typeof mountPath !== 'string' || !isAbsolute(mountPath)) {
    throw new AcquisitionPackageError(
      'PACKAGE_DEVICE_MISSING',
      `storage device ${deviceId} is not a configured local-mount with an absolute mountPath`,
    );
  }
  return resolve(mountPath);
}

/**
 * S1 + S2 pre-pass over a walked tree: refuse a mutable (mid-acquisition) tree,
 * then harden every entry with lstat + realpath containment. The provider's
 * lexical containment does NOT catch a symlink whose realpath escapes the
 * mount root — `stat` follows links, so the check is lstat (the link ITSELF)
 * plus realpath-of-the-entry vs realpath-of-the-mount-root.
 */
async function hardenTree(
  entries: StorageEntry[],
  directoryKey: string,
  mountRoot: string,
): Promise<void> {
  // S1 FIRST: the in-progress marker anywhere in the tree → refuse to pin a
  // mutable tree (the rule is data: ACQUIRING_MARKER).
  const marker = entries.find((e) => !e.isDirectory && e.name === ACQUIRING_MARKER);
  if (marker) {
    throw new AcquisitionPackageError(
      'PACKAGE_ACQUIRING',
      `acquisition in progress (${ACQUIRING_MARKER} present at ${directoryKey}/${marker.name}) — refuse to pin a mutable tree`,
    );
  }
  const rootReal = await realpath(mountRoot);
  for (const entry of entries) {
    const abs = resolve(mountRoot, `${directoryKey}/${entry.path.replace(`${directoryKey}/`, '')}`);
    const ls = await lstat(abs);
    if (ls.isSymbolicLink()) {
      throw new AcquisitionPackageError(
        'PACKAGE_SYMLINK_ESCAPE',
        `symlink inside the .D: ${directoryKey}/${entry.path.replace(`${directoryKey}/`, '')} (lstat reports a symlink — symlinks are refused, the provider is symlink-blind)`,
      );
    }
    const real = await realpath(abs);
    if (real !== rootReal && !real.startsWith(rootReal + sep)) {
      throw new AcquisitionPackageError(
        'PACKAGE_SYMLINK_ESCAPE',
        `entry escapes the mount root (realpath containment): ${directoryKey}/${entry.path.replace(`${directoryKey}/`, '')}`,
      );
    }
  }
}

/**
 * S8/S9 root-shape check, run BEFORE the walk in register AND verify (both
 * share walkTree, whose provider ENOENT→[] list swallow would otherwise let
 * a directory-level miss surface as the empty-directory PACKAGE_FILE_MISSING,
 * and whose ENOTDIR→StorageError IO_ERROR mapping would propagate an unnamed
 * token when the key resolves to a regular file). Classifies the resolved
 * root itself:
 *   - absent (ENOENT/ENOTDIR)       → PACKAGE_DEVICE_MISSING (S8: the
 *     package-level directory miss is the DEVICE token, not the file token)
 *   - present but not a directory   → PACKAGE_NOT_A_FILE (S9: a file where
 *     the .D directory key is expected — the vice-versa case)
 * Raw fs against the CONFIG mount root — the same containment anchor
 * hardenTree uses; the classification must not depend on a provider-kind-
 * specific list/stat semantic.
 */
async function assertDirectoryRoot(directoryKey: string, mountRoot: string): Promise<void> {
  const rootAbs = resolve(mountRoot, directoryKey);
  let rootStat: Awaited<ReturnType<typeof stat>>;
  try {
    rootStat = await stat(rootAbs);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new AcquisitionPackageError(
        'PACKAGE_DEVICE_MISSING',
        `acquisition directory not found on device: ${directoryKey}`,
      );
    }
    throw err;
  }
  if (!rootStat.isDirectory()) {
    throw new AcquisitionPackageError(
      'PACKAGE_NOT_A_FILE',
      `acquisition directoryKey resolves to a file, not a directory: ${directoryKey}`,
    );
  }
}

/** Walk the .D tree recursively via the provider (method subdirs included). */
async function walkTree(
  listDir: (path: string) => Promise<StorageEntry[]>,
  directoryKey: string,
): Promise<StorageEntry[]> {
  const out: StorageEntry[] = [];
  const queue: string[] = [directoryKey];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    let entries: StorageEntry[];
    try {
      entries = await listDir(cur);
    } catch (err) {
      if (err instanceof StorageError && err.code === 'NOT_FOUND') {
        throw new AcquisitionPackageError(
          'PACKAGE_DEVICE_MISSING',
          `acquisition directory not found on device: ${cur}`,
        );
      }
      throw err;
    }
    for (const e of entries) {
      out.push(e);
      if (e.isDirectory) queue.push(e.path);
    }
  }
  return out;
}

async function mintAcquisitionPackageId(ctx: AppContext): Promise<string> {
  const prefix = 'ACQP-';
  let max = 0;
  try {
    const envelopes = await ctx.store.list({ kind: 'acquisition-package', limit: 5000 });
    for (const env of envelopes) {
      const m = /^ACQP-(\d+)$/.exec(env.recordId);
      if (m) {
        const n = Number.parseInt(m[1] ?? '0', 10);
        if (n > max) max = n;
      }
    }
  } catch {
    // list may throw if no records yet — treat as max 0
  }
  return `${prefix}${String(max + 1).padStart(6, '0')}`;
}

export interface RegisterAcquisitionPackageInput {
  /** The CONFIG storage device id — never a mount path. */
  deviceId: string;
  /** The .D DIRECTORY key relative to the device root (safe relative). */
  directoryKey: string;
  /**
   * Caller-supplied role map (D4: role discovery is NOT automatic). Keys are
   * relative paths or bare file names; defaults (D10) apply first for
   * anything unmapped. Unknown names land in `uninterpreted` — never
   * rejected, never dropped.
   */
  roles?: Record<string, PackageFileRole>;
  sampleRef?: { kind: 'record'; id: string; type: string; label?: string };
  sourceRunRef?: { kind: 'record'; id: string; type: string; label?: string };
}

export interface RegisterAcquisitionPackageResult {
  packageRecordId: string;
  packagePayload: Record<string, unknown>;
  fileDrefs: Array<{ relativePath: string; role: PackageFileRole; recordId: string }>;
  manifestDrefId: string;
}

/**
 * Register a .D acquisition directory (spec D6, registration order):
 * device → safe path → root shape (S8/S9) → walk → S1 marker → S2 symlink
 * hardening → S4
 * required membership → per-file acquireDataReference → manifest DREF →
 * the acquisition-package record. A partially-failed run orphans the DREFs
 * already minted (append-only audit records — documented, no integrity
 * harm); the package record itself is created LAST, so it never exists on
 * failure.
 */
export async function registerAcquisitionPackage(
  ctx: AppContext,
  input: RegisterAcquisitionPackageInput,
): Promise<RegisterAcquisitionPackageResult> {
  // S3 pre-check: the directoryKey is a safe RELATIVE key (belt to the
  // schema pattern; StorageError TRAVERSAL_BLOCKED when the provider raises
  // it first is the other accepted spelling).
  try {
    assertSafeRelativePath(input.directoryKey);
  } catch (err) {
    if (err instanceof StorageError) {
      throw new AcquisitionPackageError(
        'PACKAGE_PATH_ESCAPE',
        `directoryKey fails the safe-relative check: ${input.directoryKey}`,
      );
    }
    throw err;
  }

  // Step 1: device. An unconfigured device id propagates the provider
  // registry's StorageError NOT_FOUND — getProvider throws BEFORE any config
  // lookup (D6 step 1: the unconfigured-id case is StorageError NOT_FOUND,
  // coded honestly; the former `if (!device)` branch below it was dead for
  // the same reason and is removed). A configured id therefore always has a
  // config entry, hence the non-null assertion.
  const provider = ctx.storageService.getProvider(input.deviceId);
  const device =
    ctx.storageService.allDeviceConfigs().find((d) => d.id === input.deviceId)!;
  const mountRoot = mountRootFor(input.deviceId, device);

  // S8/S9 root-shape check BEFORE the walk (see assertDirectoryRoot).
  await assertDirectoryRoot(input.directoryKey, mountRoot);

  // Step 2/3/4: walk, then the S1 marker check + S2 symlink hardening.
  const entries = await walkTree((p) => provider.list(p), input.directoryKey);
  const files = entries.filter((e) => !e.isDirectory);
  if (files.length === 0) {
    throw new AcquisitionPackageError(
      'PACKAGE_FILE_MISSING',
      `the acquisition directory is empty: ${input.directoryKey}`,
    );
  }
  await hardenTree(entries, input.directoryKey, mountRoot);

  // S4: required-by-default membership (FID1A.CH, SAMPLE.XML).
  const missing = REQUIRED_MEMBERS.filter(
    (name) => !files.some((f) => basenameOf(f.path) === name),
  );
  if (missing.length > 0) {
    throw new AcquisitionPackageError(
      'PACKAGE_FILE_MISSING',
      `required member(s) missing from ${input.directoryKey}: ${missing.join(', ')}`,
    );
  }

  // Step 5: per-file data-references (acquireDataReference UNCHANGED).
  // EVERY walked file is pinned — including `uninterpreted` (GC-1(e): nothing
  // is ever silently skipped). dataKind: 'signal' for .CH files, 'binary'
  // otherwise.
  const fileDrefs: Array<{
    relativePath: string;
    role: PackageFileRole;
    recordId: string;
    contentHash: string;
    sizeBytes: number;
  }> = [];
  for (const f of files) {
    const relativePath = f.path.slice(input.directoryKey.length + 1);
    const role = roleFor(relativePath, input.roles);
    const { recordId, payload } = await acquireDataReference(ctx, {
      deviceId: input.deviceId,
      path: f.path,
      dataKind: basenameOf(f.path).toLowerCase().endsWith('.ch') ? 'signal' : 'binary',
      acquisitionContext: { note: 'acquisition-package member' },
    });
    fileDrefs.push({
      relativePath,
      role,
      recordId,
      contentHash: payload.contentHash,
      sizeBytes: payload.sizeBytes,
    });
  }
  fileDrefs.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  // Step 6: the manifest data-reference (D5) — a Merkle-style pin of the whole
  // .D computed WITHOUT zipping/copying anything. Its contentHash is the
  // sha256 of the canonical per-file manifest string; it is NOT a hash of the
  // directory (createReadStream on a directory would EISDIR — which is exactly
  // why the single-file integrity contract lives on the per-file DREFs).
  const members: ManifestMembers[] = fileDrefs.map((f) => ({
    relativePath: f.relativePath,
    recordId: f.recordId,
    contentHash: f.contentHash,
    sizeBytes: f.sizeBytes,
  }));
  const manifestHash = createManifestHash(members);
  const totalSize = members.reduce((sum, m) => sum + m.sizeBytes, 0);
  const dirName = basenameOf(input.directoryKey);
  const manifestDrefId = await mintDataReferenceId(ctx);
  const manifestPayload: Record<string, unknown> = {
    kind: 'data-reference',
    id: manifestDrefId,
    title: `${dirName} acquisition package (signal collection)`,
    storageDeviceId: input.deviceId,
    path: input.directoryKey,
    contentHash: manifestHash,
    sizeBytes: totalSize,
    dataKind: 'signal-collection',
    format: 'agilent-chemstation-d',
    readerVersion: 'gc-4-registration/1',
    acquiredAt: new Date().toISOString(),
  };
  const manifestResult = await ctx.store.create({
    envelope: { recordId: manifestDrefId, schemaId: DATA_REFERENCE_SCHEMA_ID, payload: manifestPayload },
    message: `Mint signal-collection manifest data-reference ${manifestDrefId} for ${dirName}`,
  });
  if (!manifestResult.success) {
    throw new Error(`Failed to create manifest data-reference ${manifestDrefId}: ${manifestResult.error ?? 'unknown error'}`);
  }

  // Step 7: the acquisition-package record — created LAST so a partially
  // failed registration never leaves a package pointing at incomplete pins.
  // FAME-1: BEFORE the create, classify the acquisition status from the
  // package's run_log member (strict UTF-16 + the data-declared rule file)
  // and stamp the result + its evidence onto the payload. Classification is
  // floor-guaranteed (unknown on any failure, bait #5): it can NEVER fail
  // registration, and the record is still created LAST.
  const statusStamp = await classifyAcquisitionPackageStatus(
    provider,
    input.directoryKey,
    fileDrefs.find((f) => f.role === 'run_log'),
  );
  const packageRecordId = await mintAcquisitionPackageId(ctx);
  const packagePayload: Record<string, unknown> = {
    kind: 'acquisition-package',
    id: packageRecordId,
    title: `${dirName} acquisition package (signal collection)`,
    storageDeviceId: input.deviceId,
    directoryKey: input.directoryKey,
    files: fileDrefs.map((f) => ({
      relativePath: f.relativePath,
      dataReferenceRef: { kind: 'record', type: 'data-reference', id: f.recordId },
      role: f.role,
    })),
    signalCollectionRef: { kind: 'record', type: 'data-reference', id: manifestDrefId },
    // FAME-1: the acquisition status + its evidence (DATA — the matched
    // lines, the decode facts, the interpretation source) + the DECLARED
    // run-sheet qualification (D3: the rule file's statusQualification,
    // stamped so the chrome renders DATA, not a hardcoded status branch).
    // Conditional spreads throughout: exactOptionalPropertyTypes (bait #1).
    ...(statusStamp.acquisitionStatus !== undefined
      ? { acquisitionStatus: statusStamp.acquisitionStatus }
      : {}),
    ...(statusStamp.acquisitionStatusQualified !== undefined
      ? { acquisitionStatusQualified: statusStamp.acquisitionStatusQualified }
      : {}),
    ...(statusStamp.acquisitionStatusEvidence !== undefined
      ? { acquisitionStatusEvidence: statusStamp.acquisitionStatusEvidence }
      : {}),
    ...(input.sourceRunRef ? { sourceRunRef: input.sourceRunRef } : {}),
    ...(input.sampleRef ? { sampleRef: input.sampleRef } : {}),
    registeredAt: new Date().toISOString(),
  };
  const packageResult = await ctx.store.create({
    envelope: { recordId: packageRecordId, schemaId: ACQP_SCHEMA_ID, payload: packagePayload },
    message: `Register acquisition package ${packageRecordId} (${dirName})`,
  });
  if (!packageResult.success) {
    throw new Error(`Failed to create acquisition-package ${packageRecordId}: ${packageResult.error ?? 'unknown error'}`);
  }

  return {
    packageRecordId,
    packagePayload,
    fileDrefs: fileDrefs.map((f) => ({ relativePath: f.relativePath, role: f.role, recordId: f.recordId })),
    manifestDrefId,
  };
}

/**
 * FAME-1 — classify the acquisition status from the package's run_log member
 * and return the stamp fields for the package payload (the caller stamps them
 * BEFORE the record is created — the package record stays created LAST,
 * registration order stands).
 *
 * UNKNOWN IS THE FLOOR, and classification NEVER fails registration (bait #5):
 * no run_log member, an unreadable member, a decode failure, zero rule hits,
 * even a missing rule FILE (misconfigured deployment) — all land on the
 * DECLARED fallbackStatus (config/gc-acquisition-status/log-patterns.yaml —
 * the data file) with a NAMED noEvidenceReason, never on a coded `completed`
 * default and never on a thrown error. RUN.LOG is not a REQUIRED_MEMBERS
 * member (acquisitionPackage.ts:69), so a missing/unreadable log is data, not
 * a fault.
 *
 * The run_log member bytes are read through the SAME provider the DREF
 * acquire path uses (provider.read — the acquisition.ts:100 /
 * verifyAcquisitionPackage re-hash idiom); the relative path is the
 * package-root-relative member path (e.g. "RUN.LOG").
 *
 * (D6) the read+classify orchestration (provider read, floor ladder, the
 * degenerate rule-file arm) lives in acquisitionPackageStatus.ts — this file
 * keeps the classification CALL + the payload stamp ONLY (spec scope).
 */

/**
 * The execution-time gate (spec D6 verify): re-run S1/S2 (the marker can
 * appear later; a file can be swapped for a symlink), then re-stream-hash
 * every pinned file (NAS-side compute only — bytes never persist) and
 * compare to the DREF's contentHash/sizeBytes. Drift → PACKAGE_HASH_DRIFT
 * naming the file.
 */
export async function verifyAcquisitionPackage(
  ctx: AppContext,
  packageRecordId: string,
): Promise<void> {
  const env = await ctx.store.get(packageRecordId);
  if (!env) {
    throw new AcquisitionPackageError(
      'PACKAGE_FILE_MISSING',
      `acquisition-package record not found: ${packageRecordId}`,
    );
  }
  const payload = env.payload as {
    storageDeviceId?: string;
    directoryKey?: string;
    files?: Array<{ relativePath: string; dataReferenceRef: { id: string } }>;
  };
  if (!payload.storageDeviceId || !payload.directoryKey || !Array.isArray(payload.files)) {
    throw new AcquisitionPackageError(
      'PACKAGE_FILE_MISSING',
      `acquisition-package ${packageRecordId} has no storageDeviceId/directoryKey/files`,
    );
  }
  const directoryKey = payload.directoryKey;
  // S8, same rule as register: an unconfigured device id propagates the
  // provider registry's StorageError NOT_FOUND (getProvider throws first),
  // so the config is guaranteed present for a configured id (non-null
  // assertion) and a configured-but-absent .D directory is the
  // PACKAGE_DEVICE_MISSING root-shape case below.
  const provider = ctx.storageService.getProvider(payload.storageDeviceId);
  const device =
    ctx.storageService.allDeviceConfigs().find((d) => d.id === payload.storageDeviceId)!;
  const mountRoot = mountRootFor(payload.storageDeviceId, device);

  // S8/S9 root-shape check BEFORE the walk (see assertDirectoryRoot).
  await assertDirectoryRoot(directoryKey, mountRoot);
  const entries = await walkTree((p) => provider.list(p), directoryKey);
  await hardenTree(entries, directoryKey, mountRoot);

  for (const item of payload.files) {
    const relativePath = item.relativePath;
    const fileKey = `${directoryKey}/${relativePath}`;
    const member = await loadFileDref(ctx, item.dataReferenceRef.id);
    let stream;
    try {
      stream = await provider.read(fileKey);
    } catch (err) {
      if (err instanceof StorageError && (err.code === 'NOT_FOUND' || err.code === 'IO_ERROR')) {
        throw new AcquisitionPackageError(
          'PACKAGE_FILE_MISSING',
          `file no longer readable at verify: ${fileKey}`,
        );
      }
      throw err;
    }
    const { contentHash, sizeBytes } = await hashStream(stream);
    if (contentHash !== member.contentHash) {
      throw new AcquisitionPackageError(
        'PACKAGE_HASH_DRIFT',
        `content hash drifted since registration: ${relativePath} (expected ${member.contentHash.slice(0, 12)}…, got ${contentHash.slice(0, 12)}…)`,
      );
    }
    if (sizeBytes !== member.sizeBytes) {
      throw new AcquisitionPackageError(
        'PACKAGE_HASH_DRIFT',
        `size drifted since registration: ${relativePath} (expected ${member.sizeBytes} B, got ${sizeBytes} B)`,
      );
    }
  }
}

/**
 * D5 input contract: the `name → {kind:'record', id, type:'data-reference'}`
 * mapping an analysis-run's `inputs` record needs — `signal` → the .CH FILE
 * data-reference (the per-file path the runner already provisions) plus the
 * manifest DREF under `package` for provenance once the engine understands
 * collections. VERIFY-FIRST: a mutation between registration and
 * input-resolution is refused here (PACKAGE_HASH_DRIFT) — the GC-4
 * boundary's submit-side refusal. (Runner-side re-hash at EXECUTE is GC-5's
 * provisionInputs edit — NOT done here, OQ-1.)
 */
export async function packageAnalysisInputs(
  ctx: AppContext,
  packageRecordId: string,
): Promise<PackageAnalysisInputs> {
  await verifyAcquisitionPackage(ctx, packageRecordId);
  const env = await ctx.store.get(packageRecordId);
  if (!env) {
    throw new AcquisitionPackageError(
      'PACKAGE_FILE_MISSING',
      `acquisition-package record not found: ${packageRecordId}`,
    );
  }
  const payload = env.payload as {
    files: Array<{ role: string; dataReferenceRef: { id: string } }>;
    signalCollectionRef: { id: string };
  };
  const signalFile = payload.files.find((f) => f.role === 'signal_channel');
  if (!signalFile) {
    throw new AcquisitionPackageError(
      'PACKAGE_FILE_MISSING',
      `package ${packageRecordId} pins no signal_channel file — cannot resolve a signal input`,
    );
  }
  return {
    signal: { kind: 'record', id: signalFile.dataReferenceRef.id, type: 'data-reference' },
    package: { kind: 'record', id: payload.signalCollectionRef.id, type: 'data-reference' },
  };
}

function createManifestHash(
  members: Array<{ relativePath: string; contentHash: string; sizeBytes: number }>,
): string {
  return createHash('sha256').update(manifestStringOf(members)).digest('hex');
}

async function mintDataReferenceId(ctx: AppContext): Promise<string> {
  const prefix = 'DREF-';
  let max = 0;
  try {
    const envelopes = await ctx.store.list({ kind: 'data-reference', limit: 5000 });
    for (const env of envelopes) {
      const m = /^DREF-(\d+)$/.exec(env.recordId);
      if (m) {
        const n = Number.parseInt(m[1] ?? '0', 10);
        if (n > max) max = n;
      }
    }
  } catch {
    // list may throw if no records yet — treat as max 0
  }
  return `${prefix}${String(max + 1).padStart(6, '0')}`;
}
