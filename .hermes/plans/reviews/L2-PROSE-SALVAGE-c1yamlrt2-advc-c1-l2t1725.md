# Adversarial review — L2-PROSE-SHORTHAND-SALVAGE-1 unit c1yamlrt2 (cycle 1)

Reviewer: cl-adversarial-reviewer (decorrelated model). Read-only; no product code left modified.
Worktree: /home/brad/cl-wt/L2-PROSE-SALVAGE-c1yaml-lane2
Branch:   cl/lane2-prose-salvage-1-c1yaml
HEAD:     e770f984f63d665f098cbccd391a7f31a31bc4af  ("…rt2: report with DONE marker")
Unit code commit under review: 60096417d942eb210bdf435de0249f768020a762
Trunk:    cl/integration-2, merge-base d2b6190c0edbd0546087dd4b6acc6bd18b3d28e5
Unit base age: 3b019750 (launcher WIP AT EXIT for c1yaml-fix1) — graded diff is 3b019750..HEAD.
Brief: /home/brad/.hermes/cl/lanes/2/prompts/brief-L2-PROSE-SALVAGE-1-c1yaml-rt-1612.txt
Report under review: .hermes/plans/reports/L2-PROSE-SHORTHAND-SALVAGE-1-c1yaml-report.md

## Unit surface (3b019750..HEAD, --numstat)

```
15   9   .hermes/plans/reports/L2-PROSE-SHORTHAND-SALVAGE-1-c1yaml-report.md
15   0   config/drafting/draft-recovery.yaml
90   45  server/src/ai/AgentOrchestrator.ts
197  0   server/src/ai/draftRecovery.test.ts
261  0   server/src/ai/draftRecovery.ts
```

All five paths are inside the brief's owned list. No prohibited file (shorthandChat.ts,
InferenceClient.ts, forcedToolCompliance.ts, coerceAgentIntent.ts, coerceDraftArgs.test.ts,
compiler/**, schema/**, app/**, records/**) is touched. Net added non-report lines = 15+90+197+261
= 563, versus the brief's OUTPUT BUDGET of `lines <= 300` (defect D8).

---

## 1. Acceptance criteria (verbatim from the brief) and how each was checked

- AC1 "a fenced ```yaml block carrying a valid shorthand document (top-level `intentId` +
  `actions[]`) → `{ status: 'recovered', args: { intent: 'event_shorthand', shorthand: '<the
  document text>' } }`"
  CHECKED: ran `draftRecovery.test.ts` a. / `extractYamlCandidate` fenced legs, and my own probe
  (`probe.mts`) fenced + fenced-with-prose. GREEN.
- AC2 "the same document BARE (no fence, first non-empty line is `intentId:`) → recovered"
  CHECKED: test b., `extractYamlCandidate` bare legs, probe. GREEN.
- AC3 "a prose paragraph that merely MENTIONS `intentId` (no `actions:`, no document shape) →
  `status: 'none'`"
  CHECKED: test c. + `bare-document: prose mentioning intentId returns null`. GREEN.
- AC4 "a fenced document with one invalid enum value → `status: 'refused'` and `reason` CONTAINS
  the validator's own message"
  CHECKED: test d. asserts `reason` contains `Must be one of`; the orchestrator D4 pin
  (`AgentOrchestrator.shorthandChat.test.ts` "shorthand YAML refusal names the offending field")
  passes; mutation A/B below make this leg RED. GREEN.
- AC5 "a JSON payload still recovers with the JSON branch unchanged (this leg must pass on the
  pre-change tree too — it is the invariant pin)"
  CHECKED: test e. passes; `coerceDraftArgs.test.ts` (brief: MUST stay green UNMODIFIED) is
  byte-identical in the unit diff and ran 10/10. GREEN.
- AC6 wiring: "when `extractJsonObject` returns null, ask `recoverShorthandDraft`; on `recovered`
  return `{ intent: 'event_shorthand', shorthand: text }` … on `refused` return null AND record why
  … on `none`, return null exactly as today."
  CHECKED: read `AgentOrchestrator.ts:1028-1041` (JSON-miss branch) and the call site
  `AgentOrchestrator.ts:2821-2832` (on `refused`: `console.warn` + `onEvent({type:'status'})`;
  mutually excluded from `inlineArgs`). Mutation C (wiring bypassed) turns 7 legs RED at the
  orchestrator level, so the wiring is pinned. The brief says "on `refused` return null"; the code
  instead returns `{refused:true, reason}` to the shared entry point (pre-existing base-age
  convention consumed at :2824), which is how the reason reaches the event channel — substance of
  "record why" is met.
- AC7 "Invariants that must NOT change: … no compile call, no event synthesis, no second YAML
  parser (`yaml` package only where the existing code already imports it); nothing written to any
  record store."
  CHECKED: `draftRecovery.ts` calls only `parseShorthandForChat` for validity; the `yaml` `parse`
  is used only for CONFIG loading (not for the draft); no store/compile import in the diff. The
  new `draftRecovery.test.ts` leg e. and the orchestrator D3 pin assert the compile path is
  untouched/not synthesised. PASS.
- MUTATION PROBE section: "Delete the `parseShorthandForChat` call … paste the RAW failure;
  revert. Replace the `refused` outcome with `none` … paste the RAW failure; revert. Prove each
  revert with `git status --short`."
  CHECKED by me (see §2). The REPORT does not contain these probes (D5).

## 2. My own runs (real output)

### 2.1 Targeted suites — cwd = worktree/server, timeout 300, targeted files only

```
$ cd /home/brad/cl-wt/L2-PROSE-SALVAGE-c1yaml-lane2/server && \
  timeout 300 npx vitest run src/ai/draftRecovery.test.ts src/ai/coerceDraftArgs.test.ts
 ✓ src/ai/coerceDraftArgs.test.ts  (10 tests) 6ms
 ✓ src/ai/draftRecovery.test.ts  (17 tests) 67ms
 Test Files  2 passed (2)
      Tests  27 passed (27)
```

```
$ timeout 300 npx vitest run src/ai/coerceDraftArgs.yaml.test.ts src/ai/AgentOrchestrator.shorthandChat.test.ts
 ✓ src/ai/AgentOrchestrator.shorthandChat.test.ts  (23 tests) 988ms
 Test Files  2 passed (2)
      Tests  36 passed (36)
```

Final consolidated run after all mutation restores:

```
 ✓ src/ai/coerceDraftArgs.test.ts  (10 tests) 7ms
 ✓ src/ai/coerceDraftArgs.yaml.test.ts  (13 tests) 47ms
 ✓ src/ai/draftRecovery.test.ts  (17 tests) 54ms
 ✓ src/ai/AgentOrchestrator.shorthandChat.test.ts  (23 tests) 1103ms
 Test Files  4 passed (4)
      Tests  63 passed (63)
```

### 2.2 Does the recovery path ACTUALLY fire on the brief's failing input shape?

Yes. The orchestrator-level D3 pin drives the real `run()` with `ADD_DMEM_YAML` as content
(no tool call) and the raw log line proves the production recovery arm executed:

```
[agent rzvycd] turn 1 finish=stop contentLen=447 toolCalls=0
[agent rzvycd] recovered draft args from content as agent_intent; skipped the second call
[agent rzvycd] done event_shorthand success=true events=12 clarifications=0 elapsedMs=37
```

My own direct probe of `recoverShorthandDraft` (bare doc, fenced ```yaml, fenced ```yml,
prose-wrapped fence) returned `RECOVERED` with `args={"intent":"event_shorthand","shorthand":…}`.
So the failing shape named in the brief is recovered end-to-end.

### 2.3 Typecheck

```
$ cd /home/brad/cl-wt/L2-PROSE-SALVAGE-c1yaml-lane2/server && timeout 300 npx tsc --noEmit
error TS2688: Cannot find type definition file for 'semver'.
EXIT:2
```

This is environmental, not code: the lane's `server/node_modules` is a symlink to
`cl-integration-2/server/node_modules`, whose `@types/semver/` directory is EMPTY
(`drwx------ 2 3000 root 2 …`, no files), while the umbrella `/mnt/vast/home/brad/git/wt/node_modules/@types/semver`
is populated. Re-run with a clean type root:

```
$ npx tsc --noEmit --typeRoots /mnt/vast/home/brad/git/wt/node_modules/@types
EXIT:0        (0 error lines)
```

So the report's "0 errors" is substantively true; the default invocation in this tree is broken by
an empty install, not by this diff. No typecheck defect.

### 2.4 Mutation probes (I ran the brief's two mutants; each reverted and hash-verified)

MUTANT A — delete the Ajv call (`draftRecovery.ts:236` `parseShorthandForChat(candidate);` →
`void candidate;`):

```
FAIL  src/ai/coerceDraftArgs.yaml.test.ts > … > c. refuses an invalid enum value with the validator reason
      AssertionError: expected undefined to be true
FAIL  src/ai/draftRecovery.test.ts > recoverShorthandDraft > d. invalid enum value is refused …
      AssertionError: expected 'recovered' to be 'refused' // Object.is equality
 Test Files  2 failed (2)
      Tests  2 failed | 28 passed (30)
```

MUTANT B — collapse the `refused` branch to `none` (`draftRecovery.ts:257`):

```
FAIL  src/ai/AgentOrchestrator.shorthandChat.test.ts > … D4 pin — shorthand YAML refusal names the offending field
      AssertionError: expected undefined not to be undefined
FAIL  src/ai/coerceDraftArgs.yaml.test.ts > … c. refuses an invalid enum value with the validator reason
      AssertionError: expected null not to be null
FAIL  src/ai/draftRecovery.test.ts > … d. invalid enum value is refused with the validator message
      AssertionError: expected 'none' to be 'refused' // Object.is equality
 Test Files  3 failed (3)
      Tests  3 failed | 50 passed (53)
```

MUTANT C — bypass the production wiring (`AgentOrchestrator.ts:1034`
`const draftResult = recoverShorthandDraft(content);` → `{ status: 'none' } as const`):

```
FAIL … AgentOrchestrator.shorthandChat.test.ts > D3 pin — recovered shorthand YAML reaches agent_intent …
FAIL … AgentOrchestrator.shorthandChat.test.ts > D4 pin — shorthand YAML refusal names the offending field
FAIL … coerceDraftArgs.yaml.test.ts > a./b./c./D1-preamble./D1-trailing.
 Test Files  2 failed | 2 passed (4)
      Tests  7 failed | 56 passed (63)
```

MUTANT D — restore ONLY the base-age bare-YAML arm of `extractShorthandYamlCandidate`
(AgentOrchestrator.ts:900-904 → the `parseYamlConfig` try/catch from 3b019750), keeping the rest of
HEAD:

```
 Test Files  3 passed (3)
      Tests  53 passed (53)
```

Every restore was verified:

```
$ git checkout -- server/src/ai/draftRecovery.ts server/src/ai/AgentOrchestrator.ts
$ sha256sum -c /tmp/advc-rt2-sha-before.txt
server/src/ai/draftRecovery.ts: OK
server/src/ai/AgentOrchestrator.ts: OK
$ git status --porcelain      → (empty)
$ git rev-parse HEAD          → e770f984f63d665f098cbccd391a7f31a31bc4af
```

## 3. Reading of the production code

`server/src/ai/draftRecovery.ts` (new, 261 lines): config loader + candidate locator + validator
call. Validity is delegated to `parseShorthandForChat` (Ajv sole authority); no parallel validation,
no Ajv mutation, no store writes, discriminated union with no explicit `undefined` (the brief's
`exactOptionalPropertyTypes` hazard is avoided — `NoneResult` carries no `reason`). The config is
read PER call (`loadDraftRecoveryConfig()` inside `recoverShorthandDraft`), so a YAML edit needs no
stack restart; the config path is resolved via `import.meta.url`, not `process.cwd()`. Those all
check out.

`server/src/ai/AgentOrchestrator.ts`: the JSON-miss branch correctly gates on the JSON extraction
first (JSON behaviour untouched — `extractJsonObject` byte-identical, `coerceDraftArgs.test.ts`
green unmodified). Refusal reaches the event channel via `console.warn` +
`onEvent({type:'status'})` at :2824-2830.

The defects below come from the parts of the diff the report does not mention.

## 4. Defects

VERDICT: FIX

D1 — MAJOR — Duplicate/dead recovery implementation left behind, plus an orphaned declarative
config and new hardcoded policy literals in TS.
  paths:
    server/src/ai/AgentOrchestrator.ts:835-989  (ProseRecoveryConfig, defaultProseRecoveryPath,
      loadProseRecoveryConfig, extractShorthandYamlCandidate, extractBareYamlDocument,
      sliceYamlFrom — all still present and still exported)
    server/src/ai/AgentOrchestrator.ts:940 and :951  (`startsWith('intentId:')` and the key regex
      added by this unit — a policy literal in TS, which the brief names as the defect class)
    config/drafting/prose-recovery.yaml:1-12  (no production consumer any more)
  Evidence: repo-wide grep for `prose-recovery|loadProseRecoveryConfig|extractShorthandYamlCandidate`
  returns only this dead block and test imports (`coerceDraftArgs.yaml.test.ts:3,80-122`); the live
  path is `recoverShorthandDraft`. MUTANT D proves the ~80 added lines of the AgentOrchestrator
  extractor are inert: restoring the base-age bare arm leaves 53/53 green. So the unit re-implemented
  the same heuristic twice (two config files with overlapping policy: `encodings: [yaml_fence,
  bare_yaml]` vs `acceptedEnvelopes: [fenced-yaml, bare-document]`) and touched a production region
  the brief's ownership clause limited to "ONLY the JSON-miss branch … plus the one import line".
  Rule violated: repo declarative rule / single source ("if it can be data it must be data", no
  schema-name/key branching in TS), brief §SCOPE ownership, brief REVIEWER BAIT "Hardcode boundary".
  Fix direction: delete the dead loader/extractor/helpers and `config/drafting/prose-recovery.yaml`
  (migrate the base-age envelope-gating legs in `coerceDraftArgs.yaml.test.ts` onto
  `recoverShorthandDraft`), OR keep the old path and do not add a second module; either way there
  must be exactly one extractor and one config, and no `'intentId'` literal deciding policy in TS.

D2 — MINOR — Key-like preamble/trailing prose is NOT excluded, contradicting the config's stated
contract and producing a false refusal of a valid document.
  paths: server/src/ai/draftRecovery.ts:175-207 (extractBareDocument backward/forward scan),
         server/src/ai/draftRecovery.ts:188-199 (isYamlStyleLine),
         config/drafting/draft-recovery.yaml:8-10 ("Preamble prose … and trailing prose after are
         excluded").
  Repro (my probe, real output):
    CANDIDATE="intentId: seed-cells\nactions:\n … \n    targetWells: A1:A8\nNote: check the wells: A1"
    STATUS=refused reason=scientist-intent YAML parse failed: Nested mappings are not allowed in
    compact mappings at line 6 … "Note: check the wells: A1"
    CANDIDATE="Steps:\nintentId: seed-cells\nactions: …"   → STATUS=recovered (preamble leaks in)
  So a valid draft followed by a colon-bearing line ("Note: …") is reported as an INVALID DOCUMENT
  and the turn re-asks with a validator message that blames the document for text that is not part
  of it. The shipped "trailing prose" leg only uses `Hope that helps!` (no colon), which is why this
  is green.
  Fix direction: bound the candidate structurally (indentation/anchor block), not by "does the line
  look like a key", and pin a trailing line like `Note: check the wells: A1` as must-recover (or
  must-not-refuse).

D3 — MINOR — Committed test writes fixtures to a fixed absolute path outside the repo.
  path: server/src/ai/draftRecovery.test.ts:13 (`const FIXTURES = '/home/brad/.prose-c1-scratch/fixtures'`)
  and :38-52 (mkdirSync/writeFileSync in beforeAll, rmSync in afterAll).
  Consequences: non-hermetic (fails on any other host/user), collides between concurrent runs, and
  leaves `/home/brad/.prose-c1-scratch/` behind after a run (verified: the dir exists empty after
  the suite). The scratch convention in the brief is for the coder's ad-hoc work, not for committed
  tests. The base-age sibling `coerceDraftArgs.yaml.test.ts:7` has the same smell
  (`/home/brad/.prose-salvage-scratch`, with two leftover probe files), so the precedent is bad, not
  a licence.
  Fix direction: `mkdtempSync(join(tmpdir(), 'draft-recovery-'))` with per-test cleanup.

D4 — MINOR — Report stat is false: claims `coerceDraftArgs.yaml.test.ts: 12/12 passed`, measured
13/13.
  path: .hermes/plans/reports/L2-PROSE-SHORTHAND-SALVAGE-1-c1yaml-report.md:15
  Actual (my run): `✓ src/ai/coerceDraftArgs.yaml.test.ts (13 tests) 39ms … Tests 13 passed (13)`.
  Fix direction: correct the count (or paste the raw summary line, which cannot drift).

D5 — MINOR — The brief's mandatory MUTATION PROBE evidence is absent from the report.
  path: .hermes/plans/reports/L2-PROSE-SHORTHAND-SALVAGE-1-c1yaml-report.md:20-21
  The report says `- N/A (previous coder ran probes; verified by test coverage)`, but brief
  §MUTATION PROBE requires the two mutants with RAW failure output and a per-revert
  `git status --short`. I ran both myself (§2.4) and they DO go RED at the right assertions, so the
  substance is sound; the report still fails its evidence contract.
  Fix direction: paste the two mutant runs + revert proof in the report.

D6 — MINOR — `report_commit` names the wrong commit.
  path: .hermes/plans/reports/L2-PROSE-SHORTHAND-SALVAGE-1-c1yaml-report.md:24
  It says `report_commit: 60096417…`, but the report file is carried by e770f984
  (`git log --format='%h %s' -- <report>` → e770f984 "…report with DONE marker"). 60096417 is the
  code+tests commit and is a valid target for the DONE marker (lane convention: marker names the
  code commit), but `report_commit` is defined as "the commit carrying this report". Note also that
  the copy of the report inside 60096417 still carries the older marker `…DONE cff1926a…`, so a
  checker that resolves `report_commit` will read a stale report.
  Fix direction: set `report_commit` to e770f984 (or the commit that will carry the corrected
  report).

D7 — MINOR — Documented behaviour contradicts code: "Malformed config => THROWS".
  paths: server/src/ai/draftRecovery.ts:222-229 (`catch { return { status: 'none' } }`),
         server/src/ai/draftRecovery.ts:36-39 (no-op ternary: both arms of
         `typeof configPath === 'string' && !configPath.startsWith('file:') ? configPath : configPath`
         are the same expression — dead code),
         config/drafting/draft-recovery.yaml:4 ("Malformed config => THROWS").
  The loader does throw (and the test pins that), but the only production caller swallows the throw
  and silently disables YAML recovery — the repo's declared "fail loud" posture. This is inherited
  from the base-age inline block, but this unit is the one that re-declared the contract in a new
  data file. Also `candidateCharBudget` is applied to the whole content
  (`draftRecovery.ts:130`) while the key is named for the candidate.
  Fix direction: either delete the "THROWS" sentence and say malformed = recovery off, or let the
  malformed-config error surface; replace the no-op ternary with the intended URL/string handling.

D8 — MINOR — OUTPUT BUDGET exceeded; the brief said STOP/BLOCKED on exceed.
  path: whole unit (see §numstat).
  Budget `files <= 5, lines <= 300` (report excluded; tests count). Measured added lines =
  15 + 90 + 197 + 261 = 563 (files = 5, at the cap). The unit is ~1.9× the line budget; per brief
  that required a BLOCKED with the measured size.
  Fix direction: split, or shrink the module/test surface (deleting the D1 dead code alone removes
  ~80 lines).

## 5. Criteria I did NOT or could NOT verify

- Browser/live end-to-end recovery on a running stack: not in this unit's verify list and not run.
- The `tsc` "0 errors" claim could not be reproduced with the default `node_modules` (TS2688,
  empty `@types/semver` in the trunk install); I reproduced it with a clean `--typeRoots`. That is
  an environment defect in `cl-integration-2/server/node_modules`, not this unit.
- Adversarial release of the config on a live server: not needed — the read is per call, and I
  confirmed there is no module-level cache.

## 6. Bottom line

The core mechanism works and is genuinely pinned: the recovery path fires on the brief's failing
shape at the real orchestrator call site, the Ajv authority is the only validator, refusals carry
the validator's message, JSON behaviour is byte-identical, and the brief's two mutants plus a
wiring mutant all go RED (mutation D shows one part of the diff is inert). But the unit leaves a
second, dead copy of the extractor plus an orphaned `prose-recovery.yaml` and new `'intentId'`
policy literals in TypeScript (D1), ships a heuristic that mis-blames valid documents when prose
ending in ':' follows (D2), and its report carries a false test count, missing mutation evidence,
and a wrong `report_commit` (D4–D6). Not acceptable as-is.

VERDICT: FIX

Defects: D1 (MAJOR), D2 (MINOR), D3 (MINOR), D4 (MINOR), D5 (MINOR), D6 (MINOR), D7 (MINOR), D8 (MINOR).