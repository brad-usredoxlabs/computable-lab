# GC-17 SPEC — vendor-exa 502 on every run-page mount: dead-key refusal handled honestly end-to-end

Drafted by cl-spec-composer 2026-10-30 ~22:10 EDT, lane 1, trunk cl/integration-1
(worktree /mnt/vast/home/brad/git/cl-integration-1; observed HEAD at drafting 73265b3f —
the orch dispatch named 3b9e81eb; trunk moved during drafting. Branch off trunk HEAD AT CLAIM TIME).
Status: DRAFT for orchestrator review. Binding inputs: GC-17 task block (task-list.md tail),
dossier BRAD REVIEW 2026-10-30, interim spec_direction (refined here, direction kept).

## Goal (one sentence)

Make the declared Exa capability truth drive behavior end-to-end: an unconfigured OR
key-rejected vendor search answers as an honest `configured: false` capability read (HTTP 200,
zero console noise), a genuine upstream outage with a valid key stays a visible typed 502,
and the client gates its searches on that capability — so a plain /runs/:runId load records
ZERO failed requests (the D4 witness).

## Current behavior matrix (all first-hand this drafting pass)

Live on :3092 (read-only curl, 2026-10-30 ~22:3x EDT — key present+enabled, upstream-invalid):

| Condition | resolveExaConfig | Handler response today | Verified how |
|---|---|---|---|
| key present, upstream rejects it (401) | non-null | **502 EXA_SEARCH_FAILED**, message = upstream text ("Exa search failed: HTTP 401: Invalid API key…") | LIVE curl |
| no key / `enabled: false` / empty key | null | **503 EXA_NOT_CONFIGURED** (VendorExaHandlers.ts:87-93) | code-read (cannot live-probe without touching Brad's config — do NOT) |
| short/missing `q` | — | 400 BAD_REQUEST (validation, keep) | LIVE curl |
| valid key working | non-null | 200 `{configured:true, query, items}` (VendorExaHandlers.ts:124) | code-read (needs Brad's key; mock evidence is the gate) |
| GET /api/config shape | — | `integrations.exa = { enabled: true, apiKey: '***' (redacted), … }` | LIVE curl |

Client today (all read first-hand):
- app/src/shared/vendor-exa/useVendorExaSearch.ts:52-98 — fires on ANY query >= 2 chars
  (debounce 350 ms); initial `configured` state is **true**; on throw it sets
  configured=false + error but STILL refires on every subsequent keystroke (no negative
  caching); its `error` is dropped by useMaterialSearch (not in its return surface) — the
  browser-console 502 is the only observable.
- Mount-fire evidence: gate trail network arrays (receipts GC-14/20261029T181557-gate,
  root/partB/C/D/E/F/G/I/J): on every /runs/:runId mount, `POST /api/vendor/exa/search` 502
  sits immediately after `POST /api/labware-definitions/search` 200 and next to a
  `GET /api/config` 200. That fingerprint matches the slash-menu resolver path
  (resolveLabware/resolveEquipment -> `appendVendorExaHits`, resolvers.ts:362-382/501/532,
  which reads exaVendorEnabled -> GET /api/config), preloaded via SlashMenuExtension.ts:197
  initial resolve — NOT the useMaterialSearch:122 path named in the gate report (that hook's
  query is empty at mount and MIN_QUERY_LENGTH=2 blocks it; it fires the moment a user types).
  The scout recon for this timed out (endpoint busy) — treat the exact preload chain as
  SCREENED, not fully traced; see Open Q1. It does not change the fix: the server contract
  below makes EVERY fire path honest, client or server side.
- The existing vocabulary is already there and MUST be reused, not duplicated:
  app/src/shared/lib/integrationFlags.ts (`exaVendorEnabled()` — fetch-once-per-page-load
  cached read of the declared `enabled` flag, mirrors server normalizeConfig semantics,
  has `resetIntegrationFlagCacheForTests()`), already consumed by resolvers.ts
  appendVendorExaHits (SHORTHAND-CORPUS WS6 D1 — "when the integration is declared off,
  NO request fires"). The server already declares `configured: boolean` on
  VendorExaSearchResponse (server VendorExaHandlers.ts:42-46, mirrored client-side in
  shared/api/client.ts:1380-1384).

Why fire-gating alone cannot fix D4: with `enabled: true` + an INVALID key (exactly
Brad's live config), the declared capability says "on" — no pre-fire gate can know the
key is dead. AND the browser logs ANY HTTP >= 400 response as a console/resource error
that JS cannot suppress (the resolvers.ts:357-359 comment says this verbatim). So the
load-bearing half is the SERVER response contract: unconfigured/key-rejected must be
HTTP 200 `configured:false`, not 502/503.

## The chosen contract

Server, POST /api/vendor/exa/search (VendorExaHandlers.searchExa):

1. `q` validation unchanged (400 BAD_REQUEST).
2. `resolveExaConfig` null (no key / empty key / `enabled:false`) -> **200**
   `{ configured: false, query: q, items: [], reason: 'not_configured' }`
   (replaces the 503 EXA_NOT_CONFIGURED; EXA_NOT_CONFIGURED stays in its other homes —
   tools/corpusIntake.ts exit-code contract, EquipmentHandlers, VendorSearchHandlers —
   those surfaces are OUT of scope, do not touch).
3. Upstream rejects the credential (Exa answers 401/403) -> **200**
   `{ configured: false, query: q, items: [], reason: 'key_rejected' }`.
   Detection MUST be by HTTP STATUS, carried on a typed error out of
   server/src/integrations/exa.ts (e.g. an `ExaRequestError` with `status: number`),
   NOT by string-matching "Invalid API key" (see reviewer bait).
   `reason` is a server-authored fixed string; never echo upstream response bodies
   beyond the current redaction level (spec_direction is binding here).
4. Genuine upstream trouble WITH a credential (timeout, network error, upstream 5xx,
   any other non-auth non-2xx) -> **unchanged 502 EXA_SEARCH_FAILED**. POLICY CALL,
   stated for the adversarial reviewer: a real outage behind a valid key is an
   abnormal event and MAY legitimately stay a visible typed console error; laundering
   it into 200 would hide a real failure. Only the credential-capability class goes quiet.
5. Happy path byte-identical: `{ configured: true, query, items }`.

The `configured` semantic is thereby re-declared honestly: `configured: true` means
"the vendor tier actually answered"; `configured:false` + `reason` is the typed refusal.
No new declarative surface is invented (stop_boundary honored) — this is an honest
capability READ of the same `integrations.exa` data the server already declares.

Client, app/src/shared/vendor-exa/useVendorExaSearch.ts:

6. Gate every fire on the existing `exaVendorEnabled()` capability read (await the
   once-per-page cached flag before the debounced fetch — same idiom as
   resolvers.ts appendVendorExaHits). `enabled:false` or a cached sticky-negative => ZERO
   requests. Do not invent a second flag/vocabulary term.
7. On a `configured:false` response: `setConfigured(false)`, empty items, **no error
   string**, and mark the negative sticky for the page load via a new seam on
   integrationFlags (e.g. `noteExaUnavailable()` that sets the cached promise to false,
   so the 3-4 surfaces on a run page don't re-probe after the first honest refusal).
   Sticky applies ONLY to `configured:false` (credential/capability truth) — a 502
   outage must NOT stick (a blip must not silently kill the tier for the session).
8. A genuine 502 (valid key, real outage) keeps today's throw->error path (typed,
   surfaced via the hook's `error`); only its console witness exists when Exa is really down.
9. Consumers need NO markup changes: AddMaterialModal / AddToDeckDialog /
   SetupSearchCombobox already render the Vendor tier only when exaResults.length > 0,
   so `configured:false` surfaces quietly for free (no dead chrome: the tier is absent,
   and the existing `configured` state is available if a later surface wants a stated
   reason — do NOT add new UI copy in this item).

## Files

IN (worker-owned; branch `wt/gc-17-lane1-<ts>` off cl/integration-1 at claim):
- server/src/integrations/exa.ts — typed error carrying upstream status (search path;
  keep exaGetContents behavior, extend only if the same error class fits for free).
- server/src/api/handlers/VendorExaHandlers.ts — response mapping per the contract.
- server/src/api/handlers/VendorExaHandlers.test.ts — NEW (no server test exists for
  this handler today; grep: zero refs to /vendor/exa/search outside routes.ts).
- app/src/shared/vendor-exa/useVendorExaSearch.ts + useVendorExaSearch.test.ts (extend).
- app/src/shared/lib/integrationFlags.ts + integrationFlags.test.ts (sticky-negative seam).
- app/src/shared/api/client.ts — type-only: add `reason?: string` to
  VendorExaSearchResponse (mirror of the server interface).

OUT (do not touch): config.yaml (gitignored, Brad's credential — no credential ever in
git, no config-semantics change); server/src/api/handlers/EquipmentHandlers.ts and
VendorSearchHandlers.ts (same legacy 503/502 pattern on OTHER surfaces — none on the
run-page mount path; consistency cleanup = separate item, flagged in Open Q2);
/vendor/exa/from mint route (no Exa call inside); app/src/event-editor/material/
useMaterialSearch.ts and AddMaterialModal/AddToDeckDialog/SetupSearchCombobox UI
(hook contract keeps its current return shape; touch useMaterialSearch.ts ONLY if a
type change forces it — its own file boundary in the task block allows "as needed");
schema/** (no YAML — no stack restart needed).

## Acceptance criteria (VERBATIM from the task list `verified_by`)

> Unit: useVendorExaSearch fires zero requests when capability says not-configured (test
> pins fetch count); server maps an invalid upstream key to the honest typed response, no
> 5xx. Console: a plain /runs/:runId load records ZERO failed requests (browser gate,
> receipts; run-page mount = the exact D4 witness). Regression: a configured-key path still
> returns hits (mock exa in tests; live path needs Brad's key — record as environment note,
> mock evidence is the gate).

## RED-first tests (write these failing FIRST, pin the inversion in the commit message)

Server — server/src/api/handlers/VendorExaHandlers.test.ts (new; fastify inject or direct
handler call with a fake AppConfig + fetchFn injection point — exaSearch already takes
`fetchFn` as a parameter, exa.ts:135, prefer injecting there):
- T1 RED->GREEN: config present but injected fetch answers 401 -> expect statusCode 200,
  body `{ configured: false, reason: 'key_rejected', items: [] }`, and assert the body
  string contains NO key material (no 'sk-', no header value — assert the literal key you
  injected for the mock is absent from the payload).
- T2: config null (no apiKey, no env; save/restore process.env.EXA_API_KEY around it) ->
  200 `{ configured:false, reason:'not_configured', items:[] }` (this INVERTS the current
  503 expectation — call it out in the commit).
- T3: injected fetch answers 500 (and separately a forced timeout/abort) -> STILL
  502 EXA_SEARCH_FAILED (anti-laundering pin: outages do not become 200).
- T4: `q` shorter than 2 -> 400 (unchanged, pin it).
- T5: fetch 200 with `results[]` -> 200 `{configured:true, items…}` shape unchanged
  (the configured-key regression leg; mock evidence IS the gate per verified_by).

Client — useVendorExaSearch.test.ts (extend existing file):
- T6: integrationFlags says enabled:false (mock the module; call
  resetIntegrationFlagCacheForTests in afterEach) + setQuery('cayman') -> after
  > debounce, `searchVendorExa` mock call count EXACTLY 0 (pin count, not emptiness).
- T7: response `{configured:false, reason:'key_rejected', items:[]}` -> hook
  configured=false, error===null, exaResults empty; a SECOND query after that fires
  ZERO additional requests (sticky-negative).
- T8: rejection with a 502-class error (valid-key outage) -> configured=false + error
  set (typed visibility kept) and the NEXT query still fires (outage is NOT sticky).
- Existing T (line 63, 'surfaces configured=false and an error when the search fails')
  will need re-work under the new contract — expected RED inversion, disclose in commit.
- Existing AddToDeckDialog.test.tsx mocks the whole apiClient module; if the hook now
  awaits exaVendorEnabled (apiClient.getConfig via integrationFlags), those mocks must
  gain a getConfig stub — check `npx vitest run src/event-editor/deck` after, no
  collateral failures allowed.

## First targeted check (the single command that proves the approach early)

After the SERVER half lands (before any client work), restart is NOT needed (no YAML;
tsx --watch reloads TS):

  curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3092/api/vendor/exa/search \
    -H 'content-type: application/json' -d '{"q":"rot","category":"catalog"}'

Expect `200` (was 502) — with Brad's live invalid key this alone kills the D4 console
error class. If it still prints 502, the auth-class mapping did not take; stop and fix
before continuing. (Never print the full upstream body beyond the redacted level;
the -o /dev/null form above keeps output minimal.)

## Verification commands (with expected output)

- Server touched suites:
  `cd /mnt/vast/home/brad/git/cl-integration-1/server && npx vitest run src/api/handlers/VendorExaHandlers.test.ts src/tools/corpusIntake.test.ts`
  -> all green (corpusIntake pinned EXA_NOT_CONFIGURED at tool level — must stay green:
  it does NOT go through the HTTP handler, prove it).
- Client touched suites:
  `cd /mnt/vast/home/brad/git/cl-integration-1/app && npx vitest run src/shared/vendor-exa src/shared/lib/integrationFlags.test.ts src/event-editor/deck/AddToDeckDialog.test.tsx src/event-editor/material`
  -> all green (base-parity carve-out: documentMapper-protocol/RefCombobox/ChipCombobox
  named fails are a KNOWN base-parity set elsewhere; NOTHING in the four suites above is
  in that set — any failure here is yours).
- Typecheck (exactOptionalPropertyTypes on both workspaces; baselines differ per lane
  snapshot — the floor is ZERO-NEW, never "exit 0"):
  `cd app && npx tsc --noEmit | grep -c 'error TS'` -> count EQUAL to the pristine-trunk
  baseline captured at claim time (record it in the report first; recent lane witnesses:
  12 at WIDGET-R1 merge, 21 at GC-14 gate — capture your own), zero error lines in
  touched files. Same for `cd server && npx tsc --noEmit | grep -c 'error TS'`.
- Live contract (read-only curl on :3092; NEVER touch :3001/:5174; gitignored key stays
  put, do not print values):
  - first-targeted-check above -> 200;
  - full body: `curl -s -X POST http://localhost:3092/api/vendor/exa/search -H 'content-type: application/json' -d '{"q":"rot"}'`
    -> JSON `{"configured":false,"query":"rot","items":[],"reason":"key_rejected"}`;
  - short-q: -d '{"q":"r"}' -> 400 BAD_REQUEST (unchanged).
- Browser gate (cl-browser-reviewer, receipts): plain /runs/<any lane run> load,
  listener-captured network+console -> ZERO entries with status >= 400 attributable to
  /api/vendor/exa/search (the protocols-steps 400 on protocol-less runs is the
  campaign-noted segregated item, D4-adjacent but NOT this fix — count exa only, per the
  D4 witness wording "ZERO failed requests" applies to the exa class; report the full
  network array either way). pageErrors 0.
- Hygiene: `git -c core.fileMode=false diff --name-only <base>..HEAD` stays inside the
  IN-file list; config.yaml never appears in any diff/staged set.

## Worker contract

- Worktree/branch: `wt/gc-17-lane1-<l1tHHMM>` off cl/integration-1 (lane trunk) at claim
  time HEAD; NEVER merge; orchestrator merges.
- Unique deliverable path pattern: `deliverables/gc-17-report-l1t<HHMM>.md`
  (same convention as widget-r1/r1t1355 fix reports; base dir per coder prompt).
- Report must record: baseline typecheck counts at claim, the RED outputs before
  inversion, curl witnesses, mock-vs-live disclosure (key regression leg is MOCK —
  environment note: live valid-key path needs Brad's key).
- Restart rule: no YAML/schema edits expected => no stack restart; if one becomes
  necessary, it IS a stop-boundary hit (see below).
- Never print/copy/commit any API-key value; the lane worktree config.yaml is a symlink
  to Brad's — treat it read-blind (shape-only reads like the jq/python redaction stub
  in this spec are acceptable).

## Stop boundaries (return requires-rescope to the architect, do NOT absorb)

- Any need to change config-file semantics (config.yaml shape, loader `${VAR}` rules,
  GET /api/config redaction) -> architect.
- Any need to store credentials in git or fabricate/replace a key -> hard NO, architect.
- Any NEW declarative surface beyond reading the existing capability honestly (e.g. a
  new vendor-capability YAML, a capability registry) -> architect.
- If the D4 witness still shows a failed exa request after both halves land (some fire
  path bypasses the hook/contract) -> STOP with the trail evidence; do not widen scope.
- tsc baseline drift beyond touched files, lockfile repair, :3001/:5174 anything -> stop.

## Reviewer bait (anticipated adversarial review — pre-empted here)

1. exactOptionalPropertyTypes sites: `reason` is optional — build it with conditional
   spread (`...(reason ? { reason } : {})`), NEVER `reason: undefined`. Same for any
   spread into exaSearch's request body. This repo has a hard bar (BiosourceHandlers
   test idiom: "absent, NOT undefined").
2. YAML-reload trap: none expected (no YAML in scope) — but tsx --watch DOES reload
   server TS; do the first-targeted-check curl right after saving handler changes, and
   if a restart ever seems needed, that's a stop-boundary signal, not a task step.
3. Hardcode boundary: the fix must NOT special-case the string "Invalid API key" nor
   name vendors/categories in new branches; the auth-vs-outage split rides the upstream
   HTTP STATUS through a typed error (401/403 = credential capability false). String-
   matching upstream prose = hardcoded vendor policy = rejection bait. Likewise do not
   hardcode the client gate off key SHAPE (integrationFlags.test.ts:52 already pins that
   lesson: "key shape must never drive the gate").
4. Duplicate vocabulary: exactly two capability words exist and stay — server-declared
   `configured` and client `exaVendorEnabled`/enabled. Do NOT mint
   `exaAvailable/usable/live/disabled` twins; sticky-negative goes through the EXISTING
   integrationFlags cache (one cache, one term), not a new module-level flag.
5. Anti-laundering: reviewer will hammer the 200-on-failure contract. Defense, stated
   in the code comment: `configured:false` IS the typed honest answer for a capability
   question; the failure CLASS that stays loud is 502 EXA_SEARCH_FAILED for real outages
   (T3 pins it). A test that turns the 500-case into 200 is a defect, not a fix.
6. Key-material leak: 502 messages today embed upstream text (already no key echo —
   the live probe shows Exa's own refusal names the header FIELDS, not values). The new
   200-path reason strings are server-authored constants; tests must assert the injected
   mock key literal never reaches the response body.
7. Fetch-count pinning: "no requests" must be pinned by CALL COUNT === 0, not by empty
   results (empty results are also produced by an errored request — the whole defect).
8. Regression collateral: AddToDeckDialog.test.tsx + resolvers tests mock apiClient
   wholesale; the new config-await must not break them (they mock `getConfig` too or
   import the real integrationFlags — run the deck suite).
9. Out-of-scope temptation: EquipmentHandlers'/VendorSearchHandlers' 503/5xx lines look
   identical and "should" be fixed — they are NOT on the run-page mount path; fixing
   them here violates the file boundary. Named in Open Q2 instead.
10. Ontology terms: not required — this item touches no claim/context/evidence surfaces.

## Open questions (unresolved locally; for the orchestrator)

1. Exact mount-fire chain: gate trail fingerprint (GET /config + labware-definitions/
   search preceding the 502 on mount, absent on /analysis|/sequences|/claims) points at
   the slash-menu PRELOADED resolver path (resolvers.ts resolveLabware/resolveEquipment
   -> appendVendorExaHits; SlashMenuExtension.ts:197 initial resolve with a non-empty
   preloaded query), NOT the useMaterialSearch:122 chain the D4 report cited (that one
   cannot fire empty-query, MIN_QUERY_LENGTH=2). My scout dispatch timed out (endpoint
   busy at 22:1x-22:3x). I checked: no prewarm/prime call sites in app/src; the mount
   trail matches resolver signatures. The fix covers every path via the server contract,
   so this does NOT block implementation — but the coder's first targeted check plus the
   browser gate will show empirically which chain is live; if a fire STILL 502s after
   both halves land, that is the stop-boundary evidence, not a reason to widen scope.
2. Should GET /equipment/exa-search (EquipmentHandlers.ts:61 EXA_NOT_CONFIGURED) and
   VendorSearchHandlers.ts:949/989 adopt the same honest contract in a follow-up item?
   They share the defect class but are not on the D4 mount path. Recommend a QUEUED
   consistency item; deliberately out of GC-17's file boundary.
3. Sticky-negative lifetime: spec'd once-per-page-load (mirrors the existing
   integrationFlags cache + its test seam). A page reload re-probes — assumed desired
   (a pasted-in valid key heals without redeploy). Flag if the orchestrator wants TTL
   semantics instead; that would edge toward new capability-cache policy (architect).

Environment note for the report/gate: live valid-key regression needs Brad's key;
mock evidence IS the gate (verified_by verbatim). Lane :3092/:5192 untouched beyond
read-only curls this drafting pass.

SPECCOMP-GC17-DRAFT DONE
