# SPEC — OPS-1 · Isolate lane-1 data, re-seed the lane, and land the grant lint file

Lane 1 · trunk `cl/integration-1` · worktree `/mnt/vast/home/brad/git/cl-integration-1`
Tick `20261003T200307` · spec authored by orchestrator.

## Goal (one sentence)
Prove lane-1 is data-isolated to `/home/brad/.computable-lab-lane1`, re-seed it idempotently
against `:3092`, land `schema/identity/role-grant.lint.yaml` under git, and record the exact
`POST /auth/set-password` target for Brad — without touching Brad's live data dir or stack.

## State found by the orchestrator BEFORE dispatch (verified this tick — treat as STARTING TRUTH, re-prove it)
1. The backend answering `:3092` (pid 1790562, cwd `.../cl-integration-1/server`) **already runs**
   with `CL_DATA_DIR=/home/brad/.computable-lab-lane1` (read from `/proc/1790562/environ`).
   The QMS-6 handoff's claim of "no CL_DATA_DIR" is STALE — a later `cl-lane-stack.sh 1 start`
   (which always sets CL_DATA_DIR) replaced that process.
2. The lane data dir is **already a live, independent data repo**: `repos/main.git` +
   `worktrees/main/` exist; last commit `bcf5744` dated 2026-10-03 18:36; 529 record YAML files.
   Its HEAD (`bcf574496372…`) DIFFERS from Brad's live data repo HEAD (`4253f5726a00…`) and its
   record count (529) differs from live (542) ⇒ the two repos are genuinely separate.
3. All key fixtures answer 200 on `:3092`: `DOC-DEMO-SOP`, `CAL-DEMO-GC`, `TRR-DEMO-1`,
   `EQP-DEMO-GC`, `PER-DEMO-AUTHOR`, `USR-LOCAL-ADMIN`.
4. `schema/identity/role-grant.lint.yaml` in the lane worktree is **a symlink to Brad's live
   checkout** (via `cl-lane-sync.sh`) and is **NOT tracked** by git
   (`git ls-files --error-unmatch` fails). The live file exists:
   `/mnt/vast/home/brad/git/computable-lab/schema/identity/role-grant.lint.yaml` (1244 bytes).
5. `:3092` credentials file `/home/brad/.computable-lab-lane1/auth/credentials.json` contains
   **only `USR-BRAD`** (no `USR-LOCAL-ADMIN`) ⇒ the auth bootstrap window for the lane is OPEN.

## Orientation recon (cl-scout, tick 20261003T200307 — SCREENING, re-verify anything load-bearing)
- **seed invocation**: `node scripts/qms-demo-seed.mjs`; base URL from env `CL_API_BASE`,
  **default `http://localhost:3001`** — so a lane run MUST export
  `CL_API_BASE=http://127.0.0.1:3092`. Optional `CL_SEED_ADMIN_PASSWORD` for session auth;
  otherwise it uses a bootstrap header (`x-user-id: USR-LOCAL-ADMIN`) gated on
  `GET /api/me` returning `{userId:'USR-LOCAL-ADMIN', isSystem:true}`.
- **seed is idempotent**: it does `GET /api/records/{id}` first and `skipped` when it exists;
  it NEVER updates an existing fixture (only writes on `action==='create'`).
- **seed prerequisites**: `USR-LOCAL-ADMIN` and `USR-BRAD` must pre-exist; the seed creates
  `PER-*`/`GRANT-*`/`LINK-*`/`DOC-*`/`TRM-*`/`TRR-*`/`EQP-*`/`CAL-*` fixtures but **never creates
  users** (file header: "NO passwords, NO users … are ever written"). Fixture ids:
  `PER-DEMO-AUTHOR`, `PER-DEMO-REVIEWER`, `LINK-USR-BRAD`, `LINK-USR-LOCAL-ADMIN`,
  `DOC-DEMO-SOP`, `TRM-DEMO-GC`, `TRR-DEMO-1`, `EQP-DEMO-GC`, `CAL-DEMO-GC`,
  `GRANT-DEMO-AUTHOR`, `GRANT-DEMO-REVIEWER`.
- **auth resolution in server** (`server/src/server.ts:490-492`): `authDir = join(dataDir,'auth')`,
  so the credential file follows `CL_DATA_DIR` ⇒ lane credentials live at
  `/home/brad/.computable-lab-lane1/auth/credentials.json`.
- **set-password** (`server/src/api/handlers/AuthHandlers.ts:87-107`): self-service, resolves the
  caller from the request (`LocalIdentityService.resolveRequestUser`), rejects `isSystem`, min 8
  chars.

## Deliverables (UNIQUE paths — item id + tick token `20261003T200307`)
- Branch: `wt/ops-1-lane1-20261003T200307`, worktree `/mnt/vast/home/brad/git/wt/ops-1-lane1`.
- Committed file: `schema/identity/role-grant.lint.yaml` (canonical path; exact copy of the live
  file's contents, byte-for-byte as text). NOTE: `cl-lane-sync.sh` installed a **symlink** there —
  you MUST `git rm --cached` it if staged, then write the real file contents and `git add` the
  **regular file** (never commit the symlink), and confirm the symlink/exclude cannot re-shadow it.
- Worker report: `.hermes/plans/worker-reports/ops-1-20261003T200307.md` (never overwrite another
  item's report).

## Steps
1. **Inspect first, then act.** Read `scripts/qms-demo-seed.mjs` (§auth resolution),
   `/home/brad/.hermes/profiles/orchestrator/scripts/cl-lane-stack.sh`,
   `cl-lane-sync.sh` before running anything. Do not assume.
2. **Prove isolation at proc level** (re-derive, don't quote this spec): pid listening on `:3092`,
   its `/proc/<pid>/environ` contains `CL_DATA_DIR=/home/brad/.computable-lab-lane1`, its cwd is the
   lane worktree's `server/`. Then prove the data repo it serves is the lane one (record file that
   `:3092` returns exists under `/home/brad/.computable-lab-lane1/worktrees/main/`, and the lane
   data-repo HEAD differs from `/home/brad/.computable-lab/worktrees/main`'s).
   Do NOT copy Brad's live data anywhere. NEVER touch `:3001`/`:5174` or any process on those ports.
3. **Re-seed idempotently.** Run
   `CL_API_BASE=http://127.0.0.1:3092 node scripts/qms-demo-seed.mjs`
   from the worktree root. Expect every fixture `skipped` (already present). Rerun once more and
   confirm identical all-`skipped` output (idempotency proof). Paste the SUMMARY output.
   If you hit the AUTH STOP (bootstrap window closed), STOP and escalate — do NOT set a password
   (Brad owns that step) and do NOT fall back to Brad's live dir.
4. **Land the grant lint file under git.** Copy the exact contents of
   `/mnt/vast/home/brad/git/computable-lab/schema/identity/role-grant.lint.yaml` into
   `schema/identity/role-grant.lint.yaml` as a **regular tracked file** (replace the sync symlink),
   commit on your branch as housekeeping (do NOT redesign its policy). After the orchestrator
   merges, `git ls-files --error-unmatch schema/identity/role-grant.lint.yaml` must succeed on the
   trunk.
5. **Record the set-password target.** Determine, by reading code AND a live probe, exactly how
   Brad's `POST /auth/set-password` must be issued against the ISOLATED lane. Expected (verify,
   don't assume): the lane's credential file is `/home/brad/.computable-lab-lane1/auth/credentials.json`;
   with only `USR-BRAD` present the bootstrap window is open, so the curl is
   `curl -sS -X POST http://localhost:3092/api/auth/set-password -H 'content-type: application/json' -H 'x-user-id: USR-LOCAL-ADMIN' -d '{"password":"<8+ chars>"}'`.
   Prove the bootstrap window by probing `GET /api/me` with `x-user-id: USR-LOCAL-ADMIN` on `:3092`
   and reporting the actual JSON. State the verbatim curl + the credentials file path in the report.
   DO NOT actually set the password (Brad runs it).
6. **Confirm Brad's live data + stack untouched:** show that `/home/brad/.computable-lab/worktrees/main`
   HEAD and record count are unchanged from the values above, and that you issued zero requests to
   `:3001`/`:5174`.

## Acceptance (orchestrator verifies — not your word)
- Proc-level evidence of `CL_DATA_DIR` on the `:3092` pid + cwd, and lane-vs-live data-repo divergence.
- Seed summary from step 3 showing all `skipped`, twice (idempotency).
- `git diff`/`git show --stat` of your single commit adding `schema/identity/role-grant.lint.yaml`
  as a regular file (not a symlink); post-merge `git ls-files --error-unmatch` passes on trunk.
- Live `GET /api/me` bootstrap probe JSON + the verbatim set-password curl + credential file path.
- Proof Brad's live repo HEAD/count unchanged; no `:3001`/`:5174` traffic.

## Stop boundaries
- If the lane is NOT actually isolated (env/proc says otherwise), or the seed cannot bootstrap,
  STOP and return `requires-rescope` with the exact failure. Never hand-forge users, never fall
  back to Brad's live dir, never set a password.
- No code changes beyond the grant-lint file. No schema/lint policy edits.
- Do NOT restart `:3092`/`:5192` unless you must; if you do, use
  `/home/brad/.hermes/profiles/orchestrator/scripts/cl-lane-stack.sh 1 restart` (never pkill;
  never a global `tsx.*server.ts` pattern).
