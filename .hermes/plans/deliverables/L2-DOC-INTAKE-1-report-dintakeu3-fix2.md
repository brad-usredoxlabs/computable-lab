# L2-DOC-INTAKE-1 — unit dintakeu3-fix2 report (adversarial c2 D7)

Worktree: /home/brad/cl-wt/L2-DOCINTAKE-dintakeu3-lane2
Branch: cl/lane2-docintake-dintakeu3-0009 · base (fix run) fea66879408a67ca569336b4f54a86c6db7d518e
Review addressed: /home/brad/.hermes/cl/lanes/2/reviews/L2-DOC-INTAKE-1-dintakeu3-advc-c2-l2t0055.md D7 (MINOR)

## Defect and fix

D7: the caution gate tested only for error-severity diagnostics, so an OCR arm returning
`{text:'', diagnostics:[]}` (blank scan read cleanly) still got `LOCAL_OCR_REVIEW`
"Transcribed using local OCR …" on a page that simultaneously got
"Page 1 has no text layer and OCR returned no text". The module header (:17-18) says the
caution rides a read that actually produced text.

documentIntake.ts (one condition, :191-194):
    !outcome.diagnostics.some((entry) => entry.severity === 'error') &&
    outcome.text.trim().length > 0
Comment extended to name c2 D7. The blank arm now keeps only the
`PDF_NO_TEXT_LAYER` warning (:199-206), unchanged.

## Tests (documentIntake.test.ts)

- Leg (e), blank OCR (`{text:'', diagnostics:[]}`): the `LOCAL_OCR_REVIEW` pin flipped
  `toBe(true)` → `toBe(false)`, with an explanatory message on the assertion. It keeps its
  `PDF_NO_TEXT_LAYER` severity/details/message assertions.
- New leg (e2): `ocrPage` returns REAL text ("10 g NaCl in 100 mL") → asserts page method
  `ocr`, and the caution IS present (severity warning, `details.page: 1`, message contains
  "Transcribed using local OCR") and no `PDF_NO_TEXT_LAYER`. This is the overcorrection
  guard — a gate that simply never fires cannot pass it.
- Leg (g)'s positive caution count (`toHaveLength(1)`) still holds.

## RED (test changed, gate NOT yet)

    $ npx vitest run server/src/ingestion/documentIntake.test.ts
     ❯ server/src/ingestion/documentIntake.test.ts  (10 tests | 1 failed) 52ms
       ❯ ... > (e) flags an empty OCR result — a blank page is never a silent success
         → a zero-text OCR arm must not carry the "Transcribed using local OCR" caution:
           expected true to be false // Object.is equality
     ❯ src/ingestion/documentIntake.test.ts:149:7
    Tests  1 failed | 9 passed (10)
The single failure is the flipped pin; (e2) passes pre-fix, so the new leg does not mask
the defect and the flip discriminates the exact behaviour.

## GREEN (gate changed)

    $ npx vitest run server/src/ingestion/documentIntake.test.ts
     ✓ server/src/ingestion/documentIntake.test.ts  (10 tests) 49ms
     Test Files  1 passed (1)
          Tests  10 passed (10)

    $ npx tsc -p server --noEmit
    TSC_EXIT=0      (no output)

## Scope

Only `server/src/ingestion/documentIntake.ts` (one condition + comment) and
`server/src/ingestion/documentIntake.test.ts` (flip + one leg) changed. fix1's
maxPages/extension work untouched; the `PDF_NO_TEXT_LAYER` warning untouched; no YAML,
schema, or adapter change. Tree clean after the marker commit.

L2-DOC-INTAKE-1 UNIT dintakeu3-fix2 DONE c1c2179b68a719f1401ce1a3ad7afece727a8da2
