# Handoff — QMS-6 NOT DISPATCHED: lane environment + contract drift (BLOCKED)

Lane 1 · trunk `cl/integration-1` (HEAD `39ed95a4`) · 2026-10-03, orchestrator tick 20261003T142520

## Task
QMS-6 — Registry coverage + signature-aware DocumentControlBar + sign-off receipt.
Dependencies QMS-2/3/4/5/1A are all `done`, so QMS-6 is **dependency-ready** — but it is
**NOT workable this tick**. It was left `todo` (not claimed, no spec written, no worker
dispatched). This handoff records the three independent blockers with evidence so the
architect / Brad can clear them. Zero product code was written.

## Blocker 1 — THE CONTRACT FOR QMS-6 CHANGED 40 MIN AGO AND THE LIST IS STALE
A new decision doc landed in the intake at **14:34** (after the last tick, after the list's
last edit at 13:59):
`/home/brad/.hermes/specs/inbox/qms-integration-contract-2026-10-03-delta.md`
It is a delta to QMS-1's decisions doc and it **supersedes QMS-6's planned scope**:

- QMS-1 (h) is declared **VOID**: stale signatures are no longer "accepted". Merged code now
  returns `409 STALE_SIGNATURE` / `409 SIGNED_CONTENT_CHANGED` / `422 SIGNATURE_TARGET_MISMATCH`.
  QMS-6's acceptance criterion R3 ("stale-signature probe … captures whatever the server does")
  **must NOT be built** — it would assert the opposite of the shipping contract.
- New obligations for QMS-6: display the SIG snapshot id/contentHash; treat an unapplied SIG as
  NOT an approval (join SIG ↔ lifecycle transition event); a **separate** signature per gated
  transition; use `POST /records/:id/draft-copy` when editing an approved doc; approved/effective
  content is locked at HTTP **and** storage.
- A new task **QMS-3A** is named in the delta ("Tracked as QMS-3A": surface the three new error
  tokens in `app/src`). **QMS-3A does not exist in lane 1's task list** — THE LIST has not been
  reconciled with the delta.

Consequence: dispatching QMS-6 now would build against a superseded contract and collide with
Brad's in-flight signature-integrity work. **Do not dispatch QMS-6 until THE LIST is revised
by the architect** (add QMS-3A; re-scope QMS-6 to the delta; retire the R3 probe wording).

## Blocker 2 — THE LANE TRUNK'S CODE DOES NOT CONTAIN THE FEATURE THE DELTA DESCRIBES
The delta was verified against **Brad's live checkout**, not against `cl/integration-1`.
Evidence, opened this tick:

| Artifact the delta requires | Brad's live tree (`/mnt/vast/home/brad/git/computable-lab`, HEAD `dbb5ba3e`) | Lane trunk `cl/integration-1` (HEAD `39ed95a4`) |
|---|---|---|
| `server/src/revisions/RecordRevisionService.ts` (+ tests) | present, **UNTRACKED** (`git ls-files server/src/revisions` → empty) | **absent** (`ls server/src/revisions/` → No such file) |
| `RecordHandlers.ts` STALE_SIGNATURE / SIGNED_CONTENT_CHANGED (live :747/:750) | present (` M` tracked-modified) | **absent** (grep clean) |
| `server/src/api/routes.ts` `/records/:id/revisions`, `/records/:id/draft-copy` | modified (` M`) | **absent** (`grep -n 'revisions\|draft-copy' routes.ts` → only the unrelated `analysis-revisions` routes) |

Root cause: `cl-lane-sync.sh` only symlinks **untracked** files from the live checkout; it does not
carry **modified tracked** files. So even re-running the sync would link `revisions/*.ts` while
`RecordHandlers.ts`/`routes.ts` stay at HEAD — a half-wired feature. The lane's whole premise
("EXACTLY reproduce the file set the live server runs against", `cl-lane-sync.sh` header) is
currently false for any tracked file Brad has edited but not committed.

Verified-good sub-item from the delta (cheap, done): open question 2 — **both** signature-gated
transitions already declare `signatureAction: approved` in the lane's
`schema/core/lifecycles/document-controlled-signing.lifecycle.yaml` (lines 51-52 `in_review→approved`,
62-63 `approved→effective`). The effective transition is NOT fail-closed-blocked.

## Blocker 3 — THE LANE'S ISOLATED DATA REPO IS EMPTY OF THE CAMPAIGN FIXTURES (and cannot be seeded)
`cl-lane-stack.sh` was changed at **14:10** to run each lane on its own data dir
(`CL_DATA_DIR=/home/brad/.computable-lab-lane1`). That dir was created fresh at 14:11 and is a
blank lab: `records/{condition,organism,protocol}` only. The QMS-4 fixtures and the base identities
live **only** in Brad's data repo (`/home/brad/.computable-lab/worktrees/main`).
Live proof against the lane backend this tick:

```
GET :3092/api/records/DOC-DEMO-SOP      -> 404
GET :3092/api/records/PER-DEMO-AUTHOR   -> 404
GET :3092/api/records/TRR-DEMO-1        -> 404
GET :3092/api/me (x-user-id: USR-LOCAL-ADMIN) -> {"userId":null,"isSystem":false,"reason":"Unknown or inactive user: USR-LOCAL-ADMIN"}
```

Why it cannot simply be seeded:
1. **Do NOT copy Brad's data dir into the lane.** `references/parallel-lane-pipeline.md` is explicit:
   the embedded worktree's `.git` FILE holds an absolute `gitdir:` to its bare repo, so a copied
   tree still writes to the ORIGINAL — that would have the lane write into Brad's live data. The
   isolated dir must be bootstrapped fresh. (Checked and did NOT do the copy.)
2. **The fresh-lab admin bootstrap is broken (product defect).**
   `LocalIdentityService.ensureLocalAdminUser()` creates `USR-LOCAL-ADMIN` with a payload that omits
   `email`, but `schema/identity/user.schema.yaml:19` now makes `email` **required**. Server log:
   `Failed to bootstrap local admin user: Validation failed`. With no user in a fresh repo, the
   server has no acting identity at all, so nothing can be created through the API.
3. **The committed seed script (`scripts/qms-demo-seed.mjs`) cannot run on the lane** even if the
   admin existed, because its admin-actor resolution needs the *bootstrap window* — and that window
   is implemented only by Brad's **uncommitted** `LocalIdentityService.ts` + `AuthHandlers.ts`
   changes (self-closing `hasCredential` window; admin may set its own password during bootstrap).
   The lane runs the stale HEAD versions of both, so `x-user-id: USR-LOCAL-ADMIN` degrades to the
   first active user (or 403), and the seed STOPs at AUTH.
   Confirmed by running it: `CL_API_BASE=http://localhost:3092 node scripts/qms-demo-seed.mjs`
   → `AUTH STOPPED … the Local Admin bootstrap window is closed`.

Net: the signature-gated half of QMS-6 has **no reachable runtime** on lane 1. Brad's own credential
hash exists in his repo's `auth/credentials.json`; `USR-LOCAL-ADMIN` has none.

## What I did / did not do
- Did NOT dispatch any worker; no spec written; no branch; no merge; QMS-6 left `todo`.
- Verified: lane stack healthy (`:3092`/`:5192` both 200), trunk clean (only untracked
  `node_modules/` noise), Brad's live tree untouched (read-only inspection only).
- Experimented, then **reverted**: hand-wrote `USR-BRAD`/`USR-LOCAL-ADMIN` record files into the
  lane's own data dir to test the resolution path, then `rm -rf records/user` — the lane data repo
  is back to the state the tick found it in (only `?? var/`, server-generated).

## How to unblock (recommended, in order)
1. **Architect:** revise lane 1's THE LIST — add QMS-3A, re-scope QMS-6 to the delta, drop the R3
   stale-SIG-accepted probe. Until that lands, QMS-6 is not buildable to a stable contract.
2. **Brad (infra, needs a decision):** teach `cl-lane-sync.sh` to also carry **modified tracked**
   files from the live checkout (applied as working-tree changes, or as an explicitly-labelled
   lane-only commit) — otherwise every lane is a stale mirror of the code the user is actually
   running.
3. **Brad (product defect):** fresh-lab bootstrap — either give the hardcoded bootstrap admin
   payload a valid `email`, or better, move the first-run admin/user records into the server's
   data-driven seed dir (`records/seed/user/…`, already merged into `store.list`). A fresh data dir
   is currently unusable via the API.
4. **Then:** provision the lane data repo (seed fixtures into `/home/brad/.computable-lab-lane1`)
   and set the demo credentials, so the QMS-6 browser gate can exercise signing.

## Next ready task
QMS-6, once (1)-(4) are cleared. QMS-7 remains blocked behind QMS-6.
