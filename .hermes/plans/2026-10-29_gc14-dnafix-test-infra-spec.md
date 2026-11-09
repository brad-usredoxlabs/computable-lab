# Spec — DNAAFIX lane infra leg: green the vitest#5285 `rejects.toThrow(/regex/)` trunk reds (lane 1)

Origin: GC-14 draft OQ-2, adjudicated by the orchestrator 2026-10-29T06:45 at trunk ae2bcaa4.
This is lane infra (test-only), disjoint from GC-12/GC-13 product boundaries. GC-14's DNA
regression clause requires `cd app && npx vitest run src/sequences` green at the final tip.

## Root cause (orch-pinned, do not re-derive)
`app/src/test/setup.ts:1` imports `@testing-library/jest-dom/vitest`, whose global chai extend
breaks `rejects.toThrow(<RegExp>)` app-wide (vitest-dev/vitest#5285; check-error@1.0.3
getConstructorName -> "errorLike is not a constructor"). String-arg `rejects.toThrow('...')`
and no-arg forms are UNAFFECTED. `toThrow(/regex/)` SYNCHRONOUS forms are unaffected — only
`.rejects.toThrow(/regex/)` sites are broken.

## Scope — EXACTLY these 10 call sites (orch grep-enumerated at ae2bcaa4; verify the count
is still 10 before editing, `grep -rn "rejects.toThrow(/" app/src`):
- app/src/sequences/nativeDraft.test.ts:39
- app/src/event-editor/right-pane/protocol/applyDraftProtocolEdit.test.ts:166,176,211,218
- app/src/event-editor/right-pane/protocol/protocolEditOps.test.ts:411,433
- app/src/event-editor/eventGraphPersistence.test.ts:136,220
- app/src/ingestion/protocol-review/semanticDraft.test.ts:199

Conversion pattern (per site): replace
`await expect(promiseExpr).rejects.toThrow(/re/)`
with a try/catch that awaits the promise (expecting a throw), asserts an Error was caught,
and asserts `err.message` (or `String(err)`) matches the SAME regex — preserve semantics
including the `/s` and `/i` flags and the `applyDraftProtocolEdit.test.ts:211` `/op 1 \(step_delete\)/`
parenthesized text. If a site's promise resolution must NOT happen, keep the `expect.unreachable()`-style
discipline: after the awaited call inside try, `throw new Error('expected rejection')` or
`expect.fail`-equivalent per file style. No other file may change. NO changes to setup.ts, no
vitest config changes, no package upgrades, no dependency churn.

## Worktree / ownership
/mnt/vast/home/brad/git/wt/gc14-dnafix-lane1-l1t0650, branch wt/gc14-dnafix-lane1-l1t0650 off
cl/integration-1 (ae2bcaa4). ALL git via `git -c core.fileMode=false`. node_modules symlinked.

## Verification (run from app/ in the worktree; paste RAW output + command lines in report)
- RED witness BEFORE editing (the 5 files fail in one run, command line included).
- After: `npx vitest run src/sequences src/event-editor src/ingestion/protocol-review` all green.
- `npx vitest run src/sequences` green (the GC-14 DNA clause, verbatim command).
- Whole-suite non-regression: `npx vitest run --reporter=basic 2>&1 | tail -30` — failing-file
  set must be a SUBSET of the pre-existing trunk failure baseline (nothing new red).
- `npx tsc --noEmit` error count EQUALS baseline 21 lines (same files; no new).

## Report
Write to /home/brad/.hermes/cl/lanes/1/deliverables/gc14-dnafix-report-l1t0650.md.
End with 'STATUS: complete' on its own line, then 'DNAAFIX DONE <full-sha>'.

## Hard rules
Never touch /mnt/vast/home/brad/git/computable-lab, either trunk checkout, :3001/:5174,
:3092/:5192, or any other worktree. No YAML/schema edits. Server untouched. If any of the 10
sites is ALREADY green at claim time (someone beat you to it), say so with a grep witness and
convert only what remains.
