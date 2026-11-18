# ARCHITECT SESSION HANDOFF — 2026-11-09 11:15 EST (16:15Z)

Written because this session compacted several times and the squeezing is starting to cost
detail. Everything below is grounded in commands run today or in files named here. Where I am
reporting a claim I have NOT verified, it says so.

Author: cl-architect (read-only role: authors the lane queue, writes no product code, dispatches
nothing, marks nothing done).

---

## 0. The 60-second version

Two lanes, both unpaused, both ticking every ten minutes, both well ahead of main.

- **main `72aef221`** — the consolidation I pushed this morning. Lane 1 and lane 2 are rebased on it.
- **Lane 1** `cl/integration-1` @ `9b373719`, 6 ahead, working the `L1-REGISTRY-LOCKSTATE-RACE-1`
  chain. Healthy; not my current focus.
- **Lane 2** `cl/integration-2` @ `dcd81ad6`, 16 ahead. This is where prompt 2 / prompt 3 live.
- **Prompt 2**: passed 3/3 on frozen `cd367108` (yesterday's certification). Re-run today on
  `3d94c838` gives **2/3** — and the failing leg is now diagnosed as a **test-driver gap, not a
  product defect** (see §3). A Brad card is open asking for the ruling. **Corpus state was NOT
  flipped to WORKS.**
- **Prompt 3**: locked. It is not "add cells" — it is **sub-protocols** (a universal Cell Seeding
  Protocol instantiated into a lab-local one, whose graph is the context the well composition and
  the `cells/µL` parameter come from). None of that exists in the tree. Rubric drafted, 13 tasks
  queued, nothing dispatched.

---

## 1. Where the truth lives (read these first, in this order)

| What | Path |
|---|---|
| Binding decisions for lane 2 (D1–D8), including Brad verbatim | `/home/brad/.hermes/cl/lanes/2/task-list.md` header |
| The sub-protocol decision, full text + addendum | `cl-integration-2/.hermes/plans/decisions/SUBPROTOCOL-GRAPH-SHAPE-l2-20261109.md` |
| Prompt-3 rubric (checks S1–S8, P/O/G, perturbation probes, task ladder) | `/home/brad/.hermes/cl/lanes/2/prompt3-criteria-draft.md` |
| Prompt-3 recon (what exists vs declared vs absent), + my correction appended | `cl-integration-2/.hermes/plans/handoffs/2026-11-09T1920Z-L2-PROMPT3-RECON-1.md` |
| The open Brad decision on prompt 2 | `/home/brad/.hermes/cl/lanes/2/cards/BRAD-CARD-prompt2-regate-2iterations-l2t3385.md` (+ its l2t1035 ADDENDUM — the addendum is the current one) |
| Plain-English reporting contract I owe Brad | `/home/brad/.hermes/profiles/architect/SOUL.md` |
| Prompt-2 gate receipts | `~/.hermes/cl/receipts/L2-PROMPT2-GATE-20261109/` (see `20261109T134959Z-alllegs/REPORT.md`) |
| Prompt-2 gate script (unchanged instrument) | `/home/brad/.hermes/cl/lanes/2/gate-prompt2-alllegs.sh` |

---

## 2. What was decided today (do not re-litigate in code)

**D8.1** — one event-graph record per protocol instance, linked from the run. Not a namespaced
sub-graph inside the plate graph.
**D8.2** — the sub-protocol is visible and **read-only**: a "context of creation" view on the run
surface (Brad: *"bisible, read-only"*).
**D8.3** — the protocol as written is **universal**; it is brought down to a **local** protocol
bound to specific labware and to the lab's own vendor products, by ROLE.
**D8.4** — **build ≠ execute**: building the local plan produces the plan graph and no measurement;
executing produces the sub-event graph and **asks** for `cells/µL`.

Earlier standing decisions still binding: the clarification-default doctrine (ghost when the noun /
verb / labware resolution is reasonably certain, ask when it is genuinely uncertain —
`decisions/CLARIFY-DEFAULT-ghost-first-ruling.md`), and the grouped-submit driver seam (drivers stay
item-owned, fixture values extracted locally — `decisions/GROUPEDSUBMIT-drivers-seam-l2t3235-ruling.md`).

---

## 3. Prompt 2 — the honest state, and a correction I owe Brad

**Yesterday:** 3/3 PASS on frozen `cd367108` after Option A re-baselined the criteria.

**Today**, on the consolidated tree at frozen `3d94c838` (`~/.hermes/cl/receipts/L2-PROMPT2-GATE-20261109/20261109T134959Z-alllegs/`):

- legAB **PASS** — full journey, 16 wells, 18 events after cold reload, no unwanted question.
- leg3 **PASS** — no-selection leg, record stays at 2 events.
- leg4 **FAIL** on attempts 3 and 4; attempts 1 and 2 never rendered a card.

**Correction to what I told Brad at 11:00 EST.** I said the card "carried no quantity field, so
the product can't ask what it needs to ask." That was too strong and partly wrong. What the
receipt shows (`drivers/leg4.cjs:53`) is that the app asked **one free-text (typed) question**
rather than a slot card with buttons, and the driver's `answerAllSlots` only fills
`chat-clarification-slot` testids — it cannot type. So it submitted the card **empty**, got no
preview, and the grading layer recorded `no-preview-after-submit`. The product behaved plausibly;
the instrument cannot drive that branch. The typed branch is `ChatLog.tsx:589` →
`ChatClarificationCard.tsx:243-249`.

**But there is a real product finding underneath it:** on the same frozen revision, four identical
runs gave *no card* once and *typed question* three times. Same board, same prompt, different
behaviour. Whatever the ruling on the driver, that nondeterminism is worth a ticket of its own.

**The open decision (Brad's card, l2t1035 addendum):**
- Option A — re-baseline the drivers so the card legs run a negative control (spine record
  `MSP-PR9-TEST-CLO-1MM` removed) and add an arm-aware **typed-answer** leg, then re-gate leg4 at
  frozen `3d94c838`. Costs one harness unit, does not touch leg3/legAB.
- Option B — close leg3/leg4 as covered-by-unit-tests and bank WORKS on legAB alone.

**My recommendation: A, narrowly.** Teach the instrument to drive the typed branch (precedent:
CHATHOST j2grouped) and re-run leg4 at the frozen revision. That does not weaken the criterion —
it makes the same criterion measurable on a branch the product legitimately takes. Banking WORKS
on legAB alone means certifying a journey we have not actually driven end to end today.

---

## 4. Prompt 3 — what it really is, and how far we are

The prompt asks for 10,000 HepG2 cells per well, giving 20.7 µL of a 483 cells/µL suspension at
three significant figures (10,000 ÷ 483 = 20.704). That arithmetic is **the payload of the
exercise, not the exercise**. The exercise is that every substance traces to a vessel and every
number traces to a measurement:

culture flask → trypsin-EDTA as a **vendor product** (vendor, catalogue, lot) → a quench
**formulation** (900 mL DMEM + 100 mL FBS) added at an **equal volume** → the flask contents
transferred to an **8-well reservoir** → a **counting operation** that returns 483 cells/µL as a
measured parameter → the **dose** 10,000 ÷ 483 → 20.7 µL → accept → hover the well and see a
composition traceable to the reservoir mixture.

Computed well composition (cells at zero volume): **trypsin 8.6 %, DMEM 90.6 %, serum 0.86 %**.
The prompt's "8.6 % serum" looks like a slipped decimal from 0.86 %. I flagged it; Brad has not
ruled on it. It does not block anything.

### Recon result (L2-PROMPT3-RECON-1, done, report `3fbea561`)

Of nine chain links: **two work** (per-well composition tooltip; incubation event + timeline
marker), **six are declared but not wired** (flask creation, vendor product on the enzyme, quench
formulation, reservoir transfer, the measured density, target ÷ density), **one is absent**
(equal-volume ratio derivation). Four defects named, all accepted:

1. The add-material schema *claims* "derive suspension volume = count / density"; the compiler
   never does it. The only real derivation is a UI-side function at
   `app/src/graph/events/forms/plating.ts` that the compiler does not call.
2. `add_labware` exists only as test-fixture data; the shipped verb for creating labware is
   `create_container`.
3. No 8-well reservoir in the labware registry (12-well and 1-well only) even though
   `records/seed/labware/lbw-seed-reservoir-8-well.yaml` exists as an instance — an instance with
   no definition to resolve geometry from.
4. Mixture-detection rules react to words in material **labels**; they never decompose narrative.

### A correction I appended to that report

Recon claimed "no YAML/JSON file enumerates verbs". **Wrong.** `schema/scientist-intent/
scientist-intent-vocabulary.yaml` declares **32 verbs** with per-argument contracts (kind, domain,
cardinality) and the assistant's instruction block is generated from it
(`server/src/ai/submitSuggestionTool.ts:46`). What is actually hardwired is the **expander
registry** — the verbs that execute — 15 expanders at `simpleVerbs.ts:779-798` for 32 declared
verbs. So: vocabulary is data, implementation is code, and they disagree by 17 verbs. Enforcement
is also missing at the tool boundary (`submitSuggestionTool.ts:131` types `verb` as a free string).

### The universal → local tier: declared, unproduced

The binding surface already exists as data — nothing fills it:

- `schema/workflow/protocol.schema.yaml` — role declarations; `parameters` (:175);
  `producesArtifactId` (:213).
- `schema/workflow/planned-run.schema.yaml:103-140` — `LabwareBinding`, `MaterialBinding`
  (roleId + materialRef + **lotNumber**), `ParameterBinding`, `ContextBinding`, `InstrumentBinding`.
- `schema/lab/vendor-product.schema.yaml`, `vendor-offer.schema.yaml`;
  `material-lot.schema.yaml:33-39` `supplier { catalog_number, vendor_lot }`;
  `material-receiving.schema.yaml` keys on `vendorProductRef + lot`.
- `schema/studies/run.schema.yaml:137` — the run still references **one** protocol. No
  `subProtocol`/`sub_protocol` construct exists anywhere in `schema/` or `server/src/` (grep = 0).

### The 13-task ladder, as queued (all `todo`, nothing dispatched)

0. `L2-SEED-LABLOCAL-1` — seed the lab-local catalogue as data (flask, 8-well reservoir definition,
   vendor products + lots with catalogue numbers, ontology terms). Never seed derived objects.
1. `L2-RUN-PROTOCOL-LIST-1` — a run follows an ordered list of protocols.
2. `L2-PROTOCOL-LOCAL-BIND-1` — universal → local: propose per-role bindings, ghost when certain,
   ask when genuinely ambiguous, UNBOUND + reason when nothing is catalogued.
3. `L2-SUBPROTOCOL-EXPAND-1` — build the local plan graph (one record per instance); no measurement.
4. `L2-SUBPROTOCOL-LABWARE-SCOPE-1` — context labware never occupies a deck slot.
5. `L2-SUBPROTOCOL-EXECUTE-1` — execute → sub-event graph + prompt for `cells/µL`.
6. `L2-SUBPROTOCOL-CONTEXT-VIEW-1` — read-only context-of-creation view (browser-gated).
7. `L2-PROTOCOL-PARAM-BINDING-1` — parameters addressable by name downstream; unset = underivable.
8. `L2-PROTOCOL-PRODUCES-1` — produced artifacts materialise with provenance.
9. `L2-PROMPT3-DOSE-DERIVE-1` — target ÷ density → 20.7 µL at 3 s.f., source = reservoir.
10. `L2-PROMPT3-TOOLTIP-1` — composition projection into the well tooltip.
11. `L2-PROMPT3-INCUBATE-1` — incubation event + distinct timeline marker.
12. `L2-PROMPT3-GATE-1` — journey + perturbation probes; written last.

The orchestrator has additionally composed a spec for a **`L2-PROMPT3-DERIVED-RATIO-1`** (the
equal-volume derivation, recon's link 4) that has **no item block filed** yet. It is architect
scope and needs a block authored once the prompt-2 ruling lands.

### Perturbation probes (the rubric tests capability, not the answer)

Same build, no code changes between runs: "add **5,000** cells" → 10.4 µL; a re-count of
**1,000 cells/µL** → 10.0 µL; quench at **800:200** → same 20.7 µL but serum ~1.7 %; wells
**B2–B6** → same volume, different wells. If any probe fails, the app learned prompt 3 rather than
learning to decompose, and the receipt must say exactly that.

---

## 5. Open questions awaiting Brad (do not answer these myself)

1. **Prompt-2 ruling** — driver typed-answer leg + re-gate (A), or bank WORKS on legAB alone (B).
   My recommendation: A. This is the gate to everything else.
2. **Seed content** — give me the catalogue entries (vendor, catalogue number, lot) for trypsin-EDTA,
   DMEM, FBS, or seed ontology-anchored concepts only and let the binding step ask the first time.
   My recommendation: concept-only for anything not physically in the lab; I will not invent a
   catalogue number.
3. **Prompt-3 corpus ambiguity** — `test-prompts/AI-Chat-Corpus2.md` has two separate sections both
   titled "Prompt 3" (cell counting, then incubation). Drafted as one journey in two halves.
   Split or keep?
4. **The serum decimal** — prompt says 8.6 %, arithmetic says 0.86 %. Confirm which the tooltip
   should display.

---

## 6. Traps (each has bitten someone today)

- **`core.excludesFile` points at `/home/brad/.hermes/cl/lanes/1/lane-exclude`** from the main
  checkout — it hides ~120 paths from `git status`. Never trust a clean `git status` in
  `/mnt/vast/home/brad/git/computable-lab` without checking that config.
- **`wt/*` gitlinks** — lane-2 worktrees under `wt/` get swept into commits as gitlinks (already
  swept once, `9e0ca7fa`; `wt/REVISE-GHOST-1-lane2-l2t2050` is modified again right now).
- **Lane queue files are multi-doc `---` streams** read by a LINE-BASED parser
  (`cl-lane-readiness.py`). Never "repair" them with a strict YAML parser — I did that once and had
  to restore lane 1 byte-for-byte. Always edit under `fcntl.flock` on `task-list.lock` with a
  timestamped backup. An unquoted inner colon in a `files:` value has broken the file twice; a
  missing `status:` field once.
- **Secrets** — the consolidation push swept 14 secret-bearing paths (live OpenRouter keys in
  `config.yaml.bak-*`). Removed and `.gitignore` hardened. **Brad still needs to rotate both
  OpenRouter keys.**
- **A large checkout under a running dev server wedges it** — `:3001` died with
  `ERR_MODULE_NOT_FOUND` after the rebase; a clean restart fixed it. Restart exact PIDs found via
  `ss -tlnp`; never `pkill`.
- **Freezing the revision matters** — the earlier `3d94c838` re-gate had `rev_before == rev_after`,
  which is the only reason its 2/3 is a number rather than noise.

---

## 7. Honest odds, if asked tomorrow

- Prompt 2 certified: one harness unit + one re-gate, so **half a day of lane time if Brad rules
  A**; unknown if he rules B.
- Prompt 3 gate: the protocol tier is greenfield (no sub-protocol, no binding producer, 15 of 32
  verbs executable), then seven chain links. Realistic **3–5 days of lane time**, and the lane
  thrashed twice today, so I would not promise better than the far end.

---

## 8. Next action by role

- **Me (architect)**: author the `L2-PROMPT3-DERIVED-RATIO-1` item block once prompt 2 is ruled on;
  nothing else of mine is waiting.
- **Orchestrator**: keep prompt-3 dispatch blocked until prompt 2 reads WORKS; the ladder is queued
  and will otherwise start building on an uncertified baseline.
- **Brad**: three rulings in §5 (prompt-2 driver; seed content; corpus split), and rotate the keys.
