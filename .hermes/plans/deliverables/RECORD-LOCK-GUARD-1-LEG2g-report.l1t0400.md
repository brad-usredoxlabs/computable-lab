# RECORD-LOCK-GUARD-1 LEG2g Report — Unit 2g: applyProtocolEdit fail-closed gate coverage

## DEFECT
advc c2 DEFECT 3: applyProtocolEdit reaches the fail-closed gate unprimed.

## Commits

- **f9054f6f** — `unit 2g Commit A: RED test — applyProtocolEdit prime missing`
  RED test in `app/src/event-editor/right-pane/protocol/protocolEditOps.test.ts`.
  New test: `it('primes the content-lock cache before applyOps when payload carries lifecycleId')`.
  The test calls `__resetContentLockedStatesCache()`, stubs `apiClient.getLifecycleContentLockedStates`
  (added to the module `vi.mock` factory), and asserts the fetch fired and the update landed.

- **e4298fb2** — `unit 2g Commit B: prime content-lock cache before applyOps in applyProtocolEdit`
  GREEN: `protocolEditOps.ts` `applyProtocolEdit` now awaits `primeContentLockedStates(payload.lifecycleId)`
  after the `getRecord`/`payload` read and BEFORE `applyOps` — 3 lines at approximately `:380-382`,
  guarded by `typeof payload.lifecycleId === 'string'`.

## Orchestrator-Measured GREEN on e4298fb2

- `npx vitest run src/event-editor/right-pane/protocol/protocolEditOps.test.ts` = **24 passed / 0 failed**
- `npx vitest run src/shared/records` = **9/9**
- `npx vitest run src/event-editor/create` = **25/25** (4 files)

## TypeScript

`tsc` reports **12 pre-existing errors**, ALL in files this branch never touches
(verified against `git diff --name-only` vs `cl/integration-1`).
Zero new errors introduced by 2g.

## Changed Files

1. **protocolEditOps.test.ts** — New RED test (`f9054f6f`): primes the content-lock cache
   before `applyOps` when payload carries `lifecycleId`. Uses `__resetContentLockedStatesCache()`,
   stubs `apiClient.getLifecycleContentLockedStates` in the `vi.mock` factory, asserts fetch fired
   and update landed.

2. **protocolEditOps.ts** — `applyProtocolEdit` now awaits `primeContentLockedStates(payload.lifecycleId)`
   after the `getRecord`/`payload` read and BEFORE `applyOps` (3 lines at ~:380-382, guarded by
   `typeof payload.lifecycleId === 'string'`).

## Mutation Note

The test deletes-to-RED is **inferred** (not directly measured): `__resetContentLockedStatesCache()`
clears the cache, and without the prime line the fail-closed gate throws `'Lock status ... unavailable'`
before `updateRecord` is called. This is an inferred failure mode based on the gate's behavior, not
an independently re-run RED measurement.

## Commit Messages

- f9054f6f: unit 2g Commit A: RED test — applyProtocolEdit prime missing
- e4298fb2: unit 2g Commit B: prime content-lock cache before applyOps in applyProtocolEdit

L1-RECORD-LOCK-GUARD-1-LEG2G UNIT 2g DONE e4298fb2 (report authored retroactively by cl-paperwork-fixer from orchestrator-verified facts)