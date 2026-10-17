# W2-8 A5 fix report — answers reach the compile; held 422 bundle folds (lane 2, l2t1505)

Branch: cl/W2-8-a5fix-lane2-l2t1505 (base 852ed5c213108760bd769b9660f16732a0944a4b, cl/integration-2 tip at dispatch)
Worktree: /mnt/vast/home/brad/git/wt/W2-8-a5fix-lane2-l2t1505
Spec: .hermes/plans/2026-10-12_1510-W2-8-a5fix-spec.md (contract read in full; both halves S+C implemented; no criterion weakened)
Gate evidence read: /home/brad/.hermes/cl/receipts/W2-8-SAID-MEANT-SURFACE/2026-10-12_1330-a5c/REPORT.md

## 0. Lane state

Worktree created per dispatch command (`git -c core.fileMode=false worktree add -b cl/W2-8-a5fix-lane2-l2t1505 ... HEAD`).
Lane-sync state REPRODUCED before any measurement (OWN-11 lesson): node_modules/.env/server-schema symlinks +
the lane-2 lane-exclude untracked-file links (from /home/brad/.hermes/cl/lanes/2/lane-exclude) recreated in this
worktree; per-worktree core.excludesFile pointed at a deduped copy
(/home/brad/.hermes/cl/lanes/2/lane-exclude.l2t1505 — the shared file's stray comment line produced a junk
filename in `git status`, so this lane uses its own cleaned copy). `git -c core.fileMode=false status --short`
clean before edits. Baselines measured AFTER this reproduction.

Baselines at base (852ed5c2, lane-synced): server tsc 0 error lines; app tsc 28 lines (matches the lane-2 pin
28==28 from c9c356f7). Raw lists: .hermes/evidence/l2t1505/l2t1505-server-tsc-base.txt, l2t1505-app-tsc-base.txt.

## 1. Root causes fixed (spec §S and §C)

### S — server: answers now reach the compile as DATA
server/src/api/handlers/IntentCompileFromPromptHandlers.ts
- New `composeAnsweredPrompt(protocolText, answers)` (file :117-137): iterates the request's answers entries and
  appends a `SCIENTIST-RESOLVED CHOICES ... - <axisId> = <value>` block. Zero phrase/domain literals: the only
  fixed text is the block header (the spec's own example form); every axisId/value rides verbatim from the body.
- Answered call site (:280-284): `prompt: composeAnsweredPrompt(protocolText, answers)` replaces
  `prompt: protocolText`. The ask gate, the 422 envelope (`satisfies
  CompileFromPromptNeedsClarificationResponse`), and the OQ4(a) hold are UNCHANGED.
- If after answers the macro still bars on material nouns the scientist never stated, the held 422 bundle stays
  the honest surface (unchanged server behavior; folded client-side per C).

### C — client: the held bundle folds instead of being discarded
app/src/shared/api/client.ts — intentCompileFromPrompt ONLY (single diff hunk @@ -3976,22 +3976,104 @@; every
other method byte-untouched):
- VERIFIED first: `ApiError.fromResponse` (app/src/shared/api/errors.ts:42-79) does NOT carry the parsed body
  (only status/code/message/details/validation/lint) — so the spec's documented fallback applies: the method
  narrow-handles its own route and returns the parsed bundle as a discriminated result.
- The method now fetches this route directly (mechanics mirror request(): same API_BASE URL build, same
  x-user-id/x-cl-session identity headers, same ApiError.fromResponse message-building via a replay shim over
  the already-consumed body, same NetworkError mapping). Discriminator: status 422 AND body.error ===
  'NEEDS_CLARIFICATION' AND body.localMacro object AND body.terminalArtifacts object -> a result with
  `held: true` plus error/outcome/clarifications/localMacro/terminalArtifacts. A 422 WITHOUT a held macro
  re-throws the same ApiError; every other status re-throws exactly as before.
- Return type is a discriminated union (`held?: undefined` on the success arm); the success arm additionally
  carries `clarifications?` (the server's OQ2 gap-additive key was already on the wire but untyped here).

app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx
- New `foldHeldBundle` (:284-308): EXACTLY the 2xx branch (setNeedsAnswers(false) + setLocalMacro +
  holdForReview(terminalArtifacts)) plus an honest info message listing each clarification as
  `label (reason)` — messageKind 'info', NOT an error dead-end. Nothing is silently resolved on the user's
  behalf.
- handleSubmitAnswers (:398-402): `if ('held' in res && res.held === true) foldHeldBundle(res)` before the
  existing 2xx branch; the catch keeps the error path for a macro-less 422 or any other failure.
- handleLocalize (:344-349) and handleSendCorrection (:434-438): same discriminator added (required for the
  union to typecheck at every call site; the correction path folds a barred re-draft the same honest way).
- IntentAcceptHandlers.ts NOT touched (branch_resolution already works — server test
  IntentAcceptHandlers.test.ts:79-86 re-run green, §4 below).

## 2. Diff scope (git -c core.fileMode=false diff --name-only)

M app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx
M app/src/shared/api/client.ts
M server/src/api/handlers/IntentCompileFromPromptHandlers.ts
+ server/src/api/handlers/IntentCompileFromPromptHandlers.answeredPrompt.test.ts (new, 4 tests)
+ app/src/shared/api/client.intentCompileHeld.test.ts (new, 4 tests)
+ app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.heldBundle.test.tsx (new, 3 tests)
159 insertions(+), 12 deletions(-) across the three owned files. No write-wall files, no AgentOrchestrator,
no schema/lint/ui YAML touched.

## 3. RED-first evidence (CODER-CAPTURED; impl stashed via `git stash push -- <3 impl files>`, new tests present)

RED server (raw: .hermes/evidence/l2t1505/red-server-answeredPrompt.txt):
```
 FAIL  src/api/handlers/IntentCompileFromPromptHandlers.answeredPrompt.test.ts > intent-compile-from-prompt.answered-prompt-carries-answers (W2-8 A5 S leg) > answered call: the prompt captured by compileFromSmallLlm contains EVERY answers entry
 FAIL  src/api/handlers/IntentCompileFromPromptHandlers.answeredPrompt.test.ts > intent-compile-from-prompt.answered-prompt-carries-answers (W2-8 A5 S leg) > answered call with a single entry still composes the block (no multi-entry dependency)
 FAIL  src/api/handlers/IntentCompileFromPromptHandlers.answeredPrompt.test.ts > intent-compile-from-prompt.answered-prompt-carries-answers (W2-8 A5 S leg) > answers-only-as-data: an arbitrary axisId/value pair (no domain vocabulary) still reaches the prompt verbatim
```
```
 Test Files  1 failed (1)
      Tests  3 failed | 1 passed (4)
   Start at  16:27:27
   Duration  1.48s (transform 596ms, setup 0ms, collect 843ms, tests 51ms, environment 0ms, prepare 62ms)
```

The RED server failures show the pre-fix prompt contained ONLY the LAB INVENTORY + raw protocolText (no answers
entries) — the exact gate root cause. The RED client failure shows the held 422 threw ApiError NEEDS_CLARIFICATION
(bundle discarded). The RED component failure shows the fold path absent.

RED client (raw: .hermes/evidence/l2t1505/red-client-held.txt):
```
 FAIL  src/shared/api/client.intentCompileHeld.test.ts > apiClient.intentCompileFromPrompt — held 422 bundle (W2-8 A5 C leg) > 422 WITH a held macro resolves to the discriminated held bundle (never throws)
```
```
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
   Start at  16:27:47
   Duration  1.12s (transform 147ms, setup 51ms, collect 125ms, tests 7ms, environment 340ms, prepare 59ms)
```

RED component (raw: .hermes/evidence/l2t1505/red-component-held.txt):
```
 FAIL  src/event-editor/right-pane/protocol/ProtocolLocalizationThread.heldBundle.test.tsx > ProtocolLocalizationThread — held 422 folds into deck review (W2-8 A5) > answered 422 WITH held macro: deck review appears, clarifications surface honestly (info, not error)
```
```
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
   Start at  16:27:49
   Duration  1.22s (transform 176ms, setup 41ms, collect 211ms, tests 71ms, environment 351ms, prepare 105ms)
```

## 4. GREEN evidence (CODER-CAPTURED, serialized one job at a time on NFS)

Server handlers (answeredPrompt + existing SPINE-5 contract + apiKey + IntentAccept):
raw: .hermes/evidence/l2t1505/green-server-handlers.txt
```
 Test Files  4 passed (4)
      Tests  21 passed (21)
   Start at  16:27:36
   Duration  1.32s (transform 563ms, setup 0ms, collect 2.13s, tests 114ms, environment 1ms, prepare 426ms)
```
(4 files: answeredPrompt 4, IntentCompileFromPromptHandlers 11, apiKey 4, IntentAcceptHandlers 2 — the
branch_resolution pin at IntentAcceptHandlers.test.ts:79-86 re-ran green with the file byte-untouched.)

Client held-bundle method tests (incl. macro-less-422 throw preserved + intentAccept throw behavior unchanged):
raw: .hermes/evidence/l2t1505/green-client-held.txt
```
 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  16:28:03
   Duration  1.39s (transform 134ms, setup 44ms, collect 121ms, tests 4ms, environment 628ms, prepare 107ms)
```

Component held-bundle + existing thread suites (heldBundle 3, ProtocolLocalizationThread 6, familyAxes 7):
raw: .hermes/evidence/l2t1505/green-component-held.txt
```
 Test Files  3 passed (3)
      Tests  16 passed (16)
   Start at  16:28:05
   Duration  1.45s (transform 307ms, setup 248ms, collect 714ms, tests 286ms, environment 1.34s, prepare 256ms)
```

## 5. Typecheck set-diff (before/after at this base)

- server tsc: 0 lines -> 0 lines. Raw lists: l2t1505-server-tsc-base.txt / l2t1505-server-tsc-after.txt (diff empty).
- app tsc: 28 lines -> 28 lines, `diff` of sorted outputs EMPTY (set-equal 28==28, matches lane-2 pin). Raw lists:
  l2t1505-app-tsc-base.txt / l2t1505-app-tsc-after.txt. (An intermediate iteration briefly added 4 union-narrowing
  errors at the other two call sites; fixed by the `held?: undefined` discriminant + `'held' in res` guards —
  final state set-equal.)

## 6. Full-suite stash-parity (base vs head, serialized; raws: base-server-full.txt, green-server-full.txt, base-app-full.txt, green-app-full.txt)

Server full suite head:
```
      Tests  98 failed | 5587 passed | 70 skipped (5928)
     Errors  2 errors
   Start at  16:28:25
   Duration  240.70s (transform 129.31s, setup 398ms, collect 1461.18s, tests 1741.88s, environment 1.19s, prepare 477.47s)
```
Server full suite base (impl stashed):
```
      Tests  101 failed | 5584 passed | 70 skipped (5928)
     Errors  2 errors
   Start at  16:32:40
   Duration  237.81s (transform 109.87s, setup 395ms, collect 1402.48s, tests 1749.62s, environment 1.00s, prepare 481.70s)
```
Server fail-SET comm -3 (base-only; head-only empty -> ZERO new failures; the only delta is the new test file
failing at base and passing at head):
```
src/api/handlers/IntentCompileFromPromptHandlers.answeredPrompt.test.ts
```
(base 90 fail files = 89 pre-existing + new file RED at base; head 89 = same 89 pre-existing. Lists extracted to
l2t1505-server-fail-base.txt / l2t1505-server-fail-head.txt.)

App full suite head:
```
      Tests  71 failed | 2273 passed (2344)
     Errors  5 errors
   Start at  16:37:17
   Duration  107.85s (transform 137.80s, setup 123.85s, collect 248.59s, tests 170.25s, environment 1028.84s, prepare 124.18s)
```
App full suite base (impl stashed):
```
      Tests  73 failed | 2271 passed (2344)
     Errors  6 errors
   Start at  16:39:19
   Duration  98.30s (transform 92.79s, setup 102.45s, collect 202.30s, tests 176.94s, environment 987.77s, prepare 120.74s)
```
App fail-SET comm -3 (base-only; head-only empty -> ZERO new):
```
src/event-editor/right-pane/protocol/ProtocolLocalizationThread.heldBundle.test.tsx
src/shared/api/client.intentCompileHeld.test.ts
```
(base 56 = 54 pre-existing + 2 new RED at base; head 54 = same 54 pre-existing, 26 of them e2e/*.spec collected
under vitest as pre-existing. Lists: l2t1505-app-fail-base.txt / l2t1505-app-fail-head.txt.)
Disclosure (not caused by this diff): the app `Errors` line read 6 at base and 5 at head — pre-existing
unhandled-exception debt that drifts 5-6 run-to-run (known lane behavior); the fail-SET equality above is the
authoritative zero-new proof.

## 7. Assumptions, residual risk, gate-readiness notes

1. Model-dependent outcome: with answers now riding the prompt, the live answered compile may land on 200
   'complete'/'gap' (ghostable artifacts) or still bar 422 with material-noun clarifications. Both paths are
   handled honestly: 200 -> existing review flow; 422-held -> fold + honest clarification list + refine path
   (handleSendCorrection recompiles WITH answers, so a scientist correction can fold a resolvable macro).
2. canAccept gating (localMacro && non-empty editor preview) is the EXISTING macro-review flow and was NOT
   changed — per spec, "nothing is silently accepted on the user's behalf beyond the existing macro-review
   flow". If the gate fixture's answered compile bars with the zero-artifact bundle, the deck review honestly
   shows "No labware resolved yet" and Accept stays gated until a refine lands a ghostable macro. The gate
   re-shoot (orchestrator) will show which arm the live model takes; this fix makes BOTH arms reachable
   instead of dead-ending at the 422.
3. The client fold message lists clarifications verbatim (label + reason) from the server body — the route
   mints nothing; the client adds no labels.
4. Full-suite raws (~170-190KB each) are left UNTRACKED in the worktree at the cited paths (storage data, not
   git blobs); the extracted fail-SET lists and tsc lists are committed alongside this report.

## 8. Commits

- 61ad592a — implementation + 3 new test files + extracted evidence lists (14 files, 992 insertions).

W28-A5FIX DONE 61ad592a
