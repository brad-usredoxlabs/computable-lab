# Handoff — QMS-4 Minimal DEMO seed + actor matrix COMPLETE (light-qms-records-browser)

Date: 2026-10-03 (~11:35 EDT). Orchestrator tick 2026-10-03T101017. Campaign: light-qms-records-browser.
Task: QMS-4 (THE LIST `/home/brad/.hermes/cl/task-list.md`).

## Status: DONE and orchestrator-verified

- Spec: `.hermes/plans/2026-10-03_qms-4-demo-seed-spec.md` (written this tick; fixture payloads,
  endpoints, the auth trap, deliverables and dev loop pinned there).
- Worker: cl-senior (local Qwen3.8 on thunderbeast), isolated worktree
  `/mnt/vast/home/brad/git/wt/qms-4`, branch `wt/qms-4` off `main @ dbb5ba3e`. ~54 min.
- Worker log `/tmp/qms-4-worker.log`; report
  `~/.hermes/cl/worker-reports/2026-10-03_qms-4.20261003-1113.md`.
- **Deliverable (canonical = the worktree branch):**
  - `644cda2c` `QMS-4: minimal DEMO seed + actor matrix` — 3 files, +830:
    `scripts/qms-demo-seed.mjs` (425 L), `scripts/qms-demo-seed.test.mjs` (322 L),
    `docs/qms-actor-matrix.QMS-4.20261003T101017.md` (draft path).
  - `63957878` (branch tip, written by ME — the promotion step): `git mv` of the draft matrix to the
    canonical `docs/qms-actor-matrix.md` + the one-line note fix. `R098`, no mode noise.
  - NOT merged to main (same merge-gate convention as QMS-1A/2/3).

## Orchestrator verification (run myself, not the worker summary)

- Read the full `scripts/qms-demo-seed.mjs` and `docs/qms-actor-matrix.md`; skimmed the test harness
  (real `node:test` assertions against the exported builders — not a stub).
- `node --test scripts/qms-demo-seed.test.mjs` in the worktree: **11/11 pass, exit 0.**
- **Ran the seed myself** against the live `:3001`: every fixture `skipped`, `EXIT:0` — idempotency
  proven independently of the worker's own runs (their logs record ~5 runs; the second effective run
  and the orchestrator run both skipped everything).
- Read back all 11 fixtures: `PER-DEMO-AUTHOR`, `PER-DEMO-REVIEWER`, `DOC-DEMO-SOP`, `TRM-DEMO-GC`,
  `TRR-DEMO-1`, `EQP-DEMO-GC`, `CAL-DEMO-GC` → **200**; both grants → **200 as `USR-LOCAL-ADMIN`,
  404 as `USR-BRAD`** (privileged owner ACL — see the carried facts).
- `GRANT-DEMO-REVIEWER` body: `roles: [reviewer, approver]`, `lifecycleId:
  document-controlled-signing`, `grantedBy: USR-LOCAL-ADMIN` (server `stampActorAs`) ✔.
- `DOC-DEMO-SOP`: `createdBy === authorRef.id === USR-BRAD`, `state: draft`,
  `lifecycleId: document-controlled-signing` ✔ (like-vs-like ids for `requires_different_person`).
- `git show --name-only` on both commits: only the 3 deliverables; `grep -c 'mode change'` = 0; no
  `app/`, `server/`, or `schema/` paths. Live tree HEAD still `dbb5ba3e`; `RecordRegistryPage.tsx`
  diff still mode-only (Brad's live work untouched). `:3001` never restarted.
- Persistence: all fixture files are committed in the DATA repo's embedded git
  (`/home/brad/.computable-lab/worktrees/main`, seed commit `415a194`), with no uncommitted leftovers
  → they survive a server restart. (An unattended tick does not restart Brad's server, so a literal
  restart test was NOT performed; the committed-substrate check is what stands in for it.)

## Carried facts for QMS-5 / QMS-6 / QMS-7 (read the matrix: `docs/qms-actor-matrix.md`)

1. **`GET /api/records/GRANT-*` is privileged** — 404 to `USR-BRAD`, 200 to `USR-LOCAL-ADMIN`. The
   seed initially fail-closed on it (correctly); the UI must not assume BRAD can browse grants.
2. **Auth trap:** `x-user-id: USR-LOCAL-ADMIN` works ONLY while the admin has no credential; once
   Brad runs `POST /auth/set-password` for `USR-LOCAL-ADMIN`, that header silently degrades to
   `USR-BRAD` and the seed/UI must use a real `x-cl-session` login. The seed's `CL_SEED_ADMIN_PASSWORD`
   branch handles it; its STOP message names the fix.
3. **QMS-6/7 signature rows are blocked until Brad sets the `USR-LOCAL-ADMIN` password** (bootstrap
   window still open at handoff time — `credentials.json` holds only `USR-BRAD`). QMS-7 owns that
   runbook text.
4. Matrix rows give role/guard/bundle expectations for all six transitions and name the exact cause
   behind the engine's coarse 422 message (M1 no-transition vs M2 role-or-guard). **Do not assign
   `USR-BRAD` to `reviewerRef`/`approverRef`** — it would erase QMS-7's role-denial rows.
5. **Mutations the seed performed on existing data (disclosed, content-preserving):** `USR-BRAD` and
   `USR-LOCAL-ADMIN` user records gained a `personRef`; the `USR-LOCAL-ADMIN` record additionally
   gained the schema-required `email` (`local-admin@usredoxlabs.com`) — its stored record predated
   auth and lacked it, so a naive merge-PUT was correctly rejected. Probe records
   (`ACL-GRANT-PROBE-QMS4`, `GRANT-PROBE-QMS4`) were created and removed.

## Escalation for an attended session (not absorbed)

**`schema/identity/role-grant.lint.yaml` is UNTRACKED in the live checkout and absent from `main`.**
I verified this independently: `git ls-files --error-unmatch` fails, `git cat-file -e
dbb5ba3e:schema/identity/role-grant.lint.yaml` → ABSENT, and the worktree does not have it. The
authoring gate nonetheless behaves live on `:3001` (the running server reads the untracked file), so
`grantedBy` stamping and `GRANT_FORBIDDEN` both worked. **A server built from a clean `main` has NO
role-grant authoring gate** — i.e. any actor could mint themselves QMS roles. This is a one-file
housekeeping commit; it touches no QMS-4 deliverable and is outside this task's file boundary.

## State / git

- Live tree `/mnt/vast/home/brad/git/computable-lab`: untouched, HEAD `dbb5ba3e` (my spec + handoff
  are the only additions).
- New: `/mnt/vast/home/brad/git/wt/qms-4` worktree; `safe.directory` entry added for it
  (matching the wt/qms-1a/2/3 precedent).
- THE LIST updated: QMS-4 → in-progress → **done**.
- Data repo: 11 DEMO fixtures + linkage, committed (append-only side effects per approved A4).

## Next ready item(s)

- **QMS-5** (Route `/registry` + one nav entry) — its last dependency QMS-4 finished *during* this
  tick, so it was NOT in this tick's ready set and was not dispatched. It is ready for the next tick.
  **Prerequisite an unattended tick cannot settle:** QMS-5's acceptance is a browser smoke gate, and
  the gate needs an app server serving the *worktree branch* (the live `:5174` serves Brad's checkout,
  which I must not merge into). The sanctioned worktree ports `:5191`/`:3091` are Brad's
  architect-ds4 stack (currently down) — I will not silently repurpose them or spawn an unsanctioned
  port pair. Decide the gate host (or authorize an attended merge of worktree branches into main)
  before QMS-5 is dispatched. The same question gates QMS-6.
- QMS-6 / QMS-7 remain dependency-blocked behind QMS-5.
