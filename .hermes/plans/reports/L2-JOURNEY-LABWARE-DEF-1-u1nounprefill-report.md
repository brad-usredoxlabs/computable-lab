# u1nounprefill report — L2-JOURNEY-LABWARE-DEF-1

- worktree: /home/brad/cl-wt/L2-JOURNEY-LABWARE-DEF-1-u1nounprefill-lane2
- branch: cl/lane2-journey-labwaredef-u1nounprefill-1404
- base: b73ec3968370a073e00cd77027e93dd4b31c718b
- lane: 2; unit: u1nounprefill (1 of 3)

## Decisions

1. Prefill convention extended, not invented: `?prefillName=` read from
   `window.location.search` in a module-scope helper `initialPrefillName()`
   (trim + `.slice(0, 120)`), consumed ONCE as a lazy `useState` initialiser.
   Deliberately NOT an effect: an effect would clobber typed input on every
   re-render, and this page re-renders on each extraction state change.
2. Test drives the query via `history.replaceState` before `render`: the
   helper reads `window.location.search`, and jsdom's base URL is
   `http://localhost:5174/` (vitest.config.ts), so MemoryRouter's own history
   does not set `window.location`. afterEach restores `window.location` to `/`.
3. No network on load: no extraction call, no save, no POST; `display_name`
   still flows from the same `name` state through `buildPayloadFromProposals`
   (the `targetField === 'display_name'` skip), so save pre-flight validates
   the prefilled value exactly like a typed one.
4. AC2 arms pinned in-test: no query and `?prefillName=` (empty) both render
   value `''` (trim of `''`/absent yields `''`; whitespace-only trims to `''`).

## Changed files (owned, exactly)

- app/src/collections/LabLabwareNewPage.tsx — +15/−1: `initialPrefillName()`
  helper after `mintRecordId`; `const [name, setName] = useState(() =>
  initialPrefillName())` replacing `useState('')` (was line 288).
- app/src/collections/LabLabwareNewPage.prefill.test.tsx — NEW, 62 lines, 2
  tests (prefill seed; empty/absent query arms).
- app/src/collections/LabLabwareNewPage.test.tsx — byte-identical to base
  (verified `git diff --stat b73ec396` on that path is empty).

Output budget: 2 files, 78 changed lines (62 new test + 16 in the page;
<= 200). No prohibited file opened
for edit (App.tsx, RecordHostPage.tsx, RecordCreatePanel.tsx, spec-sheet
suite, config/ui/surfaces.yaml, server/src/**, schema/**, config/journey/**).

## Commits

- 3db21a12 — u1nounprefill (RED): pin prefillName seeding (new test file)
- 6f6f9ff7 — u1nounprefill (GREEN): seed name input from ?prefillName= via
  lazy useState initialiser

## Verification (raw summaries)

### RED (before implementation)

    $ cd app && npx vitest run src/collections/LabLabwareNewPage.prefill.test.tsx
    ❯ src/collections/LabLabwareNewPage.prefill.test.tsx (2 tests | 1 failed) 78ms
      → seeds the name input from the declared ?prefillName= query value
        → expected '' to be '96-well deepwell plate' // Object.is equality
    Test Files  1 failed (1)
          Tests  1 failed | 1 passed (2)

### GREEN (after implementation)

    $ cd app && npx vitest run src/collections/LabLabwareNewPage.prefill.test.tsx
    Test Files  1 passed (1)
          Tests  2 passed (2)

    $ cd app && npx vitest run src/collections/LabLabwareNewPage.test.tsx
    Test Files  1 passed (1)
          Tests  35 passed (35)     (suite byte-identical; pass count as before)

### tsc (optional; baseline measured first on the untouched tree)

    baseline (pristine b73ec396): 14 `error TS` lines, all pre-existing — 8 in
    app/src/ + 6 in ../server/src/ (missing server type deps: yaml, ajv,
    ajv-formats, ...), identical error sets base vs HEAD (D3 correction: the
    original "all in ../server/**" was false; split per advc c1)
    post-edit:                    14 `error TS` lines; `diff` of the two full
    outputs is EMPTY — identical error sets, zero new errors.

### Mutation probe (wire removed — not vacuous)

Applied exactly as briefed: `useState(() => initialPrefillName())` reverted
to `useState('')` (test file untouched):

    $ cd app && npx vitest run src/collections/LabLabwareNewPage.prefill.test.tsx
    FAIL  src/collections/LabLabwareNewPage.prefill.test.tsx > ... > seeds the
    name input from the declared ?prefillName= query value
    AssertionError: expected '' to be '96-well deepwell plate' // Object.is equality

Restored the initialiser; `git -c core.fileMode=false status --short` then
printed nothing (clean). Post-restore re-run: prefill 2 passed, spec-sheet
35 passed.

### Exit state

    $ git -c core.fileMode=false status --short
    (empty — clean tree at exit)

Full logs kept in /home/brad/.labwaredef-scratch/ (red-run.txt,
mutation-run.txt, tsc-baseline.txt); the scratch dir is deleted at exit.

## Browser acceptance (for the gate, not graded here)

- AC1: `/lab/labware/new?prefillName=96-well%20deepwell%20plate` → name input
  `lab-labware-name-input` shows `96-well deepwell plate`; no other field
  changed; no extraction or write request on load (page makes no API call
  until Propose fields is clicked — unchanged by this diff).
- AC2: `/lab/labware/new` and `?prefillName=` → input value `''` (pinned in
  test; no default invented, placeholder not a value).
- AC3: prefill comes from the URL itself, so reload/F5 and a second tab both
  carry it; the input is fully editable and save uses the edited text via
  the same `name` state (display_name = `name.trim()` in handleSave).

## Next actions / blockers

None for this unit. Units 2–3 of L2-JOURNEY-LABWARE-DEF-1 remain gated per
the item plan (write-capability legs).

---

# u1pin1 (fix cycle 1 after advc c1) — L2-JOURNEY-LABWARE-DEF-1-u1pin1

- branch: cl/lane2-journey-labwaredef-u1nounprefill-1404; base: 37bc215757f3a7814cce2180b1cdb32a47f09fdd
- tier: routine (pins-only; no adversarial review owed)
- Scope held: `LabLabwareNewPage.prefill.test.tsx` (+22 lines, 3 new `it` legs)
  and this report only. No production edit: `initialPrefillName` text and the
  `useState` initialiser are byte-identical to 37bc2157 (proved below).

## Commits

- 58e2174a — u1pin1 (RED): 3 new legs (trim, whitespace-only, cap+boundary)
- (no separate commit needed after GREEN — test file is the only change)

## Mutation probe (measured this run; raw logs in scratch)

Each mutation applied ALONE in the worktree, suite run, then the product file
restored from a scratch copy (md5-verified identical to 37bc2157 before and
after). Transient scratch, deleted at exit.

### M1 — delete ONLY `.trim()` (`:43` → `(prefill ?? '').slice(0, 120)`)

    FAIL  ... > trims surrounding whitespace off the prefill value before seeding (M1 pin)
    AssertionError: expected '  deepwell plate  ' to be 'deepwell plate' // Object.is equality
    FAIL  ... > leaves the name input empty when prefillName is whitespace-only (AC2, M1 pin)
    AssertionError: expected '   ' to be '' // Object.is equality
    Test Files  1 failed (1)
          Tests  2 failed | 3 passed (5)

### M2 — delete ONLY `.slice(0, 120)` (`:43` → `(prefill ?? '').trim()`)

    FAIL  ... > caps the prefilled value at 120 characters (M2 pin; display_name has no maxLength)
    AssertionError: expected 200 to be 120 // Object.is equality
    Test Files  1 failed (1)
          Tests  1 failed | 4 passed (5)

### M3 — seed reverted (`:302` → `useState('')`) — re-measured first-hand

    FAIL  ... > seeds the name input from the declared ?prefillName= query value
    AssertionError: expected '' to be '96-well deepwell plate' // Object.is equality
    FAIL  ... > trims surrounding whitespace off the prefill value before seeding (M1 pin)
    AssertionError: expected '' to be 'deepwell plate' // Object.is equality
    FAIL  ... > caps the prefilled value at 120 characters (M2 pin; display_name has no maxLength)
    AssertionError: expected +0 to be 120 // Object.is equality
    Test Files  1 failed (1)
          Tests  3 failed | 2 passed (5)

All three match the review's measurement (review :129-155): the new legs die
under their own mutation; the existing `:49` pin's failure under M3 is
reproduced first-hand, not narrated.

## Verification (raw summaries, at final commit)

    $ cd app && npx vitest run src/collections/LabLabwareNewPage.prefill.test.tsx
    Test Files  1 passed (1)
          Tests  5 passed (5)

    $ cd app && npx vitest run src/collections/LabLabwareNewPage.test.tsx
    Test Files  1 passed (1)
          Tests  35 passed (35)

    $ cd app && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"
    14   (= base: 8 app/src + 6 ../server/src, identical sets base vs HEAD)

    $ git -c core.fileMode=false status --short
    (empty — clean tree at exit)
    $ git diff --quiet -- app/src/collections/LabLabwareNewPage.tsx   # rc=0 (byte-identical)

L2-JOURNEY-LABWARE-DEF-1 UNIT 1 DONE d05cf784743d96ec26cac69aceeee4bc64dcc2fd
L2-JOURNEY-LABWARE-DEF-1-u1nounprefill UNIT unit DONE d05cf784743d96ec26cac69aceeee4bc64dcc2fd

L2-JOURNEY-LABWARE-DEF-1 UNIT 4 DONE c10d3cc2eedfab502fb330aa92cb3fbc6a5be4cc
