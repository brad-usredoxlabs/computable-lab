# PROTO-AI-14 report — Style ChangesPanel (F1) + fix WorkspaceTabStrip duplicate-key (F3)

Lane 2 · worktree `/mnt/vast/home/brad/git/wt/PROTO-AI-14-lane2-l2t1020`
Branch `wt/PROTO-AI-14-lane2-l2t1020` off `cl/integration-2` @ `302db3af`.
Spec: `.hermes/plans/2026-10-06_1000-PROTO-AI-14-changespanel-styling-tabkeys.md`

Brad admission quote (decisions/LANE2-BACKLOG-followup-approval.md, Answer):
> 2026-10-06 08:52 EDT (recorded by architect from Brad's direct reply): **ADMIT ALL THREE.**
> F1 admitted — ChangesPanel styling is a real defect on the review surface (SOP rule 12:
> functional-but-dead-looking chrome is a defect)... F3 admitted — batched with F1 (same surface
> family, cheap hygiene).

## Final commit

```
$ git -c core.fileMode=false log --oneline cl/integration-2..HEAD
fc85d998 fix(ui): PROTO-AI-14 style ChangesPanel with theme tokens; dedupe tab ids at load
```

Exactly one commit, message starts `fix(ui): PROTO-AI-14`. 7 files changed, 510 insertions(+), 19 deletions(-).

## Files touched

- `app/src/event-editor/right-pane/ai/ChangesPanel.tsx` — one added line: `import './ChangesPanel.css'`
- `app/src/event-editor/right-pane/ai/ChangesPanel.css` — NEW per-surface CSS (repo convention: ChatPage.css, CreateMenu.css, WorkspaceTabStrip.css sit next to their components)
- `app/src/shared/session/sessionYaml.ts` — dedupe in `sessionDocumentToState`
- `app/src/shared/shell/OpenTabsContext.tsx` — dedupe in `loadFromStorage`
- NEW tests: `ChangesPanel.styling.test.tsx`, `sessionYaml.dedupe.test.ts`, `WorkspaceTabStrip.duplicateKeys.test.tsx`
- `WorkspaceTabStrip.tsx` itself: UNCHANGED (key={tab.id} is the correct key source once the state invariant holds).

---

## F1 — ChangesPanel class inventory + token mapping

Classes enumerated from ChangesPanel.tsx (21 distinct selectors incl. severity/op variants; the orchestrator's "15 distinct" counts the base families):

changes-panel, __actions, __btn, __btn--apply, __btn--discard, __applying, __apply-error, __warning, __warnings, __warning--info, __warning--warning, __warning--error, __change, __change--add, __change--modify, __change--remove, __change-desc, __change-prefix, __diff, __protocol, __protocol-target

Token mapping (all from `app/src/shared/styles/tokens.css`; the file contains ZERO hex/rgba/hsl literals — verified by test — so `.cl-app[data-theme='light']` re-skins the panel automatically):

| selector | fill | border | ink |
|---|---|---|---|
| .changes-panel | --cl-bg-elev | --cl-border | --cl-text |
| __btn--apply (Accept) | --cl-accent (hover: --cl-accent-hover) | --cl-accent | --cl-on-accent |
| __btn--discard (Reject/Discard) | --cl-danger-soft | --cl-danger-border (hover --cl-danger) | --cl-danger |
| __btn base | --cl-bg-elev-2 | --cl-border-strong | --cl-text; focus-visible --cl-focus-ring |
| __apply-error (role=alert) | --cl-danger-soft | --cl-danger-border | --cl-danger (settings-banner family per 8e14b061) |
| __applying (role=status) | --cl-info-soft | --cl-info-border | --cl-info |
| __warning--info / --warning / --error | --cl-info-soft / --cl-warn-soft / --cl-danger-soft | matching *-border | --cl-info / --cl-warn / --cl-danger |
| __change--add / --modify / --remove | --cl-success-soft / --cl-info-soft / --cl-danger-soft | matching *-border | prefix ink --cl-success / --cl-info / --cl-danger |
| __protocol / __diff / __change | --cl-bg-elev-2 / --cl-bg | --cl-border | --cl-text / --cl-text-dim |

No token was missing; no new colors introduced. One note: the prefix uses `var(--cl-font-mono, ui-monospace, monospace)` — a font token with a generic fallback (no color involved).

## F3 — root-cause trace + chosen fix

Verified trace (my own reads, scout log corroborated):

1. `app/src/shared/shell/WorkspaceTabStrip.tsx:113` — `key={tab.id}` (correct key source; left untouched).
2. `app/src/shared/session/tabId.ts` — ids are minted PER TAB VALUE (`run` -> `runTabId(tab.runId)`); `sessionYaml.ts:49-51` states the document "deliberately carries no ids — ids are re-derived on load". So two document entries with the same run value collapse to the SAME id.
3. Entry site (a): `sessionYaml.ts` `sessionDocumentToState` — `doc.tabs.map(...)` with id re-derived via `tabIdFor`; no dedupe; both same-id entries land in `state.tabs`. (Reached from `useSessionSync.ts:50` and `sessionTabsToState` at :107.)
4. Entry site (b): `OpenTabsContext.tsx` `loadFromStorage` (~436-450) — `parsed.tabs.map(...)` with no dedupe; a persisted store carrying the same id twice hydrates both.
5. The reducer's `open` case (~136-168) DOES dedupe same-id (replaces in place) — confirmed by the existing test "opens a duplicate tab id — replaces and activates" in `OpenTabsContext.test.ts`. So the defect lives only at the two LOAD entry sites, and the codebase's convention for a same-id tab is REPLACE.
6. Distinct-views-of-the-same-run are already handled elsewhere by minting slot-suffixed ids (`navigate-active` freshId ~223, `within-back/forward` ~249/264, `slotSuffix()` in tabId.ts) — those ids differ, so they are NOT duplicates and must survive the dedupe.

Chosen fix: dedupe on the value-derived id at BOTH load entry sites, LAST-WINS (later duplicate replaces the earlier entry in place, keeping the earlier slot's position) — the same replace semantics the reducer's `open` case already implements. No index keys, no random key suffixes, no per-entry uid added to the tab model.

Entry-site decision comment (sessionYaml.ts, quoted verbatim):

```
  // PROTO-AI-14 F3 — dedupe at the LOAD entry site, on the value-derived id.
  // The document deliberately carries no ids (see sessionToYaml above), so ids
  // are re-derived here; two document entries with the same tab VALUE therefore
  // collapse to the SAME id, and both landing in `tabs` is what makes
  // WorkspaceTabStrip's `key={tab.id}` hit React's duplicate-key warning. The
  // reducer's 'open' case already replaces a same-id tab (OpenTabsContext.tsx
  // ~136-168), so the loader follows the SAME convention: LAST-WINS — the later
  // duplicate replaces the earlier entry in place (keeping the earlier slot's
  // position), and the state can never hold two entries with one tab.id.
```

OpenTabsContext.tsx carries the matching comment ("LAST-WINS ... Entries whose ids differ by a slot suffix (tabId.ts slotSuffix()) are DISTINCT tabs and are kept.").

---

## Verification (real outputs)

### 1. Red-first targeted suites

RED before implementation (tests written first, run against unmodified trunk code):

```
 Test Files  3 failed (3)
      Tests  4 failed | 2 passed (6)
 FAIL src/shared/shell/WorkspaceTabStrip.duplicateKeys.test.tsx > loadFromStorage duplicate-run dedupe ...
AssertionError: expected [ 'run:RUN-DUP', 'run:RUN-DUP' ] to deeply equal [ 'run:RUN-DUP' ]
 FAIL src/shared/shell/WorkspaceTabStrip.duplicateKeys.test.tsx > WorkspaceTabStrip renders a duplicated persisted session ...
AssertionError: expected [ …(2) ] to have a length of 1 but got 2
 (+ ChangesPanel.styling.test.tsx css-import/selector-inventory failures, sessionYaml dedupe failure)
```

GREEN after implementation:

```
$ npx vitest run src/event-editor/right-pane/ai/ChangesPanel src/shared/shell src/shared/session
 ✓ src/event-editor/right-pane/ai/ChangesPanel.test.tsx  (14 tests) 574ms
 ✓ src/shared/shell/AppShell.test.tsx  (2 tests) 327ms
 Test Files  19 passed (19)
      Tests  99 passed (99)
```

All pre-existing ChangesPanel protocol-mode tests (ChangesPanel.test.tsx 14 tests, AiTabPanel.protocolEdit) stay green; EventGraphChange review behavior untouched.

### 2. Full app unit suite delta (`npm run test:unit -w app` equivalent: `npx vitest run`)

Baseline at branch start (pre-change, on 302db3af):
```
 Test Files  47 failed | 221 passed (268)
      Tests  63 failed | 1824 passed (1887)
```
Post-change (full run on fc85d998 content):
```
 Test Files  47 failed | 224 passed (271)   (271 = 268 + my 3 new files)
      Tests  63 failed | 1835 passed (1898)
```
Failure-FILE SET comparison (JSON reporters, baseline vs post):
```
baseline files: 268 failed: 47
post files:     271 failed: 47
NEW failing files: []
newly fixed:    []
```
Zero NEW failing files. (One intermediate run flagged `SlideOverEditor.test.tsx` and `AddMaterialForm.biological.test.tsx` as newly failing; both pass in isolation and in the clean rerun — flaky under full-suite load, not caused by this change; neither imports any touched file.)

### 3. tsc baseline vs post (`npm run typecheck -w app`)

Baseline at branch start: 25 `error TS` lines (21 files). Note: the orchestrator's "34 error lines on trunk" figure did not reproduce in this checkout at 302db3af; the measured branch-start baseline is 25 and is what I diffed against.
Post-change: 25 `error TS` lines.
```
$ diff <(grep "error TS" baseline | sed 's/([0-9]*,[0-9]*)//' | sort) <(grep "error TS" post | ... )
TSC SET IDENTICAL
no errors in touched files
```
Zero new files in the error-line set; none of the touched files appear in it.

### 4. YAML

No YAML touched — no stack restart needed.

### 5. Scope compliance

- No markup redesign in ChangesPanel (only the css import line added); no new chrome; no dead controls.
- WorkspaceTabStrip.tsx unchanged; no key silencing (no index keys, no random suffixes); no per-entry uid added to the tab model.
- Reducer untouched; EventGraphChange review behavior untouched.

## Browser-gate notes for the reviewer (orchestrator dispatches)

- Accept renders as a filled accent button with inverted ink; Reject as a danger-tinted outlined button — visually distinct in both `data-theme` modes (all colors are theme-switching tokens).
- apply-error (role=alert) renders danger soft fill + danger hairline border + danger ink.
- Duplicate-key repro: persist two identical `run:RUN-DUP` tab entries in `cl-open-tabs:<user>` localStorage (or a session YAML with the same run twice) and reload — the strip now shows ONE tab and the console is free of "Encountered two children with the same key".

DONE
