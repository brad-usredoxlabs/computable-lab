# SPEC DRAFT (l1t0335) — ISEQ-1: NCBI Nucleotide/Protein search tools + Sequences ingestion tab + pill contrast fix (plan Phases 1–3)

Composed against trunk `cl/integration-1` @ **406d437676592902b570cdeab13961eeeecc4292** (verified first-hand: `git -c core.fileMode=false -C /mnt/vast/home/brad/git/cl-integration-1 rev-parse HEAD`). Every path:line below was read first-hand by the composer at this HEAD; no scout screening is relied on. All live eutils probes below were run by the composer against `https://eutils.ncbi.nlm.nih.gov` (no API key) and are quoted from actual responses.

Task-list acceptance criteria (verbatim, `/home/brad/.hermes/cl/lanes/1/task-list.md`, id ISEQ-1):
> Live probe: GET /api/biosource/ncbi_nucleotide/search?q=16S%20F%20Prausnitzi -> NR_028961; tool tests green with stubbed fetch; pill contrast browser receipt on :5192 (dark theme, before/after screenshots); browser gate on /ingestion, VERDICT: accept.

Goal (one sentence): give the lab a real NCBI Nucleotide/Protein search tool reachable through the biosource proxy, mount it as a top-level Sequences ingestion tab whose canonical-RefSeq pin surfaces NR_028961 for "16S F Prausnitzi", and make the source pills legible on the default dark theme — reusing the existing `save_sequence` save path untouched.

---

## §1 Anchors — tool-registration precedent (verified at HEAD)

- `server/src/mcp/tools/dualRegister.ts:21-46` — `dualRegister(server, registry, name, description, zodShape, handler)`: registers with the McpServer via `server.tool(name, description, zodShape, handler)` (line 30) and, when `registry` is present, with the ToolRegistry using `z.toJSONSchema(z.object(zodShape))` (lines 33-44). The registry wrapper calls `handler(args as any, {} as never)` — **no zod validation on the registry path** (line 41). Anything dualRegistered is automatically callable by the AI chat panel.
- `server/src/ai/ToolRegistry.ts:20-45` — `ToolEntry {name, description, inputSchema, handler}`; `register(entry)` (line 33), `get(name)` (line 38).
- `server/src/mcp/tools/index.ts:55` — `registerNcbiTools(server, registry);` inside `registerAllTools` — the new tools land inside the same `registerNcbiTools` body, zero wiring changes needed.
- Harness shape: `server/src/mcp/tools/ExaTools.test.ts` — `vi.stubGlobal('fetch', fetchMock as typeof fetch)` (line 52), fresh `new ToolRegistry()` + `new McpServer({name:'test',version:'0.0.0'})` (lines 54-55), register, then pull the tool out with `registry.get(name)` (line 58) and `await tool!.handler({...})`; parse `result.content[0].text` as JSON (lines 65-67); `afterEach(() => vi.restoreAllMocks())` (line 34). Copy this shape exactly; **fetch must be stubbed — no unit test hits eutils**.
- Biosource wiring: `server/src/api/handlers/BiosourceHandlers.ts` — `SOURCE_MAP: Record<string, SourceMapping>` at lines 22-30 (`ncbi_gene` is line 29); route registration `GET /biosource/:source/search` and `/fetch` at `server/src/api/routes.ts:1101-1102`; handlers constructed at `server/src/server.ts:1024` (`createBiosourceHandlers(toolRegistry)`), passed in at :1573. A new source kind requires ONLY: `SOURCE_MAP` entries (search + fetch tool names) — `VALID_SOURCES` (BiosourceHandlers.ts:32) derives from `Object.keys(SOURCE_MAP)`.
- **No BiosourceHandlers test exists at HEAD** (verified: `grep -rln biosource server/src --include='*.test.ts'` → no hits). The proxy test is net-new.

The registration pattern the new tools must follow: inside `registerNcbiTools` (`server/src/mcp/tools/ncbiTools.ts:96`), reuse the file's existing helpers `esearch` (:80), `esummary` (:85), `withTimeout` (:90), and `jsonResult`/`errorResult` from `server/src/mcp/helpers.js` (imported at :13). Register `ncbi_nucleotide_search` and `ncbi_protein_search` via `dualRegister` exactly like `ncbi_gene_search` (:220-283).

## §2 Anchors — the organism `[object Object]` bug (verified live on the LANE stack)

Current code, `server/src/mcp/tools/ncbiTools.ts:263`:
```ts
            organism: String(doc.organism?.valueOf() ?? ''),
```
`valueOf()` on an object returns the object itself, so `String(...)` renders `[object Object]`. **Reproduced first-hand at HEAD on the lane backend**: `curl -s "http://localhost:3092/api/biosource/ncbi_gene/search?q=EGFR&limit=1"` → `{"geneId":"149085364",...,"organism":"[object Object]"}`. Root cause confirmed against live eutils: gene-db esummary returns `organism` as an OBJECT: `{"scientificname":"Homo sapiens","commonname":"human","taxid":9606}` (composer probe, `esummary.fcgi?db=gene&id=1956`). NOTE: the **nuccore** esummary `organism` field is a plain string (verified live: uid 265678656 → `"organism":"Faecalibacterium prausnitzii"`) — the new tools may use `String(doc.organism ?? '')` safely, but the GENE fix must handle the object.

Minimal fix (in scope for ISEQ-1, at ncbiTools.ts:263):
```ts
organism: doc.organism && typeof doc.organism === 'object'
  ? String((doc.organism as { scientificname?: unknown }).scientificname ?? '')
  : String(doc.organism ?? ''),
```
RED-first: add a gene-arm test (stubbed esummary returning the dict shape above) asserting `organism === 'Homo sapiens'`. Do not touch anything else in `ncbi_gene_search`.

## §3 Verified corrections to the plan's hypothesis (COMPOSER LIVE PROBES — load-bearing)

The plan (`.hermes/plans/2026-10-11_112222-ingestion-architecture-sequences.md`) is background, not fact. Its Task 1.2 term-building FAILS the verbatim acceptance probe. Composer probes at HEAD, all real eutils responses (no key):

1. **Taxonomy abbreviation resolution does not work.** `esearch db=taxonomy term="F Prausnitzi"` → `count 0, errorlist.phrasesnotfound:["F","Prausnitzi"]`. Also `"F prausnitzii"` (correct spelling, lowercase) → `count 0`. Quoted and wildcarded variants (`"F prausnitzi*"[All Names]`, `"F*"[All Names] AND "prausnitzi*"[All Names]`) → all `count 0`. The taxonomy `All Names` index does not match one-letter genus abbreviations at all. **The plan's `resolveOrganism` taxonomy round-trip is dead code — drop it** (OQ1).
2. **The acceptance query has a typo ("Prausnitzi", missing an i) and it must still work.** Field-qualified exact term `16S[Title] AND Prausnitzi[Title]` → `count 0, phrasesnotfound:["Prausnitzi[Title]"]`. But the **wildcard** term `16S[Title] AND Prausnitzi*[Title]` → Entrez spelling-correction expands `prausnitzi*` → `prausnitzii[Title] OR prausnitzii strain[Title]` → `count 822`. So title terms must be emitted as `word*[Title]`.
3. **`q=16S%20F%20Prausnitzi` WITHOUT `canonicalOnly` still must surface NR_028961** (verbatim criterion). Unfiltered wildcard search → `count 822`, and the first 10 ids (`3379869005, 3366455522, ...`) do NOT contain 265678656/NR_028961. But `16S[Title] AND Prausnitzi*[Title] AND refseq[filter]` → **`count 1, idlist:["265678656"]`** → esummary: `caption NR_028961, organism "Faecalibacterium prausnitzii", taxid 853, slen 1462, sourcedb "refseq", biomol "rRNA"` (all verified live). Therefore the tool must run a **two-pass esearch** (§5): a refseq-filtered pass whose hits are pinned canonical-first, plus the general pass (unless `canonicalOnly=true`, then refseq pass only). Without this design the verbatim probe cannot pass deterministically.
4. **`ncbi_sequence_fetch` db enum is `'nucleotide' | 'protein'`** (ncbiTools.ts:291), NOT `nuccore`/`protein` — the search tool's internal db (`nuccore`) and the fetch tool's db argument (`nucleotide`) differ; the SOURCE_MAP fetch wiring must use the fetch tool's vocabulary (§5c).
5. **Do NOT import via `GET /sequences/source`** (`server/src/sequences/sequenceRoutes.ts:34` → `fetchSequenceSource`): `server/src/sequences/sequenceSources.ts:44` hardcodes `alphabet: db==='protein'?'protein':'iupac_dna'` for the ncbi arm — an rRNA record (NR_028961 residues contain U) would get `iupac_dna` and fail `normalizeSequence` against `config/sequence-analysis/alphabets.yaml:25` (iupac_dna has no U). SequenceSearch derives the alphabet itself from the fetched residues (§6). This is the plan's "alphabet trap" — the workspace values are `iupac_dna`/`iupac_rna`/`protein` (alphabets.yaml:25,59), never `dna`/`rna` (ncbiTools.ts:28-33 `inferAlphabet` — do not copy, do not "fix" it).

## §4 Scope

IN: Phases 1–3 of the plan — (1) `ncbi_nucleotide_search`/`ncbi_protein_search` dualRegistered tools + their stubbed-fetch tests; (2) the gene-db organism object fix (§2); (3) `/api/biosource/ncbi_nucleotide|ncbi_protein` search+fetch proxy wiring (SOURCE_MAP) + proxy passthrough test; (4) top-level Sequences tab on `/ingestion/` (`IngestionPage.tsx`, new `SequenceSearch.tsx`, types/client normalizer, canonical-RefSeq pin card, Import via the EXISTING save path); (5) SourceSelector pill contrast fix + the minimal LiteratureExplorer hardcoded-color fixes; contrast e2e.

EXPLICITLY OUT:
- **Plan Phase 4** (headline end-to-end e2e `ingestion-sequences.spec.ts`) — that is ISEQ-2; **Phase 5** (`ncbi_sequence_ask` Exa-composed query) and **Phase 6** (literature/database pill-group split) — explicit optional decisions, do NOT bundle.
- **No new save path.** Import MUST POST `POST /sequences/actions {operation:'save_sequence', ...}` exactly as `server/src/sequences/sequenceRoutes.ts:32` → `SequenceService.ts:70` already defines; mirror the existing call shape at `app/src/sequences/SequenceImport.tsx:23` (includes `requestId` from `app/src/sequences/api.ts`). Route, service, schema, alphabets.yaml: ZERO diffs.
- **No hardcoded model ids, API keys, or credentials** (repo hard boundary, CLAUDE.md). NCBI key policy, mirrored first-hand: existing ncbi tools read NO config/env at all — `EUTILS_BASE` is a plain const (`ncbiTools.ts:15`), no `api_key` param anywhere in the file. The Exa precedent (`server/src/integrations/exa.ts:85-92`): config `integrations.exa.apiKey` with env fallback `process.env.EXA_API_KEY`, surfaced via `appConfig`. **The acceptance probe does NOT require an NCBI key** — composer ran ~15 keyless eutils requests successfully (unauthenticated ceiling ≈ 3 req/s). Honest no-key behavior: search works; under burst NCBI returns 429 → tool returns `errorResult(...)` (proxy maps isError→502 `UPSTREAM_ERROR`, `BiosourceHandlers.ts:92-95`) — retry after ≥5 s. Adding key plumbing is OUT of scope; if ever added it MUST mirror the exa config+env pattern, never a hardcoded key.
- Vendor-PDF workflow, `/sequences` workspace internals, `LiteratureExplorer` extraction pipeline, `sequenceSources.ts`, `inferAlphabet`: untouched.
- Do NOT add `ncbi_nucleotide`/`ncbi_protein` to `BIO_SOURCES` (`app/src/types/biosource.ts:22-30`) — that would bolt two more pills onto the Literature tab (Phase 6 territory); see OQ3.

## §5 Phase 1 — backend tools (exact file paths)

Files in scope: `server/src/mcp/tools/ncbiTools.ts` (edit), `server/src/mcp/tools/NcbiNucleotideTools.test.ts` (NEW), `server/src/api/handlers/BiosourceHandlers.ts` (edit), `server/src/api/handlers/BiosourceHandlers.test.ts` (NEW).

(a) **Term building** inside a shared `registerSequenceSearch(server, registry, db: 'nuccore' | 'protein')` helper registered via `dualRegister` as `ncbi_nucleotide_search` / `ncbi_protein_search`, args `{ query: z.string(), organism: z.string().optional(), canonicalOnly: z.boolean().optional(), limit: z.number().optional() }`:
- title words = query words with length > 2 and not abbreviation-shaped (`/^[A-Z]\.?$/`), each emitted `${word}*[Title]` joined by ` AND ` — the `*` is REQUIRED (§3.2, Entrez spelling correction). Words ≤2 chars ("16S" is 3 and kept; "F" dropped) carry no signal.
- explicit `organism` arg: all-digits → `${taxid}[Taxonomy ID]`, else `"${organism}"[Organism:exp]`. NO taxonomy auto-resolution round-trip (§3.1, OQ1).
- `canonicalOnly === true` → term + ` AND refseq[filter]`, single search pass.
- otherwise **two-pass** (§3.3): refseq pass (`term AND refseq[filter]`, retmax min(limit,10)) first, then general pass (`term`, retmax limit); esummary the union of uids (one esummary call, ids comma-joined); dedupe by uid; canonical hits (`sourcedb === 'refseq'`) first, then general order; cap to `limit`; `total` from the general pass count. If the refseq pass errors or is empty, fall back gracefully to the general pass alone (a 429 on pass 1 must not fail the whole call).
- result rows: `{accession: caption, uid, title, organism: String(doc.organism ?? ''), taxId: doc.taxid ?? null, length: doc.slen ?? null, biomol, sourcedb, canonical: doc.sourcedb === 'refseq', url}` wrapped in `jsonResult({results, total, queryTranslation})`. Errors → `errorResult(...)`; `AbortError` → timeout errorResult; `finally { cleanup(); }` — mirror `ncbi_gene_search` (:228-282) structure verbatim.
- `exactOptionalPropertyTypes` is ON for the server (CLAUDE.md rule 6): never assign `args.organism = undefined`; build the args object conditionally.

(b) **Proxy search passthrough** — `BiosourceHandlers.ts`: add to SOURCE_MAP after :29:
```ts
  ncbi_nucleotide: { searchTool: 'ncbi_nucleotide_search', fetchTool: 'ncbi_sequence_fetch', fetchIdArg: 'accession', fetchArgs: { db: 'nucleotide' } },
  ncbi_protein:    { searchTool: 'ncbi_protein_search',    fetchTool: 'ncbi_sequence_fetch', fetchIdArg: 'accession', fetchArgs: { db: 'protein' } },
```
Add `fetchArgs?: Record<string, string>` to the `SourceMapping` interface (:15-20) and spread it in `fetch()` before the id assignment (data-declared in the map, not hardcoded in the branch — keeps the hard-boundary clean). In `search()`: widen the querystring type (:40) to `{ q?: string; limit?: string; organism?: string; canonicalOnly?: string }` and, after the existing limit block (:81-85), conditionally set `args.organism` (non-empty trimmed string) and `args.canonicalOnly = true` (only on `'true'`).

(c) The fetch arm routes to `ncbi_sequence_fetch` with `{accession, db}` (db from `fetchArgs`, §3.4). Returns `{accession, db, title, organism, length, sequence: FASTA text, url}` (ncbiTools.ts:343-351).

(d) **Tests** (`NcbiNucleotideTools.test.ts`, ExaTools.test.ts harness shape, fetch stubbed):
- nuccore arm: query `16S F Prausnitzi` (the typo, verbatim) — assert NO taxonomy call is made; assert a fetch to `db=nuccore` whose `term` contains `Prausnitzi*[Title]` AND a fetch whose term additionally contains `refseq[filter]` (two-pass); assert `results[0].accession === 'NR_028961'`, `canonical === true`, `organism === 'Faecalibacterium prausnitzii'`, `length === 1462` (stub shapes = the live esummary rows quoted in §3.3/§2 — real field names).
- `canonicalOnly: true` arm: exactly ONE esearch, its term contains `refseq[filter]`.
- protein arm registered: `registry.get('ncbi_protein_search')` defined; its esearch goes to `db=protein`.
- empty-results arm: `idlist: []` → `{results: [], total: 0}`, HTTP-safe.
- gene organism-object arm (§2): stub gene esummary with the real dict shape → `organism === 'Homo sapiens'` (RED before the :263 fix).
`BiosourceHandlers.test.ts`: fake registry with a recording fake `ncbi_nucleotide_search`; `createBiosourceHandlers(registry).search(request{params:{source:'ncbi_nucleotide'},query:{q:'16S F prausnitzii',canonicalOnly:'true'}}, reply)` → seen args `{query:'16S F prausnitzii', canonicalOnly:true}` (and `organism` ABSENT when not supplied — exactOptionalPropertyTypes), reply.code 200, parsed JSON body. Plus a fetch-arm test asserting `fetchArgs` reaches the fake fetch tool as `db:'nucleotide'`.

## §6 Phase 2 — Sequences ingestion tab

Files in scope: `app/src/types/biosource.ts`, `app/src/shared/api/biosourceClient.ts`, `app/src/ingestion/IngestionPage.tsx`, `app/src/ingestion/IngestionPage.test.tsx`, `app/src/sequences/SequenceSearch.tsx` (NEW), `app/src/sequences/SequenceSearch.test.tsx` (NEW), `app/src/sequences/SequencesPage.css` (append).

Tab machinery as it exists: `app/src/App.tsx:149-150` routes `/ingestion` and `/ingestion/:tab` to `IngestionPage`; the tab union is `type IngestionTab = 'vendor-pdf' | 'literature' | 'oligo-orders'` (`app/src/ingestion/IngestionPage.tsx:26`), `TABS` :28-32, body ternary :72 (`'oligo-orders' ? <SequenceImport orderOnly /> : 'vendor-pdf' ? ... : LiteratureExplorer`), body testid `ingestion-body-${active}` :71.

Changes:
- `biosource.ts`: extend the `BioSourceId` union (:5-12) with `'ncbi_nucleotide' | 'ncbi_protein'`; add `canonical?: boolean` to `BioSourceResult` (:32-42). Do NOT touch `BIO_SOURCES` (:22-30).
- `biosourceClient.ts`: extend `searchBioSource` (:11) with an optional 4th param `filters?: { organism?: string; canonicalOnly?: boolean }` setting the `organism`/`canonicalOnly` query params; add `case 'ncbi_nucleotide': case 'ncbi_protein': return normalizeNuccore(raw)` to the switch (:58-73) and a `normalizeNuccore` next to `normalizeNcbiGene` (:211) mapping `results[]` → `{source, sourceId: accession, title, subtitle: organism — N bp, url, canonical, badges:[accession badge]}`.
- `IngestionPage.tsx`: `type IngestionTab = 'vendor-pdf' | 'literature' | 'sequences' | 'oligo-orders'`; `TABS` gains `{ id: 'sequences', label: 'Sequences' }` between Literature and Primer/probe orders; lazy-import `SequenceSearch` (pattern of :22-24) and extend the body ternary (:72) with a `sequences` arm inside `<Suspense>`.
- `SequenceSearch.tsx` (NEW): source **pills** (own local config, NOT `BIO_SOURCES`) — `Nucleotide` (ncbi_nucleotide) / `Protein` (ncbi_protein) plus a `Canonical RefSeq only` toggle pill; a query input, organism input (optional), Search button (disabled below 2 chars); results list; a pinned **Canonical RefSeq card** (first `canonical` result, testid `sequence-canonical`) with an **Import as sequence record** button. Import flow, UNTOUCHED save path (§4): `fetchBioSourceDetail(db, accession)` → strip FASTA header lines → residues → `alphabet = db==='ncbi_protein' ? 'protein' : (/U/i.test(residues) ? 'iupac_rna' : 'iupac_dna')` (§3.5 — deliberate, NOT a bug) → `sequenceApi('/actions', { operation:'save_sequence', requestId: requestId(), sequence: { label, residues, alphabet, topology:'linear', source:{accession,url,retrievedAt} } })` mirroring `SequenceImport.tsx:22-23`. Show the returned `recordId` after import.
- CSS: append `.sequence-search__controls` / `.sequence-search__canonical` to `app/src/sequences/SequencesPage.css` using `var(--cl-success)` / `var(--cl-success-soft)` / `var(--cl-text)` tokens (tokens.css:22,29,38) — no raw hex except token fallbacks.
- Tests: `IngestionPage.test.tsx` — add `vi.mock('../sequences/SequenceSearch', ...)` next to the existing `vi.mock('../knowledge/LiteratureExplorer')` (:24) and a test rendering `/ingestion/sequences`, asserting `ingestion-body-sequences` + the mocked testid (existing harness: `renderAt` :38-57). `SequenceSearch.test.tsx` — stub `fetch` for search + fetch + save; assert the canonical card pins the canonical-flagged hit first and Import POSTs `operation:'save_sequence'` with `alphabet:'iupac_rna'` for a U-containing residue stub (this test is the executable fence against the §3.5 trap).

## §7 Phase 3 — pill contrast fix (the light-grey-on-light-grey defect)

Current BROKEN usage, `app/src/knowledge/literature/SourceSelector.tsx:37-55`:
```css
.source-pill { ... border: 1.5px solid var(--pill-color); background: white; color: var(--pill-color); ... }
.source-pill:hover { background: color-mix(in srgb, var(--pill-color) 10%, white); }
.source-pill--active { background: var(--pill-color); color: white; }
```
(`--pill-color` set inline from `BIO_SOURCES` colors, :21-23 — mid-blues `#1971c2`, `#364fc7`.) Hardcoded `white` fills + light-mid hue text on the app's DEFAULT DARK shell (`app/src/shared/styles/tokens.css:13` `.cl-app`, dark default, `--cl-bg: #0e1116` at :17) is the defect. Zero design tokens today.

Fix must use the actual token names (tokens.css, dark block :13-123, light override block :125-177): `--cl-bg` (:17/:128), `--cl-bg-elev` (:18/:129), `--cl-border` (:20/:131), `--cl-text` (:22/:133), `--cl-text-dim` (:23/:134), `--cl-on-accent` (:62 dark `#0e1116` / :151 light `#ffffff` — the token built for text-on-fill). Recommended pill CSS (keeps hue identity, guarantees fill/text separation in BOTH palettes):
```css
.source-pill { border: 1.5px solid color-mix(in srgb, var(--pill-color) 70%, var(--cl-border, #d0d7de));
  background: color-mix(in srgb, var(--pill-color) 14%, var(--cl-bg, #ffffff));
  color: color-mix(in srgb, var(--pill-color) 65%, var(--cl-text, #1f2328)); }
.source-pill:hover { background: color-mix(in srgb, var(--pill-color) 26%, var(--cl-bg, #ffffff)); }
.source-pill--active { background: var(--pill-color); color: var(--cl-on-accent, #0e1116); border-color: var(--pill-color); font-weight: 600; }
```
Note `--cl-on-accent` dark value is `#0e1116` (dark ink on the light pill hue) — NOT white; that inversion is exactly what the old code got wrong twice (`color: white` on light fills over dark bg).

Minimum-adjacent fixes (same visual defect, plan Task 3.2; anything beyond these is scope creep): `app/src/knowledge/LiteratureExplorer.tsx` — `.lit-explorer__title` `color: #212529` → `var(--cl-text, #212529)` (:378-382); `.lit-explorer__input` border `#dee2e6` → `var(--cl-border, #dee2e6)` + add `background: var(--cl-bg-elev, #ffffff); color: var(--cl-text, #1f2328)` (:392-398); `.lit-explorer__loading` `#868e96` → `var(--cl-text-dim, #868e96)` (:453). Leave the rest of the explorer CSS alone.

Contrast e2e: NEW `app/e2e/ingestion-pills.spec.ts` — go to `/ingestion/literature` on `PLAYWRIGHT_BASE_URL || 'http://localhost:5192'` (config `app/playwright.config.ts:4,10` — baseURL env respected; run ALWAYS `--project=chromium`, bare runs fail on the missing firefox binary), grab the NCBI Gene pill, parse computed `color` vs `backgroundColor`, assert channel-distance > 60, screenshot to `tmp/ingestion-pills.png`. NOTE (expected, call it out in the report): app/e2e/*.spec.ts files are collected by vitest and already constitute part of the 59-failing-file app baseline — adding this spec moves the app `test:unit` FAIL-FILE count 59 → 60 by design. The zero-NEW bar applies to non-e2e files.

## §8 Baselines — re-measured FIRST-HAND by the composer at 406d4376 (all from my own runs)

| Check | Exact command | MY measured result |
|---|---|---|
| server types | `npm run typecheck -w server` (repo root) | **0** `error TS` lines, exit 0 |
| app types | `npm run typecheck -w app` (repo root) | **23** `error TS` lines, exit 2 (matches carried "app tsc baseline 23") |
| server sequences suite | `cd server && npx vitest run src/sequences` | **8 files passed; 58 passed / 2 skipped (60)** |
| server handlers neighborhood | `cd server && npx vitest run src/api/handlers --reporter=basic` | **4 files failed / 47 passed (51); 5 failed / 374 passed (383)** — pre-existing fails incl. WorkspaceHandlers (2), ExtractHandlers (1), LabSettingsHandlers (2) (+1 timing-flaky appliance file observed in a second run — flaky, see bait) |
| ExaTools harness | `cd server && npx vitest run src/mcp/tools/ExaTools.test.ts` | **3 passed** |
| app unit (full) | `npm run test:unit -w app` (repo root) | **Test Files 59 failed / 281 passed (340); Tests 65 failed / 2226 passed (2291)** — pre-existing debt (e2e collection errors + event-editor/RawRecordEditor drift). FAIL-file list command: `npm run test:unit -w app 2>&1 \| grep -E ' FAIL ' \| awk '{print $2}' \| sort -u` → my run: 59 unique files |
| IngestionPage suite | `cd app && npx vitest run src/ingestion/IngestionPage.test.tsx` | **3 passed** |
| lane stack health | `curl -s -o /dev/null -w '%{http_code}' :3092/api/health`, `:5192/` | **200 / 200** |

**cwd trap (carried, reproduced by me):** running server vitest from the REPO ROOT produces false failures — `oligoOrderAiRead.test.ts` ENOENTs `/mnt/vast/home/brad/git/server/prompts/oligo-order-draft.md` and `IntentCompileFromPromptHandlers.test.ts` ENOENTs a mangled path. From `server/` both pass. Server suites MUST be run with `cd server &&`.

Bar for the coder: zero NEW failing files anywhere; sequences +3 files-worth stays zero-fail; `src/schema/` stays byte-baseline (3 files failed, 10 failed / 427 passed / 53 skipped — do not run it, do not touch it).

## §9 RED-first commit sequence (exact add-paths and messages; NEVER `git add -A`; every git command `git -c core.fileMode=false ...`)

- **C1 RED** — `git add server/src/mcp/tools/NcbiNucleotideTools.test.ts server/src/api/handlers/BiosourceHandlers.test.ts` → commit `test(tools): RED — ncbi_nucleotide/ncbi_protein contract (wildcard title terms, refseq pin, two-pass) + gene organism-object + biosource proxy passthrough`. Must fail on unregistered tools (`ncbi_nucleotide_search not registered`) and on `[object Object]`.
- **C2 GREEN** — `git add server/src/mcp/tools/ncbiTools.ts server/src/api/handlers/BiosourceHandlers.ts` → commit `feat(sequences): ncbi_nucleotide_search/ncbi_protein_search dualRegistered tools with RefSeq canonical pin; fix ncbi_gene organism [object Object]; expose via /api/biosource proxy`. Then `cd server && npx vitest run src/mcp/tools/NcbiNucleotideTools.test.ts src/api/handlers/BiosourceHandlers.test.ts src/mcp/tools/ExaTools.test.ts` all green; `npm run typecheck -w server` still **0**.
- **C3 RED** — `git add app/src/ingestion/IngestionPage.test.tsx app/src/sequences/SequenceSearch.test.tsx` → commit `test(ingestion): RED — Sequences tab + canonical RefSeq card + save_sequence-shaped import payload`.
- **C4 GREEN** — `git add app/src/sequences/SequenceSearch.tsx app/src/sequences/SequencesPage.css app/src/ingestion/IngestionPage.tsx app/src/types/biosource.ts app/src/shared/api/biosourceClient.ts` → commit `feat(ingestion): Sequences tab — NCBI nucleotide/protein search, canonical pin card, import via existing save_sequence`. `cd app && npx vitest run src/ingestion/IngestionPage.test.tsx src/sequences/SequenceSearch.test.tsx` green; `npm run typecheck -w app` back to exactly **23**.
- **C5 contrast** — `git add app/src/knowledge/literature/SourceSelector.tsx app/src/knowledge/LiteratureExplorer.tsx app/e2e/ingestion-pills.spec.ts` → commit `fix(ingestion): source pills + literature explorer use cl design tokens — readable in default dark theme (+ contrast e2e)`. (CSS-only token fix + e2e evidence; unit-RED is not meaningful for computed contrast — the e2e is the test.)

## §10 Verification gates (commands the coder runs, expected outputs)

```
cd server && npx vitest run src/mcp/tools/NcbiNucleotideTools.test.ts src/api/handlers/BiosourceHandlers.test.ts   # ALL passed, 0 failed
cd server && npx vitest run src/mcp/tools/ExaTools.test.ts                                                              # 3 passed (harness not broken)
cd server && npx vitest run src/sequences                                                                               # 8 files, 58 passed | 2 skipped — byte-identical arms + your new file if placed under src/mcp/tools
npm run typecheck -w server                                                                                             # 0 error TS
cd app && npx vitest run src/ingestion/IngestionPage.test.tsx src/sequences/SequenceSearch.test.tsx                      # all passed
npm run typecheck -w app                                                                                                # exactly 23 error TS (not 22, not 24 — no new, no "drive-by fix")
npm run test:unit -w app 2>&1 | grep -E 'Test Files|Tests ' | tail -2                                                   # fail-file count 59 -> 60 max (the ONE new e2e spec); no other file flips
PLAYWRIGHT_BASE_URL=http://localhost:5192 npx playwright test ingestion-pills --project=chromium    (from app/)          # PASS + app/tmp/ingestion-pills.png checked on the DARK shell
```
LIVE PROBE (after merge + lane-stack restart, NEVER against :3001/:5174/:3093/:5193):
```
curl -s "http://localhost:3092/api/biosource/ncbi_nucleotide/search?q=16S%20F%20Prausnitzi" | head -c 800
# expect: "accession":"NR_028961" present, "canonical":true, "organism":"Faecalibacterium prausnitzii"
curl -s "http://localhost:3092/api/biosource/ncbi_nucleotide/search?q=16S%20F%20Prausnitzi&canonicalOnly=true" | head -c 800
# expect: total 1, NR_028961 pinned
curl -s "http://localhost:3092/api/biosource/ncbi_gene/search?q=EGFR&limit=1" | head -c 300
# expect: "organism":"Homo sapiens" (or the fetched gene's scientificname) — NEVER "[object Object]"
```
On 429 (keyless ~3 req/s ceiling): wait ≥5 s, retry once; if NCBI is down, the mocked suites + §3 live probes in this spec are the honest evidence — say so in the report, do not fake a pass.

## §11 Reviewer bait (mutation probes for the adversarial gate)

1. **Wildcard stripped**: delete the `*` from `${word}*[Title]` → the verbatim typo probe returns count 0 (§3.2 verified live: `Prausnitzi[Title]` is `phrasesnotfound`). The typo-tolerance is the spec, not sugar.
2. **Single-pass sneak**: drop the refseq pre-pass → probe 1 (§10) returns 822 total with NR_028961 absent from the top 10 (§3.3 verified). The two-pass pin is required by the verbatim acceptance text.
3. **Taxonomy zombie**: re-adding the plan's `resolveOrganism` taxonomy lookup is DEAD code for abbreviations — verified count 0 for `F Prausnitzi`, `F prausnitzii`, and wildcard/quoted variants (§3.1). Any taxonomy esearch call in the handler is a defect.
4. **Alphabet flip**: `alphabet: 'dna'`/`'rna'` in SequenceSearch or importing via `GET /sequences/source` (`sequenceSources.ts:44` iupac_dna hardcode) → NR_028961 (U-containing rRNA) fails validation against `alphabets.yaml:25`. The residues-derived `iupac_rna` choice is load-bearing; the SequenceSearch unit test must pin it.
5. **`[object Object]` regression**: `String(doc.organism?.valueOf())` restored, or object-arm dropped → gene dict renders `[object Object]` again (§2 live repro on :3092). Nuccore-arm `String(doc.organism ?? '')` alone is NOT the fix (different shape, §2).
6. **exactOptionalPropertyTypes sites**: `args.organism = request.query.organism` without a presence guard, or `filters={{ organism: undefined }}` — server tsc (rule 6) must stay 0; proxy test asserts organism ABSENT, not undefined.
7. **fetchArgs hardcode**: `args.db = 'nucleotide'` special-cased in the fetch() body instead of the SOURCE_MAP `fetchArgs` data → violates the data-not-TS boundary; delete `fetchArgs` from the map → fetch 400s. ncbi enum check: fetch db is `'nucleotide'` (ncbiTools.ts:291), search db is `nuccore` — swapping them breaks the fetch arm.
8. **Token fakeout**: any raw hex surviving in SourceSelector beyond `var(--x, fallback)`, or `--cl-on-accent: white` in the dark block "simplification" — dark-mode active pill must use dark ink `#0e1116` (tokens.css:62).
9. **Pill-pollution**: adding nucleotide/protein entries to `BIO_SOURCES` (biosource.ts:22-30) silently grows the Literature tab pills (Phase 6 out of scope; §4).
10. **Save-path sneak**: any diff under `server/src/sequences/` (routes/service/schema) → instant reject; the ONLY save touchpoint is the client payload (§6).
11. **e2e baseline lie**: report claiming "app test:unit fully green" — it is 59-file-red at baseline (§8); the honest bar is zero-NEW + the +1 e2e file. MeasurementHandlers.applianceJob flake (slow-env timeout ~10 s) may flip run-to-run — re-run before blaming the diff.
12. **Key hardcode**: any `api_key=` param or literal key in the tool → hard stop (§4); keyless must remain the default path.

## §12 Worker contract

- Worktree: `/mnt/vast/home/brad/git/wt/ISEQ-1-lane1-l1t<ts>`, branch `wt/ISEQ-1-lane1-l1t<ts>` off lane trunk `cl/integration-1` (base must include the OLIGO-AI-3 merge — dispatch gate: fleet lock free AND OLIGO-AI-3 merged; deps [OLIGO-AI-3], dispatch per handoff 20261013T0300 §8/§Live-2).
- Lane-sync convention (OLIGO-AI-2/3 proven): root `node_modules` symlink → `cl-integration-1/node_modules`, `server/schema` symlink, `schema/*` lane-exclude REAL COPIES.
- Report (unique): `/home/brad/.hermes/cl/lanes/1/iseq-1-report-l1t<ts>.md`, ending marker `ISEQ-1 CODER DONE <sha>`. Commits per §9 sequence only; every git command `git -c core.fileMode=false ...`; never `git add -A`; never blanket pkill; :3001/:5174/:3093/:5193 never touched (lane stack :3092/:5192 restart via `cl-lane-stack.sh 1 restart` is the orchestrator's job post-merge).
- No new dependencies.

## §13 BROWSER GATE (owed: this item changes UI)

On the lane UI **:5192** (never :5174), against a stack serving the merged revision (confirm served checkout contains the merge sha first). Receipts to `/home/brad/.hermes/cl/receipts/ISEQ-1/<ts>/`:
1. **BEFORE** (if captureable pre-merge; otherwise cite this spec's §7 quote + plan complaint as before-evidence): `/ingestion/literature`, default dark theme, source pills — full-page + close crop of the unselected pills row.
2. **AFTER** same two framings on the merged revision, dark theme (verify `data-theme` absent ⇒ dark default): unselected pills (PubMed `#1971c2`, NCBI Gene `#364fc7` hues readable via color-mix), the ACTIVE pill with dark ink on hue, hover state, plus one light-theme (`data-theme='light'`) crop proving the tokens invert.
3. `/ingestion` — tab strip shows **Sequences** between Literature and Primer/probe orders; `/ingestion/sequences` initial state (pills Nucleotide/Protein, Canonical RefSeq toggle).
4. `/ingestion/sequences` searched state for `16S F Prausnitzi` (live NCBI; 429-tolerant — retry once after 5 s): Canonical RefSeq card visible with NR_028961 (or honest busy/error state if NCBI throttles — screenshot whichever is real, no staging).
5. `/ingestion/literature` title/input legible on dark (the §7 adjacent fixes).
Verdict language: `VERDICT: accept|reject` per state; a pill that reads grey-on-grey in any crop is an automatic reject.

## §14 Open questions (composer could not resolve locally; recommended defaults stated)

- **OQ1 — taxonomy abbreviation resolution: drop or keep-as-option?** Verified dead at the API level (§3.1: every abbreviation probe, correct spelling included, returns count 0). Default: DROP the taxonomy round-trip entirely; explicit `organism` arg covers the need (`[Organism:exp]` handles full names + taxids). Risk of keeping it: two wasted eutils calls per query that never resolve.
- **OQ2 — two-pass canonical pin vs default canonicalOnly=true.** The verbatim acceptance probe has NO canonicalOnly param, and unfiltered nuccore search for the query does not surface NR_028961 in the top 10 (§3.3, live). Default: two-pass pin (§5a) — deterministic, keeps GenBank hits visible below. Cost: one extra esearch call (≈0.3 s, still under the 3 rps keyless ceiling). Alternative rejected: defaulting `canonicalOnly=true` (hides non-RefSeq results users may want).
- **OQ3 — Sequences-tab pill config placement.** Plan reuses a `<select>`; the task-list wording says "source pills incl. nucleotide/refseq". Default: local pill config inside SequenceSearch (§6), `BIO_SOURCES` untouched, pill markup reusing the token-fixed `.source-pill` classes. If Brad wants these sources under a shared pill system, that is Phase 6's decision — do not pre-empt it here.

## §15 Out-of-scope reminders for the reviewer

Phases 4/5/6 (ISEQ-2, `ncbi_sequence_ask`, pill-group split), save-path changes, `sequenceSources.ts` alphabet hardcode (a real trap, a real separate defect — file it, don't fix it here), `inferAlphabet` in ncbiTools.ts, Literature tab pill count, NCBI key plumbing, schema/ ontology additions.

COMPOSER-DRAFT-END l1t0335
