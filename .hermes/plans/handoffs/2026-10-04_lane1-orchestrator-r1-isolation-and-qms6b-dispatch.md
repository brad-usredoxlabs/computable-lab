# Handoff — lane 1: R1 isolation remedy applied + QMS-6B dispatched

Author: interactive orchestrator · 2026-10-04 ~09:25 EDT · campaign light-qms-records-browser
Task: OPS-1 (scope amendment R1) + QMS-6B (dispatch)

## What Brad decided (2026-10-04 ~09:00 EDT)

- R1 APPROVED; it is a SCOPE AMENDMENT to OPS-1 (touches config semantics, outside OPS-1b's "data+docs only" boundary).
- **QMS-6B MUST RUN**, whether or not isolation is real.
- All records are TEST DATA — the live/lane distinction is not a correctness hazard; no cleanup/disclosure needed.

## What the orchestrator did

1. **R1 applied.** `config.yaml:5` → `dataDir: ${CL_DATA_DIR:-~/.computable-lab}`. config.yaml is GITIGNORED
   (.gitignore:36) and the lane worktree's copy is a SYMLINK to the same file → runtime config, no commit.
   Loader already substitutes `${VAR:-default}` (config/loader.ts:71-93, applied at :696); `resolveConfiguredPath`
   expands `~` (server.ts:202-205). Brad's non-CL_DATA_DIR stack is unchanged.
2. **Lane-1 stack restarted.** `:3092` backend.log now prints `Data dir: /home/brad/.computable-lab-lane1`.
   CORRECTED isolation proof = that log line + a lane-only record (`BUD-DEMO-LANE1`) returning 200 through :3092.
   The old `/proc environ` proof was INVALID (witness-only).
3. **Lane DATA preconditions completed via the lane API (verified on :3092):**
   - `GRANT-DEMO-REVIEWER.userId` = `USR-QMS-ADMIN`, roles `[reviewer, approver]`.
   - `ACL-GRANT-DEMO-REVIEWER.ownerUserId` = `USR-QMS-ADMIN` (was `USR-LOCAL-ADMIN`, unresolvable → 403/404).
   - `USR-QMS-ADMIN.personRef` = `PER-DEMO-REVIEWER`.
   - `ACL-DOC-DEMO-SOP` now grants `{principalType: user, principalId: USR-QMS-ADMIN, role: editor}`.
     Before this, DOC-DEMO-SOP was private-to-author (USR-BRAD) so the reviewer could not read/act on it —
     the two-person lap was structurally impossible.
   - `BUD-DEMO-LANE1` + `ACL-BUD-DEMO-LANE1` copied from the live dir into the lane dir (EDITOR-2 fixture
     that had leaked there because isolation was fake).
4. **OPS-1b worker STOPPED.** PID 3032193 (started 07:02, ran 2h26m, ZERO trunk artifacts; lane-data portion
   superseded; its spec would have restarted :3092 mid-gate). No artifacts lost.
5. **QMS-6B spec amended** (`.hermes/plans/2026-10-04_qms-6b-integrated-browser-gate-spec.md`):
   corrected isolation proof; set-password field is `password` (not `newPassword`); lane-data preconditions recorded.
6. **QMS-6B DISPATCHED** — `cl-browser-reviewer` PID 3400103, log
   `~/.hermes/cl/lanes/1/qms-6b-browser-20261004T0925.log`, candidate revision `6e87f1e9`, receipts base
   `~/.hermes/cl/receipts/QMS-6B/`.

## State / next checks

- **OPS-1 REMAINING (NOT QMS-6B preconditions):** trunk items 2-3 — `scripts/qms-demo-seed.mjs` STOP text +
  reviewer identity (`USR-QMS-ADMIN` everywhere the reviewer/approver actor is meant); `docs/qms-actor-matrix.md`
  correction. Deferred to a fresh worker or the next lane-1 tick.
- **QMS-6B:** awaiting the browser reviewer's single verdict (`accept` | `fix` | `BLOCKED`). On `fix`, route the
  defect list (absolute screenshot paths) to the owning coder (EDITOR-2 vs QMS-6A by surface) and re-review.
- **QMS-7** remains dep-blocked on QMS-6B.

## assumptions

- A-L1-001 (see `~/.hermes/cl/lanes/1/assumptions.md`): R1 config value + lane demo ACL/linkage adjustments.
  Reversible; evidence_debt false (Brad: all records are test data).

## Durable-state note

Only the orchestrator marks tasks done. OPS-1 stays `in-progress` (trunk items 2-3 outstanding). QMS-6B is
`todo`/dispatched, not done, until a verified `VERDICT: accept` plus the orchestrator's own acceptance.