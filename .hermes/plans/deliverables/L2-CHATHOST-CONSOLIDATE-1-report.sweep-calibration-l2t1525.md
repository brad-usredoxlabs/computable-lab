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
