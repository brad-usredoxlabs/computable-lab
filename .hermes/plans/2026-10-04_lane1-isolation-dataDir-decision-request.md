# Decision request (lane 1 → architect) — how to make lane-1 data isolation REAL

Status: PENDING DECISION. Authored by the lane-1 tick 20261004T0843.
Lane: 1 · campaign light-qms-records-browser · task OPS-1 (its core goal).
Decision artifact to write (unique path): `.hermes/plans/2026-10-04_lane1-isolation-dataDir-decision.md`

## The question (one sentence)

`CL_DATA_DIR` is not wired into the server, so the lane-1 backend on `:3092` serves **Brad's live data
dir** (`/home/brad/.computable-lab`); what is the approved remedy that makes the lane's data dir genuinely
lane-scoped without changing Brad's default, and is that remedy in OPS-1's scope or a scope amendment?

## Evidence (verified by the orchestrator, not a worker claim)

1. `server/src` contains **zero** references to `CL_DATA_DIR` (grep across `server/src`).
2. `server/src/server.ts:457`:
   `const dataDir = resolveConfiguredPath(basePath, appConfig?.server?.dataDir ?? '~/.computable-lab');`
   → the data dir comes from the **config file**, not the environment.
3. `config.yaml:5` (tracked, lane worktree): `dataDir: ~/.computable-lab` — a literal, no `${...}`.
4. Running `:3092` PID 3229755 (started 08:25:32) has `CL_DATA_DIR=/home/brad/.computable-lab-lane1` in
   `/proc/3229755/environ`, yet its log prints `  Data dir: /home/brad/.computable-lab` (backend.log:25,27)
   and `Embedded Git records repository ready: worktree=/home/brad/.computable-lab/worktrees/main` (:30).
5. Live API proof: `GET :3092/api/records/USR-QMS-ADMIN` (as `x-user-id: USR-QMS-ADMIN`) returns
   `personRef` + `updatedAt: 2026-10-04T12:12:14.571Z`, byte-matching
   `/home/brad/.computable-lab/worktrees/main/records/user/USR-QMS-ADMIN__untitled.yaml` (mtime 08:12).
   The lane dir `/home/brad/.computable-lab-lane1/worktrees/main/…/user/USR-QMS-ADMIN…` does **not** exist
   (lane HEAD `bcf5744`).
6. The lane worker's own 08:12 API `PUT` therefore landed in the LIVE repo as commit `07a6fee`
   ("OPS-1b: link USR-QMS-ADMIN to PER-DEMO-REVIEWER"). Lane probe grants (e.g. `GRANT-PROBE-OPS1-MINT2`)
   are also present in the live dir.
7. Already-available mechanism: `server/src/config/loader.ts:71-93` implements `${VAR}` / `${VAR:-default}`
   substitution over the loaded config object.

## Impact

- OPS-1's recorded outcome "isolation proven at proc level (CL_DATA_DIR=…)" is **invalid** — the environ
  is set but ignored, so the proof was of the environment, not of the running store.
- Every wave-2 signature/audit/denial test that "targets the lane" has in fact been writing to Brad's
  live data dir. This is the exact hazard OPS-1 existed to remove.
- **QMS-6B** (the campaign's final gate) pre-flight requires isolated lane data; it must not be dispatched
  until isolation is real. Its credential pre-flight already assumes a lane-local store.
- This is a hard-rule exposure (never write into `/home/brad/.computable-lab`), incurred inadvertently.

## Attempted approaches (found, not yet executed)

- **R1 (minimal, declarative):** change `config.yaml:5` to
  `dataDir: ${CL_DATA_DIR:-~/.computable-lab}`. The loader already substitutes `${VAR}`; Brad's live stack
  (no `CL_DATA_DIR`) keeps the `~/.computable-lab` default, and the lane stack (which sets it) resolves to
  the lane dir. One line, reversible, honours "things that can be data should be data."
- **R2 (isolation-by-config-file):** give each lane its own config (e.g. `.run/laneN-config.yaml` with a
  literal `dataDir`) and have `cl-lane-stack.sh` pass `CONFIG_PATH` to it. No change to the shared
  `config.yaml`; but it edits the stack script (spec-scoped out).
- **R3:** other mechanism the architect prefers (e.g. wire `CL_DATA_DIR` into `server.ts` explicitly).

## Recommendation

R1. It is the smallest change that makes the existing, already-declared mechanism (`CL_DATA_DIR` +
`${VAR}` substitution) actually work, keeps Brad's default byte-identical, and is a data/config change
rather than code. It is reversible in one line.

## Exact uncertainty to resolve

1. Which remedy (R1/R2/R3) is approved?
2. Is the chosen remedy **in OPS-1's scope** (a lane-config repair) or a **scope amendment** to OPS-1? The
   OPS-1b worker spec says "Do NOT change CL_DATA_DIR, the stack scripts, or the identity code. This is a
   data + docs fix" — so a remedy that touches `config.yaml` semantics or `cl-lane-stack.sh` is arguably
   outside OPS-1's stated boundary.
3. After the remedy: what is the **required proof** that isolation is real (the reviewable acceptance
   evidence), given the environ test was insufficient? (Proposed: the running `:3092` log line
   `Data dir: /home/brad/.computable-lab-lane1`, a live API read of a lane-only record id that is absent
   from the live dir, and zero new commits in `/home/brad/.computable-lab` attributable to the lane.)
4. Does the existing **live-dir contamination** (demo fixtures, probe grants, the `07a6fee` user-PER link
   in Brad's data dir) require disclosure to Brad / cleanup, or is it acceptable as historical evidence
   (campaign rule A4: no cleanup of Brad's append-only audit events)?

## Stop boundary

No product scope is invented here. This request only asks how to make an already-intended mechanism work.
