// L1-RECORD-LOCK-GUARD-1 LEG 1 — the declared content-lock policy is lifecycle
// DATA (AM-1): the states each lifecycle YAML declares `contentLocked: true`.
// This module owns the ONE shared engine-backed resolver channel every
// consumer uses to resolve `lifecycleId -> declared contentLocked set`:
//   - RecordStoreImpl.contentLockError + the AM-3 no-op predicate (store);
//   - RecordHandlers.updateRecord controlled-content lock (handler);
//   - the protocol-steps route G2 gate (route).
// Each consumer takes an injected resolver (AM-2: production = server.ts's
// OWN loaded LifecycleEngine, AM-10) and falls back to the default engine
// below when no engine is injected (test harnesses, CLI scripts). The policy
// data lives ONLY in the lifecycle YAML — no state list is invented in TS
// (AM-7 bait 15: two policies = automatic reject).
//
// Fail-open is EXPLICIT and commented (AM-10 bait 14): an id the resolver's
// engine has not loaded resolves to `undefined` = "no declared policy" and
// the consumer fails open. That is the designed behavior for undeclared
// lifecycles — NOT a bug and NOT a place to special-case an id. A loaded
// lifecycle that declares no contentLocked state resolves to an EMPTY set
// (AM-9f: empty ≠ undefined at every consumer).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LifecycleEngine } from './LifecycleEngine.js';
import { loadLifecyclesFromDir } from './LifecycleLoader.js';

let defaultEngine: LifecycleEngine | undefined;

/**
 * The shared engine-backed resolver for the declared content-lock policy.
 * Lazily builds one engine from the worktree's declared lifecycle YAML on
 * first use and reports its contentLocked sets. Returns `undefined` for a
 * lifecycle the engine has not loaded (explicit fail-open) and an EMPTY set
 * for a loaded lifecycle that declares no contentLocked state.
 */
export function defaultContentLockedStates(lifecycleId: string): ReadonlySet<string> | undefined {
  if (!defaultEngine) {
    defaultEngine = new LifecycleEngine();
    // Worktree-root schema dir: from src/lifecycle that is '../../../schema'
    // (src -> server -> worktree root). The symlinked server/schema points at
    // the TRUNK worktree and would read stale YAML, so the path reaches THIS
    // worktree's own declared data — same convention as the meta-schema pins
    // (lifecycleContentLock.test.ts, registryOpsLifecycle.test.ts). If the
    // dir is missing, loadLifecyclesFromDir reports 0 and every id stays
    // fail-open (undefined) — documented, not an accident.
    loadLifecyclesFromDir(
      join(dirname(fileURLToPath(import.meta.url)), '../../../schema/core/lifecycles'),
      defaultEngine,
    );
  }
  return defaultEngine.contentLockedStates(lifecycleId);
}
