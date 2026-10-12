# OPS-1 (continuation) — make the reviewer/approver actor a real, login-capable identity

Lane 1 · campaign light-qms-records-browser · 2026-10-04
Supersedes the blocked half of `.hermes/plans/2026-10-03_ops-1-lane-isolation-spec.md`
(items 1–3 of that spec are DONE: lane data isolation proven at proc level, the grant-lint file
landed as tracked, the seed gap documented).

## Goal (one sentence)

Replace `USR-LOCAL-ADMIN` as the reviewer/approver actor with `USR-QMS-ADMIN` — a real, ordinary
(non-admin) user who can be resolved from the dev header AND can authenticate — so the two-person
signing lap in QMS-6B becomes exercisable.

## Why this is the fix (do not re-derive it)

`USR-LOCAL-ADMIN` can never act as a spoofable actor or hold a login:
- `LocalIdentityService.ensureLocalAdminUser()` (`server/src/security/LocalIdentityService.ts:43-46`)
  returns the **first active non-admin user**, so an `x-user-id: USR-LOCAL-ADMIN` request resolves to
  `USR-BRAD`. This is deliberate — `server/src/security/LocalAuthorization.test.ts:157-166` asserts it.
- `POST /auth/set-password` is self-service (`server/src/api/handlers/AuthHandlers.ts:100-105`): it
  writes the verifier for the **resolved** user, so attempting to set the admin's password silently
  sets `USR-BRAD`'s instead.
- When it does resolve as the true admin, `isSystem === true` and the handler refuses (403, `:101`).
- `POST /auth/login` rejects any user with no verifier (`AuthHandlers.ts:61-66`).

`USR-QMS-ADMIN` is an ordinary active user (username `qms-admin`), so it resolves directly from the
header (`LocalIdentityService.ts:114-122`), is never `isSystem`, and can set its own password and log
in. Brad created it and confirmed login works on `:5192`. Its record + credential are already present
in the lane's isolated stores.

`USR-BRAD` (the SOP author) must NOT be used as the approver: the `in_review → approved` transition
carries `requires_different_person(than: author)`, enforced as
`roleAssignments.author !== currentActorId` (`server/src/lifecycle/LifecycleEngine.ts:115-118`), and
`DOC-DEMO-SOP`'s author is `USR-BRAD`. `USR-BRAD` also holds only the `author` role by design (the
under-granted denial actor for QMS-7).

## Environment (verified by the orchestrator before dispatch)

- Lane 1 trunk `cl/integration-1` in worktree `/mnt/vast/home/brad/git/cl-integration-1`, HEAD `5eb5128b`, clean.
- Lane 1 dev stack: backend `http://localhost:3092`, frontend `http://localhost:5192` — healthy.
  Manage with `~/.hermes/profiles/orchestrator/scripts/cl-lane-stack.sh 1 start|stop|restart|status`.
- Lane 1 data dir: `/home/brad/.computable-lab-lane1` (backend runs with `CL_DATA_DIR` set to it —
  verified in the running process environment). Its records repo is
  `/home/brad/.computable-lab-lane1/worktrees/main`.
- `USR-QMS-ADMIN` resolves on the lane: `x-user-id: USR-QMS-ADMIN` → `USR-QMS-ADMIN`, `isSystem:false`.

## HARD BOUNDARIES

- NEVER touch `/mnt/vast/home/brad/git/computable-lab` (Brad's live tree) or `:3001`/`:5174`.
- NEVER write into `/home/brad/.computable-lab` (Brad's live data). Only the lane's own stores.
- Do NOT change `CL_DATA_DIR`, the stack scripts, or the identity code. This is a **data + docs** fix.
- Do NOT fabricate a credential. Do NOT re-open the admin bootstrap.
- Work only in the worktree assigned to you for this task.

## WORK ITEM 1 — retarget the reviewer/approver grant (lane DATA)

File: `/home/brad/.computable-lab-lane1/worktrees/main/records/role-grant/GRANT-DEMO-REVIEWER__untitled.yaml`

Current: `userId: USR-LOCAL-ADMIN`, `roles: [reviewer, approver]`,
`lifecycleId: document-controlled-signing`, `createdBy`/`grantedBy: USR-LOCAL-ADMIN`.

Required: the grant must point at `USR-QMS-ADMIN`, keeping `recordId`, `roles` and `lifecycleId`
unchanged. Prefer updating it **through the API** (`PUT /api/records/GRANT-DEMO-REVIEWER` on `:3092`)
so schema + lint validation actually run; a direct file edit is acceptable only if the API path is
blocked, and must then be followed by a stack restart and re-verification.

Also link the person, so the matrix's person-based rows stay coherent: `USR-QMS-ADMIN`'s user record
(`.../records/user/USR-QMS-ADMIN__untitled.yaml`) should carry `personRef` = `PER-DEMO-REVIEWER`
(the person `USR-LOCAL-ADMIN` was linked to).

Do NOT delete or repoint `GRANT-DEMO-AUTHOR` — `USR-BRAD` keeps `author` only.

## WORK ITEM 2 — update the seed so it reproduces this (lane TRUNK)

File: `scripts/qms-demo-seed.mjs` (in your worktree).

- Introduce the reviewer identity as a named constant (`USR-QMS-ADMIN` / username `qms-admin`) and use
  it everywhere the reviewer/approver actor is meant: the DEMO reviewer person's label, the
  `LINK-*` entry, `GRANT-DEMO-REVIEWER` (`userId`, and its `requires` list), and the `grantedBy`
  stamping. Keep `USR-LOCAL-ADMIN` only where it is genuinely the bootstrap/fallback identity.
- Fix the STOP text at `scripts/qms-demo-seed.mjs:37-41`. It currently instructs the operator to run
  `POST /auth/set-password` "(bootstrap window only)" — a call that cannot work: the window state it
  tests is `isSystem === true`, which is exactly the state `setPassword` refuses (403). Replace it
  with the working path: log in as an ordinary user and set that user's own password, or create the
  actor with `POST /users` (which persists the verifier to `dataDir/auth`).

## WORK ITEM 3 — correct the actor matrix doc (lane TRUNK)

File: `docs/qms-actor-matrix.md`.

- Replace `USR-LOCAL-ADMIN` as the reviewer/approver actor with `USR-QMS-ADMIN` throughout the actor
  fixture table and the transition matrix columns/rows, so the doc describes the actors that can
  actually act.
- CORRECT the claim at line 27: "**NOT set** until Brad runs `POST /auth/set-password` (bootstrap
  window open at seed time)". That bootstrap window is not reachable through the API — see "Why this
  is the fix" above. State the real position: `USR-LOCAL-ADMIN` is a bootstrap/fallback identity whose
  header request degrades to the first active non-admin user, and it cannot set its own password or
  log in. Keep this short and factual; cite the file:line evidence above.
- Keep the honest note that a signature-gated transition needs the acting session user's password
  (`POST /signatures` re-auth) — that constraint is real and still applies to `USR-QMS-ADMIN`.

## ACCEPTANCE (prove all of these; paste real command output)

1. `curl -s -H 'x-user-id: USR-QMS-ADMIN' http://localhost:3092/api/me` → `"userId":"USR-QMS-ADMIN"`,
   `"isSystem":false`.
2. `curl -s http://localhost:3092/api/records/GRANT-DEMO-REVIEWER -H 'x-user-id: USR-QMS-ADMIN'`
   → the grant, with `userId: USR-QMS-ADMIN` and roles `reviewer` + `approver`.
3. `curl -s -H 'x-user-id: USR-QMS-ADMIN' http://localhost:3092/api/records/USR-QMS-ADMIN`
   → `personRef` = `PER-DEMO-REVIEWER`.
4. The grant **persists across a stack restart**:
   `cl-lane-stack.sh 1 restart`, then re-run (2) → same answer.
5. `grep -n 'USR-LOCAL-ADMIN' docs/qms-actor-matrix.md` → no remaining row that presents
   `USR-LOCAL-ADMIN` as the reviewer/approver actor, and the "bootstrap window" claim is gone.
6. `grep -n 'set-password' scripts/qms-demo-seed.mjs` → the STOP text no longer tells the operator to
   run the impossible bootstrap-window call.
7. `git -C /mnt/vast/home/brad/git/cl-integration-1 status --short` shows your trunk edits only;
   Brad's live tree untouched (state it and show it).

## DO NOT

- Do not attempt the signed lap itself (minting a signature) — that is QMS-6B's browser gate and needs
  the actor's password, which you do not have.
- Do not fix the unwired grant-authoring gate (`getAuthoringPolicy` is not wired in `server.ts`, so
  grants are freely mintable on this trunk). That is a separate finding — note it in your report, do
  not act on it.
- Do not touch `USR-BRAD`'s grants, `DOC-DEMO-SOP`'s state, or the lifecycle YAML.

## REPORT BACK

Files changed with `git diff --stat`; the seven acceptance results verbatim; anything surprising,
especially any place the doc contradicted the code; and any open question. Commit in your worktree
with `git -c core.fileMode=false`. Do not merge.
