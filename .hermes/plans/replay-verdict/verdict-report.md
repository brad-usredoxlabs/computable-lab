# MATRES-REPLAY — VERDICT REPORT (verdict leg l2t1805, 2026-10-26)

Inputs (all read fresh at dispatch):
- Binding truth: ~/.hermes/cl/lanes/2/decisions/MATRESREPLAY-worksheet-answers-brad.md
  — md5 2b3172d5a9366bafa10716b1f859c105, mtime 2026-10-26 19:34:38 EDT (AMENDED after
  this leg's first read; re-read in full per the dispatch non-negotiable). Brad's
  amendments BIND: W-T1/T2 [BRAD-CONFIRM] resolved ("mint a new term but always confirm
  with the user"); W-T8 Brad (b) binds (never block on level mismatch); W-T9 attestation
  is a SPECTRUM binds; W-T10 blank-source-passes binds.
- Method/F-axes: .hermes/plans/2026-10-26_MATRES-REPLAY-worksheet-leg.md (F1-F6 verbatim).
- Harvest basis: .hermes/plans/replay-harvest/ (byte-pinned; restored to pin after the
  gate run — nothing inside it was written by this leg).
- Contracts memo Q1-Q8 (RATIFIED) — Q4's binary-attestation position is overruled for
  W-T9 verdicts by Brad's amendment (recorded dissent in the answers file).

Ordering disclosure (purity): fates-first. V2 fates were captured and committed BEFORE
panels/*.txt were opened (panels opened ~20:50 EDT, after all 34 fate files existed).
The intended bindings themselves predate everything (answers drafted pre-panel 17:45 EDT).

Provenance of evidence: every "observed" below comes from a fate JSON under
.hermes/plans/replay-verdict/fates/ produced by the offline instrumented replay
(scripts/run-verdict.sh; TWO engine arms per noun — armA pre-ELIG harvest-parity,
armB production = the shipped resolve_nouns with the material-eligibility triplet loaded
per call). fetch stubbed to throw; 0 fetch attempts across all 33 noun replays — every
fate is remote-blind evidence. The REMOTE-CLAMP rows are declared arithmetic, not network.

## Harness-integrity gate (run BEFORE any new fate)

`bash .hermes/plans/replay-harvest/scripts/run-all.sh` was run twice in this worktree.
The harness is DETERMINISTIC (run1 == run2). 47 of 52 fates/panels reproduce
BYTE-IDENTICALLY to the committed pin (d0340d70); FIVE diverge — the two T9 fates, the
two T9 panels, and _summary.json:

  fates/T9__hb-8065.json                pin 26bc3f00…5359a2  -> rerun 9bc8472d…02e27d98
  fates/T9__hep-g2-hepg2-hb-8065-atcc   pin a62c94f0…2b5ac346 -> rerun 83deb486…33313d59
  fates/_summary.json                   pin 515238db…132785  -> rerun 8563621d…4547a9b
  panels/T9__hb-8065.txt                pin e72f7959…c1e66b  -> rerun 8295ebdd…39f0503
  panels/T9__hep-g2-…-atcc.txt          pin 7135b512…85fd52  -> rerun a0d4e7c7…32a883d

CAUSE (precise): db7de009 (2026-10-24) maps kind vendor-product -> level
'vendor-product' in the tier-1 record provider (harvest-era level: 'unknown'), plus the
MaterialLevel-union mirrors. Consequence: under wash.material (wantLevel aliquot) the VPR
candidate now PASSES the TS levelFilter (which drops only concept/unknown). Harvest-era T9
wash = level-filtered out (unknown-noun + mint); base 42a13635 = armA AUTO-BINDS the vendor
catalog record into an ALIQUOT slot, silently. The harvest tree was restored to its pin
(git checkout, hashes verified equal); the divergence is carried as FINDING D-1 and the
new V2 fates replay BOTH eras (armA reproduces the harvest-pinned behavior for every
pinned case, armB adds the shipped eligibility-data behavior).

## Store-basis honesty note

The replayed store is the HARVESTED lane2 copy (byte-pinned). The live main store now
also holds MAT-NCIT-C185409 (created 2026-10-25, after the harvest). So W-T4/T7's intended
DMEM binding target is NOT a candidate in the replay — recorded as an absence, never
coerced. Functionally-equivalent concept records in the replay (MAT-dmem-ykg0 "DMEM",
MAT-XCO-0000988 "Dulbecco's Modified Eagle's Medium") are used to judge the BEHAVIOR
(can the spine bind the right concept at all), and each such substitution is named below.

---

# Per-case verdicts

Legend: INTENT = Brad's binding truth. OBS = fate evidence (armA=pre-ELIG/harvest-parity,
armB=production). F-x "fires" = failure condition present. PASS requires every intended
binding achievable by spine output AND no F fires.

## Case 1 — T1 "add 100 uL of unobtainium to wells A1:C3"
- INTENT (W-T1, amended [BRAD, BINDS]): no auto-bind to any existing record; mint offer
  at concept level, mint only on explicit user confirm; 100 uL / A1:C3 scientist truth,
  never invented/altered.
- OBS: unobtainium -> 0 spine candidates both arms; engine clarifies unknown-noun with
  exactly one affordance: mint local term (no record was bound). Engine never touches the
  quantity/wells (they are not material-slot facts).
- F-axes: F1 no, F2 no, F3 n/a, F4 no, F5 no, F6 no.
- INSTRUMENTED CAUSE: none (clean unknown).
- VERDICT: PASS. [BRAD-CONFIRM] disposition note: the W-T1 line "MINT ... [BRAD-CONFIRM:
  inferred...]" was RESOLVED by Brad's amendment ("yes, mint a new term but always confirm
  with the user"), so this verdict is NOT provisional; the exact line named for the record.

## Case 2 — T2 "add 50 uL of phlogiston to A1"
- Identical shape/behavior to T1 (fate T2-phlogiston__phlogiston.json).
- VERDICT: PASS (same [BRAD-CONFIRM] resolution note for the W-T2 line).

## Case 2 — T9 + SYNTH case 2'
### T9 (real-record half): "Hep G2 [HEPG2] - HB-8065 | ATCC"
- INTENT (W-T9 [BRAD, BINDS]): bind BOTH the concept (live-store MAT-MESH-D056945) and the
  VPR record as declared SOURCE; never an instance/aliquot/lot; the binding IS a weak
  (reference-strength) ATTESTATION — strength must be a declared property.
- OBS add_material (both arms): ambiguous-noun with exactly 2 candidates —
  MAT-hep-g2-hepg2-hb-8065-atc-7hdl (level concept, 1.15) and
  VPR-hep-g2-hepg2-hb-8065-atc-29B6ACCB (level vendor-product, 1.15) — carrying the SAME
  label "Hep G2 [HEPG2] - HB-8065 | ATCC". The engine asks the user to pick ONE; it never
  expresses the two-role binding (concept + source-ref). No attestation-strength field
  exists anywhere in the payload.
- OBS wash arm (aliquot slot): armA on base 42a13635 AUTO-BINDS the VPR (catalog identity)
  as the aliquot at confidence 1 with zero warning (FINDING D-1 drift; harvest-era pinned
  fate filtered it out). armB: ELIG bind FAIL (vendor-product ∉ demandedLevelSet aliquot,
  custody guard) — correct refusal — but the surfacing degrades to unknown-noun + mint
  ("Create local term 'Hep G2 [HEPG2] - HB-8065 | ATCC'"), HIDING that the identity is
  already known locally.
- F-axes: F1 FIRES (wash slot: known identity suppressed to unknown-noun in armB). F2
  FIRES (two same-label candidates, level and role invisible in the clarification payload;
  nothing expresses reference-vs-attestation strength — the user literally cannot tell).
  F3 partially (see SYNTH half). F4 no. F5 no. F6 see synthesis.
- INSTRUMENTED CAUSE: LEVEL-FILTERING (TS levelFilter drops concept; wash armA) +
  LOCAL-SUPPRESSION (armB ELIG bind-not-PASS -> unknown-noun surface) + REMOTE-CLAMP
  structural (tier-4 max 0.58 < band 0.7: a real remote vendor hit could NEVER bind even
  online — arithmetic in every fate).
- VERDICT: FAIL (intended two-role binding not expressible; F1/F2 fire).

### SYNTH case 2' — "order note: Hep G2 [HEPG2] - HB-9999 | ATCC" / noun "HB-9999"
- SYNTH-LABELED (synth/synth-cases.SYNTH.json; HB-9999 verified absent from the live
  store; VPR-shape basis VPR-hep-g2-hepg2-hb-8065-atc-29B6ACCB).
- INTENT (by analogy to W-T9/W-T10 + the case's own purpose): a KNOWN vendor identity
  missing locally must not bind anything wrong, must not fabricate product identity, and
  the product lookup must not be wrongly disabled (F3 probe).
- OBS branded noun "Hep G2 [HEPG2] - HB-9999 | ATCC" (both arms): unknown-noun + mint.
  The vendor IS stated in the text ("| ATCC") yet no vendor scope is recognized — the
  spine treats a known-vendor product request as an unknown LOCAL noun and offers to MINT
  it. NO product-lookup elicitation fires.
- OBS bare code "HB-9999": armA = unknown-noun + mint (a vendor-scoped catalog code
  minted as a local material term). armB = AC-3 catalog-scope gate: reason
  vendor-scope-unknown, ZERO candidates — gathering skipped, nothing fabricated. Correct
  by construction — but the clarification offers no route back to a product lookup
  (dead-end card).
- F-axes: F3 FIRES in armA (product-lookup never even elicited for a catalog-shaped code;
  the P4-shaped request dies as unknown-noun) and in armB PARTIALLY (scope elicited —
  good — but never connected to a lookup; and REMOTE-CLAMP arithmetic means even a
  scope-confirmed tier-4 hit is structurally unbindable: 0.58 < 0.7). F1 FIRES (branded
  noun: known-vendor identity -> mint, i.e. the local mint path suppresses product lookup).
  F2/F4/F5 no.
- INSTRUMENTED CAUSE: LOCAL-SUPPRESSION via AC-3 gate (bare code, armB — intended
  suppression, correctly fired); NO GATE AT ALL for the branded spelling (pattern
  '^[A-Z]{2,5}[-_][0-9]{3,}$' matches "HB-9999" alone, never the display form);
  REMOTE-CLAMP structural.
- VERDICT: FAIL (SYNTH). The AC-3 gate proves the DATA-declared fix direction works; the
  branded-noun gap and the clamp prove it is not wired to the request end-to-end.

## Case 3 — T10 (3', artifact) + SYNTH case 3
### T10 case-3' unspecified source (no nouns; persisted artifact EVG-mvajv2lb-xxwa)
- INTENT (W-T10 [BRAD, BINDS]): PASS with source blank — legal, non-blocking, never
  coerced, no fake "unspecified" placeholder; missing provenance may be SHOWN (passive
  display), never owed-work-nagged.
- OBS: the persisted artifact shows material_source_requirement {status: unresolved}
  INSIDE an ACCEPTED event graph — drafting passed with the requirement unresolved and
  blank. No placeholder record exists. (No spine noun replay is possible — recorded
  absence of a transcript; the artifact is the evidence.)
- F-axes: F5 no (no guessed source forced); all other F n/a.
- VERDICT: PASS (artifact-based). The "unresolved" wording remains passive display, not
  blocking — consistent with Brad's ruling.

### SYNTH case 3 — "add 100 uL of the HepG2 bottle, lot LOT-20261103, from the culture
room fridge, to A1" (SYNTH-labeled; LOT-20261103 verified absent from the live store)
- INTENT (W-T11, architect-stated under H-A authorization — see PROVISIONAL note):
  concept + source reference; the bottle must become a real INSTANCE/ALIQUOT record; NEVER
  a name string in a material slot; known concept must not degrade.
- OBS noun "HepG2 bottle, lot LOT-20261103" (both arms, both slots): unknown-noun +
  mint "Create local term 'HepG2 bottle, lot LOT-20261103'". This is EXACTLY the
  prohibited outcome — the whole physical-bottle phrase as a name-string mint offer; no
  instance/aliquot search is attempted; the lot string is ignored. The nounShape
  mint-refuse data does NOT cover this shape (no listed connective, lot is not a quantity
  pattern).
- OBS bare "HepG2" (the concept that IS present, MAT-MESH-D056945 in the live store;
  harvest-store analogs MAT-hepg2-cells-4oys / MAT-MESH-D056945 present): add_material ->
  ambiguous-noun flood of 20 candidates (blobs, vendor-branded material, MSP-DRAFTs mixed
  in); wash slot (armB) -> unknown-noun + mint (known concept degraded).
- F-axes: F1 FIRES (explicit physical identity -> mint path; concept present but
  unreachable-at-intended-level honestly). F4 no. F5 FIRES in the mint sense the axis
  names: the offered binding WOULD manufacture a material named after a bottle — an
  invented material entity from scientist prose. F2 partially (source/location facts the
  utterance states — lot LOT-20261103, fridge — are DROPPED, not recorded).
- INSTRUMENTED CAUSE: RANKING (bare concept flood) + LEVEL-FILTERING + degradation
  (wash arm) + NO GATE for bottle-shaped nouns (nounShape gap).
- VERDICT: FAIL (SYNTH).
- PROVISIONAL: the W-T11 intent line is architect-stated ("if SYNTH is authorized, the
  intended answers are") and was never marked [BRAD]; H-A authorized the SYNTH turns but
  the per-binding intent rides the draft. Brad should confirm the W-T11 line; verdict
  stands as FAIL under it regardless of mint-vs-instance detail.

## Case 6 — SYNTH "tomorrow make 1 mL of 10% FBS in DMEM for the HepG2 passage"
- SYNTH-labeled; every component verified absent as a whole-string record in the store.
- INTENT (W-T12, architect-stated under H-A — PROVISIONAL note as for W-T11): binds
  NOTHING as an existing instance; becomes a planned step/recipe with "1 mL" as scientist
  truth; must not fail as unresolvable; must not invent a lot/bottle.
- OBS noun "10% FBS in DMEM" (the only slot the resolution engine sees): unknown-noun +
  MINT offer in BOTH arms — the recipe collapses to one fake material term. It does not
  fail as unresolvable (a mint affordance is offered) and invents no lot. But the ONLY
  bind path the spine offers treats a future product as a new material CONCEPT — the
  planned-step/recipe reading is invisible to the resolution arm.
- OBS components DMEM / FBS / HepG2 as separate nouns: ambiguous-noun floods of 20 each
  (exact local concept present at top, score 1.15, buried among blob duplicates —
  e.g. FBS clarification carries 7+ visually near-identical blob labels).
  NOTE: this harness replays NOUN SLOTS only; whether the drafting layer upstream routes
  "tomorrow make…" to a planned step is NOT observable offline from the harvest fixtures —
  recorded absence, not a pass claim.
- F-axes: F4 FIRES (a composition/recipe read as ONE material — the same blob-collapse
  class W-T4 rules out). F5 no (1 mL kept as stated; no invented lot). F1 no for
  components (present-but-flooded = RANKING). F2/F3 no.
- INSTRUMENTED CAUSE: RANKING (component floods) + NO GATE for recipe-shape nouns
  ("10% FBS in DMEM" matches NO mintRefusePattern — the survivor-pin rule for "1 mM
  Clofibrate in DMSO" over-protects recipe blobs).
- VERDICT: FAIL (SYNTH), with two intended sub-conditions met (no unresolvable failure,
  no invented lot).
- PROVISIONAL: as W-T11 — intent line is architect-stated under H-A, not [BRAD]-marked.

## Case "original mixture" — T4 / T5 / T6 / T7 (harvested derived utterances)
### T4 canonical four-term
- INTENT (W-T4): four distinct concept bindings (trypsin-edta mint-on-confirm,
  MAT-NCIT-C185409 [ABSENT from replayed store — analog MAT-dmem-ykg0], FBS
  mint-on-confirm, MAT-MESH-D056945 [present: harvest store carries it in the SYNTH-case6
  replay; analog MAT-hepg2-cells-4oys]); blob-as-ONE-material INTENDED: NO; invent:
  nothing.
- OBS: every noun -> ambiguous-noun. The blob itself is presented AS ONE material:
  9 candidates, 5+ of them the identical label "Trypsin-EDTA + DMEM + FBS + HepG2 cells"
  (per-draft duplicates differing only by unseen event suffix). DMEM's clarification
  carries 20 candidates including 7× "Trypsin-EDTA + Thermo DMEM + FBS + HepG2 cells"
  and 5× "Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells" — the exact
  concept (MAT-dmem-ykg0, exact label match, top score 1.15) is present but UNBINDABLE
  (engine requires a unique in-band winner).
- F-axes: F1 FIRES (approximate blob records suppress the explicit identity by flooding
  it). F4 FIRES (grouping/collapse hides which component a choice binds). F5 no.
- INSTRUMENTED CAUSE: RANKING (dedup-by-curie keeps near-identical labels distinct;
  limit-20 head-cut observed in harvest, same here).
- VERDICT: FAIL.

### T5 vendor-spelled four-term
- INTENT (W-T5): vendor-qualified spellings bind the SAME concepts; alias only on explicit
  lexical confirm (Q6).
- OBS: separate floods per spelling; the store literally contains one minted material per
  spelling variant (MAT-thermo-dmem-1vq1 vs MAT-dmem-ykg0 …) — the flood ROOT is exactly
  the poisoning Q6 predicted. No alias join in the spine; no alias affordance in the
  payload.
- F-axes: F1 FIRES (flood), F4 FIRES (which concept is "the DMEM" is hidden), F6 leans
  (see synthesis). F5 no.
- INSTRUMENTED CAUSE: RANKING rooted in alias-poisoned local data (LOCAL class by
  origin, RANKING by stage).
- VERDICT: FAIL.

### T6 ratio blob
- INTENT (W-T6): "50/50 Trypsin-EDTA/DMEM" = composition of TWO concepts, both component
  bindings visible; fraction binds the ratio, never a material record; 500/uL scientist
  truth at composition level.
- OBS (both arms): the blob BOUND — local:MAT-50-50-trypsin-edta-dmem--vkwl, a single
  material-concept record named after the whole ratio sentence. One record bound;
  component bindings invisible. The fraction reading became a material identity.
- F-axes: F4 FIRES (hides which component binds — nothing shows components). F5 no
  (ratios/quantities came from the utterance, not guessed). F1/F2/F3 no.
- INSTRUMENTED CAUSE: none of the four suppression classes — this is a WRONG-BIND
  (blob-record identity match wins the band); classified: RANKING/identity-collapse.
- VERDICT: FAIL.

### T7 expanded names
- INTENT (W-T7): expanded name = ONE binding with the abbreviation (alias-set member).
- OBS: "Dulbecco's Modified Eagle's Medium" -> harvest store's best concept is
  MAT-XCO-0000988 (exact label, 1.15) but armA binds the MSP-DRAFT blob record in some
  slots and clarifies 2-candidate ambiguity in others; armB (aliquot slot) turns the
  present concept into unknown-noun + mint (LOCAL-SUPPRESSION by ELIG bind-not-PASS,
  trace bind-demanded-level-and-custody-guard). The INTENDED record MAT-NCIT-C185409 is
  absent from the replayed store (recorded absence — created post-harvest in the live
  store; alias equivalence to DMEM is therefore also unverifiable in-replay — recorded).
- F-axes: F1 FIRES (armB degrades a present concept). F4 FIRES where the blob binds as
  one material. F6 leans.
- INSTRUMENTED CAUSE: LOCAL-SUPPRESSION (armB bind-not-PASS -> unknown-noun surface) +
  LEVEL-FILTERING (armA wash) + RANKING (add_material).
- VERDICT: FAIL.

## Case "wrong-level/approximate" — T8 declared-DATA probe (wash.material, level: aliquot)
- INTENT (W-T8 [BRAD, BINDS] (b)): concept match is good enough — do NOT block, do NOT
  demand a bottle; level stays recorded honestly as data; AND (both draft and Brad agree)
  a recognized concept must NEVER surface as unknown-noun.
- OBS: armA = LEVEL-FILTERING drops every concept-level candidate, leaving spec-level
  blob MSP-DRAFTs -> ambiguous-noun flood (wrong record class). armB = those specs also
  fail ELIG bind -> clarification collapses to unknown-noun + mint "Create local term
  'DMEM'" / "'HepG2 cells'" — a locally KNOWN concept surfaced as UNKNOWN. Neither arm
  passes-with-concept-and-moves-on (Brad's (b)).
- F-axes: F1 FIRES (both arms suppress an explicitly present identity). F2/F3/F4/F5 no.
- INSTRUMENTED CAUSE: LEVEL-FILTERING (TS wantLevel filter) followed by
  LOCAL-SUPPRESSION (ELIG demanded-level bind fail) ending in the unknown-noun surface —
  the exact "hides present-but-wrong-level" failure the worksheet named.
- VERDICT: FAIL (both eras, opposite mechanisms: harvest-era flooded, production-era
  degraded).

---

# Instrumented-cause master table

| case | armA (pre-ELIG / harvest-parity) | armB (production, eligibility data) |
|---|---|---|
| T1, T2 | none (clean unknown; mint affordance = intent) | same |
| T4 all nouns | RANKING (flood 9-20, near-duplicate labels) | RANKING unchanged (ELIG does not dedupe labels) |
| T4/T5/T7 blob nouns | RANKING / wrong-record bind | same (+ wash: LOCAL-SUPPRESSION -> unknown-noun) |
| T6 blob | WRONG-BIND to blob material record | same |
| T8 | LEVEL-FILTERING -> ambiguous (spec junk survives) | LEVEL-FILTERING + LOCAL-SUPPRESSION -> unknown-noun + mint |
| T9 add_material | RANKING: 2 same-label candidates (concept vs VPR) | same, + ELIG traces show both bind-PASS unconstrained |
| T9 wash | LEVEL-FILTERING (concept) + DRIFT D-1: VPR auto-BINDS aliquot slot | ELIG bind-FAIL (correct) but surface degrades to unknown-noun+mint |
| SYNTH 2' branded noun | no gate: unknown-noun + mint | no gate: unknown-noun + mint (pattern gap) |
| SYNTH 2' bare code | unknown-noun + mint | AC-3 LOCAL-SUPPRESSION (vendor-scope-unknown, 0 candidates — correct, dead-ended) |
| SYNTH 3 bottle noun | no gate: name-string mint offer | same |
| SYNTH 3 bare HepG2 | RANKING flood 20 | wash: -> unknown-noun + mint |
| SYNTH 6 recipe noun | no gate: recipe-as-material mint | same |
| SYNTH 6 components | RANKING flood 20 each | same |
| ALL vendor-remote claims | REMOTE-CLAMP arithmetic: tier-4 max confidence 0.58 < band 0.7 — vendor candidates structurally unbindable through the engine even online; tiers 0-2 saturate to 1.0 after clamp so tier rank is invisible in every clarification payload | same |

## FINDING D-1 (harness drift, from the gate)
db7de009 made vendor-product records level-'vendor-product', letting a CATALOG record
silently satisfy an ALIQUOT-declared slot on the TS filter (armA, T9 wash auto-bind). The
shipped eligibility data (armB) catches it (bind fail + custody guard) — i.e. ELIG is
already load-bearing against a real regression — but the honest production surface for
the caught case is still unknown-noun + mint. Harvest tree restored to pin; hashes
recorded in the lane report.

## PROVISIONAL flags (per spec)
- W-T1 / W-T2 [BRAD-CONFIRM] lines: RESOLVED by Brad's amendment before verdict; verdicts
  are final, lines named in-place above.
- W-T11 / W-T12 intent lines: architect-stated under H-A ("if SYNTH is authorized, the
  intended answers are"), NOT [BRAD]-marked — the SYNTH case-3 and case-6 verdicts are
  PROVISIONAL pending Brad confirming those two lines (the observed FAIL outcomes are
  robust: they fail under the draft AND under the stricter W-T9/W-T10 doctrine).

---

# F6 synthesis — does the static typed panel merely relocate the four questions?

The panels (opened AFTER fates, read per the closed contamination window) are level×tier
grids over the SAME spine candidates. Verdict per question:
1. WHICH RECORD (identity/flood): NOT reduced. The panels reproduce the flood verbatim
   (T8 DMEM panel: 10 concept rows + spec rows with 4+ visually identical
   "Thermo trypsin-EDTA + …" labels; identical labels differing only by an
   event-suffix CURIE the scientist cannot read). The grid makes level visible — new
   information — but the decision count is unchanged.
2. WHICH LEVEL / reference-vs-custody (Q1/Q4): PARTIALLY relocated, not answered. The
   grid shows "level: vendor-product" (post-drift) where the harvest panel said
   "unknown", but nothing carries attestation STRENGTH (Brad's W-T9 spectrum) — the
   user still cannot tell a catalog reference from an attested lot.
3. WHICH COMPONENT binds (blob/F4): NOT even present — panels are per-whole-noun;
   components never appear (T4/T6/case 6 keep failing identically).
4. WHETHER TO ANSWER AT ALL (blank source / future instruction / bottle): NOT expressible
   — T10's blank-source legality and case 3/6's planned-step vs mint choice have no
   panel surface at all.
CONCLUSION: the panel relocates questions 1-2 (with one real gain: level visibility) and
cannot represent questions 3-4. F6 FIRES: relocation without decision-reduction for 3 of
4 question classes. The one place where shipped DATA already reduced decisions (AC-3
correctly refusing to fabricate a product for "HB-9999") shows the fix shape:
data-declared gates + honest reason codes — which is exactly the ELIG/PANEL list below.

---

# ELIG/PANEL INPUT LIST (deliverable to the next campaign; each item cites its failing case)

E1. Candidate dedup/alias-collapse at assembly: near-identical labels (per-spelling
    mints, per-draft MSP copies) must fold to ONE row exposing its spellings as data.
    Cites: T4, T5, T7, SYNTH case 6 components. [F1, F4, F6]
E2. Blob decomposition in the material slot: "+"/ratio/recipe nouns must present a
    COMPONENT breakdown (composition record), never a single blob candidate or a
    whole-string mint. Cites: T4, T6, SYNTH case 6. [F4]
E3. Never degrade a recognized concept to unknown-noun at a strict-level slot: surface
    "present at concept; slot wants aliquot" and PASS per W-T8(b) (level is metadata,
    never a gate). Cites: T8 (both arms), T9 wash armB, SYNTH 3 bare HepG2 wash, T7 armB.
    [F1, W-T8 ruling]
E4. Same-label/different-level candidates MUST render level + role; two candidates with
    one label may never be an indistinguishable binary choice. Cites: T9 add_material.
    [F2, memo Q1]
E5. Attestation STRENGTH as a declared payload property (reference-strength vs
    lot/receipt-strength), shown wherever a source reference rides. Cites: T9, T10.
    [Brad W-T9 BINDS; supersedes memo Q4 binary for display purposes]
E6. Level-drift guard: vendor-product candidates must never auto-bind instance/aliquot
    slots — the ELIG bind currently catches it but the surface must show WHY instead of
    unknown-noun. Cites: D-1 / T9 wash (db7de009 drift). [F1]
E7. Vendor-scope recognition from the utterance: a vendor token in the noun ("| ATCC")
    must license the catalog gate / product lookup instead of a local mint. Cites:
    SYNTH case 2' branded noun. [F3]
E8. AC-3 scope elicitation must RETURN to product lookup once scope is answered (no
    dead-end zero-candidate card). Cites: SYNTH case 2' bare "HB-9999" armB. [F3]
E9. Confidence band per purpose: tier-4 max 0.58 vs band floor 0.7 makes vendor hits
    unbindable-by-arithmetic — either declare band floors per demanded level (data) or
    give identity-role candidates their own in-band surface; never leave the clamp
    silent. Cites: T9, SYNTH case 2', F3. [F3, memo P4]
E10. Instance-intent recognition: bottle/lot/location language routes to instance/
     aliquot search + create-instance affordance; the mint affordance for such nouns is
     refused (nounShape data extension). Cites: SYNTH case 3. [W-T11]
E11. Future-instruction shape ("make N mL of …"): recipe strings never mint as material;
     resolution offers planned-step/recipe framing with components bound as concepts.
     Cites: SYNTH case 6. [W-T12, F4]
E12. Blank source stays legal on every surface: no owed-work styling of unresolved
     requirements. Cites: T10 (guardrail — keep it so). [W-T10 BINDS]

---

# Verdict tally
PASS: T1, T2 (clean unknown + mint-on-confirm = intent), T10 (artifact: pass-with-blank).
FAIL: T4, T5, T6, T7, T8, T9, SYNTH 2', SYNTH 3 (PROVISIONAL on the intent line), SYNTH 6
(PROVISIONAL on the intent line).
Root shape common to every FAIL: the spine resolves WHOLE STRINGS against LOCAL records
and floods when uncertain; nothing in the payload expresses ROLE (identity vs source vs
instance), LEVEL honestly (degradation hides presence), or STRENGTH (Brad's spectrum).
The two places shipped data already improved behavior (AC-3 gate, ELIG bind guard) are
the proven fix mechanism for E1-E12.
