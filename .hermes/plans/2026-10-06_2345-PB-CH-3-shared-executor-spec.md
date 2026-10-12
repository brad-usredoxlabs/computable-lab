# SPEC — PB-CH-3: One shared client executor — wake openSurface + useApplySessionDocument (single writer, no interpretation)

Status: DRAFT for orchestrator review (composer pid 2301457). NOT dispatchable until PB-CH-2 MERGES (hard dep).
Baseline trunk at spec time: `cl/integration-2` @ `009faa10` (docs-only commits since `e5395353`; the code tree is
IDENTICAL to `d56037d7` — `git diff --stat d56037d7..HEAD -- ':!*.md'` is EMPTY, verified). PB-CH-2 coder is LIVE
(base `e5395353`, worktree `wt/PB-CH-2-lane2-l2t2155`); the PB-CH-3 worker branches off trunk HEAD AT CLAIM TIME,
which must include the PB-CH-2 merge commit.

## Goal
Factor ONE client executor that turns (a) a tier-1 compiled agent action into registry-backed navigation via the
dormant `openSurface` primitive and (b) a tier-2 ACCEPTED compiled session document into a single
`useApplySessionDocument` replaceState — so every future chat stack shares one executor, one writer
(`OpenTabsContext.replaceState`), and one push path (the existing 500 ms `useSessionSync` effect), with unaccepted
documents structurally unable to enter the tab store.

## Binding decisions (campaign rulings — do not re-litigate)
- **Tier 1 non-destructive:** no record writes (the executor performs ZERO apiClient record calls — its only
  possible network effect is the existing session PUT), no unsaved-work loss, NO wholesale session replacement
  (tier 1 never dispatches `replace`/`close`; it rides `navigateActiveTab`/`activateTab`/`openTab` only).
- **Tier 2 `replaceState` callable ONLY from accepted compiled proposals.** Unaccepted docs NEVER enter
  `OpenTabsContext` and NEVER reach the 500 ms push. This is enforced by the executor's API shape (no raw
  `replaceState` re-export, accept-attestation required by the entry point) plus the two-client harness proof.
- **Idempotent apply:** duplicate delivery / repeat click cannot double-apply; the dedup key is the accept
  identity (`draftId + revision + reviewHash`), NOT the document bytes — so a NEW revision (new reviewHash)
  always applies. Idempotence must not block intentional later revisions.
- **Stop-boundary (task-verbatim):** if focus cannot go through established state/registry mechanisms, RETURN —
  do NOT add a blocking confirm dialog to paper over an unsafe tier-1 op; diagnostic + no movement instead.
  Concretely: no `window.confirm`, no approval prompt, anywhere in the executor. Unknown surface, unroutable
  target, unmappable tab kind, or missing focus provider ⇒ `{ok:false, code}` + zero state mutation.
- AR-3: activate the dormant zero-caller primitives, do not build new machinery. VERIFIED dormant status at HEAD:
  `openSurface` has ZERO production callers (only its own test `app/src/shared/session/applySessionDocument.test.ts:49,63`),
  `useApplySessionDocument` has ZERO callers at all (`app/src/shared/session/useSessionSync.ts:45` is the definition;
  grep over `app/src` finds no import sites).
- Lane discipline: worktree off claim-time trunk HEAD; runtime evidence ONLY on :3093/:5193; NEVER touch
  `/mnt/vast/home/brad/git/computable-lab` or :3001/:5174. `git -c core.fileMode=false` (NFS). No stack restart
  needed for this task (zero server/YAML changes — see Out of scope).

## What is on trunk vs what PB-CH-2 will add (name the dep by CONTRACT, not file path)
**ON trunk today (verified by reading each at `009faa10`/`e5395353`):** everything in
`app/src/shared/session/` (`openSurface.ts`, `useSessionSync.ts`, `sessionYaml.ts`, `tabId.ts`, `applySessionDocument.test.ts`,
`useSessionSync.test.ts`), `app/src/shared/surfaces/{registry,surfaceRoute,resolveSurface}.ts`,
`app/src/shared/surfaces.ts`, `app/src/shared/shell/OpenTabsContext.tsx`, `app/src/shared/lib/openContent.ts`,
`app/src/shared/shell/WorkspaceTabStrip.tsx` (`tabPath`), and the drafts host mechanism (`server/src/drafts/**`,
sequence-authoring only) from the landing commit `d56037d7`.
**NOT on trunk — arrives with the PB-CH-2 merge:** `server/src/drafts/workstateCompile.ts`, the `workstate`
adapter key, `schema/workflow/workstate-intent.schema.yaml`, `config/drafting/workstate-tab-kinds.yaml`. This spec
depends on NONE of those paths. The PB-CH-3 dep is the **CONTRACT**: `POST /api/drafts/accept` returns HTTP 200 with
the authoritative stored compiled result as its JSON body (`FormDraftService.ts:186` `return compiled.result` — landed
at `d56037d7`), and for the workstate adapter that result carries, per the promoted PB-CH-2 spec §2
(`.hermes/plans/2026-10-06_2155-PB-CH-2-workstate-draft-adapter.md:71`):
```ts
{ sessionDocument: {version: 1, tabs: [...], activeTabId: string | null}, summary: string, resolvedTerms: [...] }
```
alongside the service's own envelope fields `draftId`, `revision`, `reviewHash`, `canAccept`
(PB-CH-2 spec's `CompiledDraft` citation `FormDraftService.ts:27-31`). The executor defines its OWN local
structural input type for this accept body — it MUST NOT import anything from `server/**` or from the arriving
PB-CH-2 module paths. Test fixtures hand-build the accept body in this shape.

## VERIFIED baseline (composer ran everything below at `e5395353` == code-tree of `009faa10`; re-measure at claim — trunk moves under you)
- `cd app && npx tsc --noEmit` (or `npm run typecheck -w app` from root) → **34 error lines** — matches the last
  pin (PROTO-AI-8/9 merge notes). Post-change bar: **34, error-file set IDENTICAL** (`comm -3` sorted lists empty).
- **Targeted app unit set I touch/adjacent** — `cd app && npx vitest run src/shared/session src/shared/surfaces src/shared/lib src/shared/shell`
  → **21 files / 106 tests, ALL PASS** (measured 22:34 EDT). Post-change: 106 + your new tests, ZERO failures.
- **Full app unit suite** — `cd app && npx vitest run` → **53 failed files / 63 failed tests / 1866 passed (280 files, 6 errors)** —
  this is the known failing-file baseline (pre-existing, heavy in event-editor/protocol-ide). Post-change bar:
  the failing-file SET must be set-identical (zero NEW failing files); count-identity of 63/1866 otherwise.
- Server-side baselines (orchestrator-pinned at `d56037d7`; PB-CH-3 must not touch server at all, so its bar is a
  byte-empty `git diff server/ schema/ config/`): server tsc 27 lines, drafts suite 1 file/10 PASS (until the
  PB-CH-2 merge rebases these), src/ai 10/21/565.
- `exactOptionalPropertyTypes`: set in `server/tsconfig.json:13` only — app `tsconfig.json` has `strict:true`
  WITHOUT it (honest reading, `app/tsconfig.json:20`). Still follow the conditional-spread convention (§5).

### Trunk ground facts for the design (each read by the composer at HEAD; scout screening corroborated)
- **Single writer today:** `replaceState` has exactly TWO call sites outside the provider — `useSessionSync.ts:46,50`
  (`useApplySessionDocument`) and `:57,72` (`adopt` for remote attach). The reducer `replace` case is
  `OpenTabsContext.tsx:336-337` (returns `action.state` unconditionally — new identity even for identical content,
  so the push dedup at the payload level is what actually prevents duplicate PUTs).
- **Push ownership = the 500 ms effect in `useSessionSync.ts`:** `PUSH_DEBOUNCE_MS = 500` (:24); push effect
  :122-150; payload-equality skip `if (payload === lastPushedPayload.current) return` (:128); `applyingRemote`
  guard (:59, :123-126) suppresses the push ONLY for server-adopted state. A doc applied via
  `useApplySessionDocument` deliberately DOES push (it is a local write) — exactly once, thanks to :128.
  **The executor must NOT add any second `putSession` call** (`apiClient.putSession` is `client.ts:2243-2251`;
  grep-enforced in the reviewer bait).
- **The real focus-setting primitives** (scout question answered, verified myself):
  1. tab focus: `OpenTabsContext.activateTab` (`OpenTabsContext.tsx:570`, reducer `'activate'` :285-294 with
     `recordVisit` history) — the established across-tab focus mechanism;
  2. in-place content focus: `navigateActiveTab` (:564, reducer `'navigate-active'` :169-237 with the
     mount re-registration NO-OP GUARD :203-205 — same payload ⇒ SAME state object ⇒ no push, no history);
  3. protocol-step focus: `ProtocolSelectionContext.setFocusedStep`
     (`app/src/event-editor/protocol/ProtocolSelectionContext.tsx:122-126,172-175`), display/preview-bridge
     consumer chain (`ChatContextHeader.tsx:16`, `ProtocolPreviewBridge`), provider mounted by
     `RunWorkspacePage.tsx:127` / `ProjectWorkspacePage.tsx:200` / `DeckHostPage.tsx:127`; `useProtocolSelection()`
     returns `null` OUTSIDE a provider (:244-246) — that null is the stop-boundary signal, not an error.
- **Unsaved-work preservation boundary (the honest one):** the tab store persists only `OpenTabsState`
  (tab values, modes, breadcrumbs, content trails — `OpenTabsContext.tsx:27-50`). Per-tab EDITOR drafts live in
  component-local `useState` and are LOST when the component unmounts: `browser/DetailPane.tsx:45` (`dirty`),
  `pages/RecordRegistryPage.tsx:42` (`dirty`), `ProtocolStepEditModal.tsx` (TipTap content until save). There is NO
  global dirty registry on trunk — so tier-1's guarantee is: (a) NEVER wholesale-replace (never `replace`/`close`),
  (b) prefer `activateTab` when the target entity already has a tab slot (never navigate someone else's dirty
  active tab out of the way — activating the existing slot touches no other tab), (c) `navigate-active` of the
  SAME entity is reducer-idempotent (`:191-205` keeps slot id + trails), and (d) the executor ships NO confirm
  dialog. Test pin: after a tier-1 apply, every NON-target tab entry is reference-identical to before.
- **Registry data path:** `loadSurfaceRegistry()` / `useSurfaceRegistry()` (`surfaces/registry.ts:14,29`) ←
  `GET /api/surfaces` ← `schema/registry/surfaces/surfaces.yaml` (deep-linkable iff `params`: find/analysis/
  knowledge/ingestion have NONE; run-plan/run-design/run-execute/results bind `:runId`; project binds
  `:studyId`; protocol-review binds `:recordId` as objectType `document`). `surfaceRoute(target, registry)`
  returns `null` for unknown id / missing params / type mismatch (`surfaceRoute.ts:23-37`).
- **The composition seams are already exported and independently callable:** `tabForSurface` (`openSurface.ts:14`),
  `surfaceRoute`, `openContent` (`lib/openContent.ts:19`), `sessionDocumentToState` (`sessionYaml.ts:83-115`,
  value-derived ids ⇒ same-doc twice is idempotent by construction, :79-82 comment), `stableTabId`
  (`session/tabId.ts:27`), `tabPath` (`WorkspaceTabStrip.tsx:177`).
- **The mount point is explicitly NOT this task:** `AiTabPanel.tsx:122-123` already holds
  `useOptionalOpenTabs` + `useNavigate` (task-list's `:120/:121` is stale by 2 lines — corrected);
  `AssistStreamEvent` (`assistStream.ts:156-168`) has NO `agent_action` member and `app/src` contains ZERO
  occurrences of `agent_action` (grep) — `useChatThread.ts:194-197`'s never-default is PB-CH-4's door.
  PB-CH-3 delivers the executor HOOK ready to mount; PB-CH-4 wires the stream.

## The design (exact, minimal)

### 1. New pure core — `app/src/shared/session/workstateExecutor.ts` (no React, no fetch)
```ts
/** Local structural type of the PB-CH-2 accept body's compiled result — the CONTRACT above. NOT imported from server. */
export interface AcceptedWorkstateResult { draftId: string; revision: number; reviewHash: string; sessionDocument: SessionDocumentLike; }
export interface SessionDocumentLike { version: 1; activeTabId?: string | null; tabs: Array<Record<string, unknown> & { kind: string }> }
export type Tier1ActionLike =   // mirrors the FROZEN agent-action schema shape (schema/workflow/agent-action.schema.yaml)
  | { action: 'open-surface'; surface: string; target?: { kind: string; id: string; type?: string; label?: string } }
  | { action: 'focus'; target: { kind: 'protocol-step'; protocolId: string; stepId: string; label?: string } | { kind: string; id: string; type?: string; label?: string } }
export type ExecutorDiagnostic =
  | { code: 'UNKNOWN_SURFACE' | 'UNROUTABLE_SURFACE' | 'UNMAPPABLE_TARGET' | 'NO_TAB_STORE'
    | 'NO_FOCUS_PROVIDER' | 'STALE_TARGET' | 'MALFORMED_ACCEPTED_DOCUMENT' | 'ACCEPT_ATTESTATION_MISSING'
    ; message: string; path?: string }
export type ExecutorOutcome = { ok: true; kind: 'navigated' | 'activated' | 'focused' | 'replaced' | 'duplicate-ignored'; route?: string; diagnostics: [] }
  | { ok: false; kind: 'noop'; route?: undefined; diagnostics: ExecutorDiagnostic[] }
```
Pure functions (each stage fails ALONE, naming itself — this is why the executor composes `surfaceRoute` +
`tabForSurface` + `openContent` directly instead of calling `openSurface()` and squinting at a bare `null`):
- `planTier1Action(action, registry): { target?: SurfaceTarget & {title?}; tab?: WorkspaceTab; route?: string; diagnostic?: ExecutorDiagnostic }`
  — registry membership via `registry.find` ONLY (surfaceRoute.ts:24 convention; zero surface-name literals —
  repo rule: registry is data); `surfaceRoute` null ⇒ `UNROUTABLE_SURFACE` (covers unknown id, no `params`,
  type mismatch); `tabForSurface` null ⇒ `UNMAPPABLE_TARGET`.
- `applyTier1Action(plan, { openTabs, navigate, focusProtocolStep? }): ExecutorOutcome` —
  **already-open ⇒ `openTabs.activateTab(existingTabId)`** (focus without touching any other tab); else
  `openContent(openTabs, navigate, tab, route)` (in-place active-tab navigation, `openContent.ts:19-28`);
  `protocol-step` target ⇒ `focusProtocolStep(step)` ONLY, zero navigation unless the plan also carries a
  routable surface; `openTabs === null` ⇒ `NO_TAB_STORE`; focus requested with no provider ⇒
  `NO_FOCUS_PROVIDER` + **zero movement** (the stop-boundary made mechanical — the caller in PB-CH-4 supplies
  `focusProtocolStep` from `useProtocolSelection`; absent provider is a diagnostic, never a dialog).
- `acceptGuard(accepted, seenKeys): 'fresh' | 'duplicate'` — key = `` `${draftId}:${revision}:${reviewHash}` ``.
  Duplicate ⇒ outcome `{ok:true, kind:'duplicate-ignored'}` with ZERO store calls. A repeat ACCEPT of the same
  revision is the idempotence case; a later revision carries a new reviewHash (PB-CH-2: reviewHash content-hashes
  the projection, `FormDraftService.ts:147-148`) and is therefore NEVER blocked.
- `validateAcceptedWorkstate(body: unknown): { ok: true; doc: SessionDocument } | { ok: false; diagnostic }` —
  structural checks shared with `sessionYaml.sessionFromYaml`'s rules (version === 1, tabs array, every tab has a
  string `kind`, `sessionYaml.ts:62-76`): extract the shared validator as `sessionDocumentFromValue(value)` in
  `sessionYaml.ts` and make `sessionFromYaml` = `parseYaml` + that function (behavior byte-identical for every
  existing caller — the two sessionYaml test files stay green untouched). The accept body is a JSON OBJECT
  (response body, `draftRoutes.ts:6-11`), so no stringify→re-parse YAML round-trip is added.

### 2. New hook — `app/src/shared/session/useWorkstateExecutor.ts`
```ts
export function useWorkstateExecutor(): {
  executeTier1(action: Tier1ActionLike): ExecutorOutcome;
  applyAcceptedWorkstate(body: unknown, attestation: { accepted: true }): ExecutorOutcome;
}
```
Wires: `useOptionalOpenTabs()` + `useNavigate()` + `useSurfaceRegistry()` (null registry ⇒ `UNROUTABLE_SURFACE`
diagnostics until loaded — render-nothing convention `registry.ts:28`) + `useProtocolSelection()` (null outside
provider ⇒ NO_FOCUS_PROVIDER path) + `useApplySessionDocument()` (§3). Module-internal `useRef<Set<string>>` for
`acceptGuard` seen-keys. **Tier-2 body:** `acceptGuard` ⇒ `validateAcceptedWorkstate` ⇒ attestation check (below)
⇒ `applyDocument(doc)` ⇒ navigate to `activeTabPath(next)` via `tabPath` — mirroring the adopt pattern
(`useSessionSync.ts:39-42,79-80`) computed from the SAME `sessionDocumentToState(doc, stableTabId)` result
(:83-115) the hook just applied, since dispatch is async.
**Attestation:** the entry point REFUSES to run without `{ accepted: true }` passed explicitly by the caller
(`ACCEPT_ATTESTATION_MISSING` diagnostic otherwise). This is the API-shape half of "only accepted proposals":
the raw `replaceState` is NOT re-exported by the executor module, so a proposal card holding an UNACCEPTED doc
has no path into `OpenTabsContext` short of ignoring a typed required argument. The push-side half is structural:
the only PUT is `useSessionSync`'s state effect — nothing that never entered the store can reach it.

### 3. Narrow change — `app/src/shared/session/useSessionSync.ts` (the ONLY existing-behavior file touched)
`useApplySessionDocument` (:45-54) gains an object overload:
`useApplySessionDocument(): (doc: string | SessionDocument) => void` — string ⇒ existing `sessionFromYaml` path
byte-unchanged; object ⇒ `sessionDocumentFromValue` (throws on malformed, same errors). NO other edit to this
file: `PUSH_DEBOUNCE_MS`, `applyingRemote`, `lastPushedPayload`, adopt logic — all byte-frozen (the exactly-once
push proof depends on them). `openSurface.ts`, `surfaceRoute.ts`, `registry.ts`, `resolveSurface.ts`,
`OpenTabsContext.tsx`, `openContent.ts`: **ZERO diffs** (the executor composes their exports; any hunk in these
is reviewer-bait territory — see below).

### 4. Explicitly OUT of scope
- **Any production UI mount:** `AiTabPanel.tsx`, `useChatThread.ts`, `assistStream.ts` (adding an `agent_action`
  event member is PB-CH-4's exhaustive-switch seam), `App.tsx`/`SessionSync` (:90-105), `RunWorkspacePage`,
  `WorkspaceTabStrip` — zero hunks. `agent_action` may appear in this spec and the executor's type-comment ONLY.
- `OpenTabsContext.tsx` reducer/provider — consume as-is; NO new action, NO `applyingRemote` export, NO "AI apply"
  flag (suppressing the accepted push via it would BREAK the exactly-once-push criterion).
- ALL `server/**`, `schema/**`, `config/**`, PB-CH-2's arriving files, `/api/session` routes — byte-empty diff.
- `agent-action.schema.yaml` / `lab-session.schema.yaml` byte-frozen; no session-payload versioning.
- Focus-INTO-the-request context plumbing (PB-CH-4's context gap fix), proposal-card rendering, Accept/Reject
  buttons, chat stream parsing, two-device browser gate (PB-CH-4), session history/ledger (PB-CH-7/8).
- `window.confirm`/dialogs of any kind (the stop-boundary); a second push path; `config.yaml`.

## Acceptance criteria (from the task list, verbatim)
> Red-first executor unit/integration tests: registry-backed navigation; focus applied; unknown/stale surface => no-op + diagnostic; unsaved editor state preserved through tier-1 apply; reject touches nothing; accepted replaceState pushes EXACTLY ONCE; two-client harness proves only applied state reaches the sync path. No production UI mount claimed in this task.

### Red-first test matrix
Files: `workstateExecutor.test.ts` (pure core), `useWorkstateExecutor.test.tsx` (renderHook +
`OpenTabsProvider` wrapper + `vi.mock('../api/client')` + `vi.useFakeTimers()` — harness precedent
`useSessionSync.test.ts:13-30` exactly, including the `await import` after the mock).

| Criterion | Named test | Where |
| --- | --- | --- |
| registry-backed navigation | `open-surface on a run target routes through the registry fixture and navigates the active tab` (REAL `surfaceRoute`, hand-built `SurfaceSpec[]`; assert route `/runs/RUN-7` + `navigateActiveTab` payload tab) | both |
| focus applied | `activates the existing tab instead of navigating when the target entity already has a slot`; `protocol-step focus calls focusProtocolStep with the step identity and performs NO navigation`; `activateTab of the active tab re-registers idempotently (same state identity — OpenTabsContext.tsx:203 guard)` | both |
| unknown/stale surface ⇒ no-op + diagnostic | `unknown surface id yields UNKNOWN_SURFACE with zero navigate/openTab/replaceState calls`; `surface without params yields UNROUTABLE_SURFACE`; `objectType mismatch yields UNROUTABLE_SURFACE`; `non-tabbable objectType yields UNMAPPABLE_TARGET`; `null registry yields diagnostics, never a throw` | pure |
| unsaved editor state preserved through tier-1 | `tier-1 apply touches no non-target tab entry (reference-identity of every other OpenTabState)`; `no tier-1 outcome dispatches replace or close — spy the reducer: zero 'replace'/'close' actions from any tier-1 path` | hook |
| reject touches nothing | `applyAcceptedWorkstate without {accepted:true} yields ACCEPT_ATTESTATION_MISSING with zero state change and zero putSession after 600 ms` (the reject path = simply never calling accept) | hook |
| accepted replaceState pushes EXACTLY ONCE | `accept-body apply advances 600 ms and putSession is called exactly once with the document's tabs`; `second apply of the same accept identity is duplicate-ignored: putSession STILL exactly once` | hook |
| idempotence without blocking later revisions | `apply v/rev1 twice then accept rev2 (new reviewHash): the second revision applies and pushes` | hook |
| two-client harness: only applied state reaches sync | `client A accept-applies, advances push; shared mock store bytes equal the ACCEPTED doc; client B fires window focus, adopts exactly the accepted tabs; an unaccepted doc passed to the executor never appears in the shared store bytes` (single in-memory `session` var behind the mocked getSession/putSession — precedent `useSessionSync.test.ts:13-21` extended into a store) | hook |
| malformed accept body is diagnostic-only | `sessionDocument with version 2 / missing tabs / tab without kind yields MALFORMED_ACCEPTED_DOCUMENT, no replaceState, no push` | both |
| extras (hardcode-boundary + reuse) | `renamed surface ids in the fixture still route (registry-driven — no surface-name literal works without it)`; `executor module source contains no putSession/import of apiClient session calls (source-text grep test)`; `sessionFromYaml behavior unchanged for the existing sessionYaml tests after the validator extraction` | pure/suite |

## First targeted check (run EARLY, before touching any existing file)
Write `workstateExecutor.test.ts` with the navigation + unknown-surface + duplicate-guard cases ONLY, run:
```
cd /mnt/vast/home/brad/git/cl-integration-2/app && npx vitest run src/shared/session/workstateExecutor.test.ts
```
Expected RED first (module absent), then GREEN with `openSurface.ts`, `useSessionSync.ts`, `sessionYaml.ts`,
`OpenTabsContext.tsx` ALL untouched (`git status --porcelain app/` shows only the two new files + tests). If any
core case forces an edit to those files to pass, the design premise is wrong — STOP and report before proceeding
(the executor is supposed to COMPOSE dormant exports, not reshape them; §3's overload is the only sanctioned edit
and it is provable in the hook layer, not this one).

## Verification (complete, with expected output vs baselines)
1. RED outputs pasted in the report, then both executor files green.
2. `cd app && npx vitest run src/shared/session src/shared/surfaces src/shared/lib src/shared/shell` →
   baseline 21 files/106 PASS + your 2 files, **ZERO failures** (106 + new tests).
3. `cd app && npx vitest run` → failing-file SET set-identical to the 53-file baseline (zero NEW failing files;
   paste the `comm -3` of sorted FAIL lists in the report); totals ≈ 63 failed / 1866+new passed / 280+2 files.
4. `npm run typecheck -w app` → **34 lines, set-IDENTICAL** to the pinned 34 (comm -3 empty). app tsconfig lacks
   exactOptionalPropertyTypes — do not "add" it.
5. `npm run typecheck -w server` → **no new lines beyond the orchestrator's CURRENT pin** (trivially true if
   `git diff --stat server/ schema/ config/` is EMPTY — paste that empty diff-stat as the proof; re-read the
   post-PB-CH-2-merge pin at claim time, the drafts work may have moved it).
6. Two-client harness excerpt (fake timers advanced, mock-store byte compare) pasted in the report — this is the
   load-bearing "only applied state reaches the sync path" proof; a single-client push-count assertion is
   necessary, NOT sufficient.
7. Mount-freedom proof: `git diff --name-only` contains ONLY: `app/src/shared/session/{workstateExecutor.ts,
   workstateExecutor.test.ts,useWorkstateExecutor.ts,useWorkstateExecutor.test.tsx,useSessionSync.ts,
   sessionYaml.ts}` (+ the two test files if you extended them; NO other file). `grep -rn "agent_action" app/src
   --include=*.ts*` still returns zero (the executor takes the action as a typed param; PB-CH-4 introduces the
   stream member).
8. No runtime/browser evidence is claimed or needed (no mount). :3093/:5193 untouched; if you poke them at all,
   health-check only.

## Worker contract
- Worktree `wt/PB-CH-3-lane2-l2t<HHMM>` off CURRENT `cl/integration-2` HEAD at claim time — the HEAD must include
  the PB-CH-2 merge commit (verify `git log --oneline` shows it; the accept-body contract §"What is on trunk"
  becomes executable-adjacent once it lands). Record the claim-time SHA in the report. Standard lane worktree
  bootstrap: node_modules + server/src symlinks from trunk (NFS `git worktree add` needs background — see handoff
  pitfalls), `git -c core.fileMode=false`, NEVER `git add -A`.
- Deliverable report (unique path): `.hermes/plans/PB-CH-3-report.wip-l2t<HHMM>.md` — MUST contain: red-first
  outputs, test-matrix mapping, verification 2-7 outputs verbatim (incl. comm -3 set-diffs and the two-client
  store bytes), claim-time SHA + the PB-CH-2 merge SHA it builds on, and an honest unsaved-work-boundary note
  (§"Unsaved-work preservation boundary": what tier-1 does and CANNOT guarantee).
- One branch, one logical commit (+ optional report commit). No UI mount, no server, no YAML, no stack restart,
  no browser gate.

## Reviewer bait (the adversarial review looks exactly here)
- **Single-writer violation:** ANY new call site of `replaceState` outside `useSessionSync.ts`, any new reducer
  action, any executor export of raw `replaceState`. The executor's tier-1 path must show ZERO `replace` dispatches
  in the reducer spy test.
- **"Fix the double push" reflex:** tempting to set `applyingRemote` (or export it) so AI applies skip the push —
  that BREAKS "accepted replaceState pushes EXACTLY ONCE" (the accepted doc must sync, that's the tmux adoption).
  The single-push property comes from `lastPushedPayload` (:128) + executor-level duplicate-ignoring. Any hunk at
  `useSessionSync.ts:59-150` beyond the §3 overload is this reflex — reject.
- **Tier-1 destructiveness:** tier-1 via `replaceState(sessionDocumentToState(...))` "because it's easier" is a
  wholesale session replacement — forbidden, and it would silently drop tabs AND unmount dirty editors. Proof:
  reference-identity of non-target tab entries + reducer spy showing no replace/close from tier-1.
- **Unaccepted-doc leakage:** an entry point that takes a bare `SessionDocument` without the accept attestation,
  or a convenience export that bypasses `acceptGuard`. Also: dedup set keyed on document JSON (a legitimate
  later revision with identical tabs would then be WRONGLY blocked) — key is `draftId:revision:reviewHash`.
- **Idempotence gap:** repeat-accept doing a second PUT (missing duplicate-guard), OR the guard living at the
  effect level (React StrictMode double-mount would fight it), OR the guard surviving tab-store churn it shouldn't
  (it guards executor applies, not user edits — a user opening tabs after an accept must still push).
- **Hardcoded surface names:** any string comparison against `run-design`/`protocol-review`/etc. in the executor
  (routes come from the fixture-renamed-ids test; surface membership is `registry.find` only). Same for tab
  kinds: composition uses `tabForSurface`, never a local switch duplicating `openSurface.ts:14-24`.
- **Focus via DOM hacks:** no `document.querySelector`, no `history.pushState`, no focus() calls — focus means
  `activateTab`/`navigateActiveTab`/`setFocusedStep` or a diagnostic. And no `window.confirm` — the
  stop-boundary names it. `NO_FOCUS_PROVIDER` + no-movement is CORRECT behavior under test, not a bug to fix by
  mounting a provider into a shared component.
- **Scope creep into the mount:** hunks in `assistStream.ts`/`useChatThread.ts` ("while I'm here, the switch needs
  an agent_action case") belong to PB-CH-4; the exhaustive `never` default there is a deliberate seam. Same for
  proposal cards.
- **sessionYaml validator extraction drift:** the refactor must keep `sessionYaml.test.ts`,
  `sessionYaml.dedupe.test.ts`, `WorkspaceTabStrip.duplicateKeys.test.tsx` green UNCHANGED (PROTO-AI-14 F3
  dedupe lives inside `sessionDocumentToState` — do not relocate it into the validator; validate ≠ rebuild).
- **Slot-id minting:** executor applies ids via `stableTabId` through `sessionDocumentToState` only;
  `uniqueTabSlotId` (`openContent.ts:47`) is for explicit new-tab affordances — an AI apply minting fresh slots
  would double-push and duplicate-key the strip.
- **exactOptionalPropertyTypes sites:** `route?`/`path?`/`label?`/`activeTabId?` — build optionals with
  conditional spread (`...(route ? {route} : {})`), matching the OpenTabsContext.tsx:559 house style; `activeTabId`
  from the accept body is `string | null`, preserve null-vs-absent faithfully into the doc.
- **Ports/data:** any :3001/:5174 evidence or writes under main data dir = automatic fail.

## Open questions (could not resolve locally; max 3)
1. **Accept-body envelope field names are contract-trust, not observation.** PB-CH-2 is in flight; I pinned
   `sessionDocument/summary/resolvedTerms` from the promoted spec (`:71`) + `CompiledDraft` fields
   (`draftId,revision,reviewHash,canAccept`) — but the coder may return `result` nested under a wrapper the
   service adds. Checked: promoted PB-CH-2 spec §2/§6, `FormDraftService.ts` accept-return citation :186 in the
   spec, `draftRoutes.ts:6-11` (response body). Mitigation baked into design: `validateAcceptedWorkstate` takes
   `unknown` and the hook layer is where an unwrap line lands. Orchestrator: at PB-CH-2 merge, if the shipped body
   nests the result (e.g. `{result: {...}}`), append the one-line unwrap here — don't re-spec.
2. **Is tier-1 `focus` on a plain record ref supposed to also NAVIGATE?** The frozen schema (`agent-action.schema.yaml`)
   lets `focus` carry any ref with an OPTIONAL `surface`; PB-CH-1's emission evidence shows bare focus (no surface).
   The design navigates only when the action carries a routable surface, else activates-an-existing-tab-or-diagnostic.
   Checked: schema text above, PB-CH-1 report frame excerpt (focus with no surface), `ChatContextHeader.tsx:16`
   (display-only focus precedent). If the architect wants bare-ref focus to deep-link anyway, that's a one-function
   change in `planTier1Action` — flagged, not assumed.
3. **Does the executor own the `openTabs === null` (no provider) surface?** `AiTabPanel` uses
   `useOptionalOpenTabs` precisely because standalone routes lack the provider. I return `NO_TAB_STORE` + no
   movement rather than falling back to `openInNewTab`-style window hacks. Checked: `openContent.ts:35-44`,
   `App.tsx` provider mount order (OpenTabsProvider wraps BrowserRouter :128-129), PB-CH-4 mount notes (run page
   HAS a provider). If PB-CH-4 needs a standalone-route fallback, it should pass an explicit fallback strategy —
   this task stays conservative.

---
Report: DONE — draft at this path. Summary: the two dormant primitives are verified zero-caller; the executor is a
pure planning/applied pair composing `surfaceRoute` + `tabForSurface` + `openContent` (tier 1: activate-or-navigate-
active, NEVER replace/close/confirm) and an accept-guarded `useApplySessionDocument` overload (tier 2: attestation +
`draftId:revision:reviewHash` duplicate key + shared `sessionDocumentFromValue` validator), push ownership left
byte-untouched in the 500 ms effect (exactly-once = lastPushedPayload + duplicate-ignoring). Baselines measured at
e5395353/009faa10 code tree: app tsc 34 lines, targeted shared session/surfaces/lib/shell 21 files/106 PASS,
full app suite 53 failing files / 63 failed / 1866 passed. One existing-behavior file touched (useSessionSync.ts
overload) + one pure extraction (sessionYaml validator); everything else new files; zero mount, zero server diff.
Open: accept-body nesting until PB-CH-2 lands, bare-ref focus navigation question, no-provider fallback ownership.

## ORCHESTRATOR PROMOTION NOTES (2026-10-06T23:47 EDT) — DISPATCHABLE
- PB-CH-2 IS MERGED: code 23c92476 -> trunk merge 35f28cbb (+receipts 6fd9f4b7/236228fc). Trunk HEAD at
  promotion: 236228fc. Branch off claim-time HEAD (must be >= 236228fc).
- OPEN QUESTION 1 RESOLVED BY OBSERVATION (orchestrator ran the real endpoint post-restart):
  POST /api/drafts/accept returns the compiled result FLAT at top level —
  {"sessionDocument":{version,tabs,activeTabId},"summary":...,"resolvedTerms":[...]} — NO {result:{...}}
  wrapper (draftRoutes returns FormDraftService.accept's return directly; live :3093 receipt 23:34 EDT,
  PB-CH-2 report's orchestrator receipts section). NO unwrap line needed; validateAcceptedWorkstate takes
  the flat body as-is. Note: draftId/revision/reviewHash are NOT inside the response body — the CALLER
  (proposal card / PB-CH-4) holds them from the compile envelope; AcceptedWorkstateResult's
  draftId/revision/reviewHash must therefore be supplied as SEPARATE parameters alongside the body
  (executor signature: applyAcceptedWorkstate(body, attestation, identity:{draftId,revision,reviewHash})).
  Update the hook signature accordingly in the red-first tests; the dedup key stays draftId:revision:reviewHash.
- OPEN QUESTION 2 (bare-ref focus): ship the CONSERVATIVE design as drafted (navigate only with routable
  surface; else activate-existing-or-diagnostic). Architect may amend later; do not pre-implement deep-link.
- OPEN QUESTION 3 (no-provider): conservative NO_TAB_STORE as drafted. PB-CH-4 owns any fallback strategy.
- Baselines RE-MEASURED by orchestrator at 236228fc: app tsc 34 lines (identical), grep -rn agent_action
  app/src = 0. Server/YAML untouched by this item -> no stack restart, no browser gate (no UI mount).
