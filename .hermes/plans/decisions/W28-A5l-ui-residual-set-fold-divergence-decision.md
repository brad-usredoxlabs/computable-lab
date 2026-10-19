# W28-A5l — DECISION: the UI residual set is NOT a second producer surface — it is the scalar-hedge answer dead-end

- Lane: 2 · trunk `cl/integration-2` · code tip `55d6d6bb` (confirmed ancestor of HEAD
  `9dc2f679`; the only commits since r3 are docs/handoff). Served stack re-verified live
  (`:3093`/`:5193`, backend pid 1692003 started 06:48, after the 05:32 PARAM-FOLD merge).
- Receipts read in full: `/home/brad/.hermes/cl/lanes/2/receipts/W28-A5D-R3/2026-10-19_0540/`
  (REPORT.md, trail.json, trail-run1/run2-supplement/run3-supplement2.json).
- Prior decisions reconciled (not re-litigated): W28-A5h (`/l` labware answer surface),
  W28-A5i (SAMPLE-CARD-1 `not-stated` surface), W28-A5j (option-(b) fold, shipped 55d6d6bb),
  W28-A5k (raw-source fold at normalizeScientistIntent).

## Ruling in one line

There is ONE producer surface and the fold IS on its path (H1 and H3 rejected). The
UI/probe divergence is (H2, modified): the UI's live answer loop walks into a
**by-construction unanswerable fact** — the model writes its own hedge SENTINEL into a
declared-optional SCALAR slot (`duration: "not-stated"`), which simultaneously defeats
PARAM-FOLD guard (4) and the ANSWER-BIND-1 join — plus (H4, secondary) per-draw emission
stochasticity which decides WHICH facts appear but cannot explain a never-emptying set.
Fix surface: the SERVER fold guard (4) in `declaredOptionalHedgeFold.ts` — then re-shoot A5.

## Grounding probes (this decision's new evidence; write-free route, trunk 55d6d6bb, active profile qwen3.8-thunderbeast)

All three scripts reproduce the UI's EXACT wire shape (protocolText composed by the UI's own
`protocolTextFromSource` algorithm — `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx:115-136`,
`"${ordinal}. ${label}"` lines joined by `\n\n`; fixture record has no `humanStepsText`,
verified live via GET — so UI and probe differ ONLY in text join style and answers map).

**Probe 1** (`/tmp/w28a5l-probe.py`, 3 draws/arm, r4's 5-answer map):
- U arm (UI-shaped text + r4 answers): **3/3 outcome=complete, ZERO facts.**
- P arm (probe-shaped text + r4 answers): 3/3 422 `not-stated|gate 2025` —
  i.e. the r4 probe's OWN request shape no longer reproduces its 5/5 (stochasticity proven
  on the probe's own turf; matches the 61 mixed reqId-paired calls in the gate window).

**Probe 2** (`/tmp/w28a5l-probe2.py`, replicating the UI's FIRST compile = axis answers only):
- 3/3 draws produced the byte-identical card set the UI supplement saw
  (`ambiguous-noun|microcentrifuge tube (/l)`, `unknown-noun|lysis reagent (/m)`,
  `not-stated|bead beating duration (/m)`) — the UI's "stable residual set" is REPRODUCED
  HEADLESS. It is not a UI-channel artifact.

**Probe 3** (sentinel mechanism, both text shapes): answering the card set the way the UI does
(mention idiom keyed by fact label — `ProtocolLocalizationThread.tsx:405-441`) clears the two
`resolvable` noun facts exactly as ANSWER-BIND-1 promises — but `bead beating duration`
**survives every draw**. The held `localMacro` shows why, verbatim:
`{"action": "bead_beat", "labware": "microcentrifuge tube", "material": "lysis reagent", "duration": "not-stated"}`.
The model put the hedge SENTINEL INTO the slot itself. When a mint-pick answer is fed back,
the model stuffs the answer text into the slot (`duration: "lysis-reagent"`) and the fact
survives again as `ambiguous|bead beating duration`. The card is a trap: every possible
answer re-materializes it.

## Why the trap closes — file:line (three independent locks, each a design promise broken by the sentinel slot)

1. **Fold guard (4) mis-fires** — `server/src/compiler/resolution/declaredOptionalHedgeFold.ts:90-93`:
   guard (4) folds only when the argument is ABSENT in the parsed action; `argumentPresent`
   (`:40-45`) returns true for ANY non-empty string, and `"not-stated"` is a non-empty string.
   A5j proved the fold over slots that are genuinely ABSENT (the r4 `lysis duration`/`cycles`
   class); a sentinel-populated slot is "present" by this test. Everything else is right —
   guards (1), (2), (3), (5) all pass (slot identity present; `bead_beat` declares `duration`
   `kind: scalar, required: false` — `schema/scientist-intent/scientist-intent-vocabulary.yaml:826-828`;
   reason is the stable `not-stated` code). The ONLY failing guard is the one the sentinel defeats.
2. **ANSWER-BIND-1 can never bind it** — `server/src/compiler/resolution/resolveNounsPass.ts:304-329`:
   `answeredSlotBindings` skips every contract whose declared `kind !== 'resolvable'` (`:308`);
   `duration` is a declared `scalar` → an answered duration slot is unbindable BY DESIGN
   (correct for quantities, fatal combined with lock 1), and the exact-label join (`:313`)
   compares the answer KEY (`"bead beating duration"`, the fact's label —
   `ProtocolLocalizationThread.tsx:409-412`) against the slot raw (`"not-stated"`) — never equal.
3. **No honest answer surface exists for it** — the `/m` card's only row is the mint floor
   (`ProtocolLocalizationThread.clarificationAdapter.ts:69-94`: reason `not-stated` falls to
   the `(reason,'*') → /m` row for argument `duration`); minting a MATERIAL to answer a
   DURATION is nonsense the gate correctly refuses to let the scientist do (rule D "must not
   clear by fabricating values" — the reviewer was right).

So: probe r4 never walked into the trap because its answers pre-settle the noun slots and its
draws never drew a sentinel-duration action; the UI walks into it on essentially every first
compile (axis-only answers → the model hedges the duration it legitimately sees unset), and
once the sentinel is in the slot the fact is permanent — which is exactly the receipt's
"never emptying, drifts/grows" signature (canonical cyc1→cyc4, supplement 3×, supplement2 2×).

## Hypothesis adjudication

- **H1 (different request shape) — REJECTED as cause; PARTIALLY TRUE as provenance.** The
  endpoint has one answers-branch call shape (`IntentCompileFromPromptHandlers.ts:408-446`);
  `composeAnsweredPrompt` (:148-157) is the single composition for both clients; the surface
  id and attached-context theory are fiction (no such fields exist on the route). Probe 1's U
  arm proves the server treats the UI's own composed text identically: 3/3 completing, zero
  survivors with the same answers. The REAL content difference — UI's first compile carries
  2 axis answers, r4's carries 5 pre-answers — explains why cards APPEAR in the UI, and that
  is the designed ask-leg working, not a defect. It does not explain the never-emptying set.
- **H2 (answer loop) — ACCEPTED, modified.** Not "partial-answer re-hydration re-introduces
  hedges"; the loop is byte-correct for `resolvable` slots (probe 3: both noun cards cleared
  exactly once). The defect is the class of fact the loop CANNOT settle: sentinel-populated
  declared-optional scalars (locks 1-3 above).
- **H3 (fold off the UI's code path) — REJECTED.** One route, one call shape; the fold runs at
  both raw-source (`normalizeScientistIntent.ts:820`) and pass (`resolveNounsPass.ts:418`),
  reachable from every client. The receipts' own 422 folds into the page — same producer,
  same fold, same channel. Probe 2 reproduces the "UI-only" card set headless. There is no
  second producer surface to be authoritative between.
- **H4 (stochasticity) — ACCEPTED as secondary, REJECTED as the explanation.** Draw-to-draw
  emission varies (probe 1 P arm vs r4's 5/5 on the identical request; `ambiguous|variant b`
  appearing in 1/9 axis-only draws; the 61 mixed 200/422 pairs). Stochasticity picks WHICH
  facts a draw raises; it cannot produce byte-identical never-emptying sets across sessions —
  the deterministic trap does that. The r4 5/5 was not luck; the UI wall is not noise.

## The authoritative surface

`POST /api/intent/compile-from-prompt` (server) is the single authority for what bars; the UI
renders whatever the spine returns. The probe is a client that happens to pre-answer. Neither
is "more authoritative" — the divergence is entirely in what each client SENDS across its
loop, not in what consumes it. No fork of producer surfaces exists and none may be created.

## The fix surface (smallest, declarative-compliant; routed to cl-coder by the orchestrator)

**SERVER, `server/src/compiler/resolution/declaredOptionalHedgeFold.ts`, guard (4) only:**
an argument whose parsed value equals the model's own hedge sentinel — the stable
`NOT_STATED_REASON` code this module already declares (:30) — is DECLARED ABSENT
(`argumentPresent` must not count the sentinel as presence). Five-line class of change:
one stable reason code, zero verb/noun/domain literals, idempotent, and it makes the fold
fire on the observed shape `duration: "not-stated"` exactly as A5j fires on the absent shape.
The fold already exists at both consumers (A5k), so the raw gaps channel, the `/m` mint-only
card, the bar and the accept gate all inherit the fix with no UI change, no endpoint change,
no prompt change, and no ANSWER-BIND scalar arm (adding one would institutionalize the mint
floor as a duration answer — a design error; locks 2 and 3 stay correct once the sentinel
never survives to become a card).

Why server and not UI/prompt: the sentinel-in-slot is a model-emitter variance the server must
be robust to REGARDLESS of client (the "never two truths" rule — the fold is the declared
authority on optionality; a slot value that IS the fold's own stable reason code is data the
fold can adjudicate). A prompt tweak ("never write the reason code into a slot") is fair
hardening but not a guarantee and must not be the fix of record.

Affected contract: none beyond the fold's own guards; golden/fixture pins that assert fold
behavior on absent slots stay green (the change only ADDS sentinel values to the "absent"
equivalence — an already-folded set re-folds to the same set).

## Secondary findings — routing

- **F2 (`sample` on `/m` with mint floor vs SAMPLE-CARD-1's `/l`): its own class, NOT this
  ruling.** The adapter maps `(reason, argument)` as data (`clarificationAdapter.ts:69-118`);
  a `sample` fact with `actionLocation.argument: labware` DOES render `/l` (probe draws show
  the model emitting exactly that), while the canonical cyc1 draw evidently carried a
  different/absent argument. That is model-emitter variance on actionLocation — the same
  emitter-compliance family as HEDGE-TYPE-1, non-blocking; if it recurs materially after the
  fold fix, it gets its own named decision.
- **F1 (duplicate identical `/l` card):** merge keeps distinct objects that reconcile de-dupes
  by slot key (`resolveNounsPass.ts:196-229`); two same-label cards = an engine fact plus a
  model fact whose actionLocation did not join the engine key. Minor UI/merge class; recorded,
  not blocking, do not widen this ruling for it.
- **F3 (`Accept &amp; Save`):** cosmetic over-escape; trivial fix-class nit, ride any touch of
  the accept button.

## The A5 accept leg — fixture-route alternative?

**No legitimate alternative; do not substitute.** The criterion is UI-shaped
("answer → accept → GET the LPR"); the headless `POST /intent/accept`
(`IntentAcceptHandlers.ts:77,121`) can mint an LPR with `branch_resolution[]` but proves a
different surface than the one A5 gates. Using it as A5 evidence is acceptance weakening,
which this decision explicitly forbids.

## Sequence from here (for the orchestrator)

1. cl-coder: guard-(4) sentinel-absence fix (server, `declaredOptionalHedgeFold.ts`) +
   regression test pinning the observed shape (`duration: "not-stated"`, reason `not-stated`,
   declared `required: false` scalar ⇒ folded from BOTH the resolve_nouns clarifications and
   the raw `unresolvedRefs`/`protocolIntent.unresolved` channels).
2. step-0 probe r5 on the merged trunk: the UI-shaped arm (Probe-1-U: UI text + r4's 5 answers)
   AND the axis-only→answer-every-card loop (Probe-2/3 shape) must reach a zero-survivor draw;
   the loop arm is the honest reproduction of what the UI does.
3. Re-shoot A5 tier-2 unchanged (accept → GET LPR → `branch_resolution[]`
   `{"lysis-method":"bead-beater"}`). If the loop still never empties after the fix, the
   residual set at that point is a NEW named class (e.g. variant-axis re-emission H4-class at
   a material rate), not this one — return it as its own decision with the per-draw log.
4. Do not weaken the gate; do not answer duration/cycles hedges via the mint floor; do not
   add `duration`/`cycles` to the gate answers as a workaround (A5i Q4 discipline holds).

W28-A5l DECIDED
