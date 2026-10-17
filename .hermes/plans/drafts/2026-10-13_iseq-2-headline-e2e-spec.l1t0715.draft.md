# SPEC DRAFT (l1t0715) — ISEQ-2: Headline end-to-end — search -> import into sequences surface from the new tab (plan Phase 4)

Composed against trunk `cl/integration-1` @ **406d437676592902b570cdeab13961eeeecc4292**
(`git -c core.fileMode=false -C /mnt/vast/home/brad/git/cl-integration-1 rev-parse HEAD`, verified first-hand).
Every path:line below was read first-hand by the composer at this HEAD.

## ISEQ-1 STATUS AT COMPOSITION HEAD — READ THIS FIRST

**ISEQ-1 is NOT yet merged at 406d4376.** Verified first-hand:
- `app/src/sequences/SequenceSearch.tsx` does NOT exist (`ls app/src/sequences/` → api.ts, nativeDraft, SequenceChat, SequenceEditor, SequenceImport, SequenceResults, SequencesPage, no SequenceSearch).
- `app/src/ingestion/IngestionPage.tsx` has NO `sequences` tab (body ternary at :71-78 is `oligo-orders | vendor-pdf | literature`, verified).
- `ncbi_nucleotide` appears NOWHERE in `server/src/api/handlers/BiosourceHandlers.ts`, `app/src/types/biosource.ts`, `app/src/shared/api/biosourceClient.ts` (verified by grep).

**Dispatch gate (hard): do NOT start this item until the ISEQ-1 merge is on the trunk.** The
first coder action must be an on-disk confirmation at the dispatch-base HEAD:
`SequenceSearch.tsx` exists, `'sequences'` is in `IngestionPage`'s `IngestionTab` union, `SOURCE_MAP`
carries `ncbi_nucleotide`, and `app/e2e/ingestion-pills.spec.ts` exists. If any is missing: STOP,
return `requires-rescope`, do not improvise the ISEQ-1 surface. Every ISEQ-1 shape cited below is
marked **"per ISEQ-1 spec §N (not yet on disk at 406d4376)"** and must be re-verified against the
MERGED code before writing a single test — the merged artifact, not this spec's quotes, is the
selector authority for the e2e.

Goal (one sentence): prove the biologist story end-to-end — searching "16S F Prausnitzi" in the
Sequences ingestion tab, importing the canonical RefSeq hit through the EXISTING
`POST /sequences/actions {operation:'save_sequence'}` path, and the record reviewable in
`/lab/sequences` — with a live-NCBI Playwright spec plus the minimal wiring that turns the bare
imported-recordId display into a real "open the record" affordance.

Task-list acceptance criteria (verbatim, `/home/brad/.hermes/cl/lanes/1/task-list.md`, id ISEQ-2):
> verified by: e2e test + browser receipt: search -> import -> record appears; VERDICT: accept on :5192.

and the description, verbatim:
> End-to-end proof of the biologist story: search the Sequences ingestion tab, pick the canonical
> hit, import lands a sequence record through the existing POST /sequences/actions save_sequence
> path, reviewable in /lab/sequences. No new save path.

---

## §1 The end-to-end story, anchored in EXISTING code (verified at 406d4376)

The save path ISEQ-2 must NOT change, quoted first-hand:

- `server/src/sequences/sequenceRoutes.ts:32` — `app.post('/sequences/actions',handle(async request=>new SequenceService(ctx,await actor(request)).apply(request.body)));` — THE save route; zero-diff mandate.
- `server/src/sequences/SequenceService.ts:70-78` — `case 'save_sequence':` — normalizes residues against `config` alphabets, derives `id: SEQ-<contentHash-slice>` from the FULL request (requestId included — so every fresh requestId creates a NEW record id even for identical residues; e2e must assert on the captured recordId, never on counts), canonicalizes with sha256, saves against `sequence.schema.yaml`, returns `{recordId, revisionRef}`.
- `server/src/sequences/SequenceService.ts:51-67` — `apply()` receipt machinery: `SEQACT-<hash>` idempotency receipt keyed on `{actor, requestId}`; retries reuse, different content under the same requestId 409s.
- Client call shape precedent: `app/src/sequences/SequenceImport.tsx:22-23` — `sequenceApi('/actions', {operation:'save_sequence', requestId:row.requestId??(row.requestId=requestId()), sequence})`; `requestId()` at `app/src/sequences/api.ts:14-17` (12 random bytes hex); `sequenceApi` prefixes `/sequences` on `API_BASE` (`app/src/sequences/api.ts:22`).
- The import call the ISEQ-2 e2e exercises: SequenceSearch's Import button POSTing exactly this shape **"per ISEQ-1 spec §6 (not yet on disk)"** — including the residues-derived alphabet (`iupac_rna` for U-containing rRNA — ISEQ-1 §3.5/§11.4, load-bearing, do not "fix").

The review surface, quoted first-hand:

- `app/src/App.tsx:210` — `<Route path="/lab/sequences" element={<DeferredRoute><SequencesPage /></DeferredRoute>} />` (identical element at :209 for `/sequences`). **The route EXISTS** — RecordRegistryPage (:215, `/registry`) is NOT this surface. `/lab/sequences` does NOT go through `/lab/:category` (:206-207) — it is the dedicated SequencesPage route.
- `app/src/sequences/SequencesPage.tsx:26-27` — `const refresh=useCallback(async()=>{const data=await sequenceApi('/catalog');setRecords(data.records)},[])` + mount `useEffect` calling it → **a fresh navigation to /lab/sequences always re-reads the catalog**; NO post-import refresh wiring is needed across pages (the import happens on a different page; SequencesPage refetches on mount).
- `server/src/sequences/sequenceRoutes.ts:11-15` — `GET /sequences/catalog` lists kind `'sequence'` among its kinds and filters by read-ACL → a saved record is catalog-visible to its actor.
- `app/src/sequences/SequencesPage.tsx:108` — the Library nav pane: `aria-label="Search sequences"` filter input + one `<button>` per record where `payload.kind` is `sequence`/`oligo-spec`, rendering `r.payload.label` + `"<n> residues"`, filterable on `` `${r.payload.label} ${r.recordId}` `` → **the e2e's review assertion target** (label contains the accession `NR_028961`, and recordId is searchable).

The gap that IS real (verified): `SequencesPage.tsx:16` reads only ONE search param —
`const [search]=useSearchParams();...search.has('source')?'Import':'Editor'` — there is **no
`?record=` deep-link**: an imported recordId (which ISEQ-1 displays as text
"per ISEQ-1 spec §6") cannot open the record directly; the user must hunt it in the Library.

## §2 Genuine post-ISEQ-1 gaps — honest enumeration, smallest closing set

Checked against real code (post-ISEQ-1-merge state as specified in ISEQ-1 §6):

| Candidate gap | Verdict | Basis |
|---|---|---|
| Search surface, canonical card, Import button, recordId display | **CLOSED by ISEQ-1** (§6) — do not rebuild | ISEQ-1 spec §6 promises `sequence-canonical` testid, `Import as sequence record` button, recordId shown after import |
| Post-import list refresh at /lab/sequences | **NO GAP** — SequencesPage refetches catalog on every mount | SequencesPage.tsx:26-27 (first-hand) |
| Record visible/reviewable at /lab/sequences | **NO PRODUCT GAP** — route + catalog + Library pane all exist | App.tsx:210, sequenceRoutes.ts:11-15, SequencesPage.tsx:108 (first-hand) |
| e2e proving the whole chain against live NCBI | **GAP — IN SCOPE** | plan Task 4.1; `app/e2e/` listing at HEAD has NO `ingestion-sequences.spec.ts` (first-hand) |
| "Open the record" affordance from the import result | **GAP — IN SCOPE (smallest wiring)** — recordId is inert text; no `?record=` handling exists | SequencesPage.tsx:16 reads only `source` (first-hand) |
| Deep-link SELECTING the record in the editor | **GAP — closes with a 4-line effect** (see §4b) | same |

**The honest finding: only the e2e spec + the import-result→record link (+ its 4-line
`?record=` consumer) remain.** Everything else in the biologist story ISEQ-1 already delivers.
Do NOT invent more: no collections-on-import, no revision pins, no import history panel, no
/Lab-collection semantics (plan Risk "Import path" defers those explicitly).

## §3 Scope

IN (complete list — nothing else):
1. `app/e2e/ingestion-sequences.spec.ts` (NEW) — the headline live e2e (§4a).
2. `app/src/sequences/SequenceSearch.tsx` (EDIT, tiny) — after import, the recordId renders inside `<a data-testid="sequence-imported-link" href={`/lab/sequences?record=${recordId}`}>` alongside the existing text.
3. `app/src/sequences/SequencesPage.tsx` (EDIT, tiny) — honor `?record=`: after the first catalog load, if the param is present and matches a loaded record, select it (once).
4. RED tests for (2)/(3) in `app/src/sequences/SequenceSearch.test.tsx` (extend the ISEQ-1 file).

EXPLICITLY OUT:
- **Any diff under `server/`** — routes, service, schema, `sequenceSources.ts`, SOURCE_MAP, tools: ZERO-DIFF. **any save-path diff = instant reject.**
- Plan Phase 5 (`ncbi_sequence_ask`) / Phase 6 (pill-group split) — optional decisions, do NOT bundle.
- `BIO_SOURCES`, `inferAlphabet`, LiteratureExplorer, vendor-PDF workflow, SequenceImport, `api.ts`, playwright.config.
- No new dependencies, no new config, no NCBI key plumbing, no hardcoded model ids/keys (repo hard boundary, CLAUDE.md).
- No ontology/knowledge-layer changes (this item touches no claim/context/assertion surfaces — the canonical knowledge example is not in play).

## §4 The work

### (a) `app/e2e/ingestion-sequences.spec.ts` (NEW) — the headline e2e

Live-NCBI policy: this is THE one e2e allowed to hit NCBI (plan: "only one e2e spec may hit NCBI
live" — ISEQ-1's `ingestion-pills.spec.ts` does not). **Do NOT stub `/api/biosource/**` or
`/api/sequences/**` in this spec** — route-mocking the backend makes it a fake headline (the
`page.route` mocking in `app/e2e/sequence-chat-scroll.spec.ts:25-40` is that spec's pattern, NOT
this one's). 429 policy: wait ≥10 s, re-run ONCE; if it persists report the real HTTP status and
fall back to ISEQ-1's §10 curl probes + mocked suites as honest evidence — never stage a pass.

Spec content (adapt SELECTORS to the merged SequenceSearch first — do not trust these blindly):
1. `page.goto('/ingestion/sequences')`; assert the Sequences tab body renders.
2. Fill the query input with `16S F Prausnitzi` (the verbatim typo — this tolerance IS the product claim, ISEQ-1 §3.2); click Search.
3. `expect(getByTestId('sequence-canonical')).toContainText('NR_028961')` and `'16S ribosomal RNA'` — timeout ≥30 s (two-pass esearch + esummary over the wire).
4. Click `Import as sequence record` in the canonical card; await the import message; **capture the recordId from the message/DOM with a regex** `/SEQ-[0-9a-f]+/` (ids come from `SequenceService.ts:69` — content hash incl. fresh requestId, so they are NEW on every run: assert the CAPTURED id, never totals/counts).
5. Assert the new affordance: `a[data-testid="sequence-imported-link"]` with `href` containing the captured recordId (§4b).
6. `page.goto('/lab/sequences')`; type the accession (`NR_028961`) into `aria-label="Search sequences"`; assert a Library button appears containing `NR_028961` — this is "record appears" per the verbatim criterion; screenshot `tmp/ingestion-sequences-record.png`.
7. Deep-link leg: `page.goto('/lab/sequences?record=' + capturedId)`; assert no error banner and the record is selected (assert whatever non-brittle editor-surface truth the merged SequenceEditor exposes — if none is robust, this leg is browser-gate-only and the e2e stops at the library assertion; say which you did).
8. `test.use({ viewport: 1440x900, ...(process.env.CL_CHROMIUM_PATH ? {launchOptions:{executablePath: process.env.CL_CHROMIUM_PATH}} : {}) })` — mirror `app/e2e/sequence-chat-scroll.spec.ts:3-6` (first-hand).

Run ALWAYS: `PLAYWRIGHT_BASE_URL=http://localhost:5192 npx playwright test ingestion-sequences --project=chromium` (from `app/`). Without the env var the config default is **http://localhost:5174 — Brad's MAIN dev stack, never point a write-doing e2e at it** (`app/playwright.config.ts:10` first-hand); bare runs collect the firefox project which has no binary installed.

Identity note (first-hand): `POST /sequences/actions` requires an actor
(`sequenceRoutes.ts:10` → `LocalIdentityService.resolveRequestUser`); with no
`x-cl-session`/`x-user-id` header the server falls back to `ensureLocalAdminUser()`
(`server/src/security/LocalIdentityService.ts:153-169`). If the lane admin is credential-set and
a bare browser 401s, the honest fix is the existing login/user-picker surface
(`cl.currentUserId` / `cl.sessionToken` localStorage keys, `app/src/shared/api/base.ts:27-60`)
or the seeded lane user — set it via `addInitScript` with the REAL observed user id and name it
in the report. NEVER add product auth code for this.

### (b) The minimal wiring (only if §5's browser-gate-free RED passes at merge — see OQ1)

`SequenceSearch.tsx` (per ISEQ-1 §6 the post-import UI is `<p>Imported: {id}</p>`-shaped text):
wrap the id in `<a data-testid="sequence-imported-link" href={`/lab/sequences?record=${id}`}>Open in Sequences</a>` (keep the existing text).

`SequencesPage.tsx` — 4-line effect (anchors first-hand: `search` const :16, `records`/`selected` state :17, mount effect :27):
```tsx
// after the mount useEffect (:27)
const deepLinkRef = useRef(false)
useEffect(()=>{ if(deepLinkRef.current||!records.length) return
  const target=search.get('record'); if(target&&records.some(r=>r.recordId===target)){deepLinkRef.current=true;setSelected(target)} },[records,search])
```
Behavior-preserving: existing `?source=` → Import-tab behavior (:16) untouched; selecting via
`setSelected` directly on fresh mount bypasses `editorRef.canLeave()` (which guards *leaving* a
dirty editor — nothing is dirty at :27 on a cold load). RED-first: assert in
`SequenceSearch.test.tsx` that after a stubbed-import the link exists with the href (RED: the
testid is absent pre-change); the SequencesPage effect is e2e/browser-gate covered (no
`SequencesPage.test.tsx` exists at HEAD — creating one would mock the entire workspace API
surface for 4 lines; say so in the report, don't smuggle a bigger harness in).

## §5 Baselines — re-measured FIRST-HAND by the composer at 406d4376 (my own runs)

| Check | Exact command | MY measured result |
|---|---|---|
| server types | `npm run typecheck -w server` (repo root) | **0** `error TS` lines |
| app types | `npm run typecheck -w app` (repo root) | **23** `error TS` lines (matches carried "app tsc baseline 23") |
| server sequences suite | `cd server && npx vitest run src/sequences` | **8 files passed; 58 passed / 2 skipped (60)** |
| app unit (full) | `npm run test:unit -w app` (repo root) | **Test Files 59 failed / 281 passed (340); Tests 65 failed / 2226 passed (2291)**; fail-file list: `npm run test:unit -w app 2>&1 \| grep -E ' FAIL ' \| awk '{print $2}' \| sort -u \| wc -l` → **59** |
| app sequences+ingestion neighborhood | `cd app && npx vitest run src/sequences src/ingestion` | **19 files: 1 failed / 18 passed; 2 failed / 130 passed** — the ONE fail is `src/ingestion/VendorPdfReviewPage.treeSelect.test.tsx` (pre-existing, member of the 59-file baseline). `src/sequences/SequenceChat.test.tsx` alone: 5 passed |
| lane stack health | `curl -s -o /dev/null -w '%{http_code}' :3092/api/health`, `:5192/` | **200 / 200** |

**cwd trap (carried):** server vitest from repo ROOT false-fails (oligoOrderAiRead ENOENT) — always `cd server &&`.

**Baseline shift the coder MUST account for:** after the ISEQ-1 merge the app fail-file baseline is
**60** (ISEQ-1 §7 adds `app/e2e/ingestion-pills.spec.ts`, collected by vitest by design). ISEQ-2
adds exactly ONE more collected e2e file → the honest terminal number is **61 failed files, zero
other flips**. Claiming "fully green" is a lie; claiming 59 post-ISEQ-1 is a stale-baseline lie.

**FIRST TARGETED CHECK** (run this before writing any code, against the post-ISEQ-1 merged stack):
```
curl -s "http://localhost:3092/api/biosource/ncbi_nucleotide/search?q=16S%20F%20Prausnitzi&canonicalOnly=true" | head -c 300   # expect "accession":"NR_028961","canonical":true
curl -s "http://localhost:3092/api/sequences/catalog" | head -c 120                                                              # expect 200-shaped {"records":... (NOT an auth error)
```
If the search probe misses NR_028961 or the catalog 401s, stop and report — the story cannot be
e2e'd against a broken or mis-authed surface.

## §6 Verification gates (commands + expected outputs)

```
cd app && npx vitest run src/sequences/SequenceSearch.test.tsx                     # all passed (ISEQ-1 tests + your new link test)
npm run typecheck -w app                                                           # exactly 23 error TS — not 22, not 24
npm run typecheck -w server                                                        # 0 error TS (server is zero-diff; any rise = you touched server, revert)
cd server && npx vitest run src/sequences                                          # 8 files, 58 passed | 2 skipped — byte-identical, you changed nothing here
PLAYWRIGHT_BASE_URL=http://localhost:5192 npx playwright test ingestion-sequences --project=chromium   # (from app/) PASS + app/tmp/ingestion-sequences-record.png reviewed
npm run test:unit -w app 2>&1 | grep -E 'Test Files|Tests ' | tail -2              # fail-file count ≤ 61 (= post-ISEQ-1 60 + THIS spec), no other file flips
git -c core.fileMode=false diff --name-only <base>..HEAD | grep -E '^server/|^schema/' || echo "ZERO-SERVER-DIFF OK"   # must print ZERO-SERVER-DIFF OK
```
429 on the live leg: wait ≥10 s, re-run once; persistent → report real status, evidence = ISEQ-1
§10 curls + mocked suites; do not fake.

## §7 Worker contract

- Worktree `/mnt/vast/home/brad/git/wt/ISEQ-2-lane1-l1t<ts>`, branch `wt/ISEQ-2-lane1-l1t<ts>` off the **post-ISEQ-1-merge** `cl/integration-1` trunk (base HEAD recorded in the report; §"ISEQ-1 STATUS" on-disk confirmation is the first action).
- Lane-sync convention (OLIGO-AI-2/3, ISEQ-1 proven): root `node_modules` symlink → `cl-integration-1/node_modules`, `server/schema` symlink, `schema/*` lane-exclude REAL COPIES.
- Report (unique): `/home/brad/.hermes/cl/lanes/1/iseq-2-report-l1t<ts>.md`, ending marker `ISEQ-2 CODER DONE <sha>`.
- Every git command `git -c core.fileMode=false ...` (NFS fakes ~2550 modified files otherwise); NEVER `git add -A`; never blanket pkill; :3001/:5174/:3093/:5193 never touched (lane-stack :3092/:5192 restart = orchestrator's job).
- No new dependencies. No `.pdf`/binary in any commit.

RED-first commit sequence (exact add-paths and messages):
- **C1 RED** — `git add app/src/sequences/SequenceSearch.test.tsx` → commit `test(sequences): RED — imported record must link into /lab/sequences deep-link (?record=)`. Must fail on the absent `sequence-imported-link` testid.
- **C2 GREEN** — `git add app/src/sequences/SequenceSearch.tsx app/src/sequences/SequencesPage.tsx` → commit `feat(sequences): import result opens the record in /lab/sequences — deep-link affordance, catalog-selection on arrival`. Gate: C1 test green, app tsc 23, SequenceChat/SequenceEditor neighborhood unchanged.
- **C3 e2e** — `git add app/e2e/ingestion-sequences.spec.ts` → commit `test(e2e): headline 16S F Prausnitzi search -> canonical RefSeq import -> record visible in /lab/sequences (live NCBI)`. Run with `PLAYWRIGHT_BASE_URL=http://localhost:5192 ... --project=chromium`; paste the real duration + the captured SEQ- id into the report.

## §8 Reviewer bait (adversarial probes for this item)

1. **Save-path sneak / any server diff = INSTANT REJECT.** `git diff --name-only base..HEAD` must contain ZERO `server/` paths. A "convenient" tweak to SequenceService/route/schema/sequenceSources is an immediate reject regardless of test color.
2. **Mocked-headline fakeout**: the e2e stubbing `/api/biosource/**` or `/api/sequences/**` via `page.route` proves nothing and is the most likely shortcut. The e2e must hit the real lane backend; a report that can't name the real wall-clock of the NCBI round-trip or the captured SEQ- id is staging.
3. **Wrong-base playwright**: report command lacking `PLAYWRIGHT_BASE_URL=http://localhost:5192` (default is :5174 = Brad's main stack — a write-e2e against :5174 is a sev-1) or omitting `--project=chromium` (bare runs die on the missing firefox binary — "firefox fails" is not a product finding).
4. **Count-based assertions**: asserting "library has N records" or reusing a hardcoded SEQ- id — ids are requestId-seeded content hashes (`SequenceService.ts:69`, first-hand) and every run accumulates a NEW record; the spec must capture the id from the import message and assert that one.
5. **Typo softening**: changing the query to correctly-spelled `prausnitzii` sidesteps the verbatim story; `16S F Prausnitzi` (missing i) is REQUIRED — it's the acceptance query (ISEQ-1 §3.2 wildcard-correction is the product).
6. **Baseline lies**: claiming app `test:unit` fully green (it's 59/60-red at baseline by design) or reporting fail-files ≠ 61 without naming why; app tsc ≠ 23; server tsc ≠ 0.
7. **SequencesPage behavior drift**: the `?record=` effect must not alter `?source=` → Import-tab routing (`SequencesPage.tsx:16`), must fire ONCE (guard ref) and must not steal selection after the user picks another record (`deepLinkRef` pattern); a re-firing effect that fights the Library buttons is a defect.
8. **exactOptionalPropertyTypes site**: `search.get('record')` returns `string | null` — never `setSelected(search.get('record'))` unguarded; app tsc must stay at exactly 23, so a naive `setSelected(params)` either 400s the union or "fixes" baseline — both rejectable.
9. **YAML-reload trap (non-applicable but check)**: nothing here touches schema/YAML; if the report claims a lane-stack restart was "needed", question it — no config files moved.
10. **Hardcode boundary**: no NCBI key, no `api_key=`, no hardcoded base URLs anywhere in the new spec/wiring (the e2e reads `PLAYWRIGHT_BASE_URL` like every sibling spec).
11. **Deep-link scope creep**: turning "open the record" into collections/pins/import-history panels is unrequested scope (§2 table) — the closing set is the link + the 4-line effect.
12. **401 theater**: if the import 401s on the lane stack, the fix is the existing identity surface with a REAL seeded user id named in the report — not product auth code, not a header hardcoded into `api.ts`.

## §9 BROWSER GATE (owed — this item is the UI story itself)

On the lane UI **:5192** ONLY (NEVER :5174/:3093/:5193/:5173-anything), against a stack confirmed
serving the merged revision. Receipts to `/home/brad/.hermes/cl/receipts/ISEQ-2/<ts>/`:
1. `/ingestion/sequences` — initial state (pills + canonical toggle as merged per ISEQ-1).
2. `/ingestion/sequences` searched: `16S F Prausnitzi`, Canonical RefSeq card showing NR_028961 (429-tolerant: screenshot whichever is real, retry once after 10 s — never stage).
3. Post-import state: `Imported ... as SEQ-...` + the new **Open in Sequences** link visible.
4. `/lab/sequences` after clicking that link: Library pane (searched for NR_028961 if needed) AND, for the deep-link leg, the same URL showing the record selected/open in the editor — full-page crop proving it.
5. Reload of `/lab/sequences` showing the NR_028961 Library button (the reviewable-record proof, matching the e2e's assertion).
Verdict language: `VERDICT: accept|reject` per state. A card that shows dnaJ garbage, an import
message with no SEQ- id, or a /lab/sequences that cannot surface the record = automatic reject.

## §10 Open questions (composer could not resolve locally; defaults stated)

- **OQ1 — Is the 4-line `?record=` effect worth touching SequencesPage at all?** Checked: the plan's "do not touch /sequences workspace internals" line, but the task-list itself says "per plan Phase 4 (IngestionPage/SequenceImport **wiring**)" and `SequencesPage.tsx:16` reads only `?source` (first-hand) — without the effect, "open the record" is only "arrive at /lab/sequences and hunt". Default: SHIP the effect (§4b). Downgrade option for the orchestrator: plain `<a href="/lab/sequences">` link, zero SequencesPage diff, e2e drops leg 7.
- **OQ2 — Should the e2e hard-fail or soft-skip on NCBI 429?** Default: HARD FAIL with one re-run (a skip-that-skips is how e2e evidence dies silently); ISEQ-1 §10 curls + mocked suites remain the declared fallback evidence with honest labeling. Checked: playwright config has `retries: 0` (`app/playwright.config.ts:7`) — do not change config for this.
- **OQ3 — Lane identity for the live import.** Checked first-hand: `sequenceRoutes.ts:10` actor requirement, `LocalIdentityService.ts:97-169` fallback chain, `base.ts` localStorage keys; no e2e at HEAD does a live authenticated write (sequence-chat-scroll mocks everything), so there is no proven pattern to copy. Default: bare-browser fallback to local-admin; if 401, `addInitScript` the REAL seeded lane user named in the report. Whether the lane admin is credential-set is NOT locally resolvable without mutating lane state — the §5 first-targeted-check catalog curl is the pre-flight.

COMPOSER-DRAFT-END l1t0715
