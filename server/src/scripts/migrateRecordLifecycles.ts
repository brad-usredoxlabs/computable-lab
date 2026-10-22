/**
 * migrateRecordLifecycles — QMS7-4 migration that brings existing working-data
 * records of the COVERED registry kinds under their declared lifecycle
 * (schema/registry/registry-kinds.registry.yaml), through the existing
 * validation/audit/git-backed store write path.
 *
 * Usage (CONFIG_PATH is REQUIRED — the repo-root config.yaml is a symlink to
 * the LIVE computable-lab data config; running without CONFIG_PATH would edit
 * the live data repo, so the CLI refuses outright):
 *   CONFIG_PATH=/home/brad/.hermes/cl/lanes/1/lane1-config.yaml npx tsx src/scripts/migrateRecordLifecycles.ts           # dry run
 *   CONFIG_PATH=... npx tsx src/scripts/migrateRecordLifecycles.ts --apply   # writes
 *
 * Posture (spec 2026-10-16_QMS7-4-migration-archive-spec.md §2, OWN-13
 * applyOwnershipDefaults precedent, non-negotiable):
 * - DRY RUN BY DEFAULT. Writes happen ONLY with --apply.
 * - The resolved data dir is printed FIRST; the script never touches a dir it
 *   did not name.
 * - Coverage-driven: the covered kinds come from KindLifecycleRegistry.kinds();
 *   records of other kinds are never listed, never touched. NO kind names in TS.
 * - The domain-status -> lifecycle-state mapping is DATA (the coverage file's
 *   `migration:` block, OQ2 ruling); the runner never guesses per-kind in TS.
 * - Idempotent: a payload already carrying lifecycleId is SKIPPED with a
 *   printed line; the second run's dry report plans ZERO changes (keyed on
 *   payload content, not mtimes).
 * - Writes preserve ids/refs/domain statuses/authorship: the payload copy ADDS
 *   only lifecycleId + state.
 * - ONE store.update per record with expectedSha + viaLifecycleApi + actor —
 *   NEVER skipValidation/skipLint. Validation, lint, the append-only wall, the
 *   content lock, git-backed durability and the audit path all run. A store
 *   refusal is REPORTED as blocked and the record is left untouched — never
 *   forced, never retried with skips.
 *
 * The core is a plain function over injected (store, coverage, engine,
 * resolvedDir, apply, log) so unit tests inject MemoryRecordStore + a fake dir
 * string and never read config. main() is the thin wiring layer: CONFIG_PATH ->
 * loadConfig -> resolved data dir -> real store, exactly the way server.ts
 * resolves it.
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import type { RecordEnvelope, RecordStore } from '../store/types.js'
import { createRecordStore } from '../store/RecordStoreImpl.js'
import { createRepoAdapter } from '../repo/createRepoAdapter.js'
import { createValidator } from '../validation/AjvValidator.js'
import { createLintEngine } from '../lint/LintEngine.js'
import { loadConfig, getDefaultRepository, createEmbeddedDefaultRepositoryConfig } from '../config/loader.js'
import { DEFAULT_CONFIG as DEFAULT_APP_CONFIG, type AppConfig } from '../config/types.js'
import { resolveSeedRecordsDir } from '../index/seedRecordsDir.js'
import { LifecycleEngine } from '../lifecycle/LifecycleEngine.js'
import { loadLifecyclesFromDir } from '../lifecycle/LifecycleLoader.js'
import { loadKindLifecycleRegistry, collectKnownKinds, type KindLifecycleRegistry } from '../registry/KindLifecycleRegistry.js'
import { loadAllSchemas } from '../schema/SchemaLoader.js'
import { createSchemaRegistry } from '../schema/SchemaRegistry.js'

// ============================================================================
// Report shape (mirrors OWN-13's MigrationReport)
// ============================================================================

/** One planned (or applied) governance stamp on a single record. */
export interface LifecycleMigrationChange {
  recordId: string;
  kind: string;
  /** The lifecycle state the record will carry (from the DATA mapping). */
  toState: string;
  /** Which declared mapping arm decided toState. QMS8-C (A1-3) adds
   *  'status-stamp': the lifecycle-declared leg stamps state := status (the
   *  schema's status enum and the lifecycle's declared states are the same
   *  vocabulary, so the mapping is the identity — a stamp, not a mapping).
   *  QMS8-C (D4/D5): 'status-strip' retires a governed record's retired domain
   *  status; the QMS7-4 'status-map' arm is retired WITH its data (D4 tail). */
  basis: 'default' | 'status-stamp' | 'status-strip';
}

/** One already-governed record deliberately left untouched. */
export interface LifecycleMigrationSkip {
  recordId: string;
  kind: string;
  reason: string;
}

/** One record the store REFUSED — reported, never forced. */
export interface LifecycleMigrationBlocked {
  recordId: string;
  kind: string;
  reason: string;
}

export interface LifecycleMigrationReport {
  resolvedDir: string;
  totalRecords: number;
  planned: LifecycleMigrationChange[];
  applied: LifecycleMigrationChange[];
  skipped: LifecycleMigrationSkip[];
  blocked: LifecycleMigrationBlocked[];
}

export interface LifecycleMigrationInput {
  /** Store the migration reads AND writes (the data repo's store). */
  store: RecordStore;
  /** The coverage registry — the ONLY source of covered kinds + mapping data. */
  coverage: KindLifecycleRegistry;
  /** Loaded lifecycle engine (declared-state checks read its YAML facts). */
  engine: LifecycleEngine;
  /** Absolute resolved data dir, injected by the caller (main() wires loadConfig). */
  resolvedDir: string;
  /** false (default posture) = plan + print only; true = write the ungoverned records. */
  apply: boolean;
  /** Output sink; defaults to console.log so tests can capture lines. */
  log?: (line: string) => void;
  /** Acting identity carried on every sanctioned write (bypass-audit actor). */
  actor?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Resolve the target lifecycle state for one UNGOVERNED record STRICTLY from
 * declared coverage data. QMS8-C (D5 / D4 tail): the QMS7-4 status-map block is
 * retired with its data — a covered create can no longer carry a domain status
 * (the schema refuses it) and every governed record carries its own state, so
 * the ONLY declared source left is the coverage entry's `defaultState`. A
 * record that still carries a domain status has no declared mapping: the
 * runner reports it, never guesses (bait #5's surviving form). Returns
 * undefined when the data cannot decide.
 */
function mappedState(
  payload: Record<string, unknown>,
  coverage: KindLifecycleRegistry,
  engine: LifecycleEngine,
): { toState: string; basis: LifecycleMigrationChange['basis'] } | undefined {
  if (asString(payload.status) !== undefined) {
    // No declared status->state mapping exists any more. A status-bearing
    // ungoverned record is undecided data — reported, never guessed.
    return undefined
  }
  const toState = coverage.entryFor(String(payload.kind))?.defaultState
  if (toState === undefined) return undefined
  const spec = engine.specFor(coverage.lifecycle)
  if (!spec || !spec.states.some(s => s.id === toState)) return undefined
  return { toState, basis: 'default' }
}

/**
 * Core migration. Plain over injected (store, coverage, engine, resolvedDir):
 * no config read, no env read, no fs path built from anything but the injected
 * dir string. Returns the full report; prints as it goes.
 */
export async function migrateRecordLifecycles(input: LifecycleMigrationInput): Promise<LifecycleMigrationReport> {
  const log = input.log ?? ((line: string) => console.log(line))

  // Requirement 1: name the dir FIRST. Never touch a dir we did not name.
  log(`Data dir: ${input.resolvedDir}`)

  const lifecycleId = input.coverage.lifecycle
  const report: LifecycleMigrationReport = {
    resolvedDir: input.resolvedDir,
    totalRecords: 0,
    planned: [],
    applied: [],
    skipped: [],
    blocked: [],
  }

  // Requirement 2: coverage-driven. Only the covered kinds are listed; records
  // of every other kind are never listed, never touched. NO kind names here.
  for (const kind of input.coverage.kinds()) {
    const envelopes = await input.store.list({ kind, limit: 10000 })
    report.totalRecords += envelopes.length

    for (const env of envelopes) {
      const payload = asRecord(env.payload)
      const recordId = env.recordId

      // Idempotency key is PAYLOAD CONTENT. QMS8-C (D4) CHANGES that key for
      // kinds the coverage DATA declares retired: "already governed" is no
      // longer terminal, because a governed record that still carries the
      // retired domain status is exactly what the strip leg must process.
      // A governed record is terminal only when it is governed AND status-less
      // (or its kind's status is not retired — an orthogonal domain vocabulary
      // the coverage data does not declare dead, spec §g / stop boundary 2).
      const existingLifecycle = asString(payload.lifecycleId)
      if (existingLifecycle !== undefined) {
        const existingState = asString(payload.state)
        const domainStatus = asString(payload.status)
        const retiring = input.coverage.entryFor(kind)?.stripDomainStatus === true

        if (domainStatus === undefined || !retiring) {
          const stateLabel = existingState ?? '(unset)'
          report.skipped.push({
            recordId,
            kind,
            reason: retiring
              ? `already governed (${existingLifecycle}/${stateLabel}) and carries no domain status to retire`
              : `already governed (${existingLifecycle}/${stateLabel}); the coverage data does not declare this kind's domain status retired`,
          })
          log(`SKIP ${recordId}: already governed (${existingLifecycle}/${stateLabel})${retiring ? '' : ' — domain status not declared retired for this kind'}`)
          continue
        }

        // Governed, carries the retired status, but carries NO lifecycle state:
        // stripping would leave the gate with nothing to read, and the runner
        // never synthesizes a state (BRAD-A1). Reported, never touched.
        if (existingState === undefined) {
          report.skipped.push({
            recordId,
            kind,
            reason: `governed by ${existingLifecycle} but carries no lifecycle state — stripping the domain status would leave nothing for the gate to read, and a state is never synthesized`,
          })
          log(`SKIP ${recordId}: governed but state-less — cannot retire status without a state, never synthesized`)
          continue
        }

        const change: LifecycleMigrationChange = {
          recordId, kind, toState: existingState, basis: 'status-strip',
        }
        report.planned.push(change)
        log(`STRIP ${recordId}: domain status retired (state ${existingState})`)

        // Writes ONLY with --apply, through the normal walls.
        if (input.apply) {
          // bait #1 (exactOptionalPropertyTypes): the key is DELETED on a
          // clone, never assigned `undefined`.
          const nextPayload: Record<string, unknown> = { ...payload }
          delete nextPayload.status
          const envelope: RecordEnvelope = { ...env, payload: nextPayload }
          const result = await input.store.update({
            envelope,
            ...(env.meta?.contentSha !== undefined ? { expectedSha: env.meta.contentSha } : {}),
            message: `Retire domain status on ${recordId} (${existingLifecycle}/${existingState}, QMS8-C migration)`,
            viaLifecycleApi: true,
            ...(input.actor !== undefined ? { actor: input.actor } : {}),
          })
          if (!result.success) {
            const reason = result.error ?? 'unknown store refusal'
            report.blocked.push({ recordId, kind, reason })
            log(`BLOCKED ${recordId}: store refused (${reason}) — left untouched, never forced`)
            continue
          }
          report.applied.push(change)
        }
        continue
      }

      const mapped = mappedState(payload, input.coverage, input.engine)
      if (!mapped) {
        report.skipped.push({
          recordId,
          kind,
          reason: 'no declared mapping: the coverage migration data does not decide a state for this payload — never guessed',
        })
        log(`SKIP ${recordId}: no declared mapping in the coverage migration data — not touched, never guessed`)
        continue
      }

      const change: LifecycleMigrationChange = { recordId, kind, toState: mapped.toState, basis: mapped.basis }
      report.planned.push(change)
      log(`${recordId}: ungoverned -> ${lifecycleId}/${mapped.toState} (kind ${kind}, mapping ${mapped.basis})`)

      // Requirement 3: writes ONLY with --apply, through the normal walls.
      if (input.apply) {
        const nextPayload: Record<string, unknown> = {
          ...payload,
          lifecycleId,
          state: mapped.toState,
        }
        // QMS8-C (D4): when the coverage DATA declares this kind's domain
        // status retired, a record being governed now must not land carrying a
        // field the item is retiring — the status is omitted on the clone
        // (deleted, never assigned undefined). Without this the record would be
        // governed-but-still-status-bearing and the next pass would plan a
        // strip, so the migration would never converge in one run.
        if (input.coverage.entryFor(kind)?.stripDomainStatus === true) {
          delete nextPayload.status
        }
        const envelope: RecordEnvelope = { ...env, payload: nextPayload }
        const result = await input.store.update({
          envelope,
          ...(env.meta?.contentSha !== undefined ? { expectedSha: env.meta.contentSha } : {}),
          message: `Govern ${recordId} under ${lifecycleId} (QMS7-4 migration)`,
          // Sanctioned, reported, git-committed assignment — NOT a bypass:
          // without the marker the BypassAudit detector self-reports every
          // migrated record as lifecycle_state_bypass (bait #8).
          viaLifecycleApi: true,
          ...(input.actor !== undefined ? { actor: input.actor } : {}),
        })
        if (!result.success) {
          // A store refusal (append-only, content lock, sha mismatch,
          // validation) is REPORTED and the record is left untouched —
          // never forced, never retried with skips.
          const reason = result.error ?? 'unknown store refusal'
          report.blocked.push({ recordId, kind, reason })
          log(`BLOCKED ${recordId}: store refused (${reason}) — left untouched, never forced`)
          continue
        }
        report.applied.push(change)
      }
    }
  }

  // QMS8-C (A1-3): the lifecycle-stamp leg. Keyed by the coverage file's
  // `lifecycleMigrations:` DATA — keyed by LIFECYCLE, never by kind name, so
  // lifecycle-GOVERNED kinds (whose lifecycleId is declared per-schema, not in
  // `kinds:`) are reachable without a single kind literal in TS. A record is
  // stamped only when it (a) declares this lifecycle, (b) carries a domain
  // status, (c) carries NO lifecycle state, and (d) that status is a declared
  // state of the lifecycle. The stamp is the identity the schema enums declare
  // (status enum == lifecycle state enum), which is why this is a stamp and not
  // a mapping. Anything else is reported, never guessed.
  for (const instruction of input.coverage.lifecycleMigrations ?? []) {
    if (!instruction.stampStateFromDomainStatus) continue

    const spec = input.engine.specFor(instruction.lifecycleId)
    const declaredStates = new Set((spec?.states ?? []).map(s => s.id))

    // Enumerated by lifecycle, not by kind: every record is inspected, only the
    // ones declaring THIS lifecycle are ever listed or touched.
    const envelopes = await input.store.list({ limit: 10000 })
    for (const env of envelopes) {
      const payload = asRecord(env.payload)
      const recordId = env.recordId
      const kind = asString(payload.kind) ?? '(unknown)'
      if (asString(payload.lifecycleId) !== instruction.lifecycleId) continue

      const status = asString(payload.status)
      const state = asString(payload.state)

      // Idempotency key is PAYLOAD CONTENT: a state is already present -> SKIP.
      if (state !== undefined) continue

      if (status === undefined) {
        report.skipped.push({
          recordId,
          kind,
          reason: `governed by ${instruction.lifecycleId} with neither state nor domain status — nothing to stamp, never guessed`,
        })
        log(`SKIP ${recordId}: governed by ${instruction.lifecycleId} but carries no domain status to stamp from — not touched, never guessed`)
        continue
      }

      if (!declaredStates.has(status)) {
        report.skipped.push({
          recordId,
          kind,
          reason: `domain status "${status}" is not a declared state of the ${instruction.lifecycleId} lifecycle — never guessed`,
        })
        log(`SKIP ${recordId}: domain status "${status}" is not a declared state of ${instruction.lifecycleId} — not touched, never guessed`)
        continue
      }

      const change: LifecycleMigrationChange = {
        recordId, kind, toState: status, basis: 'status-stamp',
      }
      report.planned.push(change)
      log(`VOCAB-STATE ${recordId}: state stamped from status ${status} (${instruction.lifecycleId}, kind ${kind})`)

      // Writes ONLY with --apply, through the normal walls.
      if (input.apply) {
        const nextPayload: Record<string, unknown> = { ...payload, state: status }
        const envelope: RecordEnvelope = { ...env, payload: nextPayload }
        const result = await input.store.update({
          envelope,
          ...(env.meta?.contentSha !== undefined ? { expectedSha: env.meta.contentSha } : {}),
          message: `Stamp ${recordId} lifecycle state from domain status (${instruction.lifecycleId}, QMS8-C migration)`,
          viaLifecycleApi: true,
          ...(input.actor !== undefined ? { actor: input.actor } : {}),
        })
        if (!result.success) {
          const reason = result.error ?? 'unknown store refusal'
          report.blocked.push({ recordId, kind, reason })
          log(`BLOCKED ${recordId}: store refused (${reason}) — left untouched, never forced`)
          continue
        }
        report.applied.push(change)
      }
    }
  }

  // Report lines keep the QMS7-4 wording for the covered-kind leg (its existing
  // consumers and tests read them verbatim); the QMS8-C stamp leg reports its
  // own count on its own line so neither leg's number is conflated (bait #9).
  const countBasis = (rows: LifecycleMigrationChange[], basis: LifecycleMigrationChange['basis']) =>
    rows.filter(r => r.basis === basis).length
  const stampCount = (rows: LifecycleMigrationChange[]) => countBasis(rows, 'status-stamp')
  const stripCount = (rows: LifecycleMigrationChange[]) => countBasis(rows, 'status-strip')
  const governedCount = report.planned.length - stampCount(report.planned) - stripCount(report.planned)
  const governedApplied = report.applied.length - stampCount(report.applied) - stripCount(report.applied)

  if (governedCount === 0) {
    log('No planned changes: every covered-kind record already carries its declared lifecycle (idempotent).')
  } else if (!input.apply) {
    log(`DRY RUN: ${governedCount} planned change(s). Nothing written. Re-run with --apply to write.`)
  } else {
    log(`APPLIED: ${governedApplied} record(s) governed under ${lifecycleId}.`)
  }
  if (stampCount(report.planned) > 0 || stampCount(report.applied) > 0) {
    log(input.apply
      ? `STAMPED: ${stampCount(report.applied)} record(s) state-stamped from domain status.`
      : `DRY RUN: ${stampCount(report.planned)} state stamp(s) planned. Nothing written. Re-run with --apply to write.`)
  }
  if (stripCount(report.planned) > 0 || stripCount(report.applied) > 0) {
    log(input.apply
      ? `STRIPPED: ${stripCount(report.applied)} record(s) had the retired domain status removed.`
      : `DRY RUN: ${stripCount(report.planned)} status strip(s) planned. Nothing written. Re-run with --apply to write.`)
  }
  if (report.blocked.length > 0) {
    log(`BLOCKED: ${report.blocked.length} record(s) refused by the store walls — reported, never forced.`)
  }
  if (report.skipped.length > 0) {
    log(`SKIPPED: ${report.skipped.length} record(s) (already governed or no declared mapping — never guessed).`)
  }

  return report
}

// ============================================================================
// main(): the thin wiring layer (CONFIG_PATH -> config -> resolved dir -> store)
// ============================================================================

/**
 * CONFIG_PATH is REQUIRED (bait #4): the repo-root config.yaml is a symlink to
 * the live computable-lab config (dataDir ~/.computable-lab). The runner must
 * never default onto it. Exported so the CLI posture is unit-testable.
 */
export function requireConfigPath(env: NodeJS.ProcessEnv): string {
  const configPath = env.CONFIG_PATH
  if (typeof configPath !== 'string' || configPath.trim().length === 0) {
    throw new Error(
      'CONFIG_PATH is required: this migration must name the data dir it operates on. '
      + 'The repo-root ./config.yaml points at the LIVE data repo and is never a default. '
      + 'Example: CONFIG_PATH=/home/brad/.hermes/cl/lanes/1/lane1-config.yaml npx tsx src/scripts/migrateRecordLifecycles.ts',
    )
  }
  return configPath
}

function expandHomePath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return join(homedir(), path.slice(2))
  return path
}

/** Resolve the data dir exactly the way server.ts does. */
function resolveConfiguredPath(base: string, path: string): string {
  const expanded = expandHomePath(path)
  return isAbsolute(expanded) ? expanded : resolve(base, expanded)
}

/** Schema dir resolution mirrors server.ts's basePath-relative 'schema' option,
 *  with the same parent fallback applyOwnershipDefaults uses for config.yaml. */
function resolveSchemaDir(base: string): string {
  const direct = resolve(base, 'schema')
  if (existsSync(direct)) return direct
  return resolve(base, '..', 'schema')
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const basePath = process.env.APP_BASE_PATH || process.cwd()

  const configPath = requireConfigPath(process.env)
  const appConfig: AppConfig = await loadConfig({ configPath })

  // Same resolution as server.ts (CL_DATA_DIR honoured via the config's
  // ${CL_DATA_DIR:-...} runtime substitution).
  const dataDir = resolveConfiguredPath(basePath, appConfig?.server?.dataDir ?? '~/.computable-lab')

  const repoConfig = getDefaultRepository(appConfig) ?? createEmbeddedDefaultRepositoryConfig('records')
  const repoAdapter = await createRepoAdapter({
    repoConfig,
    workspacePath: basePath,
    dataDir,
  })
  const recordsDir = repoConfig.records?.directory ?? 'records'
  const seedDir = resolveSeedRecordsDir()

  const schemaDir = resolveSchemaDir(basePath)
  const loadResult = await loadAllSchemas({ basePath: schemaDir, recursive: true })
  const schemaRegistry = createSchemaRegistry()
  schemaRegistry.addSchemas(loadResult.entries)
  const validator = createValidator()
  for (const id of schemaRegistry.getTopologicalOrder()) {
    const entry = schemaRegistry.getById(id)
    if (entry) validator.addSchema(entry.schema, entry.id)
  }

  const engine = new LifecycleEngine()
  loadLifecyclesFromDir(resolve(schemaDir, 'core/lifecycles'), engine)
  const coverage = loadKindLifecycleRegistry(resolve(schemaDir, 'registry/registry-kinds.registry.yaml'), {
    lifecycle: engine,
    knownKinds: collectKnownKinds(schemaRegistry.getAll()),
  })

  const store = createRecordStore(repoAdapter, validator, createLintEngine(), {
    baseDir: recordsDir,
    ...(seedDir ? { seedDir } : {}),
    appendOnlyKinds: appConfig?.server?.appendOnlyKinds ?? DEFAULT_APP_CONFIG.server?.appendOnlyKinds ?? [],
  })

  const report = await migrateRecordLifecycles({
    store,
    coverage,
    engine,
    resolvedDir: dataDir,
    apply,
  })

  if (report.blocked.length > 0) {
    console.warn(`Note: ${report.blocked.length} record(s) were refused by the store walls. Review the reasons; do not force them past the walls.`)
  }
}

/* Run main() only when invoked as the CLI entrypoint, never when imported by
   a unit test. tsx/node both surface the script path in process.argv[1]. */
const entry = process.argv[1] ? resolve(process.argv[1]) : ''
if (/migrateRecordLifecycles\.[cm]?[jt]sx?$/.test(entry)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
}
