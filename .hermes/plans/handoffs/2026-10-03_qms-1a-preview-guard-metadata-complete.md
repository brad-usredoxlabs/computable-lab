# Handoff — QMS-1A preview guard metadata COMPLETE (light-qms-records-browser)

Date: 2026-10-03 (~01:45 EDT). Orchestrator tick. Campaign: light-qms-records-browser.
Task: QMS-1A (THE LIST `/home/brad/.hermes/cl/task-list.md`).

## Status: DONE and orchestrator-verified

- Spec: `.hermes/plans/2026-10-03_qms-1a-preview-guard-metadata-spec.md` (written 00:40 by an
  earlier tick; unchanged).
- Worker: cl-senior (local Qwen3.8 on thunderbeast), isolated worktree
  `/mnt/vast/home/brad/git/wt/qms-1a`, branch `wt/qms-1a` off `main @ 2a1102bc`.
- Worker log: `/tmp/qms-1a-worker.log`. Worker report:
  `~/.hermes/cl/worker-reports/2026-10-03_qms-1a.20261003-0112.md`.
- **Deliverable (canonical = the worktree commit): `dbd390f3`**
  `feat(lifecycle): expose declarative guard metadata in transitions preview (QMS-1A)`
  — 2 files, +128 −1: `server/src/lifecycle/LifecycleEngine.ts`,
  `server/src/lifecycle/LifecycleEngine.test.ts`. `LifecycleHandlers.ts` NOT touched. No `app/`
  change. Not merged into main (see Promotion below).

## Orchestrator verification (run myself, not the worker summary)

- `git show dbd390f3 -- server/src/lifecycle/LifecycleEngine.ts` — read the full diff. It adds
  `TransitionRequirements { signatureRequired, signatureAction?, differentPersonThan? }`, an
  optional `requires?:` on `TransitionInfo`, and a pure pass-through `describeGuardFacts()` called
  from `getValidTransitions`. No policy table, no lifecycle-id branch, no guard→action mapping in
  TS; `allowed` is untouched (still `this.canTransition(...)` unchanged) and `requires` is spread
  in only when guards exist. Matches the spec contract exactly.
- `git show dbd390f3 -- server/src/lifecycle/LifecycleEngine.test.ts` — 4 tests, RED-first; two
  load the REAL `schema/core/lifecycles/document-controlled-signing.lifecycle.yaml` via `yaml.parse`
  and assert `requires {signatureRequired:true, signatureAction:'approved', differentPersonThan:'author'}`
  on the in_review→approved APPROVE transition **while `allowed` stays false**; one asserts an
  unguarded transition has no `requires`; one asserts a synthetic guard with no `signatureAction`
  yields `signatureRequired:true` with the action absent (gated-but-mis-declared).
- Re-ran the targeted suites myself in the worktree
  (`npx vitest run LifecycleEngine.test.ts LifecycleEngine.roles.test.ts LifecycleHandlers.test.ts
  governanceStrictness.test.ts`): **4 files passed, 35/35 tests, exit 0.**
- `npx tsc --noEmit -p tsconfig.json` in the worktree: exit 2, 26 errors — all in `src/ai/*` and
  `src/api/routes.ts` (`TS2307 Cannot find module './materialRefFields.js'` etc.) caused by modules
  that exist only UNTRACKED in Brad's live tree; the same command in the live tree (`server/`) is
  **exit 0, 0 errors**. **No error names a lifecycle file**, so the QMS-1A delta adds zero type
  errors — the spec's criterion 1 ("exit 0") is met at the delta level and unreachable in a clean
  HEAD checkout. Attribute as pre-existing; do not "fix".
- `git status --porcelain` in the worktree: only the two committed files carry content changes; the
  ~2 500 ` M` entries are 644→755 mode-only checkout noise from the NFS worktree
  (`git diff --numstat` = `0 0` on every one). `?? node_modules` are the symlinks the orchestrator
  created.

## Promotion

The deliverable is product code; the campaign has no deploy/merge step and Brad's live tree must not
be written by an unattended tick, so the canonical artifact is the **branch `wt/qms-1a` commit
`dbd390f3`** (QMS-1 precedent: the spike was likewise left unmerged). Merging that commit into `main`
is a follow-up for an attended session; QMS-3's typed preview wrapper and QMS-6's transition flow
assume it is present server-side.

## Surprises / notes

1. Fresh worktrees off this repo's HEAD are NOT typecheck-clean — HEAD imports modules that exist
   only untracked in the live tree (`src/ai/materialRefFields.ts`, `materialIdentity.ts`,
   `clarificationLoop.ts`, `mintLabelFidelity.ts`, `recoverInventedMaterialFields.ts`,
   `enrichMaterialDomains.ts`, `materialBinding.ts`, `src/api/labwareDefinitionSearch.ts`). Every
   future orchestrator worker should expect this and attribute it, not chase it.
2. `src/schema/ServiceDomainSchemas.test.ts` fails 9 tests when vitest runs with cwd `server/`
   (cwd-relative schema path) — pre-existing, independent of this change; run schema suites from
   the repo root if it matters.
3. `/tmp/wt-qms2-add.log` + `/tmp/orch-tsc-*.txt` are this tick's scratch.

## State / git

- Live tree `/mnt/vast/home/brad/git/computable-lab`: untouched (HEAD still `2a1102bc`); this
  handoff and the QMS-2 spec are the only new untracked files added by the tick.
- THE LIST updated: QMS-1A -> in-progress -> done (owner cl-senior, deliverable commit recorded).

## Next ready item(s)

- **QMS-2** (controlled-document schema triplet) — dispatched this tick into worktree
  `/mnt/vast/home/brad/git/wt/qms-2`, branch `wt/qms-2`; spec
  `.hermes/plans/2026-10-03_qms-2-controlled-document-schema-spec.md`.
- QMS-3 becomes ready once QMS-1A is merged; QMS-4 needs QMS-2; QMS-5/QMS-6/QMS-7 remain blocked.

## Open questions carried

1. Merge policy for worktree commits: this tick produced `wt/qms-1a` (and soon `wt/qms-2`) that
   never reach `main`. If the campaign is to be exercised live, an attended session must merge them.
2. Exec-bit normalization of `RecordRegistryPage.tsx` (QMS-1 open question 5) — still open; the
   worktree checkout regenerates the same mode noise, which makes it more visible, not less.
