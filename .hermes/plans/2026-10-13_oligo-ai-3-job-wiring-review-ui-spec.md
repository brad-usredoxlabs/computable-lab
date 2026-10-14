# SPEC DRAFT (l1t0040) — OLIGO-AI-3: wire the AI read into the job with provenance, review UI offers it honestly, real-Thermo-PDF e2e (plan Tasks 6-10)

Item: OLIGO-AI-3 — lane 1 task list (`~/.hermes/cl/lanes/1/task-list.md:3484-3504`).
Canonical plan: `.hermes/plans/2026-10-11_133742-oligo-order-ai-read-fallback.md` — **Tasks 6, 7, 8, 9, 10 ONLY**. Tasks 3-5 are OLIGO-AI-2 (in flight); Tasks 0-2 merged.
Base: trunk `/mnt/vast/home/brad/git/cl-integration-1` @ `cl/integration-1` HEAD `11aca57e` (OLIGO-AI-1 merge). Every path:line below was re-read first-hand at 11aca57e by the composer (no scout used). Every git command on this NFS mount: `git -c core.fileMode=false ...` (MANDATORY).

## 0. HARD STRUCTURAL GATE — this spec is written against a surface that does not exist on trunk yet

OLIGO-AI-3 depends on OLIGO-AI-2 (task-list `deps: [OLIGO-AI-2]`), which is IN FLIGHT. Its promoted spec is `.hermes/plans/2026-10-13_oligo-ai-2-ai-producer-fallback-spec.md`; every reference below to `readOligoOrderWithAi`, `readAiFallbackPolicy`, `aiReadTriggered`, `OligoAiReadClient`, the diagnostics `OLIGO_PARTIAL_READ` / `OLIGO_AI_READ_OFFERED`, or the `aiFallback:` config block is **per OLIGO-AI-2 spec (pending merge)** — none of it exists on trunk 11aca57e (verified: `grep -rn "aiFallback\|OLIGO_PARTIAL_READ\|readOligoOrderWithAi" server/src config` → zero hits at 11aca57e).

The coder's dispatch base MUST be a trunk HEAD that already contains the OLIGO-AI-2 merge. FIRST action at dispatch, before writing any code (structural gate, stop-and-report on failure):

    git -c core.fileMode=false log --oneline -5                       # OLIGO-AI-2 merge commit must be in history
    grep -n "readOligoOrderWithAi\|readAiFallbackPolicy\|aiReadTriggered" server/src/sequences/oligoOrderAiRead.ts
    grep -n "OLIGO_AI_READ_OFFERED\|OLIGO_PARTIAL_READ" server/src/sequences/oligoOrder.ts
    grep -n "aiFallback" config/sequence-analysis/oligo-order.yaml

If ANY of these miss, the base is wrong — report and stop, do not improvise the AI-2 surface. THEN re-baseline §7 at the dispatch HEAD (the §7 anchors below are composer-measured at 11aca57e; AI-2's merge will shift line numbers in `oligoOrder.ts`, `oligoOrder.test.ts`, and the config file — locate anchors by CONTENT, not by the numbers here).

## Goal (one sentence)

Turn OLIGO-AI-2's callable producer into a shipped fallback: `POST /sequences/order/:id/ai-read` runs `readOligoOrderWithAi` against the job's STORED extracted text and attaches its rows to the SAME job/bundle as honestly-marked `ai-draft` candidates through the SAME envelope builder and the SAME deterministic lowerer, the review UI offers it as ONE click only when the AI-2 trigger diagnostics say the deterministic read could not account for the document — proven end to end on Brad's real scanned Thermo PDF.

## 1. Acceptance criteria — verbatim from the task list (id OLIGO-AI-3, task-list.md:3484-3504)

    title: "Wire the AI read into the job with provenance, review UI offers it honestly, real-Thermo-PDF e2e (plan Tasks 6-10)"
    description: >-
      Task 6: AI read runs as an ingestion-job step with honest provenance (marked AI-read end to
      end). Task 7: route + wiring, model from /settings only. Task 8: the review UI offers the AI
      read (one click, from the zero/partial-rows diagnostic) and stays honest about what it is —
      no dead chrome, no silent substitution. Task 9: acceptance on a real Thermo PDF. Task 10:
      fixtures + regression pins.
    why: >-
      The whole campaign's thesis: deterministic parser = compiler, AI = second producer; the
      scientist always sees which producer made the draft.
    verified by: >-
      e2e on a real vendor PDF: deterministic read -> offer -> AI draft -> same review cards ->
      save path unchanged; provenance visible in job/records; browser gate on :5192,
      /ingestion/oligo-orders, VERDICT: accept.
    files: per plan Tasks 6-10 (job wiring, routes.ts, SequenceImport.tsx review card, fixtures).
    dispatch_gate: none beyond fleet lock; BROWSER GATE on :5192 (main-stack wording overridden).

## 2. Existing flow — verified seams at trunk 11aca57e (all first-hand)

Server:
- `registerSequenceRoutes(app, ctx, registry)` — `server/src/sequences/sequenceRoutes.ts:9` (3 params today; Task 7 adds a 4th options param). The `handle` wrapper at :11-13 maps `SequenceError.status` to the HTTP status (`server/src/sequences/SequenceService.ts:11` — `SequenceError(message, status = 422)`), so `new SequenceError(msg, 503)` is the in-family honest-unset precedent — and `server/src/sequences/sequenceSources.ts:38` (`throw new SequenceError(..., 503)` for an unavailable tool) is the exact same-file precedent the route's 503 copies.
- `POST /sequences/order` :35-40 → `ingestOligoOrder(ctx, user, filename, bytes)` (`server/src/sequences/oligoOrder.ts:67`). Envelopes built :86-93, saved via `service.save(env.payload, env.schemaId)` :94, response `{jobId, artifactId, sha256, candidates, text, diagnostics, message?}` :95. The artifact stores `text_extract.excerpt` AND `text_extract.method: 'local-ocr' | 'layout-text'` (:89) — THE existing provenance-vocabulary precedent; Task 6's candidate-level `extractedBy: 'ai-draft'` rides the SAME convention (and the candidate schema's `payload.additionalProperties: true` — `schema/ingestion/ingestion-candidate.schema.yaml:42-44` — means NO schema change is needed for provenance fields).
- `GET /sequences/order/:id` :41-47 — reads text from `artifact_refs` (:44) and lists candidates filtered by `job_ref.id === id && candidate_type === 'oligo'`, returning `{recordId, ...inner payload, status}` (:46). Because it spreads the INNER payload, `extractedBy`/`model`/`sourceQuote` added to the candidate payload reach the app through this endpoint UNCHANGED — reopen-after-AI-read needs zero route change.
- `buildIngestionCandidateEnvelope` — `server/src/ingestion/records.ts:162-194`: `recordId = compactId('ICD', candidateType + '-' + title)` (:175) — a same-title re-read COLLIDES; `SequenceService.save` (:36-43) returns the prior record when content-hash matches and throws 409 when it differs. `payload: input.payload` (:190) passes anything through.
- `ingestOligoOrder` already runs the local-OCR pass (oligoOrder.ts:70-84) when a PDF has no text layer and `config.ocr.enabled` — Brad's Thermo scans (below) take exactly that path.
- Runtime AI holder: `server/src/server.ts:985` `protocolIdeAiDeps = { current: {extractionService, llmClient, model?} | undefined }`; reset to `undefined` pre-init at :1086; filled at :1247-1251 inside `initializeAiRuntime` (right beside `createAiIngestionHandlers(inferenceClient, inferenceConfig.model, ctx.store)` :1244). Route registration call site: `server.ts:1530` `registerSequenceRoutes(instance, ctx, toolRegistry)` (inside the `/api` prefix plugin, so the route URL is `/api/sequences/...`).
- Honest-unset precedent for a missing AI endpoint: `server.ts:1361-1364` / :1381-1384 (`reply.status(503); {error:'AI_UNAVAILABLE', message: aiUnavailableMessage()}`, message text "AI is not configured. Open Settings and add provider, model, and API key." :1293-1300). The sequence route cannot see `aiUnavailableMessage` (it is closure-local); the plan's route-level `SequenceError('No AI endpoint is configured...', 503)` is the equivalent honest shape — keep the message ACTIONABLE in the same spirit (point at Settings).
- OLIGO-AI-2 surface the job function consumes (per OLIGO-AI-2 spec, pending merge): `readOligoOrderWithAi(text, { llmClient, model, maxContextChars, maxTokens, responseFormat }) => { rows, draft, error? }`, `readAiFallbackPolicy(config)`, budgets from the `aiFallback` block, ONE repair retry internal, Ajv-authoritative refusal via `error`, rows lowered ONLY via `oligoRowsFromDraft`. `ingestOligoOrder` already pushes `OLIGO_PARTIAL_READ` / `OLIGO_AI_READ_OFFERED` (the UI's offer trigger).

App (`app/src/sequences/SequenceImport.tsx`, 56 lines, verified whole):
- state block :5 (`jobId`, `rows`, `busy`, ...), `upload` :13-16 (sets rows/diagnostics/jobId + `sessionStorage 'cl-oligo-job'`), `reopen` :17 (re-reads via GET, `selected: r.status!=='published'`), the order-confirmation fieldset :38-42 (file input, reopen input, `diagnostics.map` render :40 — diagnostics ALREADY render with zero app change), row cards :43-52 (`issues` render :49, `raw` in a `<details>` :48), save :18-28 (candidateRef `promote_oligo` when `row.recordId` — AI candidates HAVE a recordId so they ride `promote_oligo` unchanged — the save path is genuinely untouched).
- `sequenceApi` (`app/src/sequences/api.ts`) prefixes `/sequences`, POSTs when a body argument is present. Pass `{}` (not `undefined`) for the ai-read POST — an empty-body POST confuses Fastify content-type handling; `{}` is a clean JSON POST.
- Mounts at `/ingestion/oligo-orders` via `app/src/App.tsx:150` (`/ingestion/:tab`) → `app/src/ingestion/IngestionPage.tsx:72` (`<SequenceImport orderOnly />`).
- App test precedent: `app/src/sequences/SequenceEditor.test.tsx:7` — `vi.mock('./api',()=>({draftApi:vi.fn(),sequenceApi:vi.fn()}))` with @testing-library/react under jsdom (`app/vitest.config.ts`). `app/tsconfig.json` has NO `exactOptionalPropertyTypes` (verified 0 matches).

The acceptance PDFs EXIST — no fixture must be invented: `/home/brad/Downloads/2026-10-11 11.{55,57,58,59} TINY SCANNER.pdf` are Brad's scanned Thermo Biosystems order documents (composer-verified: `extractPdfLayoutText` returns 1-5 chars — pure scans, zero text layer; host has `pdftoppm` + `tesseract`, so the config-gated local-OCR pass fires). Composer ran the real pipeline on `11.55` (1 page, 457 KB): OCR text (762 chars) contains `ORDER ID: 8493629`, four `N Pass <name> |<dye>-<bases>-QSY...` data lines, and `extractOligoRows` yields **4 rows, EVERY row carrying an issue** (OCR mangles the first label to `Zanumulumwm:Qu`; the dye tokens `Cyanine 5-` / `6FAM-` are NOT in the config modification table so they leak into `residues` — see OQ3). That means: upload of this PDF produces `LOCAL_OCR_REVIEW` + rows-with-issues, which per OLIGO-AI-2 spec fires the `any-issue` trigger → `OLIGO_AI_READ_OFFERED` renders → the button appears. The trigger story is REAL on the real document, end to end.

## 3. Never-hardcode / honest-provenance rules for this item (binding)

- The model comes from the settings-filled holder ONLY (`protocolIdeAiDeps.current.model`, server.ts:1247-1251). Zero model strings anywhere in the diff. The lane stack HAS AI configured (`lane1-config.yaml` `ai.activeProfile: qwen3.8-flash-OR`), so the browser gate exercises a real model; a missing/failed runtime must 503 honestly, never default.
- Trigger semantics stay in the YAML AI-2 shipped: the route/job code CONSUMES `readAiFallbackPolicy`/`readOligoOrderWithAi` and the AI-2 diagnostics; it adds ZERO trigger logic and ZERO new config keys (the `aiFallback` block is AI-2's file section — this item must not edit `config/sequence-analysis/oligo-order.yaml`; see §8 OUT).
- Vendor strings (`Thermo`, `Biosystems`, `Oformi_...`, `Akk_GA4_...`) appear ONLY in the Task 10 text fixture and test text, never in logic.
- Provenance rides EXISTING metadata surfaces (precedent §2: `text_extract.method`, `candidate.payload` free-form): `extractedBy: 'ai-draft'` + `model: <settings value>` on each AI candidate's payload — same spelling of the concept as the artifact's `method`, no new record kind, no schema edit, no ontology term. `OLIGO_AI_READ_PRODUCER = 'ai-draft'` exported as the single server constant; the app mirrors the literal with a comment (the app already mirrors `'iupac_dna'`, :15).
- No silent substitution: AI rows are ADDED alongside deterministic rows (the plan's own OQ3 default); no AI path deletes/overwrites a deterministic candidate; no code path writes a canonical `oligo-spec`/`sequence` — rows become candidates only, the user's save promotes (unchanged).
- No dead chrome: the "Read with AI" button renders ONLY when the current session's diagnostics include an AI-2 offer signal (`OLIGO_AI_READ_OFFERED` or `OLIGO_PARTIAL_READ`) AND a job id exists — never otherwise.

## 4. Task 6 — `aiReadOligoOrder` (job wiring + provenance), design decisions the plan left open

Add an exported function to `server/src/sequences/oligoOrder.ts` following the plan Task 6 snippet with these PINNED corrections (each is reviewer bait — do not "simplify" them back):

1. Read the job, then its FIRST artifact (`artifact_refs[0]`), take `text_extract.excerpt`; empty text ⇒ `SequenceError('No extracted text is stored for this document — scanned PDFs need the local OCR pass first.')` (honest, plan-verbatim).
2. Budgets come from `readAiFallbackPolicy(await sequenceConfig('oligo-order'))` (per AI-2 spec) — never literals in the producer call. Call `readOligoOrderWithAi(text, { llmClient, model, maxContextChars, maxTokens, ...(policy.responseFormat ? {responseFormat} : {}) })`. `read.error` ⇒ `SequenceError(read.error)` (the honest refusal rides the handle wrapper as 422, message quoting the real diagnostic).
3. Bundle: read the job's EXISTING bundle via `bundle_refs[0]` and pass its payload to `buildIngestionCandidateEnvelope` — do NOT fabricate `{ bundleType:'other' } as never` (the plan snippet's shortcut loses `bundle_ref` fidelity; the builder needs the real bundle payload for `createRecordRef(input.bundle.id, ...)`).
4. Candidate payload = `{ ...row, sha256, extractedBy: OLIGO_AI_READ_PRODUCER, model: deps.model, ...(sourceQuote ? {sourceQuote} : {}) }` where `sourceQuote` is zipped index-wise from `read.draft.rows[i].sourceQuote` (the lowerer's `OligoRow` has no quote field; the draft is the quote carrier and both are one-per-draft-row in order — assert `read.rows.length === read.draft.rows?.length` before zipping, and degrade honestly if a future change breaks the invariant). `sourceQuote` is what makes plan-Task-9-step-4 (human verification against the page) possible — dropping it is a defect.
5. `model` may be `undefined` per the holder type — with `exactOptionalPropertyTypes` ON (`server/tsconfig.json:13`) build the payload with conditional spread (`...(deps.model ? { model: deps.model } : {})`). `title = \`${jobId} AI row ${i+1}: ${row.label}\``.
6. NO `readAt` field: the store already stamps `createdAt` (`SequenceService.save` :45), so omitting a volatile timestamp makes a repeated identical read CONTENT-IDENTICAL, and `save` then returns the prior envelope (idempotent, :38-42) instead of 409-storming mid-loop. A second read that genuinely DISAGREES with the first hits the honest 409 `Record ... already exists with different content` — that is correct: two different AI reads of one job must not silently coexist (OQ1).
7. Response: `{ jobId, candidates: [...{recordId, ...payload}], diagnostics: [AI_READ_REVIEW warning naming the model + verify-every-base, and AI_READ_PARTICAL when draft.declaredRowCount > rows.length] }` per the plan snippet (the two codes `AI_READ_REVIEW` / `AI_READ_PARTIAL` are NEW diagnostic strings introduced HERE, distinct from AI-2's ingest-time codes — they describe the AI read's own outcome).
8. Rows compiler stays `oligoRowsFromDraft` transitively: `aiReadOligoOrder` calls `readOligoOrderWithAi` and NOTHING that normalizes bases (any `normalizeSequence`/`normalizeOligoRawBases` call in the new code is an instant reject — one compiler, two producers).

## 5. Task 7 — route + wiring (model from settings only)

Widen `registerSequenceRoutes` with a 4th parameter (defaulted so every existing caller/test compiles unchanged):

    export function registerSequenceRoutes(app, ctx, registry, options: { getAiDeps?: () => { llmClient: OligoAiReadClient; model?: string } | undefined } = {}) { ... }

New route beside `POST /sequences/order` (mirror :35-40 formatting):

    app.post('/sequences/order/:id/ai-read', handle(async request => {
      const user = await actor(request);
      const ai = options.getAiDeps?.();
      if (!ai) throw new SequenceError('No AI endpoint is configured. Set an AI model in Settings and try again.', 503);
      return aiReadOligoOrder(ctx, user, (request.params as {id:string}).id, ai);
    }));

At `server.ts:1530` pass `getAiDeps: () => { const c = protocolIdeAiDeps.current; return c ? { llmClient: c.llmClient as OligoAiReadClient, ...(c.model ? { model: c.model } : {}) } : undefined; }` — the SAME holder the protocol-ide streaming endpoint reads (server.ts:985/:1247), read lazily at REQUEST time so a settings change or `initializeAiRuntime` re-entry (reset at :1086) is always honored. No new holder, no eager capture, no hardcoded model. `OligoAiReadClient` is imported from `./oligoOrderAiRead.js` (structural type per AI-2 spec — do not import `InferenceClient` or `../server.js` values into sequenceRoutes beyond the existing `import type { AppContext }`).

## 6. Task 8 — the review UI offers it honestly

`app/src/sequences/SequenceImport.tsx` (keep the file's terse style):
- State: `const [aiBusy,setAiBusy]=useState(false)`; `const [aiNotice,setAiNotice]=useState('')`.
- Offer gate (NO dead chrome): derive `const offered = diagnostics.some(d=>d.code==='OLIGO_AI_READ_OFFERED'||d.code==='OLIGO_PARTIAL_READ')`; render the button ONLY when `offered && (jobId||sessionStorage.getItem('cl-oligo-job'))` and hide it once `aiNotice` is set for this session's job (one click; re-offering a row set that already answered the offer is chrome). The trigger codes are AI-2's DATA-driven diagnostics — the button literally appears "from the zero/partial-rows diagnostic" as the task demands.
- `aiRead()`: `sequenceApi(\`/order/${encodeURIComponent(id)}/ai-read\`, {})` — POST with `{}` body (§2). On success: NO-SUBSTITUTION merge — keep every deterministic row untouched, drop any row already carrying `extractedBy==='ai-draft'` (so a server-side idempotent repeat re-places only AI rows), then append the returned candidates mapped with `{selected:true,alphabet:'iupac_dna',topology:'linear'}`; append `data.diagnostics` with a Set-dedupe on `code` (second click must not stack `AI_READ_REVIEW`); `setAiNotice(\`${data.candidates.length} row(s) read by the AI. Verify every base against the PDF page before importing.\`)` rendered as `<p role="status">`. On error: `setError((e as Error).message)` — the api client surfaces the server's honest message verbatim (503/422 included).
- Row honesty in cards (:43-52): when `row.extractedBy==='ai-draft'` render `<p className="sequence-warning">AI read — verify against the PDF.</p>` and a `<details><summary>AI source quote</summary><pre>{row.sourceQuote}</pre></details>` (sibling of the existing `raw` details :48). `reopen()` needs NO change (GET spreads the payload, §2) — pin that with a test instead.
- Save path: ZERO change (§2 — AI candidates carry `recordId` and ride `promote_oligo`). Any diff touching `save()`/`/actions` is scope creep.

`app/src/sequences/SequenceImport.test.tsx` — NEW, mirror `SequenceEditor.test.tsx` (mock `./api`; jsdom): (a) no button before an upload/offer (dead-chrome negative); (b) upload via mocked `/order` returning an `OLIGO_AI_READ_OFFERED` diagnostic → button appears; (c) click → `sequenceApi` called with `'/order/<id>/ai-read'` and body `{}` → appended row renders `AI read — verify against the PDF.` and the notice appears, deterministic rows still present (no-substitution pin); (d) error path (`mockRejectedValue(new Error('No AI endpoint is configured...'))`) → error rendered, rows unchanged, button behavior sane; (e) reopen with an AI-marked candidate payload → the AI warning renders after reload.

## 7. §7 Baselines — composer-measured FIRST-HAND at 11aca57e (zero-NEW gate; RE-MEASURE every one at dispatch HEAD after the AI-2 merge, then again per commit)

| Check | Command (from the worktree) | Measured at 11aca57e |
|---|---|---|
| server types | `cd server && npx tsc --noEmit 2>&1 \| grep -c "error TS"` | **0** (stay 0) |
| app types | `cd app && npx tsc --noEmit 2>&1 \| grep -c "error TS"` | **23** (known; after this item stays 23, zero lines in touched files) |
| sequences suite | `cd server && npx vitest run src/sequences/` | **7 files, 49 passed / 2 skipped (51)** — after AI-2 merge re-quote; after THIS item: +N passed, zero failures |
| schema neighborhood | `cd server && npx vitest run src/schema/` | **PRE-EXISTING RED, byte-baseline: 3 files failed, 10 failed / 427 passed / 53 skipped (490)** (EventGraphSemanticKey/EventGraphEquipment/ProcurementSchemaContracts) — stays byte-identical; adding one is a reject |
| lane stack | `curl -s -o /dev/null -w '%{http_code}' localhost:3092/api/schemas; localhost:5192/ingestion/oligo-orders` | **200 / 200** at composer run; coder NEVER restarts/touches `:3092/:5192/:3001/:5174` |
| full server suite | `cd server && npx vitest run` (~4.5 min) | not composer-rerun (pre-existing drift known); optional, zero-NEW |

## 8. Files

IN scope (9):
1. `server/src/sequences/oligoOrder.ts` — EDIT: `export const OLIGO_AI_READ_PRODUCER = 'ai-draft'` + `export async function aiReadOligoOrder(...)` (§4). `ingestOligoOrder`/`extractOligoRows`/`normalizeOligoRawBases` byte-unchanged.
2. `server/src/sequences/sequenceRoutes.ts` — EDIT: options param + the `POST /sequences/order/:id/ai-read` route (§5). All existing routes byte-unchanged.
3. `server/src/server.ts` — EDIT: the ONE call site :1530 passes `getAiDeps` reading `protocolIdeAiDeps`. Nothing else in this file.
4. `server/src/sequences/oligoOrderAiReadJob.test.ts` — NEW: job-level tests on the `SequenceService.test.ts:16-24` harness (mkdtemp + recursive `loadAllSchemas` + `createRecordStore` + fake `AppContext`); ingest a `.txt` order, run `aiReadOligoOrder` with a stub client, assert persisted RECORDS via `ctx.store.get` (not just the response).
5. `server/src/sequences/sequenceRoutes.test.ts` — NEW: Fastify `inject` route test (precedent `server/src/api/handlers/ProtocolIdeHandlers.routes.test.ts:61-70`): `registerSequenceRoutes(app, fakeCtx, fakeRegistry, {getAiDeps})` inside an `/api`-prefixed plugin; fake `ctx.localIdentityService.resolveRequestUser → {userId:'USR-test'}`; arms: no-`getAiDeps` → **503 + actionable Settings message**, stub-deps POST → 200 + candidates, job-not-found → 422 honest message.
6. `app/src/sequences/SequenceImport.tsx` — EDIT (§6). `save()` untouched.
7. `app/src/sequences/SequenceImport.test.tsx` — NEW (§6).
8. `server/src/sequences/fixtures/thermo-biosystems-scan.txt` — NEW (Task 10): the extracted TEXT of the real failing document class — the local-OCR text of `/home/brad/Downloads/2026-10-11 11.55 TINY SCANNER.pdf` (composer-extracted: 762 chars, `ORDER ID: 8493629`, four dye-wrapped data lines, page break `\f` at end). Regenerate with: `cd /tmp && pdftoppm -r 200 -png "<pdf>" page && tesseract page-1.png stdout -l eng` (+ trailing `\f`). The PDF ITSELF is never committed (vendor document; SOP).
9. `server/src/sequences/oligoOrder.test.ts` — EDIT: Task 10 regression pins (§9).

EXPLICITLY OUT (a reviewer should reject any of these in this diff): `config/sequence-analysis/oligo-order.yaml` (AI-2's file section is hot; `aiFallback` edits, new modification patterns for 6FAM/Cyanine, ANY config change — see OQ3); `server/src/sequences/oligoOrderAiRead.ts` / `oligoOrderDraft.ts` / `server/prompts/*` / `schema/*` (AI-1/AI-2's surfaces; adding config keys or repair loops there is scope creep); `server/src/ingestion/records.ts` and `schema/ingestion/ingestion-candidate.schema.yaml` (provenance rides `additionalProperties:true`, no schema loosening needed — verified §2); the save/promote path (`SequenceService.ts`, `/sequences/actions`), `decodeAttachment.ts` and any dispatcher convergence (DOC-INGEST A2); `mode: auto` server-side auto-run (reserved by AI-2 spec, NOT implemented here); `app/src/ingestion/*` (mount untouched); OCR config keys; canonical `oligo-spec`/`sequence` schemas; `git add -A`; commits in `/mnt/vast/home/brad/git/computable-lab` or the trunk worktree itself.

## 9. Task 9/10 — acceptance and pins

Task 9 (browser gate) is §10 below. The CODER's e2e obligations (test-level):
- Fixture pin 1 (`oligoOrder.test.ts`): deterministic extractor on the fixture text yields ≥1 row, EVERY row carries an issue, and the residues of the `6FAM-`/`Cyanine 5-` lines honestly contain the un-stripped dye token — pinning the current limit honestly (this is the documented reason the AI read exists; if a later config-data item strips those dyes, that change updates THIS pin consciously).
- Fixture pin 2: `oligoRowsFromDraft` on a draft equivalent to the fixture (inline literal: the 4 names verbatim, sequences WITH dye tokens, the garbled first row `unreadable: true` + `sequence: null`) yields 4 rows with the unreadable one flagged with an issue and the legible three carrying declared-pattern modifications where the pattern table covers them — the "accounted vs unaccounted" contrast the task list demands, on the REAL document class, no vendor PDF in git.
- Job-level pin (§8.4): after `aiReadOligoOrder`, the PERSISTED envelope read back via `ctx.store.get(candidateId)` shows `payload.payload.extractedBy === OLIGO_AI_READ_PRODUCER` and `payload.payload.model === 'stub-model'` (the candidate envelope nests the row under `payload.payload` — records.ts:190) — provenance verified on the persisted record, not the response echo; a second identical call returns idempotently (§4.6), and a second DIFFERENT read throws the honest 409 text (`already exists with different content`) without half-writing the batch twice.

## 10. The BROWSER GATE on :5192 `/ingestion/oligo-orders` (owned by this item; task-list dispatch_gate overrides the plan's main-stack wording)

Run by the item's gate reviewer AFTER the orchestrator merges and restarts the lane stack (`cl-lane-stack.sh 1 restart`; the coder never touches the stack — self-verification runs on scratch ports only). Backend :3092 has AI configured (`lane1-config.yaml` active profile `qwen3.8-flash-OR` → model `qwen/qwen3.8-flash`), so S3 exercises a REAL model call. Fixture: copy (never `mv`, never commit) `/home/brad/Downloads/2026-10-11 11.55 TINY SCANNER.pdf` to a scratch path.

- S1 Dead-chrome negative: fresh `/ingestion/oligo-orders`, no job → no "Read with AI" button anywhere. Screenshot.
- S2 Upload the Thermo PDF → expect the `LOCAL_OCR_REVIEW` diagnostic AND the `OLIGO_AI_READ_OFFERED` diagnostic (OCR rows all carry issues → any-issue fires), 4 deterministic rows each under "Extraction needs review". Only NOW the button exists — exactly ONE, inside the order-confirmation fieldset. Screenshot.
- S3 Click it once → rows APPEND (deterministic rows still present, nothing replaced), every AI row shows "AI read — verify against the PDF." + an "AI source quote" disclosure whose text is findable verbatim in the extracted-text `<details>`; banner `AI_READ_REVIEW` names the settings model. Notice `<p role="status">` counts the rows. Screenshot per row-card surface (offer state, notice, one expanded quote, the banner).
- S4 Reload the page → Reopen with the job id → AI rows return still marked AI (GET carries provenance, no app state magic). Screenshot.
- S5 Save one AI row through the untouched Import flow → record appears under /lab/sequences; `GET /api/records/<id>`-level payload matches the page (name/bases/modifications) — a wrong base is a DEFECT, not a rounding error. Screenshot + record id in the receipt.
- S6 Idempotency: after success the offer is spent (hidden, per §6) — reload+reopen does NOT re-offer dead chrome; a manual second POST returns either the idempotent same row set or ONE honest error line — never duplicates, never a 500. Screenshot.
- Receipts: `~/.hermes/cl/receipts/oligo-ai-3/<timestamp>/` (SOP rule 12 — no UI claim without a browser). Gate report ends `VERDICT: accept` or the defect list.

## 11. RED-first commit plan (7 commits; every RED run pasted into the report)

- C1 RED (structural): `server/src/sequences/oligoOrderAiReadJob.test.ts` alone — `aiReadOligoOrder` absent. Arms: persisted provenance (§9), response diagnostics `AI_READ_REVIEW`/`AI_READ_PARTIAL`, idempotent repeat, conflicting repeat → honest 409, empty-excerpt honest error, bundle_ref fidelity (`bundle_ref.id` equals the job's existing bundle, not a fabricated one).
  `git -c core.fileMode=false add server/src/sequences/oligoOrderAiReadJob.test.ts && git -c core.fileMode=false commit -m "test(oligo): RED — AI read attaches to the existing job: persisted provenance, idempotent repeat, real bundle ref (structural RED: aiReadOligoOrder absent)"`
- C2 GREEN: `oligoOrder.ts` (§4). Suites: `npx vitest run src/sequences/oligoOrderAiReadJob.test.ts` → all passed.
- C3 RED: `server/src/sequences/sequenceRoutes.test.ts` — 503-without-deps (exact: message names Settings, `/settings` honest), 200 stub-deps path, 422 unknown job.
- C4 GREEN: `sequenceRoutes.ts` + the single `server.ts` call-site change (§5).
- C5 RED: `app/src/sequences/SequenceImport.test.tsx` (arms §6).
- C6 GREEN: `SequenceImport.tsx` (§6).
- C7 PIN (GREEN-by-design, state so in the message): the fixture txt + the two `oligoOrder.test.ts` pins (§9). These pin EXISTING merged behavior of the compiler on the real document class — no code accompanies them; the message must say `test(oligo): pin the scanned-Biosystems class...` and the report must show the run passing on first execution (a pin that goes RED means the base drifted — stop and re-baseline, §0).
Never `git add -A`. Never commit in Brad's live checkout or the trunk worktree.

## 12. First targeted check (the single command that proves the approach early)

At dispatch HEAD (post AI-2 merge), BEFORE writing any file:

    cd server && npx vitest run src/sequences/oligoOrder.test.ts        # AI-2's merged count GREEN — the compiler you must not break
    npx tsx /tmp/oligo-ai3-trigger-probe.mts

with `/tmp/oligo-ai3-trigger-probe.mts` (throwaway, NOT a deliverable; absolute-import form, cf. the AI-2 §12 probe):

    import { readFileSync } from 'node:fs';
    import { extractOligoRows } from '/mnt/vast/home/brad/git/cl-integration-1/server/src/sequences/oligoOrder.ts';
    import { readAiFallbackPolicy, aiReadTriggered } from '/mnt/vast/home/brad/git/cl-integration-1/server/src/sequences/oligoOrderAiRead.ts';
    import { sequenceConfig } from '/mnt/vast/home/brad/git/cl-integration-1/server/src/sequences/sequenceRuntime.ts';
    const rows = await extractOligoRows(readFileSync('src/sequences/fixtures/thermo-biosystems-scan.txt', 'utf8'));   // after C7; before C7 paste the text inline
    const fired = aiReadTriggered(readAiFallbackPolicy(await sequenceConfig('oligo-order')),
      { rowCount: rows.length, issueRowCount: rows.filter(r => r.issues.length).length,
        declaredCount: Number.isFinite(Number(rows[0]?.metadata?.declaredItemCount)) ? Number(rows[0]?.metadata?.declaredItemCount) : null });
    console.log(rows.length === 4 && fired.includes('any-issue') ? 'TRIGGER-ON-REAL-DOC-CONFIRMED' : `DRIFT rows=${rows.length} fired=${fired}`);

Expected `TRIGGER-ON-REAL-DOC-CONFIRMED` — composer already proved the half that exists on trunk: the real PDF OCRs and yields 4 issue-carrying rows (§2). This probe early-proves the whole gate story (real doc → offer fires) before a single test file is written.

## 13. Full verification commands + expected outputs (baselines per §7, re-measured at dispatch HEAD)

    cd server && npx vitest run src/sequences/oligoOrderAiReadJob.test.ts   # RED C1 → GREEN C2: all arms passed, 0 failed
    cd server && npx vitest run src/sequences/sequenceRoutes.test.ts        # RED C3 → GREEN C4: 3+ passed, incl. statusCode 503
    cd app   && npx vitest run src/sequences/SequenceImport.test.tsx        # RED C5 → GREEN C6: 5 passed
    cd server && npx vitest run src/sequences/                             # zero failures; 10+ files, "51+N passed | 2 skipped"-style, existing arms unchanged
    cd server && npx vitest run src/schema/                                # the SAME 10 pre-existing failures / 427+ passed; this item adds NO src/schema/ file
    cd server && npx tsc --noEmit 2>&1 | grep -c "error TS"                 # 0
    cd app   && npx tsc --noEmit 2>&1 | grep -c "error TS"                  # 23, zero lines in touched files
    # e2e self-check (coder, SCRATCH ports only — spin own stack or use vitest-level e2e; NEVER :3092/:5192/:3001/:5174):
    #   upload scratch-copied Thermo PDF -> LOCAL_OCR_REVIEW + OLIGO_AI_READ_OFFERED in response diagnostics
    #   POST /api/sequences/order/<jobId>/ai-read with stub OR configured model -> AI_READ_REVIEW + provenance on records
    # grep proof (report must quote outputs):
    grep -rn "qwen\|gpt-\|openrouter" server/src/sequences app/src/sequences  # zero hits (model-from-settings proof)
    grep -n "aiFallback\|any-issue\|no-rows\|declared-count" server/src/sequences/oligoOrder.ts server/src/sequences/sequenceRoutes.ts  # zero trigger semantics — policy is consumed, never spelled
    grep -n "normalizeSequence\|normalizeOligoRawBases" server/src/sequences/oligoOrder.ts | tail -5  # only the pre-existing sites; nothing inside aiReadOligoOrder

## 14. Worker contract

- Worktree `/mnt/vast/home/brad/git/wt/OLIGO-AI-3-lane1-l1t<ts>`, branch of the same name, off trunk `cl/integration-1` at a dispatch HEAD that contains the OLIGO-AI-2 merge (§0 gate FIRST). node_modules via the lane symlink convention (verify at prep, as in AI-1/AI-2 prep). `git -c core.fileMode=false` for EVERY git command.
- Unique deliverable: report `~/.hermes/cl/lanes/1/oligo-ai-3-report-l1t<ts>.md`, final line exactly `OLIGO-AI-3 CODER DONE <sha>`. The report quotes: dispatch-HEAD §0 gate outputs, §7 re-baselines, every RED output, the §12 probe line, §13 greps, and the coder-side e2e evidence. The report ALSO states: "browser gate §10 owed at the item gate on :5192 after merge+restart — NOT runnable by the coder pre-merge" so the gate reviewer does not hunt for coder screenshots and the coder does not fake them.
- Browser gate: OWED by this item (unlike AI-2), executed at the gate per §10 post-merge by the gate reviewer; the coder's obligation ends at the self-check lines above on scratch ports.
- Stop boundary: anything from §8 EXPLICITLY OUT; any `config/` diff; any model id or vendor string outside the fixture/test text; any second rows compiler; any change to `save()`/promote; any :3092/:5192/:3001/:5174 contact.

## 15. Reviewer bait — likely edge errors for this item, with mutation probes

1. **The plan-snippet bundle lie.** The plan's Task 6 passes `bundle: { bundleType:'other' } as never` → every AI candidate gets a `bundle_ref` to a bundle that isn't the job's, and review surfaces that group by bundle silently orphan them. Probe: assert `candidate.payload.bundle_ref.id === <job's existing bundle id>` in the job test (C1 arm). A diff that re-adopts the snippet form is a reject.
2. **The compactId 409 storm / silent duplicate.** `buildIngestionCandidateEnvelope` derives recordId from the title (§2): a `readAt` timestamp or attempt counter in the payload makes every repeat a 409 or, worse with attempt-counter titles, STACKS duplicate AI rows per click. Probe: run the job test's read twice — identical stub output must be idempotent (same recordIds, no duplicates in `ctx.store.list`); a mutated second output must fail with the honest 409 text and must NOT half-write. 
3. **exactOptionalPropertyTypes (server/tsconfig.json:13).** `model?: string` from the holder, `error?: string`, `sourceQuote?` — assigning `undefined` explicitly is a compile error; sites are §4.4/§4.6/§5. Conditional spreads everywhere.
4. **Silent substitution.** Mutation probe: in `aiRead()` setRows(prev=>AI only) → the app's no-substitution test (C5 arm c) fails. Deterministic rows MUST survive the click side-by-side (plan OQ3 default).
5. **Dead chrome.** Probe: upload a PDF that reads cleanly (existing 6-green txt fixture, no trigger diagnostic) → NO button; button gone after a successful offer (§6). A button rendered on `jobId` alone (plan-snippet form) is a reject — the task says "from the zero/partial-rows diagnostic".
6. **Provenance stripping.** The 503 message and the row marks are the honesty surfaces; probe: diff `extractedBy` out of the payload → C1 persisted-record assertion fails (assert against `ctx.store.get`, a response-echo assertion is vacuous — the response could lie about the store).
7. **Hardcoded model default.** `model: deps.model ?? 'gpt-4'` or `?? ''` both reject: the route test asserts the stub client received EXACTLY the injected model string; the grep in §13 must show zero model ids; when the holder has no model the honest behavior is still to forward the settings-empty case per AI-2's producer contract (OQ2 of the AI-2 spec), not to invent one.
8. **Two compilers.** Any base-normalizing call inside `aiReadOligoOrder` (or re-stripping dyes "because the model left them in" — the lowerer does that, per the prompt contract) is a reject; the fixture pin §9 makes the division of labor visible.
9. **YAML-reload trap.** Tests never write the config file (AI-2 spec bait 6 applies verbatim); the probe reads policy via `sequenceConfig`. Budgets in the producer call come from `readAiFallbackPolicy`, not literals — probe: change `maxContextChars` in a policy the TEST passes and assert the stub client saw the truncation change... only if AI-2 exposed a seam; otherwise assert the call forwards policy values read fresh from the shipped file.
10. **503 must be 503.** The `handle` wrapper maps `SequenceError.status`; probe: flip the status arg → the inject test asserting `statusCode===503` fails. A 401/422 for a missing AI runtime is dishonest chrome (it hides the actionable Settings message behind a generic `SEQUENCE_ACTION_FAILED` shape... check the response body carries the Settings sentence).
11. **The GET reopen path is load-bearing for S4.** It already spreads inner payload (:46); a "cleanup" that filters candidates by absence of `extractedBy` or re-keys payloads breaks reopen-after-AI. Probe: route test GET after ai-read returns the AI rows with `extractedBy` intact.
12. **The 10 pre-existing `src/schema/` failures, the 23 app-tsc errors, and the trunk full-suite drift are NOT yours** — fixing one is scope creep, adding one is a reject.
13. **Vendor data hygiene.** The Thermo PDF must NOT appear in the diff (`git -c core.fileMode=false show --stat` per commit); only the .txt fixture may carry vendor text.

## 16. Open questions (composer could not resolve locally; each with recommended default)

- **OQ1 — repeat-read semantics.** Options: (a) idempotent-same / honest-409-different via content-hash (no `readAt`, §4.6), (b) attempt-numbered titles + stacked rows, (c) server-side replacement of prior AI candidates (the store has no delete — would need tombstoning, real scope creep). Checked: `SequenceService.save:38-42` gives (a) for free; `compactId` collision behavior verified records.ts:175. **Recommended default: (a)** + the UI spending the offer after one click (§6) — a genuinely disagreeing second read surfacing `Record ... already exists with different content` is honest and rare; (b) is the silent-duplicate footgun, (c) is a record-tombstone campaign.
- **OQ2 — sourceQuote plumbing.** `OligoRow` (oligoOrder.ts:14) has no quote field and OLIGO-AI-1's schema/lowerer deliberately separate quote (draft) from row; the plan's Task-9 step 4 requires quote-vs-page verification. Options: zip draft→row index-wise onto the candidate payload (§4.4, no AI-1/AI-2 file edits) vs widen `OligoRow` (touches AI-1's merged contract + envelope-identity pins). **Recommended default: the index zip** with the length-guard; widening OligoRow would re-open AI-1's envelope-identity test surface for a provenance nicety.
- **OQ3 — the real fixture's dyes (`6FAM-`, `Cyanine 5-`) are not in the config modification table, so BOTH producers leave dye tokens in `residues` on Brad's actual PDF (composer-measured, §2).** Adding patterns is a config edit (AI-2's hot file; also a compiler behavior change for both producers). **Recommended default: do NOT touch config here** — pin the honest behavior (§9 pin 1) and file a one-line config-data follow-up for the lane (`modifications: + '(?:^|\\|)6FAM[- ]'` style arms, tested separately); flipping it later updates one visible pin consciously instead of silently re-baselining the acceptance fixture mid-gate.

COMPOSER-DRAFT-END l1t0040

---
## PROMOTION NOTE (orchestrator, 20261013T0240) — spec is CANONICAL from this point

Supersedes any draft-only status. This spec's §0 structural gate STANDS: the dispatch
base MUST be a trunk HEAD containing the OLIGO-AI-2 merge (trunk is 11aca57e at
promotion; AI-2 coder live). Do NOT dispatch the AI-3 coder until AI-2 is merged AND
the fleet lock is free; at dispatch, re-baseline §7 anchors at the new HEAD.

Orchestrator adjudications of the composer's open questions (binding):
- OQ1 = (a): idempotent-same / honest-409-different via content-hash, no `readAt`;
  UI spends the offer after one click (§4.6/§6 as written).
- OQ2 = the index zip of draft quotes onto the candidate payload with the length
  guard; do NOT widen OligoRow (re-opening AI-1 envelope-identity pins is out).
- OQ3 = do NOT touch config/sequence-analysis/oligo-order.yaml in this item. Pin the
  honest dye-leak behavior (§9 pin 1). The one-line modifications-table config-data
  follow-up (6FAM/Cyanine arms) is recorded as a carried finding for a future
  queue proposal — it is NOT auto-enqueued (no inventing campaign tasks).

Orchestrator anchor re-verification at promotion (first-hand, trunk 11aca57e):
SequenceService.save :36-42 (content-hash idempotency + 409 wording) CONFIRMED;
compactId('ICD', type-title) at records.ts:175 CONFIRMED; OligoRow at
oligoOrder.ts:14 has no quote field CONFIRMED; the four real Thermo PDFs exist under
/home/brad/Downloads/ CONFIRMED; SequenceImport.tsx is mounted by SequencesPage.tsx
AND IngestionPage.tsx CONFIRMED (the browser gate's /ingestion surface is real).
