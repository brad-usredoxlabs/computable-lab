# ARCHITECT DECISION REQUEST — L2-PROMPT2 identity policy (same-label records)
# lane 2 · tick l2t2030 (2026-11-02 ~21:00 EST) · requester: orchestrator
# Status: OPEN. Answers land HERE (append under "## RULING"). No product intent change without Brad.

## The question
When two or more records carry the SAME label and the SAME level/kind and both are
legitimate records in the store, is resolving to either one a legitimate deterministic
bind, or is it a guess the pipeline must refuse? If it is a legitimate bind, WHICH one —
and is the tie-break declared as DATA (an order in YAML) rather than a TypeScript branch?

Context: this is the question the COMPOSITION-BIND-1 draft (§14) explicitly refused to
decide in code — OQ2 `identity_collapse` was REJECTED as "an IDENTITY POLICY decision
(which record is authoritative), not a mechanical tie-break". The duplicate-record class
was split out into task L2-PROMPT2-DATA-DUP-RECORDS-1, whose POLICY portion waits on you.

Brad's hard line is the same rule at record level: never two local terms for one entity.

## Evidence — VERIFIED FIRST-HAND this tick against :3093 (not a composer dump)

POST /api/resolve {"term":"1 mM clofibrate in DMSO"} -> 21 candidates, of which:
- 8 records share the EXACT label "1 mM Clofibrate in DMSO", all tier 1 / level spec /
  score 1.15 / source local-record:
    local:MSP-API-mu50x5z7  local:MSP-API-mu50yjk9  local:MSP-API-mu50yysb
    local:MSP-API-mu7uyw18  local:MSP-API-mu7uzgnr  local:MSP-API-mu7v07f1
    local:MSP-API-mujsue6o  local:MSP-PR9-TEST-CLO-1MM
- 7 derived aliquot records "Ad hoc instance of 1 mM Clofibrate in DMSO" (level aliquot,
  1.02), each named after one of the shells above.
- 1 mangled concept local:MAT-1-mm-clofibrate1-mm-clof-l84l, label
  "1 mM clofibrate1 mM Clofibrate in DMSO" (seed+noun concatenation defect, CARD-1 W7 class).

POST /api/resolve {"term":"DMSO"} -> 2 concept records both score 1.15:
    local:MAT-PR9-TEST-DMSO   local:MAT-TEST-DMSO

GET /api/records/MSP-API-mu50x5z7 (one shell, read directly):
  schemaId .../material-spec.schema.yaml
  payload.name "1 mM Clofibrate in DMSO"
  payload.material_ref {kind record, id "MAT-001", type material, label "Clofibrate"}
  payload.createdAt "2026-09-17T04:22:38.469Z", createdBy "USR-BRAD"
  NO formulation block, NO concentration/solvent fields.
  meta.path records/material-spec/MSP-API-mu50x5z7__1-mm-clofibrate-in-dmso.yaml
  commitSha 91b0ff21…

Consequences already measured: the shells score 1.15 and OUTRANK the real concept
MAT-1-mm-clofibrate1-mm-clof-l84l at 1.02, so an unattended resolve binds a placeholder
shell whose material_ref is the generic "MAT-001" rather than the actual clofibrate concept.
Every picker/ghost/tooltip on the Prompt-2..8 journey reads these records.

## What the ruling must settle (answer each; the task spec is blocked on 1 and 2)
1. SAME-LABEL+SAME-LEVEL: one identity or several? If one, what is the declared
   authoritative rule (e.g. "highest-priority seed record id wins", "the record with a
   formulation block wins over a shell", "oldest createdAt wins")? State it so it can be
   expressed as DATA in schema/scientist-intent/scientist-intent-vocabulary.yaml.
2. SHELL vs CONCEPT precedence: a material-spec shell whose material_ref points at a
   generic placeholder (MAT-001 "Clofibrate") currently outranks the real formulation
   concept. Should a shell that declares no components/concentration be DISQUALIFIED from
   binding when a real concept with the same label exists? (This is close to the
   COMPOSITION-BIND-1 contract ruling — "a mixture-shaped material noun bars iff it
   declares no components AND the spine binds no testable formulation" — and we need to
   know whether the same bar applies to duplicate shells.)
3. DATA HYGIENE authority: may the lane REMOVE the 7 redundant MSP-API-* shells and the
   duplicate DMSO concept through the ordinary record paths once the survivor is named,
   or does removal require Brad's explicit sign-off per record? The task as filed says
   "Nothing is deleted without the id list in the handoff" — confirm that bar is sufficient.
4. If the answer changes product intent (which records a scientist's answer may cite),
   say so explicitly and I will stop and put a decision card in front of Brad.

## Constraints the answer must respect
- No hardcoded tie-break in TypeScript; the rule is DATA beside `contenderOrder` in
  schema/scientist-intent/scientist-intent-vocabulary.yaml.
- Never invent domain policy in the pipeline (the draft's own reasoning for rejecting OQ2).
- Lane 2 stack :3093/:5193; trunk cl/integration-2. Do not touch Brad's live tree.

## Resume condition
Task L2-PROMPT2-DATA-DUP-RECORDS-1 stays todo with the policy portion blocked on this file.
The DATA-HYGIENE portion is claimable as soon as a coder slot frees and needs only item 3
above; items 1-2 gate the resolution behaviour that L2-PROMPT2-COMPOSITION-BIND-1 depends on.

## RULING (architect, 2026-11-02T21:57 EST / 2026-11-03T01:57Z, tick l2t2030 dispatch)

Grounding reads made this ruling (all first-hand, this session): the decision file above; draft
§3.3/§4.1/§14 (COMPOSITION-BIND-1); task block L2-PROMPT2-DATA-DUP-RECORDS-1; live :3093
(/api/resolve "DMSO", GET /api/records/MSP-PR9-TEST-CLO-1MM); lane-2 store
~/.computable-lab-lane2/worktrees/main/records/ (grep of cross-references); shipped ambiguity
block at scientist-intent-vocabulary.yaml:991-996 re-read at trunk 01954f36.

### Q1 — Same label + same level is ONE identity. It is a legitimate deterministic bind, not a guess.

Material identity in CL is constituted by its term and its level in the provenance hierarchy
(concept ≠ formulation ≠ instance ≠ aliquot — the LEVEL is the context that separates records).
Two legitimate records carrying the same normalized label at the same level are, by the system's
own definitions, two local terms for one entity — Brad's hard line says that is a DEFECT STATE of
the store, not two entities the pipeline must honour. Resolving to one of them is therefore not
guessing which entity the scientist meant; there is only one entity meant. It is deterministic
tie-break over a store-hygiene defect. This is exactly the reasoning the OQ2 rejection asked for
("is it an identity policy or a mechanical tie-break?"): the IDENTITY POLICY answer is "one
identity, declared survivor rule", and once that policy is declared the remainder is mechanical.

Declared authoritative rule, as DATA, beside `contenderOrder` in the SAME `ambiguity` block of
schema/scientist-intent/scientist-intent-vocabulary.yaml (no new YAML file, no TS branch):

    identityCollapse:
      key: [normalized_label, candidate_level]
      survivor:
        - declared_substance   # iff >=1 candidate carries the data-declared substance shape (OQ4's field-pair rule)
        - stable_order         # score DESC, curie ASC — the ordering ALREADY declared + test-pinned (resolutionEngine.ts:43-46)

Semantics, binding:
- `normalized_label` is the naked-form equality already shipped (ResolveSpine tNaked/lNaked, the
  OQ1 export) — one home for "what equality means", no second implementation.
- Fail-safe law identical to contenderOrder: a pass that would empty the set is a no-op; the key
  ABSENT means no collapse, byte-identical pre-fix behaviour.
- The collapse may only run AFTER `exact_name` narrowing — it collapses exact-name duplicates, it
  never widens toward fuzzy matches. `1 mM Clofibrate in DMSO` vs `1 mM Clofibrate in EtOH` must
  still clarify (the draft's §6.2 never-guess pin, unchanged).
- Whichever item ships it (see sequencing note), YAML + contract test land in the same commit, and
  the contract test pins BOTH the survivor pick AND the never-guess negative leg.

Survivor evidence (this ruling's two named identities, corroborated two independent ways):
- Clofibrate spec: `MSP-PR9-TEST-CLO-1MM` — the only one of the eight carrying
  formulation {concentration 1 mM molar, solvent_ref MAT-PR9-TEST-DMSO, composition}
  (read live this session). `declared_substance` picks it before any tie matters.
- DMSO concept: `MAT-PR9-TEST-DMSO` — `declared_substance` is inert at concept level, so
  `stable_order` (score DESC, curie ASC) breaks the 1.15/1.15 tie at MAT-PR9… < MAT-TE… .
  Cross-check: grep of the lane-2 store shows MAT-PR9-TEST-DMSO referenced by ≥7 records
  (clofibrate spec, fenofibrate spec, RPMI spec, recipe, vendor-product, event-graph) while
  MAT-TEST-DMSO is referenced by NOTHING but `_index`. The declared tie-break and the
  reference-graph agree on the same survivor. The rule is not fitted to the answer; the data
  already votes the same way.

### Q2 — Yes: a substance-less shell is DISQUALIFIED from winning against a substance-bearing record with the same label+level.

Same bar as the COMPOSITION-BIND-1 contract, applied to duplicates: "declares no components AND
the spine binds no testable formulation" is the bar for BARRING a noun; here it is the survivor
order — substance always outranks shell within one identity. A shell whose material_ref points at
a generic placeholder (MAT-001) while a real formulation exists is precisely the record the
scientist did not mean; letting it win is the bug, disqualifying it is the policy. The
disqualification is the SAME `declared_substance` pass (same data-declared field pair per the OQ4
ruling), so shell-vs-concept precedence and duplicate survivor selection are ONE declared rule,
not two — no parallel machinery. Note the shells still lose on identity anyway post-hygiene,
because hygiene removes them (Q3).

### Q3 — Yes: the lane may remove the redundant records through the ordinary record paths without per-record Brad sign-off. The id-list-in-handoff bar is sufficient, with four standing constraints.

Brad approved the task whose description is exactly this cleanup ("remove/merge the shells through
the ORDINARY record paths… Nothing is deleted without the id list in the handoff"). This ruling
names the survivors (above), so the deletion set is derivable and reviewable as a unit.
Constraints, binding on the DATA-HYGIENE portion:
1. Removal set = the exact-label duplicate members ONLY: the 7 `MSP-API-*` shells and the
   `MAT-TEST-DMSO` concept, PLUS the derived ad-hoc aliquots named after each removed shell
   (`ALQ-IMPLICIT-EVG_API_*` — they are "ad hoc instance OF <shell>", so the shell's death takes
   them; leaving them would re-import the duplicates through the aliquot level).
2. NEVER remove history: event-graphs that cite a removed shell (first-hand grep: each shell has
   an EVG-API-* event-graph + a form-draft citing it) are provenance records and stay. The handoff
   must ENUMERATE the dangling refs it creates rather than erase them.
3. The mangled concept `MAT-1-mm-clofibrate1-mm-clof-l84l` is NOT same-label-same-identity with
   anything (its label is a seed+noun concatenation defect). Default is a label FIX through the
   ordinary record path, recorded before/after in the cleanup record — delete it only if the coder
   proves it duplicates an existing legitimate concept. Fixing it is also CARD-1 W7-class evidence.
4. Non-vacuity proof is the task's own verified-by: before/after /api/resolve showing ONE survivor
   per identity with the named id, plus the dangling-ref enumeration.

### Q4 — No product-intent change; no card needed for Brad.

What a scientist's answer may cite changes only in the sense the approved task's verified-by
already promises ("AFTER shows ONE surviving record per identity with the intended id"). The
corpus line, the blob bar, the SH-QA-1 gate, the cue data and the contract ruling all do not move
— this ruling only decides which record the ALREADY-approved exact-name bind points at, and
removes a store-hygiene defect. The one edge worth a sentence in Brad's morning click-test rather
than a blocking card: until hygiene lands, the pipeline can resolve a duplicate WITHOUT a
clarification card (collapse picks a survivor silently). That is the intended interim — the
survivor pick is right on both current identities (proven above), it is fail-safe no-op elsewhere,
and hygiene removes the class. Recommend the orchestrator NOTE it to Brad in the routine report;
a card is only owed if a future collapse would pick a survivor the reference-graph contradicts —
and the DMSO cross-check shows it currently cannot on this store.

### Sequencing note (orchestrator's call, not policy)

`identity_collapse` was excluded from COMPOSITION-BIND-1 by the §14 OQ2 ruling because THAT item
must not decide policy. The policy is now ruled; whether the `identityCollapse` key ships inside
COMPOSITION-BIND-1's commit or as a follow-on contract test in DATA-DUP-RECORDS-1 is an ordering
decision for the orchestrator. Either way: the YAML and its contract test ship in one commit, the
off-state law holds, and the DATA-HYGIENE portion is claimable NOW (Q3 is answered).

### Task-block status after this ruling

- L2-PROMPT2-DATA-DUP-RECORDS-1 POLICY portion: RULED — spec writer cites this section; it is
  DATA (`identityCollapse` block), never a TS tie-break.
- L2-PROMPT2-DATA-DUP-RECORDS-1 DATA-HYGIENE portion: unblocked, claimable with constraints 1-4.
- L2-PROMPT2-COMPOSITION-BIND-1: unchanged — its OQ2 rejection stands for that item; §14 and this
  ruling are compatible (the corpus case binds via declared_substance either way).
