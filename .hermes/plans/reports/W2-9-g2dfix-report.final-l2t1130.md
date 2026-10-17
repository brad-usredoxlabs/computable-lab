# W2-9 g2d FINAL CYCLE — LANE 2 REPORT (l2t1130)

Worktree: /mnt/vast/home/brad/git/wt/W2-9-g2dfix-lane2-l2t0310
Branch: cl/W2-9-g2dfix-lane2-l2t0310 (base 2dd35c65 = c7 tip; NOT restarted from trunk)
Ruling (contract): /home/brad/.hermes/cl/lanes/2/decisions/W29-g2d-wall-mechanism-decision-l2t1040.md
Hybrid C+A, one dispatch, both parts. Raws: .hermes/raws/g2dfin-*.

## 0. Commit chain (RED first, then PART 1, PART 2, disclosure rows, report last)

| sha | role |
|---|---|
| 1dee7d88 | RED tests: closure arms + gate arms pinned BEFORE any product change (6 failed / 125 passed at 2dd35c65) |
| 87322bd5 | PART 1: friction-wall DATA widening (YAML only) + R24 repins + R26-R29 disclosure rows |
| 7a7a78fb | PART 2: structural retarget gate (YAML data + attachedProtocolRetargetGate.ts loader + AgentOrchestrator.ts additive branches + header re-scope) |
| 807515eb | disclosure rows: protocolId-spelling stacked/closing outer-prefix variants pinned FREE (R25 extended) |
| (this report) | report commit, final tip |

## 1. Per-AC table

| AC (ruling "Final cycle — exact scope") | Status | Evidence |
|---|---|---|
| P1: widen outer-prefix quote on the bare linking nouns (YAML ~:694-703) from single-char optional class to a run over the FIVE declared quote chars | DONE (87322bd5) — with mandatory-`+` disclosure (§4) | YAML diff 2dd35c65..HEAD: 115 lines changed, 11 noun patterns carry `["“‘”’]*`; probe raws g2dfin-probe-head.txt |
| P1: re-run pinned R4/R7/R15/R20/R23 article arms | DONE — all UNFLIPPED (pinned FREE, re-measured) | g2dfin-final-battery2.txt 137/137; flip-check §3 |
| P1: FULL flip-check, bar 0 WALL->FREE, only intended FREE->WALL closures enumerated | DONE — 717 literals, WALL->FREE=0, FREE->WALL=10 enumerated verbatim | g2dfin-flipcheck-final2.txt §3 |
| P1: disclose c7 DEFECT-2 separators (comma/colon/'protocol id'/'protocol-id') as named residual rows R26+ pinned FREE; do NOT widen separator class | DONE — R26-R29 committed test rows (reviewWriteWall.test.ts:1601-1617); separator class untouched | commit 1dee7d88/87322bd5; battery green |
| P1: rewrite header completeness prose: prose wall = FRICTION layer; ENFORCED invariant = structural gate | DONE | YAML header lines 58-71 ("The ASK WALLS in this file are a FRICTION layer… The ENFORCED invariant is the STRUCTURAL RETARGET GATE… NO disclosure tier") |
| P1: server/src/ai/reviewWriteWall.ts BYTE-FROZEN | DONE — proven §5 | `git -c core.fileMode=false diff e1b62bd6 HEAD -- server/src/ai/reviewWriteWall.ts` -> 0 lines |
| P2: YAML `opsWall.attachedMismatchRule: {code, message, protocolIdPattern}`, absent = OFF | DONE | YAML :833+ `attachedMismatchRule: code: ATTACHED_PROTOCOL_MISMATCH, protocolIdPattern: "^PRT-"` + honest message |
| P2: loader rides the data-declared-list validation pattern (targetIdRules precedent); reviewWriteWall.ts stays frozen | DONE with disclosed placement (§6) | new server/src/ai/attachedProtocolRetargetGate.ts; attachedProtocolRetargetGate.test.ts 5/5 (g2dfin-gate-loader.txt) |
| P2: protocol_edit branch — rule present + attached protocol + payload protocolId defined, matches pattern, != attached => honest refusal through EXISTING channel BEFORE envelope validation | DONE (additive branch in AgentOrchestrator.ts after opsWall block, before envelope validation) | test 'g2dfin gate: a protocol_edit whose protocolId names a FOREIGN PRT is refused before the envelope (no protocolEdit, zero writes)' green; log `done protocol_edit retarget-gate refusal code=ATTACHED_PROTOCOL_MISMATCH ops=1` |
| P2: workspace_action branch — same rule on the COMPILED action; refused, same envelope, NO agent_action event | DONE | tests '…focus on a FOREIGN PRT record…ZERO agent_action emission', '…FOREIGN protocol-step target…', '…open-surface scoped to a FOREIGN PRT…' green (zero-emission asserted via onEvent capture) |
| P2: verify compiled target id observable at refusal site BEFORE implementing | DONE — proven BEFORE the gate existed (§7) | RED raw: `done workspace_action compiled ok action=focus target=PRT-foreign-9999` (g2dfin-red-battery.txt) |
| P2: RED-first tests in AgentOrchestrator.reviewWriteWall.test.ts (ADD) | DONE — commit 1dee7d88 precedes all product code | g2dfin-red-battery.txt: 6 failed / 125 passed |
| P2: honest pins stay green (protocolId==attached; NO protocolId override; non-PRT override; non-PRT focus; attached-step focus; no attached protocol; unguarded surface) | DONE — 7 honest-pin tests, all green | g2dfin-final-battery2.txt 137/137 |
| P2: existing 117/117 + 17/17 batteries keep counts (plus new rows) | DONE — 117 carried -> 131 -> 137; app 17/17 unchanged | §2 |
| Bar: full batteries + flip-check 0 WALL->FREE | DONE | §2, §3 |
| Bar: `npm run test:run -w server` failing-FILE-SET equality vs trunk (comm empty) + server tsc equality | DONE with flap proof (§8) | 4-run intersection = base 89 exactly; tsc 0 = 0 |
| Restart note: YAML changed -> orchestrator restarts lane stack; coder does NOT restart :5193/:3093, never touches :5174/:3001 | RESPECTED — no service restarted or touched | no process commands issued against those ports |

## 2. Test batteries (raw blocks spliced from raws; leading spaces preserved)

Base battery at 2dd35c65 (g2dfin-base-battery.txt):
```
 Test Files  3 passed (3)
      Tests  117 passed (117)
```
Per-file: reviewWriteWall 75, AgentOrchestrator.reviewWriteWall 40, honestRefusal 2.

RED battery (tests committed first, product untouched; g2dfin-red-battery.txt):
```
 Test Files  2 failed | 1 passed (3)
      Tests  6 failed | 125 passed (131)
```
The 6 failures are exactly: 2 PART 1 closure arms (stacked outer-prefix frames; R24 closing-orientation arms) + 4 PART 2 gate arms (foreign protocol_edit pre-envelope; foreign focus record target; foreign protocol-step target; foreign open-surface). All honest pins already passed at RED.

PART 1-only state (widened YAML, gate not yet wired; g2dfin-part1-battery.txt):
```
 Test Files  1 failed | 2 passed (3)
      Tests  4 failed | 127 passed (131)
```
(only the 4 PART 2 gate arms remain RED — PART 1 fully green.)

RED-by-YAML-swap (final tests + BASE YAML 2dd35c65; g2dfin-red-yamlswap.txt):
```
 Test Files  3 failed | 1 passed (4)
      Tests  8 failed | 128 passed (136)
```
8 = 2 closure + 4 gate + 2 gate-loader pins — proves the closure arms genuinely fail against the base YAML.

PART 2 battery (g2dfin-part2-battery.txt):
```
 Test Files  3 passed (3)
      Tests  131 passed (131)
```
(117 carried + 14 new: 2 closure + 4 gate + 7 honest pins + 1 R26-R29 disclosure row.)

Final battery incl. gate-loader (g2dfin-final-battery2.txt):
```
 Test Files  4 passed (4)
      Tests  137 passed (137)
```
Per-file: reviewWriteWall 79, AgentOrchestrator.reviewWriteWall 51, honestRefusal 2, attachedProtocolRetargetGate 5.

Gate loader (g2dfin-gate-loader.txt): 5/5. Adjacent orchestrator batteries (workspaceAction/protocolEdit/protocolEditRecovery/shadowRouter; g2dfin-adjacent.txt): 43/43. App battery (ReviewAiPanel.writeWall + ReviewAiPanel; g2dfin-app-battery.txt):
```
 Test Files  2 passed (2)
      Tests  17 passed (17)
```

## 3. Flip-check (717-literal, base YAML 2dd35c65 vs head YAML)

g2dfin-flipcheck-final2.txt:
```
FLIPCHECK literals=717 same=707 FREE->WALL=10 WALL->FREE=0
```
Bar met: 0 WALL->FREE. The 10 FREE->WALL closures, enumerated verbatim (all RETARGET_NOT_ON_THIS_SURFACE):
1. "forward this review to \"‘yet another protocol “PRT-4iaey2”’\""
2. "forward this review at \"‘a further protocol “PRT-4iaey2”’\""
3. "forward this review to \"‘yet another protocol named “PRT-4iaey2”’\""
4. "forward this review to \"\"yet another protocol PRT-4iaey2\"\""
5. "forward this review to ““yet another protocol “PRT-4iaey2””"
6. "retarget this review onto ‘‘one more protocol ‘PRT-4iaey2’‘"
7. "transfer this review towards ”“still another protocol “PRT-4iaey2””"
8. "assign this review to ‘’protocol “PRT-4iaey2”‘‘"
9. "forward this review to ”yet another protocol PRT-4iaey2“"  (c7 R24 repin)
10. "forward this review to ”yet another protocol ‘PRT-4iaey2’“"  (c7 R24 repin)

8 stacked outer-prefix closures (c7 DEFECT-1 class) + 2 R24 closing-orientation repins. Pinned R4/R7/R15/R20/R23 article arms re-measured FREE (unflipped) in the battery.

## 4. The `+`-vs-`*` disclosure (ruling wording vs 0 WALL->FREE bar)

The ruling says widen "from the single-char optional class to `+` over the five declared quote chars". A MANDATORY `+` is incompatible with the ruling's own 0 WALL->FREE bar: proven by mutation (g2dfin-mutation-plus.txt) — replacing `["“‘”’]*` with `["“‘”’]+` on the ten bare linking nouns flips 4 pinned WALL arms to FREE:
```
FAIL … g2dfix6 DEFECT-4: linking-word interposition between protocol and the record id…
FAIL … g2dfix6 sweep pin: reviewer c5 WALL-side arms fire
FAIL … g2dfix7 DEFECT-2: linking word + quoted record id fires RETARGET_NOT_ON_THIS_SURFACE
FAIL … g2dfix7 sweep pin: reviewer c6 WALL-side arms fire
```
(the unquoted frames `to protocol named PRT-…` etc. are pinned WALL from cycles 5-7). The mutation was reverted; committed form is `["“‘”’]*` — a RUN over the five declared quote chars that is the UNION of the old optional frame and the new mandatory multi-char run: it adds the stacked-run closure without dropping any unquoted coverage. This is the only reading that satisfies both the widening and the 0 WALL->FREE bar; disclosed rather than silently resolved.

## 5. Byte-freeze proof

```
$ git -c core.fileMode=false diff e1b62bd6 HEAD -- server/src/ai/reviewWriteWall.ts | wc -l
0
```
(Also 0 against the working tree at every checkpoint; interpreter never edited in any commit of this cycle.)

## 6. Loader placement (disclosed)

The ruling: "loader additions for opsWall live where targetIdRules loading lives; verify where that is before editing." Verified: targetIdRules loading lives in server/src/ai/reviewWriteWall.ts (:245-246 region) — the BYTE-FROZEN file. The two constraints collide; the freeze wins (ruling: "If you cannot do PART 2 without touching it, report BLOCKED — do not improvise" applies to editing the frozen file). Resolution: the gate loader lives in its own module server/src/ai/attachedProtocolRetargetGate.ts, riding the SAME data-declared validation pattern as targetIdRules (required strings code/message/protocolIdPattern; pattern compiled at LOAD; present-but-malformed throws honestly; absent file/section = OFF) and the house load-per-call pattern (shorthandDrafting.ts). Surfaces membership reads the same DATA `surfaces:` list. attachedProtocolRetargetGate.test.ts pins the contract 5/5. NOT BLOCKED: PART 2 completed without touching the frozen file.

## 7. Observable-target-id proof (workspace_action refusal site)

Proven BEFORE implementing the gate, at base 2dd35c65 with no gate code present (g2dfin-red-battery.txt):
```
[agent cmpddq] done workspace_action compiled ok action=focus target=PRT-foreign-9999 elapsedMs=34
```
The compiled action's target id is observable at the refusal site. After the gate (g2dfin-part2-battery.txt):
```
[agent 0ueufd] done protocol_edit retarget-gate refusal code=ATTACHED_PROTOCOL_MISMATCH ops=1 elapsedMs=27
[agent ktt3mz] done workspace_action retarget-gate refusal code=ATTACHED_PROTOCOL_MISMATCH action=focus target=PRT-foreign-9999 elapsedMs=38
[agent n9e6zx] done workspace_action retarget-gate refusal code=ATTACHED_PROTOCOL_MISMATCH action=focus target=PRT-foreign-9999 elapsedMs=8
[agent q9fpmz] done workspace_action retarget-gate refusal code=ATTACHED_PROTOCOL_MISMATCH action=open-surface target=PRT-foreign-9999 elapsedMs=8
```
Record targets (focus/open) and protocol-step targets (protocolId on the compiled step action) are both observable; open-surface scoping carries the record target id. No prose fallback was used.

## 8. Full server suite + tsc (failing-FILE-SET equality)

Base (2dd35c65, g2dfin-base-fullserver.txt):
```
 Test Files  89 failed | 623 passed | 9 skipped (721)
      Tests  98 failed | 5814 passed | 70 skipped (6155)
SUITE_EXIT:1
```
Head, three serial clean runs (g2dfin-head-fullserver-clean{,2,3}.txt):
```
 Test Files  91 failed | 623 passed | 9 skipped (723)   Tests  99 failed | 5829 passed | 70 skipped (6175)
 Test Files  91 failed | 622 passed | 9 skipped (722)   Tests  100 failed | 5831 passed | 70 skipped (6174)
 Test Files  91 failed | 622 passed | 9 skipped (722)   Tests  98 failed | 5820 passed | 70 skipped (6174)
```
comm(base, head-run-N) is NOT empty for any single run: each run adds exactly 2 extra fail-files, and the extra set ALTERNATES run to run:
- run1: +W25DraftLifecyclePromotion, +Qms6bSchemaDrift
- run2: +W25DraftLifecyclePromotion, +Wave2SemanticPassE2E
- run3: +DraftCopyDerivedRefValidation, +Qms6bSchemaDrift
Intersection of base ∩ head1 ∩ head2 ∩ head3 = exactly the 89 base files (computed: common-fail-in-all-4-runs: 89; union: 93). The 4 flap candidates (W25DraftLifecyclePromotion, Wave2SemanticPassE2E, DraftCopyDerivedRefValidation, Qms6bSchemaDrift) all PASS standalone in one targeted run (4 passed / 25 tests) and have ZERO coupling to this cycle's diff (grep for reviewWriteWall|AgentOrchestrator|attachedProtocolRetargetGate|review-write-wall in them: exit 1, no matches). This is the known load-timeout flap class (head runs show +2 via load-timeout flaps; serial runs flip which two). Failing-FILE-SET equality holds modulo proven flaps; zero new fail-files attributable to this cycle.

Server tsc: base 0 errors (g2dfin-base-tsc.txt, TSC_EXIT:0), head 0 errors (g2dfin-head-tsc.txt, TSC_EXIT:0) — baseline equality.

## 9. Residual table (R1-R25 carried from c7 + new R26+ rows)

| # | Residual | Class | Status after final cycle |
|---|---|---|---|
| R1 | bare article frame with NO id (`retarget/switch/forward this review to the protocol`) | LEAK | pinned FREE (unchanged; no-id arms stay FREE) |
| R2 | `retarget this review for protocol PRT-4iaey2` (`for` as preposition) | LEAK | pinned FREE (unchanged) |
| R3 | id-named nav asks (`switch to the PRT-4iaey2 protocol tab`) | OVER-BLOCK | pinned WALL (unchanged) |
| R4 | `towards/toward the protocol PRT-<id>` (article frame) | LEAK | pinned FREE — UNFLIPPED (re-measured, flip-check) |
| R5 | `switch this review into protocol PRT-<id>` | covered | pinned WALL (unchanged) |
| R6 | bare frames naming NO target (`to protocol`, `to the protocol id`) | LEAK | pinned FREE (unchanged) |
| R7 | quoted-id scope compounds (`to "CAN-w29-gate"`, `to the "PRT-4iaey2" protocol`) | LEAK | pinned FREE — UNFLIPPED (re-measured) |
| R8 | id token without hyphen (`to protocol PRT`) | LEAK | pinned FREE (unchanged) |
| R9 | `what is the target protocolId?` | OVER-BLOCK | pinned WALL (unchanged) |
| R10 | `move the draft to "PRT-4iaey2"` | OVER-BLOCK | pinned WALL (unchanged) |
| R11 | undeclared retarget VERB synonyms | LEAK | pinned FREE (finite DATA enum) |
| R12 | `towards/toward a different protocol` (no-id) | LEAK | pinned FREE (unchanged) |
| R13 | interposed qualifier with NO record-id token | LEAK | pinned FREE (unchanged) |
| R14 | negated questions about the wall | covered | pinned FREE (negationTokens) |
| R15 | `towards/toward the different protocol PRT-<id>` | LEAK | pinned FREE — UNFLIPPED (re-measured) |
| R16 | `forward this review to my protocol PRT-<id>` | OVER-BLOCK | pinned WALL (unchanged) |
| R17 | unenumerated qualifier on `protocolId` WITHOUT an id | LEAK | pinned FREE (unchanged) |
| R18 | underscore id shape (`PRT_4iaey2`) | LEAK | pinned FREE (unchanged) |
| R19 | unenumerated linking word + id (`protocol dubbed PRT-…`) | LEAK | pinned FREE (unchanged) |
| R20 | article + linking compound (`to the protocol named PRT-…`) | LEAK | pinned FREE — UNFLIPPED (re-measured) |
| R21 | quote opening MID-frame (`… yet another “protocol PRT-…”`) | LEAK | pinned FREE (unchanged; probe-confirmed mid-frame stays FREE after widening) |
| R22 | quote-CHARACTER enumeration limit (apostrophe/guillemets) | LEAK | pinned FREE (unchanged) |
| R23 | article + quoted-id compound (`to the protocol “PRT-…”`) | LEAK | pinned FREE — UNFLIPPED (re-measured) |
| R24 | outer-quote ORIENTATION limit (closing char as outer opener) | CLOSED this cycle | repinned WALL (flip-check rows 9-10) |
| R25 | outer quote + linking hop on `protocolId` spelling (`to “yet another protocolId named ‘PRT-…’”`) | LEAK | pinned FREE (unchanged); EXTENDED this cycle (807515eb) to the stacked/closing outer-prefix variants on the `protocolId` spelling — `to ""yet another protocolId PRT-…""`, `to ”protocolId PRT-…“` etc. stay FREE: the widened run is declared for the ten BARE linking nouns only (the ruling's :694-703 region), never silently |
| R26 | **NEW (final):** comma separator — `forward this review to protocol, PRT-4iaey2` | LEAK | pinned FREE (committed row, 'g2dfin disclosed residuals'; separator class NOT widened per ruling) |
| R27 | **NEW (final):** colon separator — `forward this review to protocol: PRT-4iaey2` | LEAK | pinned FREE (committed row) |
| R28 | **NEW (final):** spaced `protocol id` spelling — `forward this review to protocol id PRT-4iaey2` | LEAK | pinned FREE (committed row) |
| R29 | **NEW (final):** hyphenated `protocol-id` spelling — `forward this review to protocol-id PRT-4iaey2` | LEAK | pinned FREE (committed row) |

Per the re-scoped completeness prose: pinned-FREE rows are SUFFICIENT for the friction wall (visible, never silent). The structural gate has NO disclosure tier: a payload-side leak (focus/write landing on a foreign PRT while a protocol is attached) is a MAJOR fix-cycle defect, refused by code.

## 10. Restart note

YAML changed -> the ORCHESTRATOR restarts the lane stack. This coder did NOT restart :5193/:3093 and never touched :5174/:3001.

## 11. Raw inventory (.hermes/raws/, g2dfin- prefix)

g2dfin-base-battery.txt, g2dfin-base-fullserver.txt, g2dfin-base-tsc.txt, g2dfin-base-failfiles.txt, g2dfin-probe-head.txt, g2dfin-red-battery.txt, g2dfin-part1-battery.txt, g2dfin-red-yamlswap.txt, g2dfin-part2-battery.txt, g2dfin-gate-loader.txt, g2dfin-adjacent.txt, g2dfin-app-battery.txt, g2dfin-final-battery.txt, g2dfin-final-battery2.txt, g2dfin-flipcheck.txt, g2dfin-flipcheck-final.txt, g2dfin-flipcheck-final2.txt, g2dfin-mutation-plus.txt, g2dfin-head-fullserver.txt (contaminated — kept for honesty), g2dfin-head-fullserver-clean{,2,3}.txt, g2dfin-head-failfiles{,2,3,-contaminated}.txt, g2dfin-head-tsc.txt.
