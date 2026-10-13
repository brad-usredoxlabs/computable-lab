/**
 * applyOwnershipDefaults — opt-in migration that brings existing
 * `access-policy` records in line with the declared `ownership-policy`
 * document (§T13 / OWN-13).
 *
 * Usage:
 *   npx tsx src/scripts/applyOwnershipDefaults.ts           # dry run (prints planned changes)
 *   npx tsx src/scripts/applyOwnershipDefaults.ts --apply   # writes
 *
 * Posture (plan §T13, non-negotiable):
 * - DRY RUN BY DEFAULT. Writes happen ONLY with --apply.
 * - The resolved data dir is printed FIRST; the script never touches a dir
 *   it did not name.
 * - Rules are resolved ONLY through OwnershipPolicyService.ruleFor (the
 *   declarative source). The script never reads the document itself and
 *   never hardcodes a default.
 * - NEVER invents an owner: a record whose kind has no applicable rule
 *   (no document installed) is SKIPped with a printed line, not guessed.
 * - Idempotent: a second dry-run after --apply plans zero changes.
 *
 * The core is a plain function over (store, service, resolvedDir) so unit
 * tests inject MemoryRecordStore + a fake dir string and never read config.
 * main() is the thin wiring layer: loadConfig -> resolved data dir -> real
 * store, exactly the way server.ts resolves it.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import { createRepoAdapter } from '../repo/createRepoAdapter.js';
import { createValidator } from '../validation/AjvValidator.js';
import { createLintEngine } from '../lint/LintEngine.js';
import { OwnershipPolicyService, type ResolvedKindRule } from '../security/OwnershipPolicyService.js';
import { ACCESS_POLICY_SCHEMA_ID } from '../security/AuthorizationService.js';
import type { Visibility } from '../security/AccessControlService.js';
import { loadConfig, getDefaultRepository, createEmbeddedDefaultRepositoryConfig } from '../config/loader.js';
import { DEFAULT_CONFIG as DEFAULT_APP_CONFIG, type AppConfig } from '../config/types.js';
import { resolveSeedRecordsDir } from '../index/seedRecordsDir.js';

export { ACCESS_POLICY_SCHEMA_ID };

/** One planned (or applied) change to a single access-policy record. */
export interface MigrationChange {
  aclId: string;
  resourceId: string;
  kind: string;
  fromVisibility: Visibility;
  toVisibility: Visibility;
  fromOwnerUserId: string;
  toOwnerUserId: string;
  ruleRecordId: string;
  originSource: ResolvedKindRule['origin']['source'];
}

/** One access-policy record deliberately left untouched. */
export interface MigrationSkip {
  aclId: string;
  resourceId: string;
  kind: string;
  reason: string;
}

export interface MigrationReport {
  resolvedDir: string;
  totalAcls: number;
  planned: MigrationChange[];
  applied: MigrationChange[];
  skipped: MigrationSkip[];
}

export interface MigrationInput {
  /** Store the migration reads AND writes (the data repo's store). */
  store: RecordStore;
  /** The declarative resolver — the ONLY source of ownership rules. */
  service: OwnershipPolicyService;
  /** Absolute resolved data dir, injected by the caller (main() wires loadConfig). */
  resolvedDir: string;
  /** false (default posture) = plan + print only; true = write the differing ACLs. */
  apply: boolean;
  /** Output sink; defaults to console.log so tests can capture lines. */
  log?: (line: string) => void;
}

const VISIBILITIES: Visibility[] = ['private', 'shared', 'public'];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

interface StampedAcl {
  envelope: RecordEnvelope;
  aclId: string;
  resourceId: string;
  kind: string;
  visibility: Visibility;
  ownerUserId: string;
}

/** Read the stamped fields off an access-policy envelope. Null = malformed / not an ACL. */
function coerceStampedAcl(env: RecordEnvelope): StampedAcl | null {
  const payload = asRecord(env.payload);
  if (payload.kind !== 'access-policy') return null;
  const aclId = asString(payload.recordId) ?? env.recordId;
  const resourceRef = asRecord(payload.resourceRef);
  const resourceId = asString(resourceRef.id);
  if (!resourceId) return null;
  // The kind that ruleFor resolves: resourceRef.type is the stamped record kind.
  const kind = asString(resourceRef.type);
  if (!kind) return null;
  const visibility = VISIBILITIES.includes(payload.visibility as Visibility)
    ? (payload.visibility as Visibility)
    : null;
  const ownerUserId = asString(payload.ownerUserId);
  if (!visibility || !ownerUserId) return null;
  return { envelope: env, aclId, resourceId, kind, visibility, ownerUserId };
}

/**
 * Core migration. Plain over injected (store, service, resolvedDir):
 * no config read, no env read, no fs path built from anything but the
 * injected dir string. Returns the full report; prints as it goes.
 */
export async function applyOwnershipDefaults(input: MigrationInput): Promise<MigrationReport> {
  const log = input.log ?? ((line: string) => console.log(line));

  // Requirement 1: name the dir FIRST. Never touch a dir we did not name.
  log(`Data dir: ${input.resolvedDir}`);

  // Requirement 2: every access-policy record (lives in the DATA repo, not
  // the seedDir; if a run shows records missing here, they surface as a
  // smaller totalAcls and the operator reports it — never papered over).
  const aclEnvelopes = await input.store.list({ kind: 'access-policy', limit: 10000 });
  log(`Access-policy records found: ${aclEnvelopes.length}`);

  const report: MigrationReport = {
    resolvedDir: input.resolvedDir,
    totalAcls: aclEnvelopes.length,
    planned: [],
    applied: [],
    skipped: [],
  };

  for (const env of aclEnvelopes) {
    const acl = coerceStampedAcl(env);
    if (!acl) {
      report.skipped.push({
        aclId: env.recordId,
        resourceId: '(unreadable)',
        kind: '(unreadable)',
        reason: 'no applicable rule: access-policy payload unreadable (missing resourceRef.id/type, visibility, or ownerUserId)',
      });
      log(`SKIP ${env.recordId}: no applicable rule (access-policy payload unreadable) — not touched, no owner guessed`);
      continue;
    }

    // Requirement 3: resolve the rule ONLY via the service.
    const rule = await input.service.ruleFor(acl.kind);
    if (!rule) {
      // Requirement 5: no document / no rule -> SKIP. NEVER guess an owner.
      report.skipped.push({
        aclId: acl.aclId,
        resourceId: acl.resourceId,
        kind: acl.kind,
        reason: 'no applicable rule: no ownership-policy document resolves this kind — skipping, never guessing an owner',
      });
      log(`SKIP ${acl.aclId}: no applicable rule (kind ${acl.kind}, no ownership-policy document) — not touched, no owner guessed`);
      continue;
    }

    // Owner target: lab-owned kinds move to the document's labOwnerUserId
    // (via the service's active document). Creator-owned kinds KEEP the
    // stamped owner — the migration never guesses who the creator was.
    const doc = await input.service.activeLabPolicy();
    const toOwnerUserId =
      rule.owner === 'lab' && doc ? doc.labOwnerUserId : acl.ownerUserId;

    const visibilityDiffers = acl.visibility !== rule.visibility;
    const ownerDiffers = acl.ownerUserId !== toOwnerUserId;
    if (!visibilityDiffers && !ownerDiffers) continue;

    const change: MigrationChange = {
      aclId: acl.aclId,
      resourceId: acl.resourceId,
      kind: acl.kind,
      fromVisibility: acl.visibility,
      toVisibility: rule.visibility,
      fromOwnerUserId: acl.ownerUserId,
      toOwnerUserId,
      ruleRecordId: rule.origin.policyRecordId,
      originSource: rule.origin.source,
    };
    report.planned.push(change);

    if (visibilityDiffers) {
      log(`${acl.aclId}: visibility ${acl.visibility} -> ${rule.visibility} (kind ${acl.kind}, rule ${rule.origin.policyRecordId})`);
    }
    if (ownerDiffers) {
      log(`${acl.aclId}: owner ${acl.ownerUserId} -> ${toOwnerUserId} (kind ${acl.kind}, rule ${rule.origin.policyRecordId})`);
    }

    // Requirement 4: writes ONLY with --apply.
    if (input.apply) {
      const payload = { ...asRecord(acl.envelope.payload), visibility: rule.visibility, ownerUserId: toOwnerUserId };
      const envelope: RecordEnvelope = { ...acl.envelope, payload };
      const result = await input.store.update({
        envelope,
        message: `applyOwnershipDefaults: ${acl.aclId}`,
      });
      if (!result.success) {
        log(`FAILED ${acl.aclId}: store update rejected (${result.error ?? 'unknown error'})`);
        continue;
      }
      report.applied.push(change);
    }
  }

  if (report.planned.length === 0) {
    log('No planned changes: every access-policy already matches the declared document (idempotent).');
  } else if (!input.apply) {
    log(`DRY RUN: ${report.planned.length} planned change(s). Nothing written. Re-run with --apply to write.`);
  } else {
    log(`APPLIED: ${report.applied.length} access-policy record(s) updated.`);
  }
  if (report.skipped.length > 0) {
    log(`SKIPPED: ${report.skipped.length} record(s) with no applicable rule (never guessed an owner).`);
  }

  return report;
}

// --- main(): the thin wiring layer (config -> resolved dir -> real store) ---

function findConfigPath(base: string): string {
  if (process.env.CONFIG_PATH) return process.env.CONFIG_PATH;
  const direct = resolve(base, 'config.yaml');
  if (existsSync(direct)) return direct;
  const parent = resolve(base, '..', 'config.yaml');
  if (existsSync(parent)) return parent;
  return direct;
}

function expandHomePath(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  return path;
}

/** Resolve the data dir exactly the way server.ts does. */
function resolveConfiguredPath(base: string, path: string): string {
  const expanded = expandHomePath(path);
  return isAbsolute(expanded) ? expanded : resolve(base, expanded);
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const basePath = process.env.APP_BASE_PATH || process.cwd();

  let appConfig: AppConfig;
  try {
    appConfig = await loadConfig({ configPath: findConfigPath(basePath) });
  } catch {
    appConfig = { ...DEFAULT_APP_CONFIG };
  }

  // Same resolution as server.ts:449 (CL_DATA_DIR honoured via config.yaml's
  // ${CL_DATA_DIR:-~/.computable-lab} runtime substitution).
  const dataDir = resolveConfiguredPath(basePath, appConfig?.server?.dataDir ?? '~/.computable-lab');

  const repoConfig = getDefaultRepository(appConfig) ?? createEmbeddedDefaultRepositoryConfig('records');
  const repoAdapter = await createRepoAdapter({
    repoConfig,
    workspacePath: basePath,
    dataDir,
  });
  const recordsDir = repoConfig.records?.directory ?? 'records';
  const seedDir = resolveSeedRecordsDir();
  const store = createRecordStore(repoAdapter, createValidator(), createLintEngine(), {
    baseDir: recordsDir,
    ...(seedDir ? { seedDir } : {}),
  });

  const report = await applyOwnershipDefaults({
    store,
    service: new OwnershipPolicyService(store),
    resolvedDir: dataDir,
    apply,
  });

  if (report.skipped.length > 0) {
    console.warn(`Note: ${report.skipped.length} record(s) skipped for lack of an applicable rule. Review them; do not let a guess replace the document.`);
  }
}

/* Run main() only when invoked as the CLI entrypoint, never when imported by
   a unit test. tsx/node both surface the script path in process.argv[1]. */
const entry = process.argv[1] ? resolve(process.argv[1]) : '';
if (/applyOwnershipDefaults\.[cm]?[jt]sx?$/.test(entry)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
