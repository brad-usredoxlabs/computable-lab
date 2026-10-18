# W28-A5h labware-semantic noun answer — ARCHITECT DECISION (2026-10-18)

Trunk at decision time: b6ab51e9 (docs-only above fe1d7fa1; the gate measurement ran
AT fe1d7fa1, which contains WIRE-TEMP-1 4b068515, MINT-IDEM-1 68e5a85c,
MINT-FLOOR-UI-1 f57149e3 — containment re-checked by the reviewer via
merge-base --is-ancestor and reported). Evidence:
/home/brad/.hermes/cl/receipts/W2-8-SAID-MEANT-SURFACE/2026-10-18_0630-a5d-r2-tier2/
(REPORT.md — VALID, trail.json .cycles 4 draws, 10 PNGs / 6 distinct states, md5s.txt;
backend reqId-paired log). Rides on W28-A5g-postmerge-caution-fired-decision.md (ruling (a),
U2-U5 cycle discipline), W28-A5d-reshoot-mint-idempotency-decision.md (V1-V9, its Q3
"if a deterministic r2 STILL bars on a declared-role noun, that is the empirical trigger"),
W28-A5-accept-leg-decision-20261017.md, W2-11-d4-unknown-noun-resolution-decision.md
(fact 8 corrected by A5d V1-V4; its THREAD-ASK-1 spec §"Server: extend ... a DATA-side
clarification-answer binding ... consumed BEFORE resolve_nouns" — the text this decision
re-reads first-hand). The U5 trigger (iii) fired with valid gate evidence: pick 200/422,
mint 200, repeat-mint 200 (MINT-IDEM-1 holds), fact survives, unknown set drifts 4->6->6->6,
draws 3 and 4 byte-identical (md5 e38d83ea… / 323d5d0a…) — WIRE-TEMP-1's determinism is
confirmed by that identity. No stack touched (a read-only GET on :3093 timed out; abandoned,
nothing retried — no restart, no kill). No product code changed. Only this file written.
All git via `git -c core.fileMode=false`. Not re-litigating: the A5g Q2 discipline, the
bead_beat ruling ("a) yes"), options A5-accept-leg (b)/(c), the strict-shrink rule, the
MAX_REDRAW cap, material-only mint-floor reaffirmations.

## Q1 — ROOT CAUSE: (1) CONFIRMED, with a sharper mechanism than the packet framed.

The answer-surface mismatch is real, but it is the SECOND defect. The FIRST, load-bearing
one: **a clarification answer never reaches any binding check at all** — it is prompt text
only. Verified at fe1d7fa1:

1. CONFIRMED — bindings exist ONLY inside the engine. `resolveNounsPass.ts:149-152`
   builds `boundKeys` EXCLUSIVELY from `engine.bindings` (each binding occupies its
   slot key `slot:<actionIndex>:<argument>` AND `label:<label>`); a model/engine fact
   is dropped only if its identityKey is in that set (:165 DROP; :190-192 KEEP "bars
   exactly like an engine clarification"); `const blocked = clarifications.length > 0`
   (:326). Bindings are produced at `resolutionEngine.ts:199-207` (`inBand.length === 1`
   -> `bindingFor`) and nowhere else.

2. CONFIRMED — the answer path is prompt-text-only. Client
   `ProtocolLocalizationThread.tsx:383-396` (`handleClarificationPick`) stores
   `answers[label] = mentionToken` and re-POSTs. Server
   `composeAnsweredPrompt` (IntentCompileFromPromptHandlers.ts:139-156) appends every
   answers entry VERBATIM into the settled-choices block; its own header says "Nothing
   here interprets it ... the spine's tier-1 remains the ONLY binder." There is NO
   server code at fe1d7fa1 that reads a `[[material:…]]` / `[[labware:…]]` mention,
   resolves the recordId, and feeds it to resolve_nouns. Therefore: **the pick did not
   "fail a binding check" — it never entered one.** The binding check the pick could
   never satisfy is `resolveNounsPass.ts:149-152` (boundKeys from engine.bindings);
   the check the minted MAT- cleared for ITS OWN label (`lysis-reagent`, proven in
   A5d V5) is the same join — but the held fact here is `ambiguous-noun` on a
   DIFFERENT label in a labware-argument slot (`actionLocation.argument:'labware'`,
   bead_beat.labware declared `kind:resolvable domain:labware`,
   schema/scientist-intent/scientist-intent-vocabulary.yaml:812-821), and its
   resolution is re-derived from the STORE by the spine on every draw, not from the
   scientist's stated choice.

3. CONFIRMED — why minting can never clear an AMBIGUOUS-NOUN (this is arithmetic, not
   behavior): `ambiguous-noun` fires at `resolutionEngine.ts:209-217` when TWO OR MORE
   candidates sit in the acceptance band (`policies.ambiguity.confidenceAccept`
   min 0.7 / max 1.0, vocabulary.yaml:842-847; confidence =
   `TIER_BASE[tier] + matchBonus` CLAMPED to <=1, ResolveSpine.ts:40,:70-78 +
   resolutionEngine.ts:34-36 — so a tier-1 hit is ALWAYS >=0.7 in-band, exact or
   substring). A mint ADDS a tier-1 exact candidate (score clamps to 1.0); it removes
   nothing. The held-fact card is the engine's own candidate list
   (`clarificationFor` resolutionEngine.ts:81-93 carries candidates + actionLocation;
   adapter :87-95 renders them) — the gate SAW >=2 in-band candidates ("Ontology
   microcentrifuge tube" + seed rows). Post-mint, `MAT-microcentrifuge-tube-sgzg`
   (exact-name tier-1) now sits in the :3093 store permanently, so for this fixture
   the ambiguous-noun is deterministically INCONVERGIBLE by any future mint, and a
   pick cannot shrink the store's candidate set either. The 4->6->6->6 drift is the
   honest signature of an answer mechanism that can only add candidates and echo text.

4. CONFIRMED — the surface mismatch is real and structural. The fact is
   labware-semantic (`argument:'labware'`) but
   `CLARIFICATION_MENU_BY_REASON` (clarificationAdapter.ts:38-42) keys on REASON ONLY
   (`ambiguous-noun -> '/m'`), so the answer is offered from the MATERIAL menu; its own
   comment flags labware minting as a domain-policy call NOT decided there. `/vocab/mint`
   is material-only (VocabHandlers.ts:45-52 MINTABLE). A material answer to a
   labware-slot fact is a layer error even in intent, and the W2-11-D4 ruling's OPEN
   QUESTION anticipated exactly this shape.

5. ANSWER TO "would a labware pick / labware-role binding clear the fact?" — A LABWARE
   RECORD BINDING WOULD: tier-1 searches labware records (records.ts:17-25
   DEFAULT_KINDS includes 'labware'); the `labware` domain tag has NO
   ONTOLOGY_DOMAINS entry (domains.ts declares chemical/cellType/tissue/
   cellularComponent/experimentalAction/unit/species/protein/pathway/
   biologicalProcess/disease only), so the domain filter falls to the landing-zone
   taxonomy (adapters.ts:236-263), which a local labware record passes; a single
   in-band winner binds (resolutionEngine.ts:199-207). BUT a labware PICK under
   today's answer mechanism would NOT deterministically clear it either — it rides
   the same prompt-echo, and clearing then depends on the model re-emitting the
   picked label verbatim into the slot (drift-hostage, the A5d V6 failure mode).
   The DECLARED ROLE (`roles.labwareRoles=[microcentrifuge-tube]`,
   fixture-CAN-protocol-1791692042751.json record.payload.roles) exists on the record
   and is injected as prompt DATA (renderDeclaredRolesBlock :172-200, :318) but is
   NEVER consulted by the engine (A5d V8 stands). The spine-side declared-role
   consultation (A5d Q3(iii)) trigger HAS fired — this deterministic r2 barred on a
   declared-role noun — but see Q2: it is NOT the smallest fix today.

VERDICT Q1: YES, root cause = answer mechanism + surface mismatch, precisely:
(i) answers are prompt text, so no scientist answer can ever enter `boundKeys`
(resolveNounsPass.ts:149-152 is fed only by engine.bindings); and
(ii) the labware-argument fact is answered from the material menu, whose only
convergence act (mint) provably cannot collapse an in-band set (point 3).

## Q2 — SMALLEST DECLARATIVE-FIRST FIX SET (two tasks, no hardcode, no TS domain branch)

The declarative principle: the ambiguity arm exists to ASK the scientist; the
scientist's answer IS the resolution act (authoritative disambiguation of the offered
candidate set). A system that asks a question it cannot accept an answer to is the
bug. This is completing THREAD-ASK-1's own approved spec half — W2-11 D4 §"Product
task to author: THREAD-ASK-1": "Server: extend the compile-from-prompt answered-request
with a DATA-side clarification-answer binding ... consumed BEFORE resolve_nouns ...
No imperative policy: the binding is pass-through of the scientist's stated answer;
the spine remains the only binder." Shipped Leg 1 underdelivered this (it shipped
prompt-text-riding only); that deviation works for unknown-noun+mints (the mint
changes the STORE, tier-1 then binds) and provably fails for ambiguous-noun (no store
change shrinks the set). Completing the promised half is NOT new spine policy.

TASK ANSWER-BIND-1 (server; no browser gate of its own — the A5 re-shoot exercises it)
  scope: before `resolve_nouns`, honor answers-map entries whose value matches the
    mention idiom `[[<kind>:<id>|<label>]]` as DATA. Generic, zero domain/reason/verb
    literals:
    - validate `<id>` exists in the store (store.get); a nonexistent id is ignored
      honestly (prompt-echo-only as today -> the fact re-bars, no fabrication);
    - for each validated answer, bind generically by scanning the intent's actions for
      noun-kind argument slots whose value equals the answered label (the arg-contract
      data already names noun kinds; same §5.1 identity machinery), and inject the
      chosen record as the AUTHORITATIVE single candidate for that slot — it REPLACES
      the gathered set (that is what "settled, do not re-ask" means; the answers map's
      presence is the data that licenses the replacement, no policy branch).
    - the binding flows into engine.bindings, so the §5.1 join
      (resolveNounsPass.ts:149-152,:165) drops the fact with zero new drop-rule;
      answers WITHOUT an idiom value (axis answers, plain text) keep riding the prompt
      exactly as today; label-keyed model hedges without slot identity are UNTOUCHED.
  verified by: server tests — answered compile with `[[labware:<existing>|X]]` binds
    the labware slot and the ambiguous-noun fact for X disappears on the NEXT draw,
    deterministically (no redraw needed for answered labels); a nonexistent id leaves
    today's behavior byte-identical; axis answers unchanged; goldens updated, not
    pinned around. Observable in-browser: the answered card's fact clears and the
    unknown set strictly shrinks on the very next draw.

TASK ANSWER-SURFACE-1 (client; browser-gated via the A5 re-shoot)
  scope: route labware-argument clarification cards to the LABWARE menu so the
    scientist is offered the RIGHT KIND of record. Presentation data only, same
    sanctioned class as CLARIFICATION_MENU_BY_REASON: key the menu pick on
    (reason, fact.actionLocation.argument) — argument names are declared vocabulary
    data; `argument:'labware'` -> '/l', everything else keeps the existing reason
    table ('/m'). NO schema change (actionLocation is already in the frozen SPINE-1
    unresolved shape, workflow/scientist-intent.schema.yaml:220-244, which is
    additionalProperties:false — do NOT add a field). The '/l' surface ALREADY
    EXISTS and needs no new chrome: ClarificationPicker routes '/l' to
    resolveLabware (ClarificationPicker.tsx:18,:31 — labware records + lbw-def
    definitions), answerFromMention already emits `[[labware:<id>|label]]`
    (:118-131, the token ANSWER-BIND-1 consumes), and canMint is material-only
    (:262) so the '/l' card honestly shows NO mint floor. The (reason,'*') default
    preserves every existing card byte-identically.
  closes, without new domain policy, the adapter's OPEN QUESTION
  (clarificationAdapter.ts:26-36 / W2-11-D4 THREAD-ASK-1 OQ): labware-semantic facts
  are answered by PICKING '/l', NEVER by minting — the '/vocab/mint' floor stays
  material-ONLY (third consecutive reaffirmation; see Q3).
  verified by: the A5 re-shoot assertion (Q4): the card for a fact with
    actionLocation.argument='labware' renders the labware surface (records/definitions,
    no mint floor); material-reason cards are visually unchanged.

Rejected alternatives, with grounds:
- Spine-side declared-role consultation (A5d Q3(iii)): trigger fired (V8 + this gate),
  legitimately earned as its OWN spine decision — but it is adapter/contract
  territory and NOT the smallest fix: ANSWER-BIND-1 closes the gate on the scientist's
  answer, which is the interaction the A5 surface is actually about. Authorize it as a
  follow-on decision after A5 closes; do not smuggle (A5d's own instruction stands).
- Server-side pre-resolution of ambiguous-noun facts whose noun matches a declared role
  BEFORE emission: silently resolves WITHOUT the scientist — removes the human from a
  disambiguation the engine explicitly asked about; weaker provenance than honoring the
  answer; and it needs role-vs-store collision policy with no lint teeth. Not today.
- '/l' mint floor: not needed (the gate's own receipts show labware seed candidates
  exist for microcentrifuge-tube), and minting labware is the category error A5d Q3
  ruled against.
- Informational reclassification / fixture edit / wording edit: closed precedents
  (A5g Q1 (b)/(c), A5d "fix the emitter not the rule"); nothing new touches their
  rejection grounds.

Honest residual, named up front (do not fight it blind): the r2 also held free-form,
slot-less model hedges (`lysis reagent identity`, `bead-beating parameters`,
`variant a vs variant b`). These are KEEP facts (resolveNounsPass.ts:190-192) with NO
card — a distinct, previously-flagged class (A5g consequences note: an uncarded fact
that IS record-resolvable re-opens the adapter question WITH A NAMED FACT —
`lysis reagent identity` names mat-lysis-reagent-1dkp, so that condition is arguably
met; it stays OUT of the fix set because it is not evidenced as a deterministic
forever-bar on a COMPLETING path). ANSWER-BIND-1 does not clear label-variant hedges
(join is exact-label identity, deliberately — a containment join would recreate the
A5d V6 spaced/hyphenated drift class). The step-0 probe below measures whether the
hedges survive on a completing path AFTER the two fixes; if they deterministically
bar, that named shape returns as its own decision per the A5g standing clause. Do NOT
pre-authorize a hedge-suppression rule.

## Q3 — NOT BRAD-GATED. Implementable within approved intent.

No '/vocab/mint' labware draft floor is requested — the fix deliberately answers
labware facts WITHOUT minting, so the domain-policy question (materials provenance
hierarchy) never opens. ANSWER-BIND-1 is the half of THREAD-ASK-1 that its approved
spec text already promised; ANSWER-SURFACE-1 is a presentation-table extension in the
same file, keyed on data the 422 already carries. No frozen-contract change, no verb
change, no seed change, no fixture change. The material-only mint floor is reaffirmed
as domain posture. No BRAD QUESTION — the standing A5g/A5d routing discipline is
unchanged; if the step-0 probe or the re-shoot surfaces the hedge class as a
deterministic forever-bar, THAT returns to me with the named fact, and only a
domain-policy fork inside THAT decision would go to Brad.

## Q4 — GATE RE-SHOOT PLAN (A5d r3; criteria UNCHANGED, prompt ADDS these)

Carry forward verbatim from A5g Q2 / A5d Q4: family questions -> answer -> compile
completes -> pl-deck-review >=1 checkbox -> pl-load-deck ghosts >=1 event ->
pl-accept enables -> LPR minted -> GET branch_resolution[].choices ==
{"lysis-method":"bead-beater"}; receipt names the LPR id; per-cycle log; MAX_REDRAW
cap 8 for slot-less hedge draws; honest-FAIL path; no fixture/spec/wording edits.
ADDITIONS for r3:
1. GATE: run only after ANSWER-BIND-1 + ANSWER-SURFACE-1 merge to cl/integration-2;
   containment check lists both SHAs (as today's did for WIRE-TEMP-1/MINT-IDEM-1/
   MINT-FLOOR-UI-1).
2. NEW SURFACE ASSERTION: the `microcentrifuge tube` card MUST render the labware
   surface ('/l' — labware records/definitions, NO mint floor row). If it still
   renders '/m', that is an immediate VALID defect return (fix-class), not a draw.
3. ANSWERED-LABEL SHINK REPLACES CHASE-THE-SET for bound facts: for every fact
   answered with a record idiom (pick OR mint), the fact MUST be gone on the next
   draw — deterministic, not redraw-hostage. The strict-shrink rule stays as the
   general rule; an answered label that survives is a spine defect -> honest FAIL,
   per-cycle log, return. (This is the U5 discipline made sharper, not weaker.)
4. Discipline: answer labware-slot facts by PICKING '/l' (the (seed) labware rows);
   NEVER mint for an argument:'labware' fact (no floor exists — a mint attempt here is
   a defect finding). `lysis-reagent` unknown-noun: the '/m' mint floor row;
   MINT-IDEM-1 makes the reuse return 200 (no 'already exists' tolerance needed
   anymore — delete the A5d Q4 bridging clause from the prompt). MAT-microcentrifuge-
   tube-sgzg stays in the store; the '/l' routing means it can no longer interfere
   with the labware card, and dedupe-by-label absorbs any '/m' reappearance.
5. Hedge draws: unchanged — never fabricate durations/cycles/volumes/reagent brands
   to clear slot-less hedges; they ride MAX_REDRAW only. If >=2 consecutive draws
   hold the SAME slot-less hedge set AND every bounded fact has cleared, do NOT burn
   the remaining budget: file the named hedge set and hand back (step-0 probe result
   will pre-empt most of this).
6. Step-0 PROBE FIRST (measurement, authorized now, precedents A5-accept-leg step 0 /
   control series 2): after the two merges, headless POST /api/intent/compile-from-prompt
   x5, gate-exact protocolText + answers {lysis-method:'bead-beater',
   lyse_variant:'variant_a', 'microcentrifuge tube':'[[labware:<seed id>|...]]',
   'lysis reagent':<pick or mint-reuse idiom>}; record outcome per draw + surviving
   fact sets with reasons. If a completing draw exists (even 1/5) -> proceed to tier-2.
   If 0/5 and every survivor is slot-less free-form -> stop, return the probe log
   (that is the named hedge-class fact for a new decision; the tier-2 spend is
   wasted). If 0/5 with a BOUNDED fact surviving -> ANSWER-BIND-1 defect, return
   with the log, do not force the gate.

## Consequences / notes

- W2-8 A5 stays in-progress; a BLOCKED/FAIL is not a pass; two r3 fails => suspect
  harness/slot infra per the standing SOP.
- The orchestrator authors both tasks into lane 2 (no architect task-list edit);
  ANSWER-BIND-1 and ANSWER-SURFACE-1 are independent (either order); the step-0 probe
  rides after both.
- A5d V1-V9 all stand; this decision is the Q2.2/Q3(iii) "return with the per-cycle
  log" path discharging: the log arrived, the cause is answer plumbing + surface, not
  the bar (bar remains correct by design, resolveNounsPass.ts:326 + SPINE-4/SPINE-7).
- The declared-role-consultation spine task is EARNED (trigger fired: deterministic r2
  barred on a declared-role noun at fe1d7fa1) and should be scheduled as its own
  decision after A5 closes — microcentrifuge-tube would then pre-resolve WITHOUT the
  scientist ever seeing the card; that is the right end-state, this decision is the
  smaller honest one.
- Store side effects from the gate run (all 'proposed' drafts, product-mint state):
  MAT-microcentrifuge-tube-sgzg reuse + possible re-mints; no cleanup owed.
- No live :3093 measurement was taken by me (one read-only GET timed out and was
  abandoned; no retry, no restart). Every load-bearing claim above is code-first-hand
  at fe1d7fa1 or gate-receipt-first-hand.

DECISION: the accept leg dies because a clarification answer is prompt text that can never enter the engine's boundKeys (resolveNounsPass.ts:149-152) while the labware-argument fact is answered from the material menu whose only act (mint) provably adds in-band candidates instead of collapsing them — fix by ANSWER-BIND-1 (honor `[[kind:id|label]]` answers as authoritative data-bound slot bindings before resolve_nouns — the unshipped half of THREAD-ASK-1's approved spec) + ANSWER-SURFACE-1 (route argument:'labware' cards to the existing '/l' menu, presentation data, no schema change, no mint floor); no Brad gate, no fixture/assertion change, material-only mint floor reaffirmed.

IMPL PATH: lane-2 tasks ANSWER-BIND-1 (server: validated-mention answers -> authoritative single-candidate slot binding via generic noun-contract scan feeding engine.bindings; store.get validation; idiom-absent behavior byte-identical; server tests pin deterministic answered-label shrink) and ANSWER-SURFACE-1 (client: clarificationAdapter menu keyed (reason, actionLocation.argument) with 'labware'->'/l', default table unchanged; '/l' card shows no mint floor); then step-0 headless probe x5 per Q4.6; then A5d r3 tier-2 with criteria UNCHANGED + the three prompt additions (surface assertion, answered-label-shrink rule, no-labware-mint discipline); declared-role consultation deferred as its own earned spine decision after A5.

ARCHITECT DONE W28-A5h
