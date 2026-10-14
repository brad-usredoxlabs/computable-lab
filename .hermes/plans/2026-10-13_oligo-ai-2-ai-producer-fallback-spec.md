# SPEC (PROMOTED, l1t0020) — OLIGO-AI-2: the AI producer (prompt-as-data + schema-constrained completion + ONE repair retry), the fallback trigger as DATA, PARTIAL-read detection (plan Tasks 3-5)

## PROMOTION NOTE (orchestrator, 2026-10-13 l1t0020) — supersedes §0 and adjudicates OQ1-OQ3

§0's structural gate is now SATISFIED: OLIGO-AI-1 merged to trunk; dispatch HEAD is
`cl/integration-1` @ `11aca57e`, which VERIFIED-CONTAINS (orchestrator first-hand at promotion):
`server/src/sequences/oligoOrderDraft.ts` (exports `OligoOrderDraft` :32, `OligoOrderDraftRow` :18,
`oligoRowsFromDraft` :41), `schema/sequence-analysis/oligo-order-draft.schema.yaml`
(`additionalProperties:false` top + row, `required:[kind,rows]`), the pinned `$id` literal at
`server/src/schema/OligoOrderDraftSchema.test.ts:26-27`, exports `normalizeOligoRawBases` /
`OligoModification` / `OligoRow` in `server/src/sequences/oligoOrder.ts`, and NO `aiFallback` /
`declaredItemCount` key in the config (grep-verified). Line numbers in the draft were measured at
386cbf8a and shifted post-merge (e.g. the `extractOligoRows` call is now oligoOrder.ts:85,
`ingestOligoOrder` at :67); the coder locates anchors by content, not by the draft's numbers.

OQ adjudication (orchestrator):
- OQ1: ACCEPT recommended default — ship `responseFormat: json_object`, Ajv as the authority,
  `json_schema` reserved in config for a proven endpoint.
- OQ2: ACCEPT recommended default — push the two diagnostics in `ingestOligoOrder` as the plan's
  Task 5 snippet says.
- OQ3: ACCEPT recommended default — evaluator colocated in `oligoOrderAiRead.ts`; split only if
  the adversarial reviewer objects to the import direction.
Browser gate: NOT owed by this item (task-list `verified by` = tests only); UI proof rides
OLIGO-AI-3's own gate.

Item: OLIGO-AI-2 — lane 1 task list (`~/.hermes/cl/lanes/1/task-list.md:3436-3457`).
Canonical plan: `.hermes/plans/2026-10-11_133742-oligo-order-ai-read-fallback.md` — **Tasks 3, 4, 5 ONLY**. Tasks 6-10 are OLIGO-AI-3; touching them is scope creep.
Base: trunk `cl/integration-1` @ `386cbf8a` (measured), worktree `/mnt/vast/home/brad/git/cl-integration-1`. Every git command on this NFS mount: `git -c core.fileMode=false ...` (MANDATORY).
Composer: cl-spec-composer run l1t2325, 2026-10-12. Every path:line below was re-read first-hand at 386cbf8a or at the OLIGO-AI-1 branch tip (named per fact); no scout used, no plan-snippet trusted unverified.

## 0. HARD STRUCTURAL GATE — the dependency is not on trunk yet

OLIGO-AI-1 (`wt/OLIGO-AI-1-lane1-l1t2245`, 4 commits, tip `3d758ca5`) is **NOT merged into trunk 386cbf8a**. This item's producer imports `oligoRowsFromDraft` / `OligoOrderDraft` from `server/src/sequences/oligoOrderDraft.ts` and validates against `schema/sequence-analysis/oligo-order-draft.schema.yaml` — **neither file exists on trunk** (verified: `git ls-tree HEAD server/src/sequences/` shows no `oligoOrderDraft.ts`; `ls schema/` has no `sequence-analysis/` on trunk). The coder's dispatch base MUST be a trunk HEAD that already contains the OLIGO-AI-1 merge (deps: [OLIGO-AI-1] is load-bearing, not bureaucratic). The coder re-baselines §7 at ITS dispatch HEAD before writing code.

## Goal (one sentence)

Make the configured model a second PRODUCER of the draft document AI-1 defined — a callable `readOligoOrderWithAi` that emits an Ajv-validated `oligo-order-draft` through a schema-constrained completion with exactly ONE repair retry — while the policy for WHEN the fallback is warranted (empty read, any issue, declared-count mismatch) and the PARTIAL-read detection that exposes the dangerous 2-of-3-rows case live entirely in `config/sequence-analysis/oligo-order.yaml`, so flipping behavior never requires a code change.

## 1. The producer's output contract — pinned to the OLIGO-AI-1 branch (pending merge)

The producer MUST emit into, and type against, exactly these shapes (quoted from branch `wt/OLIGO-AI-1-lane1-l1t2245` @ `3d758ca5`; "per OLIGO-AI-1 branch, pending merge"):

- `server/src/sequences/oligoOrderDraft.ts:18-31` — `OligoOrderDraftRow { name: string; sequence?: string | null; unreadable?: boolean; modifications?: OligoModification[]; scale?, purification?, yieldPmol?: number, mass?: number, concentrationUM?: number, buffer?, page?: number, sourceQuote?: string }`.
- `server/src/sequences/oligoOrderDraft.ts:32-39` — `OligoOrderDraft { kind: 'oligo-order-draft'; vendor?: string; orderId?: string; declaredRowCount?: number; notes?: string; rows: OligoOrderDraftRow[] }`.
- `server/src/sequences/oligoOrderDraft.ts:41` — `export async function oligoRowsFromDraft(draft: OligoOrderDraft): Promise<OligoRow[]>` — the producer's ONLY route from draft to rows (one compiler, two producers; re-normalizing in the producer is a reject).
- `server/src/sequences/oligoOrder.ts` (branch diff) — `normalizeOligoRawBases(rawBases, config, alphabets)` and `OligoModification` are now exported there; `OligoRow.modifications: OligoModification[]`.
- Schema contract (`schema/sequence-analysis/oligo-order-draft.schema.yaml`, branch): `$id` :2 = `https://computable-lab.com/schema/computable-lab/sequence-analysis/oligo-order-draft.schema.yaml`; top-level `additionalProperties: false` :10, `required: [kind, rows]` :11; row `additionalProperties: false` :33, `required: [name]` :34; `sequence: type [string, "null"]` :40-41 with the null-bases convention (:42-45: an unreadable row MUST be `sequence: null` with `unreadable: true` — never invented bases); `declaredRowCount` :20-26 (integer ≥0, "used to detect a PARTIAL read"); `sourceQuote` :74-78 (verbatim lines; the review anchor). Modification `role` enum `reporter|quencher|other` and `position` enum `5-prime|3-prime|internal` :57-58.
- The branch test pins the `$id` import string for this item (`server/src/schema/OligoOrderDraftSchema.test.ts:24-27` on the branch: "OLIGO-AI-2 imports this string"). Import the literal, do not re-derive it.

Producer result shape (new, this item): `{ rows: OligoRow[]; draft: OligoOrderDraft | null; error?: string }` — on refusal after the retry: `rows: []`, `draft: null`, `error` carrying the quoted validation failures. Never a partial rows array alongside an error.

## 2. Existing flow — verified seams (trunk 386cbf8a)

- `POST /sequences/order` (`server/src/sequences/sequenceRoutes.ts:35-40`) → `ingestOligoOrder(ctx, user, filename, bytes)` (`server/src/sequences/oligoOrder.ts:51-80`). A job/attachment "text" is `extraction.text`: layout text via `extractPdfLayoutText` for `.pdf` (oligoOrder.ts:53), raw UTF-8 for `.txt`; OCR may refill it (oligoOrder.ts:54-68, config-gated `config.ocr?.enabled` :56 — THE in-repo config-predicate precedent: `if(config.ocr?.enabled)` flips behavior with zero code change). The stored artifact keeps `text_extract.excerpt` (oligoOrder.ts:73) — that is what the AI read will consume in Task 6 (not this item).
- `extractOligoRows(text)` (oligoOrder.ts:15-49): per-line metadata loop :21 fills `metadata` from `config.metadata` patterns (this is the exact hook Task 5's `declaredItemCount` pattern rides — no new parser needed). Rows built :22-37, normalization via `normalizeOligoRawBases` post-AI-1.
- Response shape: `{jobId, artifactId, sha256, candidates, text, diagnostics, message?}` (oligoOrder.ts:79); `diagnostics` is `ExtractionDiagnostic[]` (`{severity, code, message}` — see the `LOCAL_OCR_REVIEW` push at :65 for the exact form). **The app already renders `diagnostics`** (plan context §Current context; SequenceImport review cards) — a new diagnostic code needs no app change, so Task 5's detection ships honestly without touching `app/`.
- Task 3's producer is a **callable module only**: it takes `{ llmClient, model }` as injected deps (mirroring `createAiIngestionHandlers(inferenceClient, inferenceConfig.model, ctx.store)` — `server/src/server.ts:1244`). NO route, NO job mutation, NO server.ts wiring in this item (plan Tasks 6-7 = OLIGO-AI-3). Task 5's two-line diagnostic push inside `ingestOligoOrder` IS forced by the plan (Task 5 snippet) and is DETECTION on the existing response, not AI wiring — flagged here per the instruction; it does not pre-wire the ai-read step.

## 3. Model-from-settings precedent (verified)

- `CompletionRequest` (`server/src/ai/types.ts:49-80`): `response_format?: { type:'json_object' } | { type:'json_schema', json_schema:{ name, schema, strict? } }` (:56-58). The schema-constrained shape is DIRECTLY expressible.
- Existing structured-JSON call sites — **all 8 use `json_object`; ZERO call sites use `json_schema`** (verified grep: `analysisAuthoring.ts:212`, `AiIngestionHandlers.ts:389`, `ChatbotCompilePasses.ts:855`, `PromptTagger.ts:150`, `OpenAICompatibleExtractor.ts:124`, `SemanticFamilyPass.ts:200`, + 2 test assertions). House precedent for the JSON-read producer: `server/src/api/handlers/AiIngestionHandlers.ts:382-391` — `inferenceClient.complete({ model, messages, temperature: 0, max_tokens, response_format: { type: 'json_object' } })`, model flowing from `inferenceConfig.model` (the /settings choice, server.ts:1095, :1244). `ChatMessage.content` is `string | null` (ai/types.ts:16-18) — text-only, no image part; this item reads TEXT.
- The runtime holder for future wiring: `protocolIdeAiDeps.current = { ..., llmClient: inferenceClient, model }` (server.ts:985 declaration, :1247-1250 fill) — OLIGO-AI-3's route will read it; this item only proves the producer forwards the model verbatim.

## 4. Repair-retry precedent (verified) + the ONE-retry semantics

Closest precedents: `AgentOrchestrator.ts:1590,1882,2126` — `sequenceRepairAttempts < 2` bounded re-ask loops; `ai/draftArgDiagnostics.ts:97` — "the same diagnosis, phrased as an instruction for the model's next attempt"; `InferenceClient.ts:127-138` — bounded single retry. None is a validation-repair-on-schema; **no drop-in reusable helper exists**. The shape this item defines (and DOC-INGEST Stage C reuses, per the task description):

    attempt 1: complete(messages) → parse JSON → Ajv-validate vs the draft $id
      valid → { rows: await oligoRowsFromDraft(draft), draft }
      invalid/not-JSON → lastError = JSON message OR first ≤6 Ajv errors as `path: message; ...`
    attempt 2 (the ONE repair): same messages + one user message quoting lastError
      valid → return; invalid → return { rows: [], draft: null, error:
        "The AI read did not produce a valid oligo-order-draft: <lastError>" }

Hard invariants the tests pin: the client is called **exactly twice, never a third time** (no `while(!valid)`, no exponential loop — the plan snippet's `for attempt < 2` shape is the control); the repair prompt QUOTES the diagnostic (never silently repairs); after the retry there is NO repair-by-editing-the-JSON in code — Ajv is the authority, refusal is honest.

## 5. Prompt-as-data placement (verified convention)

`server/prompts/*.md` read via `readFileSync(new URL('../../prompts/<name>.md', import.meta.url), 'utf8')` — exact in-repo precedent at `server/src/sequences/sequenceIntent.ts:3` (same directory as this item's module); also `ai/analysisReferenceGrounding.ts:118`. NEW file `server/prompts/oligo-order-draft.md`, content = plan Task 3a's text (rules 1-7 + the Biosystems example: one row per oligo, `name` verbatim, keep dye tokens for the lowerer, `sequence: null` + `unreadable: true` never guessed, verbatim `sourceQuote`, `declaredRowCount` from QTY/ITEMS/line-number, honest-all-unreadable beats empty). The plan's snippet-3b `existsSync(path) ? read : ''` cwd-relative fallback is a **silent-empty-prompt + worktree-portability trap** — use import.meta.url and let a missing prompt throw loudly.

## 6. The trigger predicate as DATA — exact YAML keys (Task 4) + partial-read detection (Task 5)

Append to `config/sequence-analysis/oligo-order.yaml` (current contents at trunk: formats[3 ids], sequenceNoise, modifications[6], metadata[4 keys vendor/orderId/purification/synthesisScale], ocr — **no aiFallback key**, verified):

    metadata:
      # ...existing 4 keys unchanged...
      # How many line items the document itself claims ("ITEMS: 4", "QTY 4", "Total Items: 4").
      declaredItemCount: '^(?:ITEMS?|QTY|Total(?:\s+Items)?)\s*[:#]?\s*(\d+)\s*$'

    # When the deterministic read cannot account for the document, offer the AI read.
    # The trigger is DATA — the predicate lives here, not in TypeScript.
    aiFallback:
      enabled: true
      # offer the AI read when: no rows at all | any row carries an issue (the lowerer's
      # unreadable-row arm always produces one) | fewer rows than the document declares
      offerWhen: [ no-rows, any-issue, declared-count-mismatch ]
      # manual = a later item's UI offers the action; auto reserved (not implemented here)
      mode: manual
      maxContextChars: 12000
      maxTokens: 4000
      # json_object = the repo's proven call form (8 call sites); json_schema reserved for
      # endpoints proven to honor it (zero call sites today) — Ajv is the authority either way
      responseFormat: json_object

TypeScript holds ZERO trigger logic — only a generic evaluator, exported from the producer module (OQ3):

    export interface OligoReadSignals { rowCount: number; issueRowCount: number; declaredCount: number | null }
    export interface AiFallbackPolicy { enabled: boolean; offerWhen: string[]; mode: string; maxContextChars: number; maxTokens: number; responseFormat: string }
    export function readAiFallbackPolicy(config: Record<string, unknown>): AiFallbackPolicy   // missing aiFallback => { enabled: false, ... } — absent data means no behavior
    export function aiReadTriggered(policy: AiFallbackPolicy, signals: OligoReadSignals): string[]   // the tokens that FIRED
    // token semantics: 'no-rows' rowCount===0; 'any-issue' issueRowCount>0;
    // 'declared-count-mismatch' declaredCount!==null && rowCount<declaredCount

Wiring in `ingestOligoOrder` (the only hot-path edit, ~4 lines after `const rows=await extractOligoRows(...)` at oligoOrder.ts:69): compute signals from `rows` (`declaredCount = Number(rows[0]?.metadata?.declaredItemCount)` guarded by Number.isFinite) → `const fired = aiReadTriggered(policy, signals)` → when `fired.includes('declared-count-mismatch')` push diagnostic `{severity:'warning', code:'OLIGO_PARTIAL_READ', message:'The document declares N items but only M were recognized. Review the pages before importing, or use the AI read.'}`; when fired non-empty AND `policy.enabled` AND `policy.mode==='manual'` ALSO push `{severity:'warning', code:'OLIGO_AI_READ_OFFERED', message:'The deterministic read could not account for the document (<tokens>). An AI read can be offered.'}` — this is the honest signal OLIGO-AI-3's UI consumes ("from the zero/partial-rows diagnostic"); it must not exist without it. `enabled: false` ⇒ NEITHER diagnostic appears (that is the file-level flip story).

The flip-with-zero-code-change proof: the evaluator takes the POLICY as data (mirroring the `config.ocr?.enabled` precedent at oligoOrder.ts:56 — behavior, not vocabulary, lives in YAML). Test A reads the REAL shipped config via `sequenceConfig('oligo-order')` and asserts the shipped behavior; Test B passes the same signals with a flipped policy literal (`enabled:false`, or `offerWhen` with the token removed) and asserts the behavior flips — same code path, data changed, no source touched. (Do NOT write-flip the shared config file in a test — concurrent vitest files race on it; that is the YAML-reload trap dressed as a test.)

PARTIAL-detection honesty limits to state in code comments and tests: documents that declare NO count stay undetectable at the deterministic layer (plan risk §); the `declaredItemCount` regex must NOT match "Total Amount: $12.34" style lines (anchored `(\d+)\s*$`, case-insensitivity comes from the loader's `new RegExp(pattern,'i')` at oligoOrder.ts:21, so the YAML pattern itself needs no flags).

Producer budget consumption: `readOligoOrderWithAi(text, { llmClient, model, maxContextChars, maxTokens, responseFormat })` — budgets from `readAiFallbackPolicy(config)` (the caller passes policy values as numbers; the producer also defaults policy-absent to the shipped values as DATA in one exported constant, not scattered literals). Truncate text to `maxContextChars` (precedent: `MAX_AI_CONTEXT_CHARS` truncation in AiIngestionHandlers.ts:14). Forward the model verbatim: `model: options.model` — a test asserts the stub client received exactly the string it injected, proving no default/hardcoded model.

## 7. Baselines re-measured at HEAD 386cbf8a by the composer (zero-NEW gate — paste into the report, then RE-MEASURE at dispatch HEAD which includes the OLIGO-AI-1 merge)

| Check | Command | Measured at 386cbf8a |
|---|---|---|
| server types | `cd server && npx tsc --noEmit 2>&1 \| grep -c "error TS"` | **0** (stay 0) |
| app types | `cd app && npx tsc --noEmit 2>&1 \| grep -c "error TS"` | **23** (known; app untouched → stays 23, 0 lines in touched files) |
| sequences neighborhood | `npm run test:run -w server -- src/sequences/` | **6 files, 40 passed / 2 skipped (42)** — after the OLIGO-AI-1 merge expect 7 files / 49 passed / 2 skipped (51); after THIS item: +N passed, zero failures |
| schema neighborhood | `npm run test:run -w server -- src/schema/` | **PRE-EXISTRED RED: 10 failed / 424 passed / 53 skipped (487)** — EventGraphSemanticKey×4, EventGraphEquipment×3, ProcurementSchemaContracts×3; after AI-1 merge +3 passed (427); this item adds schema-suite tests ONLY if OQ forces it — the 10 failures stay byte-identical |
| full server suite | `cd server && npx vitest run` (~4.5 min) | not re-run by composer (AI-1 spec baseline: 98f/5510p/70s + 2 unhandled, pre-existing drift); only if cheap, zero-NEW |
| lane stack | `:3092/:5192` | untouched — test-level item, no restart, no curl |

## 8. Files

IN scope (6):
1. `config/sequence-analysis/oligo-order.yaml` — EDIT: `metadata.declaredItemCount` + `aiFallback` block, §6 exact keys.
2. `server/prompts/oligo-order-draft.md` — NEW: prompt as DATA (plan Task 3a text).
3. `server/src/sequences/oligoOrderAiRead.ts` — NEW: `readOligoOrderWithAi` (client+model injected; response_format per policy; ONE repair retry quoting the diagnostic; Ajv-validate against the pinned draft `$id`; `oligoRowsFromDraft` for rows) + `readAiFallbackPolicy` / `aiReadTriggered` / `OligoReadSignals` / `AiFallbackPolicy` (OQ3 default: same module). Schema YAML loaded via `new URL('../../../schema/sequence-analysis/oligo-order-draft.schema.yaml', import.meta.url)` + `createValidator({ strict:false })` (the branch schema passes strict:true too per the AI-1 probe, but strict:false matches the sibling schema test). Import `OligoOrderDraft`/`oligoRowsFromDraft` from `./oligoOrderDraft.js`; type `OligoAiReadClient` structurally (`complete(req: CompletionRequest)` subset) — do NOT import `../server.js` (circular) and do NOT import `ai/InferenceClient` (injection point).
4. `server/src/sequences/oligoOrderAiRead.test.ts` — NEW: stub client only, zero model calls.
5. `server/src/sequences/oligoOrder.test.ts` — EDIT: the Task 4 config-declaration test + the trigger-flip pair (Test A shipped config / Test B flipped policy literal) + `declaredItemCount` regex arms (match "ITEMS: 3"; NOT "Total Amount: $12.34").
6. `server/src/sequences/oligoOrder.ts` — EDIT: the §6 signals→diagnostics block in `ingestOligoOrder` ONLY (~4 lines). `extractOligoRows` untouched; `oligoOrderDraft.ts` untouched.

EXPLICITLY OUT (a reviewer should reject any of these in this diff): any route (`sequenceRoutes.ts`), `server.ts` wiring, `aiReadOligoOrder` job-attachment (plan Task 6 = OLIGO-AI-3), `app/` (SequenceImport is Task 8), any MCP tool / `dualRegister` registration (see §11 recommendation), a second text-acquisition dispatcher / `decodeAttachment` convergence (DOC-INGEST A2 owns it), `server/prompts/*` other than the one new file, vendor PDF fixtures (`thermo-biosystems-scan.txt` is plan Task 10 = OLIGO-AI-3; inline test text only here), any store write beyond what `ingestOligoOrder` already does, `ocr:` config keys, canonical `oligo-spec`/`sequence` schemas, `git add -A`, commits in `/mnt/vast/home/brad/git/computable-lab` or the trunk worktree itself.

## 9. Acceptance criteria — verbatim from the task list (id OLIGO-AI-2, task-list.md:3436-3457)

    title: "The AI producer + policy-as-data fallback: schema-constrained completion, one repair retry, trigger predicate in config, PARTIAL-read detection (plan Tasks 3-5)"
    description: >-
      Task 3: the AI producer — prompt as DATA, schema-constrained completion, ONE repair retry,
      model from settings (this shape is the pattern DOC-INGEST Stage C reuses — define it
      cleanly here). Task 4: the fallback trigger is DATA — the config predicate for "deterministic
      read cannot account for the document" lives in config, not TypeScript (hard-boundary rule).
      Task 5: detect a PARTIAL read (the dangerous case) data-driven. No second text-acquisition
      dispatcher is added here — that convergence belongs to DOC-INGEST A2.
    why: >-
      Never-hardcode: the fallback policy is a declared config predicate; the model is a producer
      bounded by a schema, never a free-prose composer. Reuses dualRegister/tool settings precedent.
    verified by: >-
      Tests: trigger predicate honored from config (flip -> behavior flips, no code change);
      malformed AI draft refused by schema after the single retry with an honest diagnostic;
      partial-read detection test on a fixture with accounted/unaccounted rows.
    files: config/sequence-analysis/oligo-order.yaml (+ per-plan config), server AI-producer module (+tests).

## 10. RED-first commit plan

Commit 1 (Task 3 RED, structural): `server/src/sequences/oligoOrderAiRead.test.ts` alone — module absent. Arms (stub client; no model):
  (a) schema-valid draft JSON → `rows` lowered via the real lowerer: labels `['Oformi_1784_ABY','Buulg_934_VIC']`, second row `issues.length>0` (the unreadable arm rides the lowerer, proving one-compiler), `error` undefined, and the stub's captured request shows `model==='test-model'` verbatim + `response_format` present + system message = the prompt file content (proves prompt-as-data load, non-empty, contains 'oligo-order-draft').
  (b) prose answer twice → `calls===2` EXACTLY, `rows=[]`, `error` matches /did not produce a valid oligo-order-draft/ (the honest refusal after the SINGLE retry).
  (c) invalid draft once, valid on retry → succeeds with `calls===2` (the retry actually re-asks with the quoted diagnostic: assert the 2nd request's messages contain a validation-error quote).
  (d) fabricated shape (`{rows:[{name:'x',bases:'ACGT'}]}` — `additionalProperties:false` rejects) twice → refused, error quotes the offending path.
    git -c core.fileMode=false add server/src/sequences/oligoOrderAiRead.test.ts
    git -c core.fileMode=false commit -m "test(oligo): RED — AI producer contract: one repair retry, schema-authoritative refusal, model forwarded verbatim (structural RED: oligoOrderAiRead.ts absent)"
Commit 2 (Task 3 GREEN): the prompt md + the module.
    git -c core.fileMode=false add server/prompts/oligo-order-draft.md server/src/sequences/oligoOrderAiRead.ts
    git -c core.fileMode=false commit -m "feat(oligo): AI read producer — prompt as DATA, schema-constrained completion, ONE repair retry, lowered by the deterministic lowerer"
Commit 3 (Tasks 4-5 RED): `oligoOrder.test.ts` edits — the config-declares-aiFallback test, the flip pair, the regex arms, and the `OLIGO_PARTIAL_READ` ingest test. The ingest test needs the `SequenceService.test.ts:16-24` harness (mkdtemp + loadAllSchemas recursive + createRecordStore + fake AppContext) — a `.txt` upload keeps it off the OCR/pdf path; text fixture: an `ITEMS: 3` header line plus two readable labeled-fields rows (accounted 2 / unaccounted 1 — the task-list's accounted/unaccounted fixture, inline not vendor-PDF).
    git -c core.fileMode=false add server/src/sequences/oligoOrder.test.ts
    git -c core.fileMode=false commit -m "test(oligo): RED — fallback trigger as config DATA (flip->flip, zero code change) + partial read is a declared failure (OLIGO_PARTIAL_READ)"
Commit 4 (Tasks 4-5 GREEN): the YAML + the ingestOligoOrder block.
    git -c core.fileMode=false add config/sequence-analysis/oligo-order.yaml server/src/sequences/oligoOrder.ts
    git -c core.fileMode=false commit -m "feat(oligo): aiFallback policy + declaredItemCount as DATA — partial read and AI-offer diagnostics driven by the config predicate, none in TypeScript"
Every RED run pasted into the report with its failing output (orchestrator re-runs).

## 11. Producer form: server module, NOT an MCP tool (recommendation with rationale)

The OWN-10 dualRegister precedent (`server/src/mcp/tools/dualRegister.ts:21-45`, registered via `server/src/mcp/tools/index.ts:45`, model in `ownershipPolicyTools.ts:56`) exists for tools that EDIT RECORDS through the store with a human in the loop. This producer is a pure text→draft function whose client+model arrive as injected deps (the AiIngestionHandlers pattern, server.ts:1244); MCP registration would (a) need an actor it cannot have (the ownershipPolicyTools.ts:8-23 header documents that no session actor exists in the tool context), (b) pre-wire what Task 7's route owns (the route must 503 honestly when no AI endpoint is configured — an MCP tool silently registered without AI is exactly the dishonest surface), and (c) bundle Task 6-7 work this item explicitly must not. `why:` mentions dualRegister only as SETTINGS precedent ("reuses dualRegister/tool settings precedent") — the settings part is the model-from-settings flow (§3), satisfied by injection. **Server module, exported functions, zero registration.**

## 12. First targeted check (proves the approach before any test file exists)

At dispatch HEAD (post OLIGO-AI-1 merge), from the coder worktree:

    cd server && npx vitest run src/sequences/oligoOrder.test.ts        # 6 passed — the compiler you must not break
    cd server && npx tsx /tmp/oligo-ai2-probe.mts

with /tmp/oligo-ai2-probe.mts (throwaway, NOT a deliverable):

    import { readFileSync } from 'node:fs';
    import { parse } from 'yaml';
    import { createValidator } from './src/validation/AjvValidator.ts';
    const id = 'https://computable-lab.com/schema/computable-lab/sequence-analysis/oligo-order-draft.schema.yaml';
    const v = createValidator({ strict: false });
    v.addSchema(parse(readFileSync('../schema/sequence-analysis/oligo-order-draft.schema.yaml','utf8')) as never, id);
    const good = v.validate({ kind:'oligo-order-draft', rows:[{ name:'X', sequence:null, unreadable:true }] }, id).valid;
    const bad  = v.validate({ kind:'oligo-order-draft', rows:[{ name:'x', bases:'ACGT' }] }, id).valid;
    console.log(good && !bad ? 'SCHEMA-TARGET-CONFIRMED' : `DRIFT good=${good} bad=${bad}`);

Expected `SCHEMA-TARGET-CONFIRMED` — it early-proves both producer halves: the AI-1 schema validates the exact contract the producer emits into, and `additionalProperties:false` catches the fabricated-shape class the retry test depends on.

## 13. Full verification commands + expected outputs (from §7, re-measured at dispatch HEAD)

    cd server && npx vitest run src/sequences/oligoOrderAiRead.test.ts
      # RED at commit 1; GREEN after commit 2: "Test Files 1 passed (1) | Tests 4 passed (4)"
    cd server && npx vitest run src/sequences/oligoOrder.test.ts
      # RED at commit 3; GREEN after commit 4: the original 6 arms UNCHANGED + ~4 new → "Tests 10 passed (10)"-ish; the 6 pre-existing tests must keep passing byte-identical
    cd server && npx vitest run src/sequences/
      # zero failures; after merge-of-AI-1 + this item: files ≥8, "51+N passed | 2 skipped"
    cd server && npx vitest run src/schema/
      # the SAME 10 pre-existing failures (EventGraph×7, Procurement×3); zero NEW; this item adds no src/schema/ file
    cd server && npx tsc --noEmit 2>&1 | grep -c "error TS"    # 0
    cd app   && npx tsc --noEmit 2>&1 | grep -c "error TS"    # 23, zero lines in touched files (app untouched)
    cd server && npx vitest run                                # optional; quote verbatim, zero-NEW

## 14. Worker contract

- Worktree: `/mnt/vast/home/brad/git/wt/OLIGO-AI-2-lane1-l1t<ts>`, branch `wt/OLIGO-AI-2-lane1-l1t<ts>` off trunk `cl/integration-1` at dispatch HEAD — which MUST already contain the OLIGO-AI-1 merge (§0). node_modules via the lane symlink convention (verify at prep, as in the AI-1 prep). `git -c core.fileMode=false` for EVERY git command.
- Unique deliverable: report `~/.hermes/cl/lanes/1/oligo-ai-2-report-l1t<ts>.md`, final line exactly `OLIGO-AI-2 CODER DONE <sha>`. Report quotes dispatch-HEAD baselines (§7 re-measured) plus every RED output.
- Never `git add -A`; commit paths exactly as §10. Never commit in `/mnt/vast/home/brad/git/computable-lab` or `/mnt/vast/home/brad/git/cl-integration-1` (the orchestrator merges). Never touch `:3001/:5174`; no lane-stack restart.
- Browser gate: **NOT owed by this item** — the task-list `verified by` names tests only; the UI/job/e2e proof rides OLIGO-AI-3 (its own BROWSER GATE on :5192 per task-list.md:3466). State this in the report so the gate reviewer does not hunt for one.
- Stop boundary: anything from plan Tasks 6+; any route/server.ts/app diff; any model id, vendor name, or trigger vocabulary hardcoded in TypeScript logic (the tokens 'no-rows' etc. are matched as DATA, cf. `ocr.enabled` precedent); any second normalization path.

## 15. Reviewer bait — the edge errors for this item, with mutation probes

1. **The infinite-retry trap.** Mutation probe: change the loop bound to 3 (or `while`) → test (b) `expect(calls).toBe(2)` must fail. The producer must be call-count-pinned, not outcome-pinned.
2. **The silent-repair trap.** Mutation probe: make the code `JSON.parse`-repair or drop the offending field instead of re-asking → test (c)'s "2nd request quotes the validation error" assertion and test (b)'s error-text assertion both fail. Refusal message must quote the real Ajv/parse diagnostic (`path: message`), never a generic 500.
3. **Flip-the-config proof.** Mutation probes: set `aiFallback.enabled:false` in the YAML copy the evaluator receives → `aiReadTriggered` returns `[]` and (ingest-level) no OLIGO_AI_READ_OFFERED / OLIGO_PARTIAL_READ diagnostic; remove `declared-count-mismatch` from `offerWhen` → partial diagnostic gone, any-issue path unaffected. All with the same compiled code. A reviewer CAN attack the shipped file-level flip too: `grep -n "no-rows\|any-issue\|declared-count" server/src/sequences/oligoOrder.ts` must show zero trigger semantics — only `aiReadTriggered(...)` consumption.
4. **exactOptionalPropertyTypes is ON** (`server/tsconfig.json:13`): `error?: string` must never be assigned `undefined` — build the result with conditional spread (`...(error ? { error } : {})`); same for forwarding `model`, `max_tokens`, `response_format` into `CompletionRequest`.
5. **cwd/symlink traps**: prompt + schema loaded via `new URL(..., import.meta.url)` (sequenceIntent.ts:3 precedent); the plan's `existsSync('prompts/...')` cwd form is a worktree-portability AND empty-prompt trap; tests use `REPO_ROOT = resolve(process.cwd(),'..')` when they need repo files.
6. **YAML-reload**: `sequenceConfig` re-reads per call (`sequenceRuntime.ts:14-16`) — never assert the flip by write-rewriting the shared YAML in a test (race + a crashed test leaves the repo dirty); flip by passing policy data.
7. **Hardcode boundary**: zero vendor strings outside test fixtures (`Oformi_1784_ABY`/`Buulg_934_VIC` are fixture text from the plan); zero model ids except the stub `'test-model'`; budgets read from the policy, not literals in the producer body; no new `config` keys beyond §6 exactly.
8. **declaredItemCount regex collisions**: must match `ITEMS: 3` / `QTY 4` / `Total Items: 4`, must NOT match `Total Amount: 12.34` or `Total 1234567` price lines with trailing text (anchored digits); a doc with NO count must produce NO declared-count diagnostic (the undetectable class stays honest, not wrong).
9. **One compiler, two producers**: the producer must call `oligoRowsFromDraft` for rows — a diff that re-strips dye patterns or calls `normalizeSequence` directly in `oligoOrderAiRead.ts` is a reject (the AI-1 shared-normalizer thesis, spec-promoted adjudication OQ3).
10. **Envelope/store surface**: the ingest-level partial test uses the `SequenceService.test.ts:16-24` harness (loadAllSchemas recursive — it picks up `schema/sequence-analysis/` post-AI-1; dev-3: `store.validate` wants full envelopes). Producer tests touch NO store.
11. **The 10 pre-existing src/schema/ failures and the trunk full-suite drift are NOT yours** — fixing one is scope creep, adding one is a reject.
12. **Schema `$id` literal**: import the pinned string verbatim; a re-derived or typo'd id makes `validate(x, id)` throw `Schema not found` at the first model call in production while tests with a hand-built validator still pass — assert validation-by-$id in test (d).

## 16. Open questions (composer could not resolve locally; each with recommended default)

- **OQ1 — `response_format: json_schema` vs the 8-site `json_object` precedent.** The type supports the constrained form (`ai/types.ts:56-58`) but NO repo call site uses it (grep-verified); sending it to an endpoint that rejects it is a hard 400 for the whole feature, and I cannot verify fleet endpoint support from this worktree. **Recommended default: ship `aiFallback.responseFormat: json_object` (house-proven) with Ajv as the real schema authority + the retry as the enforcement loop; the config key reserves `json_schema` for when a fleet endpoint is proven (DOC-INGEST Stage C can flip data, not code).**
- **OQ2 — where OLIGO_PARTIAL_READ / OLIGO_AI_READ_OFFERED get pushed.** The plan Task 5 snippet puts the push inside `ingestOligoOrder` (touches the hot path, +1 file in diff); the pure alternative is exporting the evaluator only and letting OLIGO-AI-3's route compute diagnostics. **Recommended default: as the plan says — push in `ingestOligoOrder` gated by the config predicate (this item's own `verified by` is a partial-read DETECTION test, and the app already renders `diagnostics`, so the dangerous case stops being silent THIS item, with zero UI surface).**
- **OQ3 — evaluator placement: inside `oligoOrderAiRead.ts` vs its own `oligoAiFallbackPolicy.ts`.** Checked: the plan's Task 5/6 snippets read the policy from BOTH the ingest flow and the (future, AI-3) job function; one module keeps the campaign's policy+producer shape colocated and the diff at 6 files, at the cost of `oligoOrder.ts` importing the AI module (no cycle: oligoOrderAiRead imports types + oligoOrderDraft only). **Recommended default: same module; split only if the adversarial reviewer objects to the import direction.**

COMPOSER-DRAFT-END l1t2325
