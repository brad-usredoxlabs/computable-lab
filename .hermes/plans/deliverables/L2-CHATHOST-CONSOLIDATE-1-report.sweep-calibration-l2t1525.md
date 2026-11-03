# L2-CHATHOST-CONSOLIDATE-1 — Post-Merge Sweep Calibration (Lane 2)

**Branch:** `cl/lane2-chathost-consolidate-1-lane2-l2t0410` (base `fbbca785`, merged to trunk as `98a099fe`)
**Lane stack:** `:5193` (FE) → `:3093` (BE), live sampler `:18099`
**Red receipts:** `/home/brad/.hermes/cl/receipts/L2-TRUNK-JOURNEYS/20261103T195642Z/`
**Green baseline:** `/home/brad/.hermes/cl/receipts/L2-TRUNK-JOURNEYS/20261101T225814Z/`

---

## U2 — J2 trunk journey RED: diagnosis + fix

### Verdict: HARNESS fault (canned data), not a product regression.

### Root cause (first-hand, deterministic)

J2's pinned acceptance targets the **single typed clarification card** —
`[data-testid^="chat-log-request-"]` + `ol.chat-log-clarification-options` —
which is the **single-request arm** of `ChatLog.tsx` (`renderTypedClarification`,
line 309, testid `chat-log-request-${request.id}`).

`ChatLog.tsx:419` (added by **CARD-1**) routes the **multi-request** case to the
**grouped** `ChatClarificationCard` (testid `chat-clarification-card`):

```js
const rendersGroupedCard = (message.clarificationRequests?.length ?? 0) > 1
  && onClarificationSubmit !== undefined
```

So the J2 outcome depends on **how many** clarification requests the deterministic
compiler emits for the turn-1 shorthand:

| Run | Shorthand form | Compiler requests | Card rendered | `chat-log-request-*`? | Verdict |
|-----|---------------|-------------------|---------------|----------------------|---------|
| GREEN baseline (live, 20261101T225814Z) | **canonical** `params.composition` | **1** (composition-fraction-sum) | single-card arm | **yes** | GREEN |
| RED sweep (fake, 20261103T195642Z) | **non-canonical** top-level `composition:` | **multiple** (material-binding ×3 + composition-fraction-sum) | grouped `ChatClarificationCard` | **no** | RED (480 s timeout) |
| RED live (20261103T202010Z) | **non-canonical** top-level `composition:` + `material:` blob | **multiple** | grouped `ChatClarificationCard` | **no** | RED (480 s timeout) |
| GREEN fake-fix (20261103T205541Z, **this run**) | **canonical** `params.composition` | **1** (composition-fraction-sum) | single-card arm | **yes** | GREEN |

The **canned** J2 turn-1 shorthand (`.hermes/plans/harness/l2-trunk-journeys/canned/
completions.yaml`) used the **non-canonical** top-level `composition:` sibling form.
The canonical form (per the taught grammar — "the entry per component in
`params.composition`") is `params.composition`. The live model produces the
canonical form in the GREEN baseline; the canned data did not.

With the non-canonical form, the compiler fires the per-component material-binding
bars (Trypsin-EDTA, DMEM, FBS → `ambiguous-noun`, `menuProvider:/m`, `options:[]`)
**in addition to** the composition-fraction-sum bar → `clarificationRequests.length
> 1` → CARD-1's grouped-card routing → the pinned `chat-log-request-*` testid is
absent → J2's selector times out at 480 s.

The composition-fraction-sum card **IS emitted** by the server (present in the
compiler output of every run; visible in the RED failure screenshot as a numbered
1./2./3. card). The card is **not** missing — it renders via the grouped arm when
multiple requests are present. The CARD-1 grouped-card routing is the product
behavior change that makes the single-card testid absent in the multi-request case.

### Which component changed

`app/src/agent/ChatLog.tsx` line 419 (the `rendersGroupedCard` condition) and the
`ChatClarificationCard` import/arm (lines 469–483) — both added by **L2-CLARIFY-CARD-1**
(commit `c7c684ca`, merged in the window 2026-11-01 → 2026-11-03). Before CARD-1,
the multi-request case rendered one `chat-log-request-*` card per request (via the
`.map` at line 485), so J2's selector matched. After CARD-1, the multi-request case
routes to the grouped `chat-clarification-card`, so the single-card testid is absent.

This is **another item's merged intent** (CARD-1), not CONSOLIDATE-1's. Per the
assignment boundary ("Do NOT touch CARD-1 files … If U2's cause lands inside those
files, report it instead of editing"), I report this and do **not** edit
`ChatLog.tsx` or `ChatClarificationCard.tsx`.

### Fix (harness data, smallest responsible seam)

Canonicalized the canned J2 shorthand in **both** turns: moved `composition:` from a
top-level sibling of `add_material` to `params.composition` (the taught grammar; the
form the live model produces in the GREEN baseline). Turn-1's fractions (50/50/10)
still sum to 110, so the composition-fraction-sum bar still fires (the J2 round trip
is preserved). Turn-2's fractions (45/45/10) sum to 100, so no composition bar fires
there (the answer turn is a clean re-apply). This makes turn-1's compiler emit exactly
**one** request (composition-fraction-sum) → single-card arm → `chat-log-request-*`
present → J2's pinned selector matches.

**File changed:** `.hermes/plans/harness/l2-trunk-journeys/canned/completions.yaml`
(J2 turn-1 + turn-2 blocks only). No product files touched. No CARD-1 files touched.

### Verification (RED → GREEN, deterministic)

Command: `python3 run-journeys.py --journey J2 --fake` (from the worktree, against
the live lane stack `:5193` → `:3093`).

- **Pre-fix (fake):** RED — `locator('[data-testid^="chat-log-request-"]')` 480 s
  timeout; `channel MISSING: clarificationAnswers`; `rendered: no clarification card
  was answered`. (Receipt `20261103T195642Z`.)
- **Post-fix (fake, turn-1 only):** GREEN. (Receipt `20261103T205541Z`.)
- **Post-fix (fake, turn-1 + turn-2, final):** GREEN — `== J2 clarification round
  trip: card -> structured answer -> fold, no loop → GREEN`.
  (Receipt `20261103T210905Z`; live sampler restored `ok=True`, `18099` → `18099`.)
- The GREEN run (`20261103T205541Z`) satisfies every pinned acceptance:
  - `verdict: green`, `violations: []`
  - Composition card rendered (`composition-fraction-sum` present in body[2])
  - First option clicked via the real card affordance
    (`whole-mixture-supplement` — option 1 of 3)
  - No re-ask loop (`clarification_answer_no_loop: true`)
  - Follow-up request body carries structured `clarificationAnswers`:
    `body[4].clarificationAnswers = [{requestId: "unresolved-c-4dc3c9a9c1",
    optionId: "whole-mixture-supplement", label: "whole-mixture supplement …"}]`
- **Self-check:** `python3 test-channel-selfcheck.py` → `SELFCHECK: PASS` (all
  pre-existing arms green, including the D3/D4 fake-dispatch pins over the edited
  canned block).

### Acceptance (never weakened — all pinned)

- ✅ Card rendered (composition-fraction-sum, single-card arm)
- ✅ First option clicked through the real card affordance
  (`ol.chat-log-clarification-options` → option 1)
- ✅ No re-ask loop
- ✅ Follow-up request body carries `clarificationAnswers` (structured)

### Live-model caveat (out of scope for this calibration)

The live model **also** occasionally emits the non-canonical top-level
`composition:` form (seen in the RED-live run `20261103T202010Z`). A **live**
(non-fake) J2 run could still be RED if the live model emits the non-canonical
shorthand, because the compiler then emits multiple requests → grouped card → the
pinned single-card testid is absent. This is a **model/teach** concern (the model
should emit the canonical `params.composition` form), not a harness or product
defect. The sweep uses **fake mode** (`--all --fake --chat-hosts`), so the
deterministic canned-data path is what the sweep grades. The harness fix makes that
path GREEN and deterministic. A live-mode J2 is advisory and not gate-graded
(`fake_mode=False` → `GREEN-NOT-GATING`, per the D2 rule in `run-journeys.py`).

---

## U1 — the two host probes were vacuous: made honest + non-vacuous (Lane 2)

Run 1's sweep left `artifact-host` and `run-workspace` RED for HARNESS reasons,
and both greens (had they been green) would have been VACUOUS: the probe never
actually exercised a real chat round trip on those hosts. This run fixes both,
one commit per host. Both are now GREEN against the live lane stack (`:5193` →
`:3093`) with the full non-vacuous evidence chain.

### U1a — artifact-host (commit `522d2403`)

**Cause:** HARNESS data fault. The probe navigated to
`/artifact/CHATHOST-PROBE/CHATHOST-PROBE` but no record existed there, so
`ArtifactHostPage` early-returned "Failed to load artifact: NOT_FOUND" → no right
pane → no AI tab → `open_ai_tab` waited 30 s and hung. The host could never
render a chat, so any verdict was vacuous.

**Fix (harness DATA, not a special case):** `build_chat_host_probe` now materialises
a REAL artifact record through the SAME `seed.record` / `teardown.delete_record`
machinery every journey uses. When the probe nav path is an artifact route
(`re.match ^/artifact/`), it seeds a schema-valid artifact record whose `recordId`
is the route's `:artifactId` token (derived from the nav path the product declared,
not a host-name comparison). The route-shape rule is the only branch; policy stays
in YAML; the other five hosts stay seedless. Teardown deletes the record.

**Commands + raw results (counts, not dumps):**
- The two probes were driven by an ad-hoc helper `_u1_rerun_probes.py` that was **never
  committed** (it is absent from the tree; only a stale
  `.hermes/plans/harness/l2-trunk-journeys/__pycache__/_u1_rerun_probes.cpython-314.pyc`
  remains), so `python3 _u1_rerun_probes.py` is NOT reproducible by a reader. The receipts
  below are the **evidence of record**. The nearest committed entry point that exercises the
  same chat-host probe path (it builds each `probe-<host>.yaml` from the inventory and runs
  it, `run-journeys.py:1042-1049`) is `python3
  .hermes/plans/harness/l2-trunk-journeys/run-journeys.py --all --fake --chat-hosts` against
  the live lane stack — it writes a fresh dated receipt dir, it does not re-emit the one
  below verbatim. Result recorded then: `VERDICT artifact-host=GREEN`, `RESTORE_OK=True`.
- Receipt dir `~/.hermes/cl/receipts/L2-TRUNK-JOURNEYS/20261103T220210Z-u1-probes/`:
  `artifact-host.json` `verdict=green`, `n_ai_request_bodies=3`, request body carries
  the sweep prompt; `artifact-host-ui.json` `assistant_turns=1 turns_completed=1
  last_assistant_text_nonempty=True error_frames=0`; screenshots
  `artifact-host-rendered-answer.png` + `artifact-host-outcome.png`.
- Teardown proof: `curl GET :3093/api/records/CHATHOST-PROBE` → `HTTP 404` (deleted).

**Still needs an orchestrator/browser gate:** none beyond the standard independent
browser reviewer confirming the rendered answer screenshot is a genuine assistant
turn (the driver already graded `assert.rendered` green from the live page text).

### U1b — run-workspace (commit `ef0ebde5`)

**Cause:** HARNESS step fault. `RunWorkspacePage` mounts the universal chat pane
ALREADY OPEN (it renders `HarnessChatPane` directly as its `rightPane` — no
`RightPane` tab strip, so no `right-pane-tab-ai` element exists there). The probe's
mandatory tab click hung 30 s on that host.

**Fix (ONE shared step implementation, no per-host branch):** `open_ai_tab`
(ui-drive.cjs) now detects the pane FIRST via the `Message` composer (the SAME
locator the `ask` step uses), polls bounded (up to `T`) for EITHER the tab or the
already-open composer, then acts — clicks the tab only when it exists, waits on the
pane when already open, and throws (fail closed) when neither is present so a host
that genuinely lacks the chat goes RED instead of silently skipping.

**Assertion NOT weakened:** the probe still demands a rendered non-empty assistant
answer + a request-body receipt, and a genuinely chat-less host yields no rendered
answer. Proven by a negative control in `test-channel-selfcheck.py` (pure, no
browser/stack): the probe's own `assert.rendered` scores a pane-absent fixture
(0 assistant turns) RED and a pane-present fixture (1 non-empty answer) GREEN.

**Commands + raw results (counts, not dumps):**
- `python3 test-channel-selfcheck.py` → `SELFCHECK: PASS` (10 new U1a/U1b arms OK — 5 U1a +
  5 U1b, including the pane-absent→RED negative control).
- The same **uncommitted** ad-hoc helper `_u1_rerun_probes.py` (see U1a above; absent from
  the tree) drove the run-workspace probe; the receipt dir below is the evidence of record.
  Committed reproducible entry point: `python3
  .hermes/plans/harness/l2-trunk-journeys/run-journeys.py --all --fake --chat-hosts`.
  Result recorded then: `VERDICT run-workspace=GREEN`, `RESTORE_OK=True`.
- Same receipt dir: `run-workspace.json` `verdict=green`, `n_ai_request_bodies=3`,
  request body carries the sweep prompt; `run-workspace-ui.json`
  `assistant_turns=1 turns_completed=1 last_assistant_text_nonempty=True
  error_frames=0`; screenshots `run-workspace-rendered-answer.png` +
  `run-workspace-outcome.png`.

**Still needs an orchestrator/browser gate:** same as U1a — the independent browser
reviewer confirms the rendered answer is a genuine assistant turn.

### U3 — the three reds: cause, classification, receipts validity

| Red | Cause | HARNESS vs PRODUCT | Now |
|-----|-------|--------------------|-----|
| artifact-host | no record → page early-return → no pane/tab → hang | **HARNESS** (data) | GREEN (U1a) |
| run-workspace | pane already open, no tab element → mandatory click hangs | **HARNESS** (step) | GREEN (U1b) |
| J2 | canned shorthand non-canonical (`composition:` top-level) → compiler multi-request → grouped card → single-card testid absent | **HARNESS** (canned data) | GREEN (U2, `92a83c4a`) |

All three reds were **HARNESS** faults (none touched a CARD-1 product file). No
product regression was found; nothing lands in another coder's worktree.

**Do the four prior accept receipts remain valid?** YES. This run changed only
harness files (`run-journeys.py`, `ui-drive.cjs`, `test-channel-selfcheck.py`,
`canned/completions.yaml`) plus this report. It did NOT change `config/chat/
chat-hosts.yaml` ids/surfaces, the shrink-guard anchor, the blessed id set, or any
product code. The four prior accept receipts grade the same inventory + gate, so
they stand unchanged. (The sweep table they feed is re-emitted each run from the
receipts that exist; the id/surface set is untouched.)

**VERIFY (raw, once):**
- `python3 .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py` →
  `SELFCHECK: PASS` (+ 10 new U1a/U1b arms).
- Two changed probes re-run against the live lane stack (`:5193` → `:3093`):
  `VERDICT artifact-host=GREEN`, `VERDICT run-workspace=GREEN`, `RESTORE_OK=True`;
  receipt dir `~/.hermes/cl/receipts/L2-TRUNK-JOURNEYS/20261103T220210Z-u1-probes/`.
- `git -c core.fileMode=false diff --stat fbbca785..0d0e6b72` →
  **5 files changed, 459 insertions(+), 15 deletions(-)** (report 249+/0-,
  completions.yaml 23+/8-, run-journeys.py 63+/5-, test-channel-selfcheck.py 93+/0-,
  ui-drive.cjs 31+/2-). The earlier figure this report carried — "341 insertions(+),
  15 deletions(-) (report 131+, completions.yaml 31±, run-journeys.py 68+,
  test-channel-selfcheck.py 93+, ui-drive.cjs 33+)" — was measured at the U1b commit
  `ef0ebde5` (`git -c core.fileMode=false diff --stat fbbca785..ef0ebde5` → 341(+)/15(-)),
  before the report body grew to its final 249 lines. That 341 figure is a stale
  mid-stack snapshot, not the frozen-HEAD stat. Any `HEAD`-relative stat keeps growing
  as this report file grows (every paperwork commit enlarges it), so a reader must pin
  the explicit head `0d0e6b72`; the range printed above does.
- `git -c core.fileMode=false status --porcelain` → clean (only the untracked
  `.hermes/plans/harness/l2-suite-a/lib/__pycache__/` dir remains, which is never
  committed).

### OPEN OBLIGATION (not a fix; do not widen scope into it)

The **live (non-fake) J2 path is still unproven**: the live model sometimes emits
the non-canonical top-level `composition:` form, which makes the compiler emit
multiple requests → a grouped card → the pinned single-card testid absent → a live
J2 can go RED. The sweep grades the **deterministic fake path only** (`--all
--fake --chat-hosts`); a live-mode J2 is advisory and not gate-graded
(`fake_mode=False` → `GREEN-NOT-GATING`). Fixing the live-model emission is a
model/teach concern owned elsewhere — out of scope for this calibration. No
product/teach fix is attempted here.


CHATHOST-CALIB DONE 34cbac7bb39da2de07f071c0389d3bf408bc76c7

---

## PAPERWORK FIX (l2t1712)

Evidence-trail-only corrections per adversarial cycle-3 (`.hermes/../cl/lanes/2/reviews/CHATHOST-CONSOLIDATE-1-advc-calib-c3-l2t1712.md`).
No harness, product, config or test file was touched; no stack was re-run. One commit.

**DEFECT-1 — §U3 diff-stat number (MINOR).** The report claimed `git -c core.fileMode=false
diff --stat fbbca785..HEAD` → "5 files changed, 341 insertions(+), 15 deletions(-)". Re-ran it
against the frozen HEAD: the actual stat is **459 insertions(+), 15 deletions(-)** (5 files).
Command re-run:
    git -c core.fileMode=false diff --stat fbbca785..0d0e6b72        # -> 459 insertions(+), 15 deletions(-)
    git -c core.fileMode=false diff --numstat fbbca785..0d0e6b72     # report 249/0, completions 23/8, run-journeys 63/5, selfcheck 93/0, ui-drive 31/2
The 341 number is not a fabrication: it is the real `git -c core.fileMode=false diff --stat
fbbca785..ef0ebde5` (the U1b commit — "5 files changed, 341 insertions(+), 15 deletions(-)"),
captured before the report body and two later commits grew the diff. The §U3 text now states
the frozen-HEAD numbers and names `ef0ebde5` as the head at which 341 was measured, rather
than silently swapping the value.

**DEFECT-2 — U1a/U1b arm count (MINOR).** §U1b and §U3 said "9 new U1a/U1b arms". Counted from
the selfcheck run:
    python3 .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py | grep -cE '^U1(a|b)'
    # -> 10
(5 lines prefix `U1a`, 5 lines prefix `U1b`; `SELFCHECK: PASS`, exit 0.) Both occurrences now
read **10**.

**DEFECT-3 — non-reproducible command (MINOR).** §U1a and §U1b cited `python3
_u1_rerun_probes.py` as the U1 evidence command. Re-checked: that file is NOT in the tree
(`ls _u1_rerun_probes.py` → No such file; `git ls-files | grep _u1_rerun` → empty; only a stale
`.hermes/plans/harness/l2-trunk-journeys/__pycache__/_u1_rerun_probes.cpython-314.pyc` remains),
so a reader cannot run it. Both citations were replaced with an honest account: the ad-hoc
helper was never committed, the receipts under
`~/.hermes/cl/receipts/L2-TRUNK-JOURNEYS/20261103T220210Z-u1-probes/` (artifact-host.json,
run-workspace.json, the two ui.json files and their screenshots) are the evidence of record, and
the committed reproducible entry point for the same chat-host probe path is `python3
.hermes/plans/harness/l2-trunk-journeys/run-journeys.py --all --fake --chat-hosts`
(`run-journeys.py:1042-1049` builds each `probe-<host>.yaml` and runs it).


CHATHOST-PAPERWORK DONE 6ac19250d8fe59e6e02140bf19cccc631d4d7dc7

(The sha this marker was first written with, `5db37aeb`, was an amended-away draft — folded
into `6ac19250` by `git commit --amend`, not the commit of record — see D-2 below.)

---

## PAPERWORK FIX 2 (l2t1712)

Evidence-trail-only corrections per adversarial cycle-4 (`.hermes/../cl/lanes/2/reviews/CHATHOST-CONSOLIDATE-1-advc-calib-c4-l2t1712.md`).
Report-text only: no harness, product, config or test file was touched; no stack was re-run.

**D-1 (MINOR) — the printed diff-stat commands bound the moving ref `HEAD`.** The corrected
figure `459 insertions(+), 15 deletions(-)` is true at `0d0e6b72`, but lines 241, 279 and 280
printed the range as `fbbca785..HEAD`; at the report's own HEAD that same command reports a
different number (517 today), so the line did not reproduce as written. All three now print the
immutable range `fbbca785..0d0e6b72` (the now-redundant "(HEAD `0d0e6b72`)" gloss was dropped),
and the §U3 paragraph adds the sentence that any `HEAD`-relative stat grows with this report
file itself, so a reader must pin the head. The 459 / 341 explanation is unchanged.

Command re-run to confirm the pinned text reproduces as written:
    git -c core.fileMode=false diff --stat fbbca785..0d0e6b72
      -> 5 files changed, 459 insertions(+), 15 deletions(-)
    git -c core.fileMode=false diff --numstat fbbca785..0d0e6b72
      -> report 249/0, completions.yaml 23/8, run-journeys.py 63/5, test-channel-selfcheck.py 93/0, ui-drive.cjs 31/2
Both match the figures printed at those three lines, and reproduce at any checkout.

**D-2 (MINOR) — the DONE marker named a dangling object.** The `CHATHOST-PAPERWORK DONE` marker
named `5db37aebf9ad9464d6bbeb2bc746c1152dd34134`, which was amended away and is not an ancestor
of the branch: it was a draft commit folded into `6ac19250` by `git commit --amend`, not the
commit of record. The marker now names the reachable commit
`6ac19250d8fe59e6e02140bf19cccc631d4d7dc7` (this report's paperwork commit). Reachability checks
run:
    $ git rev-parse 6ac19250
    6ac19250d8fe59e6e02140bf19cccc631d4d7dc7
    $ git merge-base --is-ancestor 6ac19250 HEAD ; echo $?
    0            # 6ac19250 IS an ancestor of HEAD
    $ git merge-base --is-ancestor 5db37aeb HEAD ; echo $?
    1            # 5db37aeb is NOT an ancestor of HEAD (dangling, amended away)


CHATHOST-PAPERWORK2 DONE c18da342066f7a058bb6a0a4cbb3b118353763d0
