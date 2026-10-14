# OWN-13 SPEC — Document the ownership model + opt-in defaults migration (dry-run by default)

Spec authored directly by the orchestrator 20261011T1305 (cheap, bounded — no composer slot;
anchors verified first-hand at trunk cl/integration-1 @ 7b27011b+ by grep/sed).
Plan of record: .hermes/plans/2026-10-10_192635-lab-ownership-and-sharing-policy.md §T13
(line 1425 ff.) — reproduced with lane corrections below. Task block: OWN-13 in
~/.hermes/cl/lanes/1/task-list.md (deps OWN-3 + OWN-7 — BOTH MERGED; dispatch_gate QMS-8
merged (25f74aaa — satisfied)).

## Goal

One sentence: ship `server/src/scripts/applyOwnershipDefaults.ts` (idempotent, dry-run by
default, prints the resolved data dir, writes ONLY with --apply, never guesses an owner) +
the founding docs (DATA_MODEL.md OwnershipPolicy entity + three levels + resolution order +
role-vocabulary seam + git-boundary note; CLAUDE.md non-negotiable rule 9).

## Lane-verified anchors (orchestrator first-hand at dispatch base >= 7b27011b)

| Thing | Path:line | Fact |
| --- | --- | --- |
| Script pattern | server/src/scripts/bootstrapAdmin.ts | Existing CLI-script shape: plain exported core function + main() guard, imports loadConfig from '../config/loader.js'. Mirror this shape (exported testable core, thin main). |
| Service API | server/src/security/OwnershipPolicyService.ts:135 `activeLabPolicy()`, :144 `ruleFor(kind): Promise<ResolvedKindRule|null>`, :153 `defaultsForCreate(...)` | The script MUST resolve rules via OwnershipPolicyService.ruleFor (declarative source), NOT by reading the doc itself. ResolvedKindRule.origin = {policyRecordId, source:'kind'\|'fallback'}. |
| Doc types | OwnershipPolicyService.ts:17-56 | OwnershipScope creator\|lab; KindRule{owner,visibility,filedTo,editRoles,shareTargets,defaultGrants,publishRole?}; CreateDefaults{ownerUserId,visibility,...}. |
| Access-policy records | server/src/security/AccessControlService.ts (findPolicyForRecord matches resourceRef.id), AuthorizationService.ts:177-180 | access-policy envelopes carry `visibility`, `ownerUserId`, `grants[]`, `resourceRef:{id, kind?}` — READ the actual access-policy schema (schema/ directory; the OWN-1 triplet) for payload field names before writing the script; do not guess. |
| npm scripts | server/package.json:8-16 (build/start/dev/test/test:run/lint/typecheck/mcp) | Add `"apply:ownership-defaults": "npx tsx src/scripts/applyOwnershipDefaults.ts"` beside them. |
| DATA_MODEL | docs/agent/DATA_MODEL.md:26 "## Core Entity Table" (pipe table, one row per entity), sections at :81 Material Hierarchy, :159 QMS Governance Runtime | Add an OwnershipPolicy row (`OWN-*`) + a new "## Ownership & Sharing" section after the entity table (before Relationship Chains or after Material Hierarchy — coder's judgment, keep style). |
| CLAUDE.md | CLAUDE.md:133 "## Non-Negotiable Rules", numbered list ends at :156 rule 8 (materials hierarchy), :158 "### The Hard Boundary" | Append rule 9 verbatim per §T13 text below. |
| Baselines | server tsc 45 error-TS lines, app 31; src/api/ ~17 files/9 failed tests pre-existing | zero-NEW is the done-gate. |

## Required behavior (from §T13, verbatim requirements)

1. Script resolves the data dir EXACTLY like the server (loadConfig; CL_DATA_DIR honoured via
   config.yaml's ${CL_DATA_DIR:-~/.computable-lab} runtime config) and PRINTS the resolved
   absolute dir FIRST. Never touch a dir it did not name.
2. Lists every access-policy record (store.list by kind — access-policy lives in the DATA
   repo, not the seedDir, so the AS-ORCH-L1-042 boot-blindness does NOT apply to it; if it
   demonstrably does at run time, print what was skipped and report it, do NOT paper over).
3. For each, resolve the resource kind's rule via service.ruleFor; when the stamped
   visibility (and, for owner:lab kinds, ownerUserId != doc.labOwnerUserId) differ, print
   `ACL-x: visibility private -> public (kind instrument, rule OWN-LAB-DEFAULT)` — the
   origin's policyRecordId goes in the parenthetical.
4. Writes ONLY with --apply: a store.update per differing ACL with message
   `applyOwnershipDefaults: <acl-id>`; dry-run MUST write nothing (proven by tests AND by
   the acceptance check `git -C <data-repo> status --porcelain`-style emptiness — use the
   embedded-git status of the resolved data dir for the live proof, or assert non-write via
   a recording store in the unit test).
5. NEVER invent an owner: if ruleFor returns null (no doc / kind unmatched AND fallback
   null), skip the record with a printed `SKIP` line; never guess. Stop-boundary stands: a
   case that would REQUIRE guessing -> report REQUIRES-RESCOPE, do not absorb.
6. Idempotent: a second dry-run after --apply prints zero planned changes.

## Docs (exact content obligations)

- docs/agent/DATA_MODEL.md: (a) Core Entity Table row **OwnershipPolicy** |
  `workflow/ownership-policy.schema.yaml` | `recordId` (OWN-*), `scope` lab|project,
  `labOwnerUserId`, `fallback`, `kindRules` | drives creation-time ACL defaults (T7) +
  filing (T8); (b) new section: three ownership levels personal -> project -> lab; the
  resolution order (kindRules[kind] -> fallback -> no-document creator-private fallback
  with the D9 note that a bare repo never widens access); the role-vocabulary seam (the
  document speaks ACL roles owner/admin/editor/operator/qa/viewer; QMS lifecycle roles
  stay role-grant — separate vocabularies, one entity never gets two local names); the
  honest note that git access to the data dir is the real ACL boundary.
- CLAUDE.md rule 9 (verbatim §T13): "Ownership and sharing defaults are declared in
  `ownership-policy` records, not in TypeScript; when the document is missing, the system
  falls back to creator-private and says so."

## Files (stage EXACTLY; never git add -A)

server/src/scripts/applyOwnershipDefaults.ts (new), server/src/scripts/applyOwnershipDefaults.test.ts
(new), server/package.json, docs/agent/DATA_MODEL.md, CLAUDE.md. NO other file. NO YAML.

## Tests (RED first)

applyOwnershipDefaults.test.ts on MemoryRecordStore (server/src/test-support/MemoryRecordStore.ts,
used by OwnershipPolicyService.test.ts): fixtures = seed doc envelope + access-policy
envelope stamped private/creator for a kind whose rule says lab/public. Assert: (1) dry run
returns planned changes, ZERO store.update calls (recording-subclass or spy); (2) --apply path
updates exactly the differing ACLs, payload visibility flips, ownerUserId = labOwnerUserId;
(3) idempotency: second pass plans nothing; (4) no-doc / no-rule record -> SKIP line, no
write, never a guessed owner; (5) the resolved-dir string is taken from an injectable
resolver arg (do NOT read config in the unit test — main() wires loadConfig).
⚠ Vacuity rule: the MemoryRecordStore.validate stub always returns valid:true — do not
assert 422/validation anywhere; assert on the plan list + spy'd updates instead.

## Verification (real outputs in the report; zero-NEW done-gate)

1. `npm run test:run -w server -- src/scripts/applyOwnershipDefaults.test.ts` RED then green.
2. `npm run test:run -w server -- src/security/` identical to base.
3. `npm run typecheck -w server` error-TS count identical to base (~45), zero in touched
   files; app untouched (31).
4. Dry-run LIVE proof on the LANE data dir ONLY, orchestrator-owned (worker: make NO runtime
   claim; the orch runs this after merge):
   `CL_DATA_DIR=/home/brad/.computable-lab-lane1 npm run apply:ownership-defaults -w server`
   -> prints the lane dir first, prints planned changes, exit 0, and the lane data repo
   stays clean (`git -C /home/brad/.computable-lab-lane1 -c core.fileMode=false status
   --porcelain` empty). The worker must NOT run any curl or any script against a live data
   dir; unit tests only.
5. `git diff --stat base..head` = exactly the 5 files.

## Worker contract

- Worktree wt/OWN-13-lane1-<ts> off dispatch-time trunk (>= 7b27011b; report base sha;
  if OWN-8/OWN-9 landed, anchors may shift — re-verify server/package.json scripts block
  and CLAUDE.md rule numbering before editing). ALWAYS git -c core.fileMode=false.
- Commit: RED `test(scripts): RED — opt-in defaults migration contract (§T13)`, then
  `docs+tooling: ownership model documented; opt-in defaults migration`.
- FORBIDDEN: touching Brad's live data dir ~/.computable-lab (read OR write — including
  RUNNING the script: never execute the migration against any data dir in-session; unit
  tests only, injected store), :3001/:5174/:3092/:5192 restarts/curls, pnpm install,
  editing the task list, runtime claims.
- Stop-boundary: any migration write path that would GUESS an owner for a record with no
  applicable rule -> STOP, REQUIRES-RESCOPE to the architect. Never invent ownership.
- Report: own13-report-l1t<ts>.md — base/head shas, RED evidence, all outputs, honest
  no-runtime-claims statement. End marker: OWN13 CODER DONE <head-sha>.

## Orchestrator post-merge duties (not the worker's)

After adversarial ACCEPT + orch verification: merge --no-ff; NO restart expected (TS/docs/
package.json only — but if the merge touches any YAML, restart per lane rules); run the
lane-dir dry-run proof (verification 4) MYSELF and record output in the handoff; mark done.

## OQ adjudication at promotion

(none pending — orchestrator authored; any worker deviation must be flagged in its own
report entry per the standing rule.)
