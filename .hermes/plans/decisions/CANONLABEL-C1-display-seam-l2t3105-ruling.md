# RULING — L2-CANONICAL-LABEL-STAGE-A-FALLBACK C1: where the display seam's witness actually runs

Ruling by: cl-architect (lane 2). Date: 2026-11-08 (filing l2t3105).
Item: L2-CANONICAL-LABEL-STAGE-A-FALLBACK, acceptance criterion C1 (cycle-2 browser gate
receipts/CANONLABEL-STAGEA-BROWSER-20261108T045357Z/report.md, VERDICT: blocked).
Authority: decisions/CARD1-D5-one-entity-one-label-l2t0520-ruling.md §4 (Q4) — binding.
Predecessor seam rulings read: CARD1-D3-canonical-source-l2t1430.
Scope: ruling ONLY. No code, no tests, no servers, no edits to THE LIST or acceptance wording.
Status: BINDING for the C1 close / re-statement; Brad/orchestrator restate AC wording from this ruling.

## 0. DECISION

Option (c). Restate C1's display clause onto the surface where the fallback display seam
actually runs — the clarification-question-row / mint-card render, driven by the REAL
`ClarificationPicker` fed a constructed unresolved fact (AC-3) plus the server value seam
(AC-1), NOT the live chat pipeline. Option (b) is rejected as a violation of the binding
one-entity-one-label ruling. Option (a) (abandon the render witness entirely) is the wrong
shape for the same reason D5 Q3 rejected a "delete the criterion" outcome: the renderable
witness is real and gradeable; only the LIVE-engine path to it is structurally impossible.

Name the seam (exact) — see §3. Brad/orchestrator restate the AC wording from §4 below.

## 1. WHY C2/C3 pass but C1 cannot be exercised live (verified at served rev)

The gate's finding is CORRECT and I re-confirmed it at the merged code track
(cl/integration-2; the fallback block lives in `server/src/ai/shorthandChat.ts:1209-1256`):

1. The fallback (`canonicalLabelsForFacts` PASS 3, name-keyed) is a DISPLAY read. It only ever
   consumes UNRESOLVED facts. On the live pipeline it is reached as
   `canonicalLabelsForFacts(compiledSh.clarifications ?? [], deps.store)` at
   `server/src/ai/AgentOrchestrator.ts:3277` (fold path `:1642`). With `unresolved: []` the
   fact set is empty, so the block never executes for the legacy entity.
2. The entity never becomes unresolved. The producer's gated clarification is dropped exactly
   when the engine bound its slot (`server/src/compiler/resolution/resolveNounsPass.ts:553-562`).
   The engine bound this entity by NAME — `material_ref = MAT-1-mm-clofibrate1-mm-clof-l84l` —
   which is the STAGE-A-equivalent lookup, at 8 occurrences in run 1, 16 in the two-material run.
3. Decisive: the binder and the fallback disagree on NOTHING. Both resolve by the same
   case-insensitive exact-name key (`payloadName(...).toLowerCase()`, fallback at
   `shorthandChat.ts:1241` vs binder via MaterialGrounding name-match), and the fallback's OTHER
   key (`recordId = localMaterialIdForLabel`) is precisely the id the binder already used to
   produce a binding. Therefore ANY fact the fallback could title is a fact the binder already
   bound ⇒ no question ⇒ no card ⇒ the fallback title is never rendered to a live browser.

That is a designed property (binder≡fallback key agreement is the whole POINT of D5 Q1(a): one
entity, one owner), not a data gap and not a defect of this revision. This is a
criterion-premise error, structurally identical to the D5 Q3 case: the criterion assumed a
destination surface (a live card for the legacy entity) that the pipeline cannot reach by
construction.

## 2. WHICH OF THE THREE IS THE RULED PATH

(b) REJECTED — a hard rule, not a preference. (b) sanctions a route where binder and fallback
disagree on the key so the UI arm can be driven. That is exactly the divergence D5 Q1(a) /
Q2 forbid and Q4 this item exists to close: binder, fallback, and mint must agree on one key.
A sanctioned divergence would (i) create a second vocabulary for one entity — the ruling's
prohibited outcome; (ii) ship an inconsistency that has no truthful story for the scientist
(which string is the record?); (iii) make the gate pass against a rigged fixture. Do not
pursue it.

(a) REJECTED as the primary frame for the same reason D5 Q3 declined to delete/weaken:
it reads as "the UI surface is never needed," which would abandon a genuine, gradeable render
witness AND contradict the standing UI standard (every UI surface change browser-/render-
witnessed before done). The render seam is real and already exercised.

(c) RULED. The display seam DOES run — it is just not reachable through the LIVE ENGINE, which
structurally cannot emit an unresolved fact whose label name-matches the legacy record. The
seam runs on a real surface: the clarification-question-row / mint-card render produced from a
constructed unresolved fact whose label name-matches the legacy record, driven through the
REAL `ClarificationPicker` (AC-3) with the value-seam proven on the server side (AC-1). Restate
C1 to grade THAT surface, and record the live-pipeline impossibility as a measurement, not a
defect. This mirrors D5 Q3 exactly (amend the criterion to its actual occurrence).

## 3. THE EXACT DISPLAY SEAM (for the re-statement's "where")

- VALUE seam (produces the fallback title): `server/src/ai/shorthandChat.ts:1209-1256`
  (PASS 3 name-keyed fallback), consumed into the per-fact map fill `:1259-1262`.
- LABEL SELECTION seam (chooses STAGE A title over STAGE B identity form):
  `server/src/ai/shorthandChat.ts:1039-1061` — `groundedTitle = canonicalLabels?.get(identityKey)`
  `:1040`; STAGE A arm `displayLabel = groundedTitle` `:1049-1050`.
- WIRE-write to the card: `server/src/ai/shorthandChat.ts:1140` `query: displayLabel` (the
  question row's identity form); the mint-offer prompt `:1126-1129`.
- RENDER seam (the card the C1 witness is about): `app/src/agent/ChatClarificationCard.tsx:213`
  renders the REAL `ClarificationPicker`; the mint row + question row render there.
- NOTE on the mint row's OWN seed: `app/src/event-editor/right-pane/ai/ClarificationPicker.tsx:389-411`
  (`mintLabelFor`) seeds from the RAW `unresolvedFact.label` — intentionally NOT the fallback
  title (D5 Q3 provenance contract). The fallback title manifests on-screen as the QUESTION row
  (`query:`) and the STAGE A prompt, not as the mint-row input.

Witness surfaces that ACTUALLY run the seam today (this is what C1 must be graded on):
- server: `server/src/ai/shorthandChat.canonicalLabelFallback.test.ts` (AC-1: `query ===
  LEGACY_TITLE`, `map.get(FACT_KEY) === LEGACY_TITLE`, no `1 mm clofibrate in dmso`).
- app: `app/src/agent/ChatClarificationCard.stageAstring.test.tsx` (AC-3: the REAL
  `ClarificationPicker` driven with `unresolvedFact.label` = case-drift label + mocked
  `apiClient.mintLocalTerm`; asserts one string across question/mint/answered and that the
  lowercased STAGE B form is absent).
- live (already PASS): clause 2 grounds by name (`material_ref` → legacy id; record GET 200;
  single casing `recordTitleLower:0` in the DOM census).

## 4. RECOMMENDED C1 RE-STATEMENT (for Brad/orchestrator to adopt; do NOT treat as AC text yet)

Restate C1 so its display clause is graded on the render seam of §3, and its live clause on the
name-grounding already proven:

  "STAGE A one-label display, graded at the render seam: AC-1/AC-3 prove the fallback value seam
  (shorthandChat.ts:1209-1256) feeds a STAGE A title (`LEGACY_TITLE`) into the card's question
  row and STAGE-A prompt (`query: displayLabel`), and the REAL ClarificationPicker renders ONE
  string for the entity — question row = record title = answered row, mint-row seed = offered
  phrasing (raw provenance), lowercased STAGE B identity form absent. Clauses that must still be
  exercised in browser: the live name-grounding leg (record GET 200, `material_ref` by name,
  single casing on screen) — already PASS. Explicitly NOT required: a live chat card that shows
  the fallback title while the record's termRef is unresolved, because binder≡fallback key
  agreement (a designed, D5-required property) makes that state unreachable; the fallback is
  DISPLAY-seam-proven, not live-engine-proven."

The gate must report the structural result as a measurement, and C1 is ACCEPTED only when
AC-1 + AC-3 are green AND the live grounding leg is re-confirmed. Do not substitute any easier
assertion (no weakening) and do not manufacture a binder/fallback divorce to force a live card.

## 5. OUT OF SCOPE / NEXT OWNER

- I do not rewrite the AC text (that is Brad/orchestrator per the charge).
- No code change, no new fixture, no binder/fallback disagreement.
- Residual flag for the orchestrator (uncharged, pre-existing, seen in both cycles): the
  deck left-pane `EVG-cellrox-flow-cytometry-assay-kits-method-bda3685b` NOT_FOUND gap and the
  pre-mint row width clip are not this item's; keep them out of the gate's verdict.
- If the orchestrator wants the live leg driven anyway, the ONLY legitimate route is a
  deliberately-unresolved fact that name-matches a legacy record but sits OUTSIDE the binder's
  slot-binding — i.e. raise a clarify card for a label with no action slot, so the binder has
  no bound key to close (resolveNounsPass keeps slot-less gated facts). That is a REAL witness
  path that does NOT violate one-entity-one-label. Worth trying before this item closes; if it
  produces the card, C1 can be browser-witnessed after all. If the gate already tried slot-less
  asks (leave to the orchestrator to confirm from the trails), fall back to the AC-1/AC-3 grade.

END-RULING
