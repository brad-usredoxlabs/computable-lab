# SPEC DRAFT — L2-THREAD-SCOPED-1 (lane 2) — per-tab AI threads
Draft by cl-spec-composer, 2026-10-28, output tag l2t0010. DRAFT — orch review/promotion required before dispatch.
TRUNK VERIFIED AGAINST: 0c9a30023a594428e871849e9883e7fc954c36ad (cl/integration-2 @ /mnt/vast/home/brad/git/cl-integration-2)

## 1. Goal
Give each browser tab its own server-keyed AI thread (client mints a per-tab id via sessionStorage, server keys threads on (endpoint, user, threadId)) so automation sessions (cl-browser-reviewer minting x-user-id USR-BRAD) are invisible to human tabs and vice versa — ending the cross-session chat contamination Brad saw first-hand.

## 2. Why (binding framing — DIVERGENCE NOTE honored)
The justification is exactly the three arms the task-list DIVERGENCE NOTE mandates:
(a) Brad first-hand saw the browser-reviewer's chat in his own tab (reviewer sessions mint x-user-id USR-BRAD against the lane stack; same surface+user = same thread today, per aiThreadClient.ts header "single live thread per user" per endpoint — verified at app/src/shared/api/aiThreadClient.ts:4).
(b) Two tabs of one scientist cannot hold two conversations.
(c) Automation sessions contaminate human tabs and vice versa; per-tab threading fixes the reviewer-as-observer contamination class permanently WITHOUT special-casing the reviewer.
DO NOT build this on the L2-SUITE-A D3 root-cause claim. The re-drive traced D3's browser "success-with-nothing" to the useAiChat empty-success gate defects (fixed in uifix1 e706359e / uifix2 leg E), NOT to shared-thread inherited history. Shared-thread contamination is a real, independent concurrency defect; D3 is not this item's proof.

## 3. Current machinery (composer-verified at 0c9a3002 — all cites re-read first-hand)
- app/src/shared/api/aiThreadClient.ts (123 lines): getThread(:68), appendThreadMessage(:76), promoteThread(:94); threadUrl = `${API_BASE}/ai/threads/${endpoint}` (:110); threadHeaders() mints x-user-id + x-cl-session (:123). NO thread id anywhere.
- Server routes: server/src/api/routes.ts:732-734 (GET/POST `/ai/threads/:endpoint`, POST `/ai/threads/:endpoint/promote`).
- server/src/api/handlers/AiThreadHandlers.ts: resolveUserId falls back to 'default' (:28-32); getThread (:40), appendMessage (:58), promote (:83) reads the thread via store.getThread(userId, endpoint) (:107), builds the conversation payload (:118-133), creates the record, then store.clear(userId, endpoint) (:151).
- server/src/ai-threads/AiThreadStore.ts: FILE-backed, not in-memory. Key formed in threadPath() = `join(rootDir, safeUser, `${endpoint}.json`)` (:52-55); root = var/ai-threads (gitignored via var/), override AI_THREADS_ROOT (server/src/server.ts:958-960). tmp-then-rename writes (:167-177); snapshot rotation at 500 msgs keeping tail 100 (:137-140, :188-198, files named `${endpoint}.${stamp}.snapshot.json` in the SAME user dir). sanitizeSegment guards traversal (:224-232).
  EXISTING escape hatch NOT to confuse: an `AppendMessageInput.conversationId` routes appends to `var/ai-threads/_conversations/${id}.json` (conversationPath :61-64, append :116-126, getConversation :67-84). Grep-verified: NO app caller ever sends conversationId (server-side/tests only). Leave it untouched; per-tab threadId is a DIFFERENT axis.
- app/src/shared/hooks/useAiChat.ts: only two thread call sites — getThread(endpoint) in the hydration effect (:651, effect deps [endpoint], sets messages once via `prev.length > 0 ? prev : hydrated`, marks persistedIdsRef) and appendThreadMessage(endpoint, {...}) in the sync effect (:712). MAX_HISTORY site: MAX_HISTORY_MESSAGES = 20 (:189), buildConversationHistory `.slice(-MAX_HISTORY_MESSAGES)` (:200) over the hook-LOCAL messages array (hydration output + session appends, 1:1 with the thread), consumed once at :921 for streamAssist. The slice is ALREADY tail-N of the thread — per-tab keying makes it tail-N of the tab's thread automatically; do not add a second slice.
- promoteThread callers (complete enumeration, non-test): app/src/extraction/ExtractionReviewPage.tsx:182 (promoteThread('literature', ...)) and app/src/protocols/ProtocolCandidatesView.tsx:115 (promoteThread('protocols', ...)). Both are page-level side effects with NO chat chrome of their own on the same tab necessarily. Both call the aiThreadClient wrapper, so §4's client-side minting means they automatically carry the tab id with ZERO call-site changes (pin this in tests).
- useAiChat consumers with endpoint set (threaded surfaces): DeckSurfaceChat.tsx:165-167 (endpoint 'event-editor'), RunSurfaceChatBridge/RunWorkspacePage, SequencesPage, and the AiTabPanel-mount surfaces, all via useSurfaceChat (app/src/agent/useSurfaceChat.ts) which registers the chat in AiPanelContext.
- Chat chrome: HarnessChatPane (app/src/agent/HarnessChatPane.tsx) is the surviving pane (consumes useAiPanel().chat; renders SurfaceFocusHeader + ChatLog; pure consumer, never registers). AiTabPanel is being REPLACED by HarnessChatPane surface-by-surface in L2-CHAT-UI-1 — so the picker goes in HarnessChatPane (see OQ-2).
- Server store tests: server/src/ai-threads/AiThreadStore.test.ts (8 tests green at tip) + AiThreadStore.conversation.test.ts. Handler-level fastify.inject pattern is established (e.g. server/src/api/handlers/InventoryShelfHandlers.test.ts:93).
- App hydration test pattern: app/src/shared/hooks/useAiChat.hydration.test.ts (vi.mock('../api/aiThreadClient')) — reuse this shape for the new app tests.

## BINDING AMENDMENT — ARCHITECT RULING 2026-10-28 (orch l2t2015): ONE DECK PER THREAD
Amendments A-1..A-5 in `/home/brad/.hermes/cl/lanes/2/decisions/SUITEA-D3-deck-thread-scope-l2t2015.md`
are BINDING and OVERRIDE §§4.1/4.3/4.4/4.5/4.7 of this draft wherever they conflict
(thread key = (userId, endpoint, scope, threadId); scope = deck eventGraphId or reserved
"_"; second header x-cl-thread-scope inside threadHeaders(); file layout
var/ai-threads/{user}/{endpoint}/{scope}/{threadId}.json; scope-filtered thread list;
added acceptance criteria (4)(5)(6) from the ruling). Read the decision file IN FULL
before dispatch; it also PINS edges (unsaved deck under "_", per-tab distinct ids under one
scope, tab-duplicate map inheritance) and requires NO Brad re-approval (same goal, files,
dispatch count). The D3 leak scenario is closed by acceptance (6) when SUITE-A re-gates.

## 4. Design (numbered decisions; smallest change each)

4.1 CLIENT MINT (aiThreadClient.ts). Add a module-level `getThreadTabId(): string` that lazily mints `crypto.randomUUID()` ONCE per tab into sessionStorage key `cl.ai-thread-tab-id` and returns it; every subsequent call returns the stored value (mint-once). Guard `typeof sessionStorage === 'undefined'` like base.ts guards localStorage (return a per-call ephemeral id, never throw, in non-browser contexts). All three wrappers (getThread/appendThreadMessage/promoteThread) automatically carry it — legacy callers need no edits.

4.2 TRANSPORT — CHOSEN: HTTP header `x-cl-thread-id`, added inside the existing threadHeaders() (:123). Rationale (smallest): threadHeaders() is already the single site that attaches identity to every thread request (all three methods, one function); a query param would instead fork threadUrl() and change URL identity that three e2e route matchers (app/e2e/sequences-harness-chat.spec.ts:38/:173, sequences-multiselect.spec.ts:35, sequence-chat-scroll.spec.ts:27) pattern on — headers keep `new URL(...).pathname` matching byte-identical, which the query param also survives but the header touches strictly less surface. Server reads request.headers['x-cl-thread-id'].

4.3 SERVER KEY EXTENSION (AiThreadStore.ts). Threads key on (userId, endpoint, threadId). File layout: `var/ai-threads/{user}/{endpoint}/{threadId}.json` — a DIRECTORY per (user, endpoint), so the thread-list endpoint is one readdir of that directory. This deliberately avoids the sibling-file collision the legacy flat layout would cause with snapshot files (`${endpoint}.${stamp}.snapshot.json` lives in {user}/ — a `${endpoint}.*.json` glob would list snapshots; the directory layout makes snapshots irrelevant) and keeps `_conversations/` and legacy `{user}/{endpoint}.json` out of the new namespace. sanitizeSegment the threadId too. Methods: getThread(userId, endpoint, threadId) / append(..., threadId) / clear(...) — legacy methods either retire or delegate; the LEGACY flat file is NOT read by any new code path (no migration, see OQ-3).
  NO-FALLBACK RULE (binding): an absent, malformed, or unknown threadId yields a FRESH EMPTY thread; the store MUST NEVER read another thread of the same (user, endpoint) — not the legacy flat file, not a sibling threadId, not "most recently updated". Pinned by test (verified-by 2).

4.4 HANDLERS (AiThreadHandlers.ts + routes.ts). resolveThreadThread: read the x-cl-thread-id header (string or fresh-empty semantics; malformed header => treated as absent => fresh thread; never 4xx, never fallback). GET/POST/promote all thread-scoped through it. NEW route: GET /api/ai/threads/:endpoint/threads -> `{ threads: [{ threadId, title, updatedAt, messageCount }] }` for the calling user+surface, sorted updatedAt desc. title = first USER message content, trimmed, truncated to 60 chars + ellipsis — computed server-side from each thread file (pure store data; NO new schema, NO new record type: the thread list is a readdir + messages[0] read, and conversation.schema.yaml is NOT touched — promoted payload in AiThreadHandlers :118-133 stays byte-identical in its schema-visible fields).

4.5 PROMOTION — semantics UNCHANGED: promote reads the tab's CHOSEN thread (header-threaded), creates exactly one conversation record, clears exactly that thread (store.clear(userId, endpoint, threadId)). A no-id promote gets a fresh empty thread => the existing honest 400 'Live thread is empty; nothing to promote' (:113-115). Enumerated legacy callers (ExtractionReviewPage.tsx:182, ProtocolCandidatesView.tsx:115) go through the wrapper => always carry the minted tab id => safe without edits; pin with an app test that promoteThread sends the header.

4.6 MAX_HISTORY: no code change (site verified: useAiChat.ts:189-205 slicing the hook-local messages, which is the thread's content); ADD a test pinning "hydrated 25-message thread => streamAssist receives exactly the last 20 user/assistant messages" so the tail-N-of-thread invariant survives future refactors.

4.7 PICKER (chat chrome, HarnessChatPane.tsx). Next to SurfaceFocusHeader: (a) a thread-list control (select or disclosure list) fed by the new GET .../threads, rows = title + updatedAt; (b) a "New thread" button. Switching = write a new (listed or freshly minted) threadId into sessionStorage `cl.ai-thread-tab-id` and re-key the chat. Mechanism (proposal, coder's detail): useAiChat keeps `threadId` state (init getThreadTabId()), hydration + sync effects key on [endpoint, threadId]; on threadId CHANGE (not first mount) reset messages/persistedIdsRef/hydratedRef so the new thread rehydrates; expose threadId + switchThread(id) + newThread() on UseAiChatReturn; the pane renders the picker from chat.switchThread. Only surfaces whose chat carries an `endpoint` render the picker (a picker with no threads behind it is dead chrome — dead chrome is a defect). Do NOT touch AiTabPanel. No rename affordance. Keep the pane's existing honest-failure wall, proposal card, ChatPreviewCard, ChatLog byte-untouched.

4.8 Reload behavior (pinned by app test): sessionStorage survives reload => the tab KEEPS its thread across reloads (same as today's global thread did, now per-tab). Tab DUPLICATE inherits the minted id (browser sessionStorage copy semantics) — accepted, documented edge, not a defect.

## 5. Files in scope
IN: app/src/shared/api/aiThreadClient.ts; app/src/shared/hooks/useAiChat.ts; app/src/agent/HarnessChatPane.tsx (+ HarnessChatPane.css if needed); server/src/ai-threads/AiThreadStore.ts (+ types.ts if a param type is needed); server/src/api/handlers/AiThreadHandlers.ts; server/src/api/routes.ts; tests: server/src/ai-threads/AiThreadStore.test.ts (+ sibling for handler-level), new app tests alongside the hydration-test pattern, new HarnessChatPane picker tests.
OUT (do not touch): schema/knowledge/conversation.schema.yaml (no schema change — the thread list is pure store data); app/src/event-editor/right-pane/ai/AiTabPanel.tsx; server/src/workspace-session/*; the conversationId escape-hatch code paths; any protocol/record/QMS file; :3001/:5174 stacks.

## 6. Acceptance criteria (VERBATIM from task-list verified-by)
"Vitest: (1) two threadIds for same surface+user yield isolated transcripts — a
message posted to one never appears in the other's GET; (2) absent threadId creates
fresh, does not fall back; (3) thread list returns the user's threads for a surface,
promotion moves exactly the chosen thread. App tests: new tab = new empty thread
(sessionStorage id minted once per tab); picker switches active thread; reload
KEEPS the tab's thread. Browser receipt (:5193): reviewer opens the deck surface as
USR-BRAD and posts; a separate human-shaped session (or clean browser context, same
user) shows an EMPTY thread — explicit criterion "automation sessions are invisible
to human tabs and vice versa". Lane-2 note appended for lane 1 (browser gates there
ride the same pattern once merged)."
The UI acceptance is VISUAL (browser-gate class) and the browser receipt above is orchestrator-owned (cl-browser-reviewer against :5193, VERDICT: accept). The coder NEVER runs the browser gate.

## 7. First targeted check (prove the approach early, before polish)
After the Leg-A store change only:
  cd /mnt/vast/home/brad/git/cl-integration-2/server  (worker worktree copy)
  npx vitest run src/ai-threads -t 'isolat'
RED-first: write the two-threadId isolation test first; GREEN means the key extension is real. Secondary live check after Leg A merges-to-worktree: two curls against :3093 with different x-cl-thread-id headers posting to /api/ai/threads/browser, then a GET with each header showing disjoint transcripts (curl transcript into the report).

## 8. Verification commands (with expected output)
Legs: A = server (store+handlers+route+server tests); B = client mint/transport + useAiChat + app tests; C = HarnessChatPane picker + tests. (B and C may merge if the coder lands them in one coherent diff; commit prefixes per leg regardless.)
  Server tests:  cd <worktree>/server && npx vitest run src/ai-threads src/api/handlers   -> 0 failed (baseline: ai-threads 8/8 green at tip)
  Server tsc:    cd <worktree>/server && npx tsc --noEmit                                  -> ZERO 'error TS' lines (re-derived 0 at 0c9a3002)
  App tests:     cd <worktree>/app && npx vitest run src/shared/hooks src/agent           -> 0 NEW failing files vs baseline at dispatch tip
  App tsc:       cd <worktree>/app && npx tsc --noEmit | grep -c 'error TS'               -> count EQUAL to baseline re-derived at dispatch start (composer measured 20 at 0c9a3002 — the e706359e-era figure of 12 is STALE post-uifix merges; DO NOT assume, re-measure in the fresh branch and record the number in the report baseline section)
  Playwright pin: cd <worktree>/app && npx playwright test sequences-harness-chat.spec.ts --project=chromium -> green (proves header transport didn't break the pathname-mocked thread routes)
  No YAML touched -> no stack-restart dependency; if the coder touches ANY schema yaml that is scope creep (report it, don't restart around it).

## 9. Hot-file serialization (SH-QA rule) — read before branching
useAiChat.ts is HOT RIGHT NOW: uifix2 leg E is live on branch cl/lane2-suite-a-uifix1-l2t1755 (worktree wt/L2-SUITE-A-uifix1-lane2-l2t1755) editing the useAiChat.ts:1383 region. RULE: the coder branches off the trunk tip AT DISPATCH (which will already contain the merged uifix2 work — L2-SUITE-A closes before this item claims; deps: L2-SUITE-A in the task block enforces this). Any useAiChat.ts edit SERIALIZES AFTER that merge. If at dispatch time SUITE-A/uifix2 is still open on trunk, STOP and report — do not branch off a stale tip, do not edit the 1383 region concurrently.

## 10. Constraints (all binding)
- exactOptionalPropertyTypes (server): optional means absent OR value, never `undefined`. e.g. the threadId param/header must be conditionally spread, never `threadId: undefined`.
- No policy in TypeScript where data can carry it; no user-id or endpoint literals introduced; the 'default' user fallback (AiThreadHandlers:28-32) stays where it is.
- Dead chrome is a defect: the picker renders only where a threaded chat exists; no duplicate of existing chrome; no rename affordance; no new schema/record type (thread list is pure in-memory/readdir store data; threads remain non-records until promoted).
- Propose-never-write is unaffected: this item touches no AI-write path.
- Do NOT touch :3001/:5174. Lane stack restarts via /home/brad/.hermes/cl/lanes/2 helpers / cl-lane-stack.sh 2 restart are orchestrator actions; backend :3093, frontend :5193.
- Browser-gate is orchestrator-owned; coder delivers unit/app tests + report only.

## 11. Worker contract
- Worktree: /mnt/vast/home/brad/git/wt/L2-THREAD-SCOPED-1-lane2-<tag> ; branch cl/lane2-thread-scoped-1-<tag> off the trunk tip AT DISPATCH (git -c core.fileMode=false; the NFS checkout fakes ~2550 'modified' files via mode bits — always use -c core.fileMode=false, never 'restore' mode bits).
- Report (unique, write BEFORE any edit — baseline section first): /home/brad/.hermes/cl/lanes/2/deliverables/L2-THREAD-SCOPED-1-report.<tag>.md. Append per leg: what changed, commands run, raw output excerpts, the re-derived app-tsc baseline COUNT with the sha it was measured at. End with `STATUS: complete` and a final line `L2THREADSCOPED1 DONE <sha>`.
- Commits: one per leg, messages prefixed [L2THREADSCOPED1][A] / [B] / [C].
- Pin tsc baselines at start (server 0 expected, app ~20 re-measured — report both actuals, do not assume either).
- Append the lane-1 note to the report (verified-by tail): lane-1 browser gates ride this pattern once merged.

## 12. Reviewer bait (expect these in the adversarial review; pre-empt them)
1. FALLBACK LEAK: any code path where absent/unknown threadId reads the legacy {user}/{endpoint}.json, the _conversations files, or "latest" thread. The rule is fresh-empty, period. Test it at store AND handler level.
2. SNAPSHOT GLOB TRAP: naive thread listing that globs `${endpoint}.*.json` inside {user}/ would return snapshot files as threads — the directory layout (§4.3) is the fix; a reviewer will check for readdir filtering.
3. exactOptionalPropertyTypes sites: header value, AiThread.threadId plumbing, AppendMessageInput — optional never undefined. Server tsc is the net (baseline 0).
4. TRUNCATION HARDCODE: title truncation is one named constant applied generically to first-user-message content — no message-shape branching, no per-surface branches.
5. sessionStorage in module scope / SSR-unsafe import (useAiChat tests import the client under jsdom — mint lazily inside the function, not at module load).
6. YAML-reload trap: none expected — if the diff contains ANY schema yaml, that's the defect (no new schema was the mandate).
7. MINT-TWICE: any path that re-mints within a tab (sessionStorage write on every call instead of mint-once) — pin with the app test (two getThread calls in one tab => one id).
8. e2e breakage: headers chosen so pathname matchers keep working; a reviewer WILL run the sequences-harness-chat pin (§8).
9. Promotion blast radius: store.clear must clear ONLY the promoted threadId; a reviewer will grep for any remaining clear(userId, endpoint) that wipes the whole surface.
10. DIVERGENCE NOTE violation: the report/spec must not repeat the SUITE-A D3 shared-thread root-cause claim.
11. Hydration reset: switching threads without clearing persistedIdsRef re-posts the old thread's messages into the new one — pin with a picker-switch test.

## 13. Open questions for the orchestrator (composer could not fully resolve locally)
OQ-1 (RESOLVED by composer, needs ratification): the task block/spec-hint says "in-memory store — confirm". CONFIRMED NOT in-memory: AiThreadStore is file-backed JSON under var/ai-threads (gitignored), so threads SURVIVE backend restarts while sessionStorage tab ids do not (a closed tab orphans its thread files until GC or promote). No GC is proposed. Proceed file-backed? [Checked: AiThreadStore.ts header+threadPath+writeAtomic, server.ts:958-960, .gitignore var/.]
OQ-2: Picker home — composer recommends HarnessChatPane ONLY (it survives; L2-CHAT-UI-1 replaces AiTabPanel with it surface-by-surface). Consequence: AiTabPanel-only surfaces (literature/protocols/sequences pages) get per-tab isolation (client always mints) but NO picker until their migration legs. Accept this staging, or mandate a duplicate picker in AiTabPanel chrome? Composer says duplicating picker chrome into a pane scheduled for deletion violates the dead-chrome constraint — recommend approve pane-only. [Checked: L2-CHAT-UI-1 universal_scope in task-list, RightPane.tsx:96, RunWorkspacePage.tsx:161.]
OQ-3: Legacy flat threads (var/ai-threads/{user}/{endpoint}.json, incl. the lane stack's contaminated USR-BRAD reviewer history) become unreachable under the new key — no migration, no read path. Composer recommends LEAVE THEM (the data IS the contamination; migrating re-imports it). Confirm no one wants a 'legacy' threadId migration or a cleanup rm at restart. [Checked: threadPath layout, no server readers besides handlers.]

TRUNK VERIFIED AGAINST: 0c9a30023a594428e871849e9883e7fc954c36ad

## 14. ORCH RATIFICATION + PROMOTION (l2t0115, 2026-10-28 ~01:20 EDT)
Promoted from drafts/2026-10-28_L2-THREAD-SCOPED-1-DRAFT.l2t0010.md after first-hand
re-verification at trunk 0c9a3002 of ALL load-bearing cites: aiThreadClient.ts header +
threadHeaders() single-identity site (:123); AiThreadStore threadPath = join(rootDir,
safeUser, `${endpoint}.json`) + conversationPath/_conversations escape hatch +
sanitizeSegment alphabet ^[A-Za-z0-9._-]+$; routes.ts :732-734; resolveUserId 'default'
fallback; promote clears via store.clear(userId, endpoint); MAX_HISTORY_MESSAGES=20 +
buildConversationHistory slice site; useAiChat.ts getThread :651 / appendThreadMessage
:712; promoteThread callers ExtractionReviewPage.tsx:182 + ProtocolCandidatesView.tsx:115.
ALL CONFIRMED.

OQ-1 RATIFIED: proceed file-backed, NO GC. The task block mandates "extends the key,
does not replace the store"; the store is already file-backed — re-keying is the minimal
change. Orphaned thread files after tab close are gitignored local data; GC is out of scope.
OQ-2 RATIFIED: picker in HarnessChatPane ONLY. AiTabPanel is slated for replacement
surface-by-surface in L2-CHAT-UI-1; a duplicate picker there is dead chrome (hard rule).
AiTabPanel-only surfaces get per-tab isolation without a picker until their migration legs —
accepted staging.
OQ-3 RATIFIED: legacy flat {user}/{endpoint}.json files are ABANDONED, not migrated, not
read by any new path. They ARE the contamination; migrating re-imports it. No cleanup rm
mandated (leave on disk; harmless under the new key).

CLAIM GATE (unchanged): deps L2-SUITE-A + spec §9 hot-file rule — branch off trunk tip
containing merged uifix2; if SUITE-A/uifix2 still open on trunk at dispatch, STOP.
