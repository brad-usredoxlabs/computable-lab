# ADVERSARIAL REVIEW — L2-SPEC-SHEET-INGEST-1 unit g1D4 (lane 2, cycle 1, orchestrator l2t0730)

- Candidate: /home/brad/cl-wt/L2-SPECSHEET-uD4capacity-lane2
- Branch: cl/lane2-specsheet-uD4capacity-1110, HEAD 8d14f110c1cec6f73a47932cea52397fdac65f54
- Base: 8b543b13 (ancestor of trunk cl/integration-2 @ 3256493b)
- Diff: exactly one commit, 3 files, +91/-7
- Unit brief: /home/brad/.hermes/cl/lanes/2/prompts/brief-L2-SPECSHEET-uD4capacity-0630.txt

VERDICT: FIX

---

## Acceptance criteria (verbatim from the unit brief)

1. "Bracket each extracted value at the next field label on the same line, so a multi-field
   reservoir line yields `vendor = "Polypropylene (PP)"` and a separate
   `capacity.max_well_volume_uL` proposal instead of one prose blob with the capacity stuck
   inside `vendor`."
2. "a label ends at the FIRST colon, a value ends at the next label boundary (the separators
   that appear before a following `Some Label:` — `◉`, `|`, `•`, `;`, or a run of 2+ spaces-
   then-Capitalised-word-then-colon; keep the rule simple and documented in one comment) — and
   return the segment belonging to the mapping whose keyword matched."
3. "A line with a single `Label: value` MUST still return exactly the current result (that is
   the existing suite)."
4. "`source: "Max well volume / Reservoir capacity as stated on the sheet"` — `parseSourceKeywords`
   splits on `/`, so this adds a second keyword. NO field name, vendor string or unit may be
   hardcoded in `.ts`; the engine stays generic and data-driven."
5. "Must NOT change: the existing 6 tests' expectations byte-for-byte; `applyTransform` /
   `TRANSFORMS` behaviour ...; the `proposal.passage` verbatim-source contract; the
   `configured/blocked/reason` envelope."
6. Mutation probe: "revert ONLY the `extractValue` segmentation (keep the YAML keyword) and show
   the new test goes RED with the blob value".
7. Reviewer bait: "any `.ts` literal naming `Polypropylene`, `Reservoir`, `cotaus`, or a unit is a
   BLOCKER"; "a rule that truncates a legitimate single-colon value containing a colon ...
   would regress"; "A test that only asserts 'capacity exists' passes with the blob still in
   vendor."
8. Exit contract: append `L2-SPEC-SHEET-INGEST-1 (L2-SPECSHEET-uD4capacity) UNIT g1D4 DONE <40-hex>`
   to `.hermes/plans/deliverables/L2-SPEC-SHEET-INGEST-1-report.g1D4.md`.

---

## What I ran (first-hand, real output)

1) Delivery diff + scope

    $ git -c core.fileMode=false diff --name-status 8b543b13..8d14f110
    M  schema/ingestion/spec-sheet.labware.yaml
    M  server/src/ingestion/SpecSheetExtractor.test.ts
    M  server/src/ingestion/SpecSheetExtractor.ts

    $ git -c core.fileMode=false status --porcelain      # (empty; rc 0)
    $ git -c core.fileMode=false rev-parse HEAD
    8d14f110c1cec6f73a47932cea52397fdac65f54

    All three paths are in the brief's owned set. Nothing from PROHIBITED
    (SpecSheetFieldMaps.ts, spec-sheet.vendor-product.yaml, app/**, api handlers) is touched.
    D5 not touched.

2) Named test suite, at HEAD, in the candidate worktree

    $ cd server && npx vitest run src/ingestion/SpecSheetExtractor.test.ts
     ✓ src/ingestion/SpecSheetExtractor.test.ts  (7 tests) 16ms
     Test Files  1 passed (1)
          Tests  7 passed (7)

    Matches the brief's expectation (baseline 6, post-change 7).

3) Typecheck

    $ cd server && npx tsc --noEmit -p .
    (no output; exit 0 — zero diagnostics)

    $ cd /mnt/vast/home/brad/git/cl-integration-2/app && npx tsc --noEmit
    (no output; exit 0 — zero diagnostics)

    The app leg is informative only; the diff touches no app file.

4) Real-data probe (the decisive check). I built a read-only scratch
   (/home/brad/adv-probe, deleted afterwards) containing the HEAD extractor, the
   base extractor (`git show 8b543b13:...SpecSheetExtractor.ts`), the real YAML map and
   the worktree's node_modules, and drove `extractProposals` on the EXACT passage from
   receipts/SPECSHEET-browser-g1-l2t0245/probe-labware-multi.jsonl line 4 (the cotaus page):

    REAL_HEAD=[{"f":"vendor","v":"Polypropylene (PP) ◉ Reservoir Format: Single well ◉ Reservoir
      Capacity: 195 mL, 185 mL ◉ ... ◉ Compatibility: Multichannel pipettes & automated pipetting
      systems"},{"f":"capacity.max_well_volume_uL","v":"195 mL, 185 mL"}]
    REAL_BASE=[{"f":"vendor","v":"Polypropylene (PP) ◉ Reservoir Format: Single well ◉ Reservoir
      Capacity: 195 mL, 185 mL ◉ ... (byte-identical blob)"},
      {"f":"capacity.max_well_volume_uL","v":"<the same blob>"}]

    HEAD vendor === BASE vendor, byte for byte. The capacity half is genuinely fixed; the vendor
    half of D4 is untouched on the page the gate failed on.

5) Boundary/regression probes (same scratch, HEAD vs BASE):

    T "Vendor: Polypropylene (PP), 25 mL"      HEAD=[vendor="Polypropylene (PP), 25 mL"]   (no capacity)
    T "Polypropylene (PP), 25 mL"              HEAD=[]                                     (no proposal at all)
    T "Vendor: Acme | Reservoir Capacity: 25 mL"
        HEAD=[vendor="Acme | Reservoir Capacity: 25 mL", capacity="Acme | Reservoir Capacity: 25 mL"]
    T "Vendor: Acme, Reservoir Capacity: 25 mL"
        HEAD=[vendor="Acme, Reservoir Capacity: 25 mL", capacity="Acme, Reservoir Capacity: 25 mL"]
    T "Vendor: Acme·Corp"                      HEAD=[vendor="Acme"]            BASE=[vendor="Acme·Corp"]
    T "Vendor: Acme • Ltd"                     HEAD=[vendor="Acme"]            BASE=[vendor="Acme • Ltd"]
    T "Catalog Number: AB-123; AB-124"         HEAD=[catalog="AB-123"]         BASE=[catalog="AB-123; AB-124"]
    T "Vendor: Sigma-Aldrich"                  HEAD=BASE=[vendor="Sigma-Aldrich"]        (unchanged)
    T "Catalog Number: S8270"                  HEAD=BASE=[catalog="S8270"]               (unchanged)
    T "Vendor: Thermo Fisher Scientific"       HEAD=BASE=[vendor="Thermo Fisher Scientific"]
    T "Vendor: Polypropylene (PP) ◉ Reservoir Capacity: 195 mL, 185 mL"
        HEAD=[vendor="Polypropylene (PP)", capacity="195 mL, 185 mL"]      (the brief's literal shape: works)

6) Mutation check on the coder's own fixture (base extractor, coder's map and text):

    FIXTURE_HEAD=[vendor="Polypropylene (PP)", capacity="195 mL, 185 mL"]
    FIXTURE_BASE=[vendor="<blob>", capacity="<blob>"]
    BASE_vendor_len=1  BASE_vendor_notReservoir=false       <- vendor leg does go RED
    BASE_capacity_len=1 BASE_capacity_has195=true has_mL=true  <- capacity legs do NOT discriminate

7) Exit-contract artefacts

    $ find <worktree> <trunk> -name '*g1D4*'        -> nothing
    deliverables dir contains only L2-SPEC-SHEET-INGEST-1-report.u1.md
    commit 8d14f110 touches only the 3 product/test/YAML files

---

## Defects

D1 — MAJOR — `server/src/ingestion/SpecSheetExtractor.ts:151-166`
    The vendor half of D4 is not fixed on the shipped page. `segmentLine` only keeps segments that
    parse as `Label: value` (line 120-124), so the real line's leading colon-less chunk
    ("Manufacturer | OEM/ODM Supplier | Wholesale Factory Price") is dropped before label matching.
    Keywords `["Vendor","Manufacturer"]` therefore match no segment label, and the
    "fall back to whole-line match" arm (lines 160-165) re-runs the pre-fix `extractValue`, handing
    back the identical prose blob (probe 4). AC-1 ("vendor = 'Polypropylene (PP)'") is unmet on the
    only page in evidence. The new test at `SpecSheetExtractor.test.ts:159-186` uses a synthesised
    line (`Vendor: Polypropylene (PP) ◉ ...`, :170) that does not occur in
    probe-labware-multi.jsonl — the brief's FIRST TARGETED CHECK told the coder to use the receipt
    line if the synthetic shape was not the shipped one.
    Fix direction: treat a separator as a boundary only when the right-hand chunk parses as a label,
    and match keywords against the whole line's label positions (including colon-less leading text)
    rather than only against colon segments; add a regression test built verbatim from
    probe-labware-multi.jsonl line 4.

D2 — MAJOR — `server/src/ingestion/SpecSheetExtractor.ts:114-115`
    `|` is named in the brief and in the code's own comment ("Separators: ◉ | • ;") but is absent
    from `sepRe = /\s*(?:◉|·|•|;)\s*/`. Measured (probe 5):
    "Vendor: Acme | Reservoir Capacity: 25 mL" -> vendor AND capacity both get the entire
    "Acme | Reservoir Capacity: 25 mL" string, i.e. the capacity proposal carries a fabricated
    value. Fix direction: add the escaped `\|` alternative (and keep the comment truthful).

D3 — MAJOR — `server/src/ingestion/SpecSheetExtractor.ts:115-117`
    Value truncation regression on legitimate single-field values that contain one of the new
    separators, with no test: "Vendor: Acme·Corp" -> "Acme"; "Vendor: Acme • Ltd" -> "Acme";
    "Catalog Number: AB-123; AB-124" -> "AB-123" (base returned the full value for all three —
    probe 5). This is exactly the reviewer-bait class ("a rule that truncates a legitimate value
    ... would regress the existing suite"); the existing 6 tests do not exercise it, so AC-3 is
    only satisfied for values that contain no separator. The brief's fourth boundary form ("a run
    of 2+ spaces-then-Capitalised-word-then-colon") is not implemented at all, and the review
    brief's "comma boundary" has no implementation either: "Vendor: Polypropylene (PP), 25 mL"
    yields vendor = "Polypropylene (PP), 25 mL" with no capacity proposal.
    Fix direction: split only when the right-hand chunk begins a new label (short capitalised run
    immediately followed by `:`), otherwise fold the separator and the following text into the
    current value; add a negative fixture (`Catalog Number: AB-123; AB-124`,
    `Vendor: Acme·Corp`) that must NOT be truncated. Note the genuine tension with comma
    splitting: "Reservoir Capacity: 195 mL, 185 mL" shows a comma inside a value, so any comma rule
    must also be label-gated — the orchestrator should rule on whether the comma clause is
    required at all.

D4 — MINOR — `server/src/ingestion/SpecSheetExtractor.test.ts:184-186`
    The capacity legs assert only what the pre-fix blob already contains: at base the capacity
    proposal exists and `toContain('195')` / `toContain('mL')` are both TRUE (probe 6). The pin's
    only teeth are the vendor `not.toContain('Reservoir')` leg, and even that only against the
    synthetic fixture. Fix direction: assert the capacity value equals the segment value
    (e.g. `'195 mL, 185 mL'`) and assert the vendor value is exactly `'Polypropylene (PP)'` on the
    receipt line.

D5 — MINOR (paperwork; still required by the brief's EXIT CONTRACT)
    `.hermes/plans/deliverables/L2-SPEC-SHEET-INGEST-1-report.g1D4.md` does not exist in the
    worktree or the commit, and there is no `DONE <40-hex>` marker (check 7). The brief's EXIT
    CONTRACT also requires the report to state baseline 6/6, post-change 7/7, the RED summary and
    the mutation RED->GREEN pair. This is not merely cosmetic because the missing report is where
    the (mandatory) mutation evidence was supposed to live.

---

## Criterion-by-criterion disposition

- AC-1 (multi-field line -> vendor + separate capacity): PARTIAL. Capacity: met on the receipt
  line (probe 4). Vendor: NOT met on the receipt line (D1); met only on the synthetic shape.
  -> D1.
- AC-2 (`◉`, `|`, `•`, `;`, or spaces+Capitalised+colon as boundaries): PARTIAL/FAIL. `◉` works;
  `|` missing (D2); the spaces+Capitalised+colon form absent; truncation side effects (D3).
- AC-3 (single-field line unchanged): PASS for separator-free values
  ("Vendor: Sigma-Aldrich" identical to base); FAIL for values containing `·`/`•`/`;` (D3).
- AC-4 (data-driven keyword widening, no hardcoded vendor/field/unit in .ts): PASS.
  `schema/ingestion/spec-sheet.labware.yaml:36` is the only data edit; grep of the diff for
  `Polypropylene|Reservoir|cotaus` finds them only in the test fixture string, not in production
  branching. `parseSourceKeywords` strips " as stated on the sheet" so the new phrase yields the
  keyword "Reservoir capacity".
- AC-5 (existing 6 tests byte-for-byte, TRANSFORMS, passage, envelope unchanged): PASS — 7/7 green,
  the 6 pre-existing `it(` blocks are unmodified in the diff, `passage: trimmed` still the whole
  line, envelope untouched.
- AC-6 (mutation probe): the vendor pin does go RED on revert for the synthetic fixture; the
  capacity pin does NOT (D4). No coder evidence is on disk (D5).
- AC-7 (no hardcoded domain literals): PASS.
- AC-8 (DONE marker): FAIL (D5).
- Task check 4 (no duplicate vocabulary, dimensions ABSENT when unstated): PASS — no new
  vocabulary, no defaults, no zero-fill; `physical_geometry.*` mappings untouched and still
  `required: false`.
- `exactOptionalPropertyTypes`: no optional interface field added by the diff; nothing to violate.

## Observations (not defects)

- O1: `SpecSheetFieldMaps.ts:29-30` caches field maps module-level, so the YAML `source:` change
  needs a server restart to take effect. The unit's verification is a pure-unit test with an inline
  map, so no live-stack reload was claimed or performed.
- O2: the capacity proposal's value is the raw mL string ("195 mL, 185 mL") while its targetField
  is `capacity.max_well_volume_uL` with `unit: uL`. This is pre-existing design and the brief
  forbids converting, so not a defect of this unit — but the proposal is not directly usable as a
  numeric uL value.
- O3: "first matching segment wins" (`break` at line 157) is order-dependent; on the receipt line
  it is harmless (labels are distinct), but combined with the very generic keyword derived from
  `"Number of rows for grid addressing"` -> "Number", a label containing "Number" would capture
  `topology.rows`. Pre-existing keyword-derivation hazard, made more reachable by label matching.
