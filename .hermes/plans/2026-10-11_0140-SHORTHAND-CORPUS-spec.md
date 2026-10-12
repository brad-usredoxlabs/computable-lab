# SPEC DRAFT — SHORTHAND-CORPUS (lane 2, l2t2110)

Composed by: cl-spec-composer, 2026-10-10 ~21:15 EDT
Trunk: cl/integration-2 @ feb80edf (all line numbers re-verified first-hand at this HEAD)
Status: DRAFT — orchestrator review required before dispatch. Never dispatch unreviewed.
CAMT = CONFIRM AGAINST MERGED TRUNK AT PROMOTION. Every bind to the SHORTHAND-CHAT shape reads CAMT:
coder branches off trunk tip at dispatch; SHORTHAND-CHAT (l2t1810, worktree live at cfdfc2e9/b05b4974
while this drafts) must be MERGED first or this item's chat-Accept workstream re-binds.

## Goal (one sentence)

Make every human acceptance of an accepted shorthand a corpus pair: wire the chat-panel Accept and the
localization thread to the EXISTING capture seam (prompt → accepted ScientistIntent, compiled graph as
provenance only, version-discriminated, anonymized, schema-checked before write), make the local JSONL
capture persistent on the lane stack, and ship a replay script + round-trip test that turns captured
JSONL into corpus-service POST bodies.

## BINDING DECISIONS (reproduced VERBATIM from the task block, /home/brad/.hermes/cl/lanes/2/task-list.md)

```
# BINDING DECISIONS (architect):
#   - Pair shape = { prompt (user turns + SurfaceContext) -> accepted shorthand (final,
#     refinement-folded ScientistIntent) } + optional compiled graph as PROVENANCE ONLY, never
#     as the training target. Extend buildCorpusEntry usage; do not fork a second corpus client.
#   - Wire the dead client method saveIntentTrainingPair (client.ts:3979) to the real Accept
#     seam on the chat panel (and the localization thread where localMacro is already held —
#     ProtocolLocalizationThread.ts:151 setLocalMacro) so every human acceptance is a pair.
#   - Local JSONL capture via the existing CLA_CORPUS_LOCAL_PATH opt-in (surfaceContextCorpus.ts
#     precedent) so Brad can seed the corpus by hand today; corpus.enabled config still gates the
#     remote post. Anonymization is mandatory on both shapes (anonymizeSurfaceContext).
#   - The old acceptedGraph-as-target entries stay in the corpus untouched (historical); no
#     migration, no deletion — new entries carry a shape/version discriminator as DATA.
```

Also from the task block's DIRECT-CODED note (binding):

```
# DIRECT-CODED 2026-10-10T14:30 by architect (Brad "fix directly, don't queue it" — UNCOMMITTED
#   on trunk working tree): server-side capture EXISTS. server/src/corpus/shorthandCorpus.ts
#   (+ 6 tests): buildShorthandCorpusEntry (lift->parse via Ajv BEFORE write, target = canonical
#   scientist-intent, graph demoted to provenance, intentShapeVersion:'1' discriminator, reuses
#   buildCorpusEntry/anonymizers) + captureShorthandPairToLocal (CLA_CORPUS_LOCAL_PATH JSONL).
#   IntentTrainingPairHandlers seam captures a local pair on every accepted macro (+2 tests;
#   invalid macro = request served, nothing written). Verified live on :3093 smoke (pair landed,
#   line cleared). 19-error tsc pin unchanged; corpus suites 35/35. REMAINING for this task:
#   wire chat-panel Accept (after SHORTHAND-CHAT) + localization-thread surfacing, JSONL->corpus
#   replay script + round-trip test, PERSISTENT lane env wiring (cl-lane-stack.sh export is
#   session-only for now), browser receipt 0->1. Do NOT re-implement the capture module.
```

NOTE (verified first-hand, drift against the note): the capture module IS committed on this trunk —
`git log -- server/src/corpus/shorthandCorpus.ts` shows 51ac31e3, an ancestor of feb80edf. Treat it as
merged code: build ON TOP, do not re-implement, do not gratuitously refactor.

## Acceptance criteria (VERBATIM from the task block, `verified by:`)

```
Headless: accepting a shorthand proposal (stubbed flow) appends exactly one JSONL pair whose
target is the accepted ScientistIntent (not the graph), anonymized, with the version
discriminator; disabling the toggle captures nothing; a malformed/undisclosed field cannot
reach the file (schema-checked before write). A replay script converts a captured JSONL into
the corpus-service POST bodies (round-trip test). Browser gate reuses SHORTHAND-CHAT's
receipt: after Accept, the lane's local JSONL gains the pair (count observed 0 -> 1).
```

## Grounding verified first-hand at feb80edf (corrections to the brief)

1. **Client method names**: the brief/task-block cite `saveIntentTrainingPair (client.ts:3979)`. Real
   names at HEAD: `intentTrainingPair` (client.ts:3980; :3979 is its doc comment) and
   `intentCompileFromPrompt` (:3947). Same drift the SHORTHAND-CHAT composer found; accepted.
2. **`intentTrainingPair` is NOT dead**: `ProtocolLocalizationThread.tsx:460` calls it inside
   `handleAccept` (:435-478) with `localMacro` + `acceptedGraph` + `confirmedAt`. That POST lands on
   `IntentTrainingPairHandlers.saveTrainingPair`, which ALREADY fires
   `captureShorthandPairToLocal` (:115-126) whenever the body carries `localMacro`. So the
   localization-thread capture END already works end-to-end; what the task block calls
   "localization-thread surfacing" is the USER-VISIBLE half: the thread's message at :469 claims
   "added to training corpus" even when the remote post returned `corpus.disabled` and the ONLY thing
   that happened was the local JSONL append (or nothing at all when the toggle is unset). See WS2.
3. **Chat-panel Accept today**: `AiTabPanel.tsx` onApply (:1156 region, in-trunk) commits the preview
   via `editor.actions.commitPreview()` and posts NOTHING to the corpus. The only app-side corpus
   capture today is the deck-accept path: `PreviewActionBar.tsx:105` → `persistAcceptedEventGraph`
   (`eventGraphPersistence.ts:298-338`) fire-and-forgets `apiClient.saveCorpusEntry` →
   `POST /corpus/entries` → `CorpusHandlers.saveCorpusEntry` (source-guard: only
   'protocol-loop'|'event-editor' forwarded). That old path posts the OLD acceptedGraph-target shape
   and STAYS UNTOUCHED (binding decision: historical entries untouched; no migration).
4. **Capture module shape** (`server/src/corpus/shorthandCorpus.ts`, 117 lines, 6 tests green):
   `INTENT_SHAPE_VERSION = '1'`; `buildShorthandCorpusEntry({userPrompt, shorthand, acceptedGraph?,
   confirmedBy?, confirmedAt?, goldModel?, surfaceContext?, source?})` does lift → `parseScientistIntent`
   (Ajv sole authority) BEFORE any write, target `shorthand: validated` + `shorthandVersion:
   SCIENTIST_INTENT_VERSION` riding beside the `buildCorpusEntry` body (whose `acceptedGraph` +
   `prompt.surfaceContext` are anonymized via `anonymizeGraph`/`anonymizeSurfaceContext`,
   CorpusClient.ts:138-159). `captureShorthandPairToLocal` no-ops (returns false, writes nothing) when
   `CLA_CORPUS_LOCAL_PATH` is unset OR validation throws; it NEVER throws to the caller.
5. **Toggle resolver**: `resolveLocalCorpusPath` (surfaceContextCorpus.ts:20-22) reads
   `env.CLA_CORPUS_LOCAL_PATH?.trim() ?? ''`. Remote post is separately gated by `resolveCorpusConfig`
   (`corpus.enabled` config + `CLA_CORPUS_ENABLED`/`CLA_CORPUS_URL` env, CorpusClient.ts:61-70).
   `cl-lane-stack.sh` (read first-hand) has NO `CLA_CORPUS_LOCAL_PATH` export — the lane currently
   relies on a session-only export; nothing under `/home/brad/.computable-lab-lane2/` carries a corpus
   JSONL today (verified: only records/_index and shadow-router jsonl). WS5 makes it persistent.
6. **goldModel re-verify field**: `GOLD_MODEL = 'deepseek-v4-flash-0731'`
   (IntentTrainingPairHandlers.ts:30), carried through `buildCorpusEntry`
   (`...(input.goldModel ? {goldModel} : {})`). Note the local shorthand capture at
   IntentTrainingPairHandlers.ts:116-125 does NOT pass `goldModel` — the local pair carries no
   goldModel today. Deliberate or oversight: OQ3.
7. **SHORTHAND-CHAT shape (CAMT bind; live in wt/SHORTHAND-CHAT-lane2-l2t1810 at cfdfc2e9+b05b4974,
   NOT yet on trunk)**: `AgentResult.shorthand?: string` (server/src/ai/types.ts:762, conditional
   spread, key ABSENT when absent), stream-carried via assistStream.ts `shorthand?: string` (:106),
   held in `sidebarState.ts` `reviewing.shorthand?: string` (:137/:163), rendered verbatim in
   ChangesPanel, server-side hold helpers `holdShorthandIntent`/`takeHeldShorthandIntent`
   (`server/src/ai/shorthandChat.ts:104/:113`), edit-recompile via `POST /intent/compile`. The chat
   Accept button does NOT yet capture a corpus pair (SHORTHAND-CHAT spec §corpus-collision forbids it
   there — it is explicitly THIS item's job).
8. **Replay precedent**: `server/scripts/golden-replay.ts` (tsx CLI under `server/scripts/`, NOT
   collected by vitest, wraps a pure kernel under `src/`) is the in-repo shape for WS4.
9. **Suite/pin state re-measured first-hand at feb80edf**: corpus suites
   (`src/corpus/**` + `IntentTrainingPairHandlers.test.ts` + `CorpusHandlers.test.ts`, run FROM
   `server/`) = 35/35 green; `npx tsc --noEmit | grep -c "error TS"` = 19; MANIFEST blob via
   `git -c core.fileMode=false hash-object src/compiler/scientistIntent/goldens/MANIFEST.yaml` =
   58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35; live :3093 health lintRules.loaded = 81.
10. Scout recon was attempted (one bounded question to cl-scout) and returned EMPTY; every claim
    above comes from my own read/grep. Do not re-derive from this spec without trusting these cites.

## Remaining workstreams (the 6, with file-ownership map)

### WS1 — Chat-panel Accept → one pair (CAMT: binds SHORTHAND-CHAT's merged shape)

Design (recommended arm; OQ1 rules the alternative): after a successful chat Accept (SHORTHAND-CHAT's
`onApply` in `AiTabPanel.tsx`, event-graph branch), fire-and-forget ONE
`apiClient.intentTrainingPair(...)` POST carrying: `userPrompt` = the prompt that produced the draft
(AiTabPanel already holds it per draft — the same value SHORTHAND-CHAT threads into its shorthand-apply
state), the accepted SHORTHAND as the target, `acceptedGraph` = the committed preview events+labwares
as PROVENANCE ONLY, `confirmedAt: new Date().toISOString()`. The shorthand rides to the server either
as a YAML string in a NEW optional `shorthandYaml` field on `/intent/training-pair` (server does
`parseYaml` → object → existing lift+Ajv path; the CLIENT NEVER PARSES — render + POST only), or as
whatever object shape SHORTHAND-CHAT's merged `reviewing` state happens to expose (CAMT — bind at
promotion; prefer YAML-string arm: it is byte-identical to the verbatim panel content and needs zero
client-side parsing). Route through the EXISTING `/intent/training-pair` seam — do NOT post via
`saveCorpusEntry`/`/corpus/entries` (source-guard there rejects shorthand bodies, and it would fork a
second capture path, violating "do not fork a second corpus client").

Files: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` (+ its tests; SHORTHAND-CHAT's post-merge
state is the base), `app/src/shared/api/client.ts` (widen the `intentTrainingPair` body with the one
new optional field), `server/src/api/handlers/IntentTrainingPairHandlers.ts` (decode the new optional
field; feed the SAME `captureShorthandPairToLocal`; malformed YAML = request served, nothing written —
mirror the existing invalid-macro test) + `IntentTrainingPairHandlers.test.ts`.

### WS2 — Localization-thread surfacing

The POST already happens (grounding 2). Ship honest surfacing: when the `intentTrainingPair` response
is `corpus.disabled`/not-ok but local capture is on, the thread message (:469) must say the pair was
captured LOCALLY (or state the truth when nothing was captured); when capture fails validation the
request still serves and the message must not claim corpus capture. Keep `setLocalMacro`/`handleAccept`
flow (ProtocolLocalizationThread.tsx:151, :435-478) otherwise byte-stable; do NOT move capture into
the client. Files: `ProtocolLocalizationThread.tsx` + `ProtocolLocalizationThread.test.tsx` /
`.familyAxes.test.tsx` (their client mocks already stub `intentTrainingPair`; extend assertions, do not
restructure).

### WS3 — Client method wiring/naming (folded into WS1)

The task-block wording "wire the dead client method saveIntentTrainingPair (client.ts:3979)" is
naming-drifted: the method is `intentTrainingPair` (client.ts:3980) and it is NOT dead on the
localization thread. This item's real wiring is WS1 (chat panel) + WS2 (thread surfacing). No rename
this wave; if the orchestrator wants `saveIntentTrainingPair` restored as the name, ruling = OQ4
(recommendation: NO rename — the SHORTHAND-CHAT promotion record already canonically cites
`intentTrainingPair`).

### WS4 — JSONL → corpus replay script + round-trip test

New PURE kernel `server/src/corpus/corpusReplay.ts`: `parseCorpusJsonlLine(line): entry` +
`entryToPostBody(entry): CorpusEntryInput-shaped POST body` — NO networking, NO fs in the kernel
(replayKernel precedent). Rules: the `intentShapeVersion`/`shorthand`/`shorthandVersion` fields are
preserved as DATA in the replayed body (the moat reader selects on them); old acceptedGraph-target
lines (no discriminator) pass through UNCHANGED (no migration, no rejection); lines that fail JSON
parse or the entry shape are reported with line numbers, never silently dropped. New tsx CLI
`server/scripts/corpus-replay.ts` (outside src/, NOT vitest-collected, `golden-replay.ts` is the
shape): reads a JSONL path, POSTs each body to the corpus service (`resolveCorpusConfig`-resolved URL;
`--dry-run` prints bodies without network — dry-run is what the lane exercises). Round-trip test
(colocated with the kernel): buildShorthandCorpusEntry → captureShorthandPairToLocal(tmp) → read line →
parseCorpusJsonlLine → entryToPostBody → deep-equals the captured entry AND a mocked-corpus test posts
it and gets dedup-friendly identity (replaying the same file twice yields byte-identical bodies).

### WS5 — Persistent lane env wiring (ORCHESTRATOR-OWNED FILE — coder does NOT edit it)

`/home/brad/.hermes/profiles/orchestrator/scripts/cl-lane-stack.sh` lives OUTSIDE the repo and outside
any coder worktree; it is orchestrator-owned infra (its header: lane ports, lane config isolation). The
coder's deliverable is a VERBATIM patch block in the report, and the orchestrator applies + restarts
the lane stack. Exact change (verified against the current file): inside `start()`, add to the backend
subshell's env line (currently `APP_BASE_PATH=.. PORT=... CL_DATA_DIR=... CONFIG_PATH=...`):

```
CLA_CORPUS_LOCAL_PATH="/home/brad/.computable-lab-lane${LANE}/corpus/pairs.lane${LANE}.jsonl" \
```

(one line, backend ONLY — vite does not need it). Opt-in preserved in tests: `captureShorthandPairToLocal`'s
env-driven no-op test still unsets it; nothing in the repo may assume the env is set. Browser-reviewer
contract: receipt run happens AFTER the orchestrator has applied the patch and restarted the lane
stack; a lane backend restarted without the export silently captures nothing (the whole point of WS5).

### WS6 — Browser receipt 0→1 (browser-reviewer, not coder)

REQUIRES WS5 applied + SHORTHAND-CHAT merged (its gate prompt is the receipt vehicle). Contract: with
`CLA_CORPUS_LOCAL_PATH` = the lane path, `wc -l` the file BEFORE (expect 0 or record baseline), run
SHORTHAND-CHAT's :5193 gate (prompt "add 100uL of DMEM", Accept the shorthand proposal), `wc -l` AFTER
(= baseline+1, EXACTLY one line), then `jq` the tail line asserting
`intentShapeVersion == "1"`, `.shorthand` is the accepted ScientistIntent object,
`.acceptedGraph` present-but-provenance, no raw internal ids (scrub sites show `###`/`ID`). VERDICT:
accept recorded in the receipt.

## File ownership map

IN SCOPE (may edit, coder worktree):
- `server/src/api/handlers/IntentTrainingPairHandlers.ts` (+ test) — decode WS1 field, keep the
  existing capture call as the single write path
- `app/src/shared/api/client.ts` — `intentTrainingPair` body widened with ONE new optional field only
- `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` (+ tests) — post-accept fire-and-forget
- `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx` (+ its 2 test files) —
  surfacing only
- NEW: `server/src/corpus/corpusReplay.ts`, `server/src/corpus/corpusReplay.test.ts`,
  `server/scripts/corpus-replay.ts`
- NEW test file for the chat-accept capture leg (app-side component test colocated with AiTabPanel
  tests; server-side leg rides the extended IntentTrainingPairHandlers.test.ts)

OFF LIMITS (do not touch, no "improvement" hunks):
- `server/src/corpus/shorthandCorpus.ts` + `.test.ts` — the direct-coded capture module: build on top,
  never re-implement, never refactor
- `server/src/corpus/CorpusClient.ts`, `surfaceContextCorpus.ts`, `analysisCorpus.ts`,
  `CorpusHandlers.ts` (+ tests) — the shared client/anonymizers/bridge; the old acceptedGraph path
  stays byte-identical (no migration, no deletion of historical entries)
- `app/src/event-editor/eventGraphPersistence.ts` + `deck/PreviewActionBar.tsx` — the OLD
  acceptedGraph deck-accept capture: historical path, untouched
- `server/src/compiler/scientistIntent/**` incl. `goldens/` (pipeline freeze), `schema/scientist-intent/**`
  and `schema/workflow/scientist-intent.schema.yaml` (vocab/schema freeze)
- `server/src/ai/**` incl. `shorthandChat.ts` (SHORTHAND-CHAT's territory; consume, don't edit)
- `/home/brad/.hermes/profiles/orchestrator/scripts/cl-lane-stack.sh` and ANY path outside the
  worktree (WS5 delivers a patch block, orchestrator applies)

## First targeted check (proves the approach early — BEFORE writing code)

```bash
cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run src/corpus src/api/handlers/IntentTrainingPairHandlers.test.ts
```
Expected: `Tests  35 passed (35)` (measured first-hand at feb80edf — this is the capture baseline the
item extends). Then RED-FIRST (CLAUDE.md rule 5): write (a) the extended IntentTrainingPairHandlers
test for the WS1 `shorthandYaml` decode (fails now), (b) `corpusReplay.test.ts` round-trip (fails —
module absent). Those failing files are the approach proof and stay as acceptance tests.

## Verification commands (with expected output)

All from the coder worktree. ALWAYS `git -c core.fileMode=false` for any git plumbing. Server tests run
FROM the `server/` pkg dir (vitest workspace-root pitfall).

```bash
# 1. Server typecheck — lane pin EXACTLY
cd server && npx tsc --noEmit 2>&1 | grep -c "error TS"          # expect: 19 (fa3ca817-lineage pin; W2-9 added ZERO new)

# 2. App typecheck — base-debt pin (SET-equality vs base; count is not the point)
cd app && npx tsc --noEmit 2>&1 | grep -c "error TS"             # expect: 34, zero NEW error sites

# 3. Corpus + seam suites (the acceptance surface for this item)
cd server && npx vitest run src/corpus src/api/handlers/IntentTrainingPairHandlers.test.ts src/api/handlers/CorpusHandlers.test.ts
#   expect: baseline 35/35 GREEN plus all new tests (corpusReplay, shorthandYaml) passing — zero failures

# 4. Server scoped base-debt fail-SET: SET-equal to the pinned 11-file list, zero new
cd server && npx vitest run src/ai src/compiler/scientistIntent

# 5. App unit — FULL run, fail-SET SET-equal to the 35-file base-debt set (SET, not count)
cd app && npx vitest run

# 6. Pipeline freeze + goldens untouched
cd server && npx vitest run src/compiler/scientistIntent/goldens   # expect: 15/15
git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml
#   expect: 58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35
git -c core.fileMode=false diff --name-only <base>...HEAD -- server/src/corpus/shorthandCorpus.ts server/src/compiler schema/
#   expect: EMPTY (capture module + pipeline + schema all frozen for this item)

# 7. Replay script dry-run round-trip on a locally captured file (hermetic, no network)
cd server && npx tsx scripts/corpus-replay.ts --dry-run /tmp/l2-corpus-smoke/pairs.jsonl
#   (input generated by the round-trip test's capture or a one-shot vitest run; expect: one POST-body
#    JSON per line, each carrying "intentShapeVersion":"1"; exit 0; NO network calls in dry-run)

# 8. Health surface (lane :3093; lintRules pin)
curl -s localhost:3093/api/health | jq '.components.lintRules.loaded'   # expect: 81
```

## Worker contract

- Worktree: `/mnt/vast/home/brad/git/wt/SHORTHAND-CORPUS-lane2-l2t<tick>`
- Branch: `cl/SHORTHAND-CORPUS-lane2-l2t<tick>` off `cl/integration-2` trunk TIP AT DISPATCH —
  MUST be >= the SHORTHAND-CHAT merge (CAMT; if SHORTHAND-CHAT has not merged, WS1/WS6 bind cannot be
  made and the coder implements WS2-WS5 only and declares the WS1 stub RED in the report, not faked).
- Deliverable report: `.hermes/plans/SHORTHAND-CORPUS-report.wip-l2t<tick>.md` (unique in-lane path);
  every verification command's VERBATIM tail in the report, plus the WS5 patch block verbatim.
- End marker: `SHORTHAND-CORPUS DONE <sha>`.
- Lane pins to honor: server tsc 19 (fa3ca817-lineage; W2-9 merge added ZERO new — re-verified first-
  hand at feb80edf), app tsc 34, app FULL fail-SET 35 files (SET-equality, not count), server scoped 11
  (base-debt set), MANIFEST blob 58c447eb, lintRules 81. ALWAYS `git -c core.fileMode=false`. Server
  tests run FROM the `server/` pkg dir. NO lane-stack restarts (orchestrator-owned infra; WS5 is a
  patch block, not an applied edit). No stack env assumptions in tests.

## Reviewer bait (the adversarial review WILL probe these — pre-empt in code and report)

1. **exactOptionalPropertyTypes (server/tsconfig.json:13 is TRUE; app tsconfig does NOT set it)**:
   every new server-side optional (`shorthandYaml` decode branches, replay kernel results) must use
   the conditional-spread idiom `...(v !== undefined ? {v} : {})` — key ABSENT, never `undefined`.
   shorthandCorpus.ts:68-70 is the in-repo precedent; add/extend a test asserting NO key when absent.
2. **Schema-check-before-write is THE invariant; nothing may route around it**: the ONLY local-write
   door stays `captureShorthandPairToLocal` (lift → `parseScientistIntent` Ajv sole authority → write).
   The WS1 YAML arm must convert YAML→object and hand it to that door — a replay path, a chat path, or
   a debug path that appends to the JSONL directly is a hard stop. Keep/extend the two invalid-macro
   tests (malformed AND undisclosed-field: `{nope:true}` never reaches the file, request still serves).
3. **Toggle-off captures nothing**: `resolveLocalCorpusPath` returns '' when `CLA_CORPUS_LOCAL_PATH`
   unset → no-op. Do NOT default a path anywhere (not in the lane-stack patch beyond the exported env,
   not in config, not in code). A test with the env deleted must still pass with the file never
   created (mirror shorthandCorpus.test.ts:91-100).
4. **Target vs provenance, verbatim**: the JSONL pair's `.shorthand` IS the accepted ScientistIntent
   (lift-canonical — natural verbs bridged via the declarative ACTION_SYNONYMS table, canonical closed
   vocabulary per ontology terms in `schema/` vocabulary YAML); `.acceptedGraph` is provenance-only and
   MUST NOT be promoted to target anywhere in replay. Replay preserves `intentShapeVersion` as DATA —
   the version discriminator is data, not a code fork; no second corpus client (all posts ride
   `postCorpusEntry`/`buildCorpusEntry`).
5. **Anonymization on both shapes**: `buildCorpusEntry` anonymizes `acceptedGraph` + `surfaceContext`.
   The shorthand TARGET is deliberately NOT run through `anonymizeGraph` — it is canonical-vocabulary
   by schema construction (no internal ids survive lift+Ajv; the model is barred from record ids/CURIEs).
   The report must STATE this with the schema pointer; if the reviewer demands belt-and-braces, the
   fix is a test asserting an id-bearing malformed document is REFUSED at the door, not an anonymizer
   patch to the frozen module.
6. **Historical entries untouched**: no code may rewrite, filter, or delete existing JSONL lines or
   corpus entries (`/corpus/entries` bridge, old acceptedGraph targets, `eventGraphPersistence` deck
   path stay byte-identical). Reviewer greps the diff for deletes against those files.
7. **Client never parses**: the app must not YAML-parse, validate, or normalize the shorthand anywhere —
   WS1 ships the verbatim string (or SHORTHAND-CHAT's exact held object, CAMT) and the server owns all
   parsing. Reviewer greps the app diff for `yaml`/`parse` near the accept leg.
8. **Hardcode boundary**: test shorthand (DMEM-class docs) lives in test fixtures only; the replay CLI
   reads paths from argv; no lane path (`/home/brad/.computable-lab-lane2/...`) hardcoded in `src/` —
   the path authority is the ENV, the lane-stack patch is infra.
9. **Never-throw contract**: capture failures never fail the request (IntentTrainingPairHandlers
   try/catch precedent); the replay CLI is allowed to be loud (operator tool, exit codes) but the
   kernel stays pure and never fs/network.
10. **WS5 scope discipline**: any diff hunk touching cl-lane-stack.sh (or anything outside the
    worktree) = contract violation; it is a REPORT ARTIFACT only.

## Open questions (with recommendations)

- **OQ1 — Where the chat-Accept corpus call lives once SHORTHAND-CHAT lands: client-side post-accept
  POST (recommended) vs server-side capture on an accept endpoint.** Checked first-hand: the chat
  Apply is a pure client action (`commitPreview`, AiTabPanel onApply) — the server never learns an
  acceptance happened; SHORTHAND-CHAT holds intents per conversation (`shorthandChat.ts:104`) but
  exposes no accept endpoint. Client-side POST to the existing `/intent/training-pair` seam reuses the
  audited write door with one new optional body field; server-side would need a new endpoint + hold
  lifecycle (key expiry, cross-turn ambiguity) — more surface, no new safety. Recommendation:
  client-side post-accept, fire-and-forget (mirrors `eventGraphPersistence`'s corpus leg). CAMT: bind
  field name + value shape (YAML string vs held object) to the merged SHORTHAND-CHAT at promotion.
- **OQ2 — What exactly "localization-thread surfacing" means.** Checked: the thread's POST leg already
  exists (:460) and already triggers local capture; the misleading part is the user-visible message
  path (:469 claims corpus capture unconditionally post-accept, while `corpus.disabled` + unset toggle
  mean nothing may have been stored). Recommendation: WS2 as scoped (honest message driven by the POST
  response), NOT moving capture client-side and NOT plumbing the capture boolean through the server
  response (the POST response `{ok, error}` already distinguishes `corpus.disabled`; the local-append
  boolean is server-side best-effort and stays server-side; if the orchestrator wants the pair COUNT
  surfaced, that's an additive response-shape extension of /intent/training-pair — rule it).
- **OQ3 — goldModel on local shorthand pairs.** Checked: `buildShorthandCorpusEntry` accepts
  `goldModel` but IntentTrainingPairHandlers' local-capture call (the only production caller today)
  omits it, while the remote post carries GOLD_MODEL. Recommendation: leave as-is this item (the local
  JSONL is Brad's hand-seed path; re-verify tagging is a corpus-service concern), note the asymmetry
  in the report; adding it is a one-line change if the orchestrator rules otherwise.
- **OQ4 — Rename `intentTrainingPair` → `saveIntentTrainingPair`?** Recommendation: NO (see WS3) — the
  SHORTHAND-CHAT promotion record canonically cites the current name; rename would churn two merged
  specs for zero behavior.

## Assumptions

- AS-LANE2-SHORTHANDCORPUS-1: the capture module (51ac31e3) is treated as MERGED authority despite the
  task block's "UNCOMMITTED" note — verified first-hand (ancestor of feb80edf, suites green). All line
  numbers verified at feb80edf.
- AS-LANE2-SHORTHANDCORPUS-2: WS1/WS6 are CAMT-bound to the merged SHORTHAND-CHAT (spec
  2026-10-10_1955-SHORTHAND-CHAT-spec.md, its `reviewing.shorthand`/`AgentResult.shorthand` string
  shape). If SHORTHAND-CHAT merges with a different holder shape, rebind at promotion; nothing else in
  this item changes. If it has NOT merged at dispatch, the coder ships WS2-WS5 and reports WS1 stub RED.
- AS-LANE2-SHORTHANDCORPUS-3: `corpus.enabled`/remote-post gating is out of scope to change anywhere —
  `corpus.disabled` stays a normal response (lane default is remote-off; local JSONL is the receipt
  path). WS5 sets ONLY `CLA_CORPUS_LOCAL_PATH`, never `CLA_CORPUS_ENABLED`.
- AS-LANE2-SHORTHANDCORPUS-4: replay POST bodies reuse the captured entry as-is (entries are already
  `buildCorpusEntry` output + discriminator fields); "replay" adds file→body mechanics + dedup-stable
  serialization, not re-anonymization (re-anonymizing an anonymized entry is idempotent but re-opens
  the schema-check invariant debate — leave it out).
- AS-LANE2-SHORTHANDCORPUS-5: pins 19/34/35-set/11-set/81/58c447eb as handed; coder re-derives the
  failing SETs at branch base and asserts SET-equality (matching count + different SET = defect).
- AS-LANE2-SHORTHANDCORPUS-6: the single cl-scout recon dispatch returned empty; ZERO claims in this
  spec rest on scout output — every load-bearing line was read/grep-verified first-hand (including a
  live :3093 health check and the corpus suite re-run at 22:44 EDT).

---
**DRAFT — this spec is NOT canonical.** Orchestrator: rule OQ1-OQ4 (esp. the WS1 arm + CAMT bind to the
merged SHORTHAND-CHAT shape, and the WS5 patch-block ownership), fix or approve, then promote to the
canonical spec path. Do not dispatch a coder against this file as-is.

---
## PROMOTION RECORD 2026-10-11T01:40 EDT (orch l2t0115)

Promoted to canonical by the orchestrator after pre-review. The draft's OQ recommendations are
ADOPTED as rulings:

- OQ1 = client-side post-accept POST to /intent/training-pair with one new optional body field
  (fire-and-forget, mirrors eventGraphPersistence's corpus leg). Server-side capture rejected:
  new endpoint + hold lifecycle for no new safety.
- OQ2 = WS2 scoped as drafted (honest message driven by the POST response). NO response-shape
  extension for pair COUNT — the local-append boolean stays server-side best-effort.
- OQ3 = leave goldModel asymmetry as-is this item; note in report.
- OQ4 = NO rename (intentTrainingPair stays).

CAMT BIND UPDATE (supersedes the draft's cfdfc2e9+b05b4974 citation): SHORTHAND-CHAT fix cycle 1
landed at wt/SHORTHAND-CHAT-lane2-l2t1810 tip e5078aef (bf40b0e8 code + report commit); DEFECT-5
fix ADDS shorthand to the clarifications-needed dispatch, so the clarification turn now also
carries result.shorthand. WS1/WS6 bind to the MERGED SHORTHAND-CHAT shape at promotion-to-trunk
time (adv c2 live; if c2 returns fix again, rebind at the eventual merged tip). The AgentResult
.shorthand string shape is unchanged by fix1.

CODER-QUEUE NOTE: CORPUS dispatch waits for (a) SHORTHAND-CHAT merged to trunk (WS1/WS6 CAMT)
and (b) the fleet coder slot free. WS2-WS5 are independent of (a) per AS-LANE2-SHORTHANDCORPUS-2
stub rule.
