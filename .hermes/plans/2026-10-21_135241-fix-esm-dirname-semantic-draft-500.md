# ESM-DIRNAME-1 — "Draft the semantic protocol" 500: bare __dirname in ESM production code

RECONSTRUCTION NOTE (orchestrator, tick l1t1700, 2026-10-21): the file this task
block originally referenced at this exact path was lost (not in plans/, git, or
any backup — verified by find/grep/git-log sweep). This document is the
canonical spec, RECONSTRUCTED from the task block's verified-by list plus the
orchestrator's own first-hand grounding below (every line cite re-opened on
trunk 0814cd6a this tick — not scout-sourced). Same intent, same file set, same
TDD order. The task block's description remains the approved intent.

## 0. The bug (orchestrator-verified first-hand, 2026-10-21 ~17:05 EDT)

Live repro against the lane-1 backend (read-only host, one POST, 500 — the
failure leaves no side effect; verified record CAN-vendorpdf-b87b94e312ce5462
still 200 with its 35 steps):

  curl -X POST http://localhost:3092/api/extraction/vendor-candidates/CAN-vendorpdf-b87b94e312ce5462/semantic-draft -H 'content-type: application/json' -d '{}'
  -> {"statusCode":500,"error":"Internal Server Error","message":"__dirname is not defined"}   HTTP 500

Chain (all cites verified on trunk 0814cd6a this tick):
  button -> POST /extraction/vendor-candidates/:recordId/semantic-draft
  (server/src/api/routes.ts:657 -> ExtractHandlers.ts semanticDraft;
   ExtractHandlers.ts:97 -> loadExtractionPrompt(PROMPT_KIND); the pass itself
   lives in server/src/ingestion/vendor-protocol/SemanticFamilyPass.ts, which
   reaches the loader) -> server/src/extract/prompts/loader.ts:98
   `path.join(__dirname, ...)` -> ReferenceError.
server/ is "type": "module" (server/package.json:5) — native ESM has no
__dirname. Handler error mapping at ExtractHandlers.ts:~496-502 turns the
designed SEMANTIC_PASS_* errors into 404/400/422/502; the ReferenceError
escapes to the generic 500.

## 1. Why no gate caught it (and the guard that ends the class)

Vitest transforms modules CJS-ish and INJECTS __dirname — an in-vitest suite
can NEVER go RED for this class. The only true harness is a real `tsx`
subprocess (what the server actually runs under). This spec therefore
requires (a) a subprocess regression test and (b) a whole-tree source-text
class guard.

## 2. The three production files to fix (orchestrator-verified bare-__dirname
users with NO in-file shim; grep of every non-test server/src file this tick)

1. server/src/extract/prompts/loader.ts — :98 (`path.join(__dirname, ...)`)
   and :127 (`const promptsDir = __dirname`). THE BUG.
2. server/src/compiler/derive/seedModels.ts — :30
   (`path.resolve(__dirname, '../../../..')`).
3. server/src/ingestion/extractorLibrary.ts — :220
   (`path.resolve(__dirname, '..', '..', '..')`).

Verified ALREADY-GUARDED (do not touch): every server/src/registry/*.ts
(`const __dirname = dirname(fileURLToPath(import.meta.url))` idiom),
server/src/ingestion/IngestionService.ts (:12 shim),
server/src/protocol/ProtocolExtractionService.ts (:17 shim),
server/src/protocol/ProtocolIdeProjectionService.ts (:33 shim — its :49
__dirname use is guarded), compiler/pipeline/fixtures/runFixtureDiff.ts (:22
shim). runChatbotCompile.ts:185 `import.meta.dirname ?? __dirname` is SAFE
(left side always defined on node 26; ?? short-circuits) — LEAVE ALONE, and
the class guard must accept that shape.

FIX IDIOM (established in-repo, IngestionService.ts:11-12 style — do not
modernize to import.meta.dirname, do not drive-by refactor anything else):

  import { fileURLToPath } from 'url';   // 'node:url' also fine; match each file's existing import style
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);   // dirname from each file's existing path import

The shim resolves to the same directory, so loader.test.ts and every existing
suite stay green UNMODIFIED.

## 3. Tasks (TDD order; 4 commits, 5 files)

Task 0 — Baseline pin: on the worktree merge-base, run `npm run typecheck -w
server` and record the error set (trunk baseline; report pins base + delta).

Task 1 — RED first-hand, server/src/extract/prompts/loader.esm.test.ts (new):
spawn a REAL tsx subprocess from the test (e.g. `npx tsx <tiny fixture script>`
that imports ./loader.js and calls loadExtractionPrompt('observation')), cwd
pinned so tsx resolves inside the repo. The test must observe the EXACT error
text `__dirname is not defined` — the spec FORBIDS proceeding on the wrong RED
(an ENOENT, a tsx-resolution failure, or a vitest-CJS pass are all wrong REDs;
stop and report instead). Commit the failing test.

Task 2 — GREEN loader.ts: shim per §2. The subprocess test passes; existing
loader.test.ts stays green unmodified.

Task 3 — seedModels.ts and extractorLibrary.ts: same shim, each behind the
same subprocess-style proof (or an extension of the Task-1 harness covering
both modules — coder's choice, but each module must be exercised under REAL
ESM, not vitest-CJS, for the dir-resolution path).

Task 4 — Class guard, server/src/esmNoBareDirname.test.ts (new): scans every
non-test .ts under server/src (test files excluded — they run under vitest's
injected __dirname); a file USES __dirname (any identifier occurrence,
comments stripped) only legally if the same file contains an in-file
`fileURLToPath(import.meta.url)` shim or `import.meta.dirname`. Regex must NOT
be weakened to pass; comment-only mentions in prose are reworded, not exempted.
Green over the whole tree after Tasks 2-3 (this is the proof the guard covers
more than the three files).

Task 5 — (ORCHESTRATOR GATE, not the coder): after merge into
cl/integration-1, restart the lane-1 stack (cl-lane-stack.sh 1 restart — tsx
--watch is unreliable over NFS; restart regardless), then the LIVE LAP: POST
semantic-draft on CAN-vendorpdf-b87b94e312ce5462 on :3092. PASS = 200+recordId
OR an honest designed error (SEMANTIC_PASS_UNAVAILABLE / 404
SEMANTIC_PASS_NO_CANDIDATE / 400 / 422 STEP_COVERAGE per
ExtractHandlers.ts:496-502). The ReferenceError 500 is the ONLY failing
outcome. A NEW honest error is reported verbatim as the next distinct defect —
do NOT fix it on this branch. Stack log grep "__dirname is not defined" -> 0.
Then the browser lap on :5192/ingestion/vendor-pdf/VPDF-6C821D307E98 (the
route verified live by the VPDF-4 gate): click "Draft the semantic protocol",
record the outcome against the same PASS bar; receipts under
~/.hermes/cl/receipts/ESM-DIRNAME-1/.

## 4. Ownership

IN: loader.ts; loader.esm.test.ts (new); seedModels.ts; extractorLibrary.ts;
esmNoBareDirname.test.ts (new). That's 4 commits / 5 files.
OUT (hard, requires-rescope if violated): runChatbotCompile.ts,
SemanticFamilyPass.ts, ExtractHandlers.ts, routes.ts, every registry file,
any YAML (NONE expected), the task list, the lane stack, :3001/:5174.

## 5. Verified-by (mirrors the task block)

(1) Task-1 RED first-hand with the EXACT ReferenceError. (2) GREEN subprocess
test + loader.test.ts green unmodified. (3) Class guard green over the whole
tree, regex unweakened. (4) Orchestrator live lap per Task 5 post-restart.
(5) server tsc: no NEW errors vs the Task-0 base; ALSO raw tsc on the two new
test files (server tsconfig excludes tests — standing rule, that gap shipped a
defect before).

## 6. Hard rules (lane-1 standing)

- All git via `git -c core.fileMode=false`. Work ONLY in the assigned worktree.
- RED-first commits; one final message per leg.
- No hardcoded policy in TS; no modernization drive-bys; runChatbotCompile.ts
  stays untouched.
- NEVER mutate :3092 (read-only GETs allowed), never restart the lane stack,
  never touch :3001/:5174.
- Pre-existing known reds (do not chase): LabSettingsHandlers 2 failures
  (lane-exclude symlink artifact), AuditEventService signature-ref 1 failure.
- Browser gate is orchestrator territory — the coder makes no browser claims.

## 7. Deliverable

Report at EXACTLY /home/brad/.hermes/cl/lanes/1/esm-dirname-1-report-l1t1700.md
ending "STATUS: complete", pinning: the RED error text verbatim, per-test pass
counts, tsc base + delta + raw-tsc-on-new-tests output, the class-guard file
count scanned, and any file touched outside the IN list (should be none).
