# FAME-5 ARCHITECT DECISION — OQ-2 (palmitate ontology minting) + OQ-3 (denominator honesty)

Author: architect (read-only on all git trees except this file). Date: 2026-11-01.
Trunk verified at `aad849f6` (git -c core.fileMode=false log; matches the packet's stated
orchestrator verification). FAME-3 (393fee16) confirmed UNMERGED at tip (`git grep assignment_state HEAD -- schema/` = empty; branch contains shows only `+ wt/fame-3-lane1-l1t0245`).

---

## DECISION: OQ-2 = Option A — mint the two palmitate terms into schema/registry/ontology-terms/fame-local.yaml, as a SEPARATE housekeeping item (NOT FAME-5).

### Rationale (≤30 lines)
1. The file's own header doctrine authorizes exactly this act: `source: manual`, ChEBI CURIEs
   carried in `meta.chibi_id`, "never as the term id: one entity, one local term"
   (fame-local.yaml:4-6, read at aad849f6). Minting here is the governed door, not a workaround.
2. "Prefer ontology terms over free text" is a founding non-negotiable; Option B permanently
   makes the check's central identity a string. "Never two local terms for one entity" is NOT
   violated: FFA and methyl ester are two entities — the file's own rule "Two species per chain
   length (FFA vs methyl ester): one local term each" (fame-local.yaml:17-18) prescribes two terms.
3. FAME-3 §18 OQ-2 ratified NO new RECORD KIND — not at issue; this adds terms to an EXISTING
   local ontology file consumed by the shipped OntologyTermRegistry (server/src/registry/
   OntologyTermRegistry.ts:4-6, :48).
4. ChEBI ids verified LIVE by the architect at OLS4 this session (same method the header
   documents for the n6/n8/n10 set): CHEBI:15756 label "hexadecanoic acid", not obsolete,
   synonyms incl. "Palmitic acid"/"Palmitate"; CHEBI:69187 label "Methyl palmitate", not
   obsolete, synonyms incl. "Methyl hexadecanoate". CAS cross-checked at PubChem PUG:
   palmitic acid CID 985 CAS 57-10-3; methyl palmitate CID 8181 CAS 112-39-0. (OLS4's
   database_cross_reference returned empty for CAS on both; the file's header already cites
   "OLS4 (+ PubChem)" as the joint verification source, so PubChem covers CAS, OLS4 the CURIE.)
5. Honesty today is preserved: with terms minted but NO assignment entry targeting them (the
   real lane state; FAME-5 draft §3 item 5, live lookup of any palmitate record 404'd again this
   session), leg (a) still drives not-assessable via drive (i) "no assignment entry targets the
   expected analyte" (draft §4). Minting makes the check ASSESSABLE-ONCE-BRAD-ASSIGNS, which is
   the whole point of the campaign (R6: identity map domain-authored, Brad verifies).
6. Option B's "zero vocabulary growth" is illusory: the label string becomes a de-facto
   ungoverned term used for matching — precisely the free-text drift the doctrine forbids.
7. The composer's own objection ("schema-tree edit inside an item that declared zero YAML
   edits") is correct AND is why the edit does NOT ride FAME-5 — see ownership below. It is not
   an argument against minting.

### The EXACT term blocks (append-only to fame-local.yaml, after methyl-decanoate-n10)

```yaml
# ChEBI ids architect-verified live at OLS4 2026-11-01 (CAS via PubChem PUG):
#   palmitic acid       CHEBI:15756   (CAS 57-10-3; PubChem CID 985; OLS4 synonyms
#                                     incl. "Palmitic acid"/"Palmitate")
#   methyl palmitate    CHEBI:69187   (label "Methyl palmitate"; CAS 112-39-0;
#                                     PubChem CID 8181; synonym "Methyl hexadecanoate")
  - kind: ontology-term
    id: FAME-LOCAL:palmitic-acid-n16
    source: manual
    label: "Palmitic acid (free fatty acid, 16:0)"
    definition: "Free fatty acid species of the palmitic (16:0) chain; distinct from its methyl ester."
    meta:
      chebi_id: CHEBI:15756
      cas: 57-10-3
      chain: 16:0
      species: ffa
  - kind: ontology-term
    id: FAME-LOCAL:methyl-palmitate-n16
    source: manual
    label: "Methyl palmitate (FAME, 16:0-OMe)"
    definition: "Methyl ester (FAME) of palmitic acid; the 16:0 GC-FID standard species."
    meta:
      chebi_id: CHEBI:69187
      cas: 112-39-0
      chain: 16:0
      species: methyl-ester
```
Format constraints: schema-valid per OntologyTermSchema (OntologyTermRegistry.ts:26-39: kind
literal, source enum incl. `manual`, meta freeform record). NO `synonyms:` field — the file's
existing style carries none; ChEBI synonyms live in the header comment, matching precedent.
Ids follow the file's exact convention (`<species>-<chain>` suffix, n6/n8/n10 pattern).

### Ownership + boundaries
- A NEW housekeeping item (proposed id **FAME-ONTO-1**, lane 1, no deps) owns: (1) the
  fame-local.yaml append above (incl. the header verification comment), (2) the two HARDCODED
  counts at server/src/registry/OntologyTermRegistry.test.ts:15 and :67 `toHaveLength(10)` ->
  `toHaveLength(12)` (verified at tip; these assertions WILL fail otherwise — adversarial
  reviewers will grep for exactly this), (3) the lane stack restart (:3092/:5192) performed by
  the ORCHESTRATOR at merge — the registry is a startup singleton (OntologyTermRegistry.ts:49-62;
  `reload()` exists at RegistryLoader.ts:153/:222 but no non-test API route invokes it; the
  architect restarted nothing, per the packet's boundary).
- FAME-5's coder touches NOTHING in the schema tree. Its bait #3 stands verbatim; the ruling it
  awaited is this file.
- Sequencing: FAME-ONTO-1 should land on cl/integration-1 BEFORE FAME-5 dispatch (both already
  sit behind the FAME-3+FAME-4 merge gate, so it adds no serialization). If it has NOT landed at
  FAME-5 dispatch, FAME-5 proceeds under the draft's Option-B wording for W3 (label-only DATA +
  explicit no-governed-term note) and does NOT block; W3's expected_analyte is ref-of-ontology
  the moment the term is live.
- FAME-5 W3 usage once live: `expected_analyte` = {kind: ontology, id:
  FAME-LOCAL:methyl-palmitate-n16} — the METHYL-ester term, because the injected standard is a
  derivatized FAME mix and the assigned peak is the ester. The artifact's source_honesty sentence
  must state that Brad's bench statement says "palmitic acid 6%" while the governed identity of
  the measured species is its methyl ester — a declared basis note, never a silent identity swap
  (one entity, one term; the FFA term exists for the acid, not for the ester peak).

---

## DECISION: OQ-3 = Option A confirmed — observed_percent rides FAME-4's eligible-set denominator; both denominators published side-by-side; WITHIN/OUTSIDE-TOLERANCE OUTCOMES ARE PERMITTED, with mandatory cross-denominator labeling. v1 is NOT comparison-only-only.

### Rationale (≤30 lines)
1. Option B is not available as a demand: FAME-4's published analyte_summary contract carries
   the ELIGIBLE-SET denominator + contributing peak refs + excluded/unresolved buckets
   (fame-4-spec.md §5 :171 "denominator = math.fsum of the eligible rows' area_pa_min"; :266
   metric `denominator_pa_min or null`; :60 excluded/unresolved retained IN the artifact) — no
   full-table denominator is contracted. Repo grep for a total-area/table-total field in the
   FAME-4 spec: 0 hits (checked this session). FAME-5 must not fork or reshape FAME-4's contract
   (append-only, frozen chain untouched).
2. Echo-if-present: IF the ACTUAL published artifact (read live at dispatch, draft §10) carries
   any table-wide/total-area field, the coder echoes it as an EXTRA labeled denominator column.
   Absent => absent; no re-derivation from raw peak_table (all 31 area_percent null anyway,
   draft §3; tuning ban).
3. Cross-denominator honesty, per R4 verbatim (draft-campaign-list.md:35-37: percentages show
   denominator + excluded/unresolved area; never imply "all fatty acids"): the reference_check
   artifact MUST carry, as distinct labeled fields: observed_percent + its denominator (the
   eligible set, its value + member refs, carried from analyte_summary), expected_percent_of_total
   + its declared denominator basis (%-of-total over the ~37-component standard, declared DATA),
   and a mandatory `denominator_basis: subset-vs-total` disclosure field + the honesty sentence.
   A reviewer re-derives the outcome from the payload alone (draft §4's replayability rule).
4. Why within/outside are PERMITTED, not banned: (a) the task description itself declares
   tolerance a parameter and names all four outcome words as the controlled vocabulary
   (task-list.md:10907-10910) — banning two arms would contradict the approved verified-by;
   (b) the direction of bias is CONSERVATIVE in the fail-safe sense: a subset denominator
   (eligible set = C6/C8/C10 + any assigned species, FAME-4 eligible_states) is SMALLER than the
   total, so observed_percent over it is generally INFLATED relative to %-of-total — a
   within-tolerance verdict under a subset denominator is a strong, hard-won claim, while an
   outside-tolerance verdict may overstate; (c) honesty lives in the LABELING, not in amputating
   the vocabulary: R2 already ruled this is a CHECK, not an equivalence claim
   (draft-campaign-list.md:28-32), and tolerance_pp is a human-declared parameter read with both
   denominators visible.
5. Mandatory guardrails on the two permitted arms: any within/outside outcome from a
   subset-vs-total comparison MUST (i) carry the `denominator_basis: subset-vs-total` field,
   (ii) be presented in the report/browser surface as a labeled cross-denominator check — an
   outside-tolerance there is "discrepancy pending human interpretation", NEVER a claim that the
   standard is bad (the W5(c) absurd-expected leg proves the check bites; the discrepancy is
   never relabeled, task verified-by); (iii) not-assessable still OUTRANKS both arms — the draft's
   leg (a) (target absent/ambiguous/null-denominator) stays not-assessable even with tolerance
   declared (draft §7 W5(b)).
6. comparison-only remains the DEFAULT when tolerance_pp is ABSENT (absent ≠ 0; draft §5).
   No tuning door: tolerance changes = fresh runs with distinct params_digest (FAME-2 §8).

---

## NOTE — FAME-5 file boundaries under OQ-2=Option A (explicit, per the packet)

FAME-5 itself declares ZERO schema/YAML edits and KEEPS them: the ontology edit does NOT
transfer into FAME-5's diff — it is absorbed by the new **FAME-ONTO-1** housekeeping item above
(fame-local.yaml + OntologyTermRegistry.test.ts counts + orchestrator restart at merge). FAME-5
default diff remains: ZERO code files, records via :3092 only. If the orchestrator promotes the
spec draft, amend §8 ("NO new ontology term ... palmitate term = architect call, OQ-2") to cite
THIS file: the minting is ruled and owned elsewhere; FAME-5's grep gate is unchanged — the four
outcome words must still appear NOWHERE in the shipped tree (the two new TERMS are a different
surface, and the FAME-ONTO-1 diff is the only place `palmit` may appear in schema/).

### What the coders may/may not touch
- FAME-5 coder: lane-data records via :3092 (ANREV successor, runs, runner-persisted AOUT/VSPEC)
  + report/receipts ONLY. May READ the new terms (post-FAME-ONTO-1 merge) and ref them as
  expected_analyte. May NOT edit schema/, server/, app/, fame-local.yaml; may NOT mint anything;
  may NOT compute observed % from raw peak_table; may NOT imply all-fatty-acids.
- FAME-ONTO-1 coder: fame-local.yaml (append the two blocks verbatim above + header comment) +
  the two test counts ONLY. Zero other files. Restart is the orchestrator's, at merge, exact
  PIDs, never pkill.

### Evidence actually read this session (all re-verified at tip aad849f6)
- .hermes/plans/2026-11-01_fame-5-spec-draft-l1t0535.md (full, incl. §3 item 5, §4, §7 W5, §8, §13 #3, §14 OQ-1/2/3)
- /home/brad/.hermes/cl/lanes/1/task-list.md:10894-10920 (FAME-5 block, verified-by verbatim)
- ~/.hermes/specs/intake/2026-10-31_fame-quantitation-chain/draft-campaign-list.md:24-43 (R1-R7; R2 :28-32, R4 :35-37)
- schema/registry/ontology-terms/fame-local.yaml via `git show HEAD:` (exactly 6 terms, zero palmitate; header doctrine :4-6, :17-18)
- server/src/registry/OntologyTermRegistry.ts:26-39 (term schema), :48-62 (startup singleton DIR/loader); RegistryLoader.ts:46/:153/:222 (reload exists, test-only callers found); OntologyTermRegistry.test.ts:15/:67 (hardcoded 10)
- .hermes/plans/2026-11-01_fame-4-spec.md §5 :171, :260-282 (eligible-set denominator contract; no full-table denominator anywhere in the spec — grep 0 hits)
- git -c core.fileMode=false grep -ril 'palmit' HEAD -- ':!.git': hits ONLY .hermes/plans/** (repo code/schema: zero); live :3092 GET FAME-LOCAL:palmitic-acid-n16 => NOT_FOUND (re-confirmed this session)
- FAME-3 unmerged at tip: `git grep assignment_state HEAD -- schema/` empty; 393fee16 on wt/fame-3-lane1-l1t0245 only
- OLS4 live: CHEBI_15756 / CHEBI_69187 term endpoints (labels, is_obsolete=false, synonyms); PubChem PUG: CID 985 / CID 8181 + CAS 57-10-3 / 112-39-0

`FAME-5 OQ-2+OQ-3 RULED <this file>` — orchestrator: fold into the spec at promotion; queue
FAME-ONTO-1 per Brad's standing amendment-approval flow.
