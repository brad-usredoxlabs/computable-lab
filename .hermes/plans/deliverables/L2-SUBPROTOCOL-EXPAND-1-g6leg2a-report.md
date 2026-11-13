# L2-SUBPROTOCOL-EXPAND-1 / unit g6leg2a — report

Item: L2-SUBPROTOCOL-EXPAND-1-g6leg2a
Worktree: /home/brad/cl-wt/L2-SUBPROTO-g6leg2a-lane2
Branch: cl/lane2-subproto-g6leg2a-1732
Base: e18cc3eec1f809bf2bbd59e9b97a7b7aae4af9e7
Tier: routine (one seam, one file)

## Change summary (owned file: app/src/main.tsx, 17 insertions / 11 deletions)

RED (gate g5 leg 2, receipts
~/.hermes/cl/receipts/SUBPROTO-EXPAND-browser-g5-20261113T2147Z/recon2/trail.json
step 11): the labware-editor fixture arm painted a BLANK page with 6x pageErrors
"useOpenTabs must be used inside <OpenTabsProvider>" (rootChildren: 0). Trace:
LabwareEventEditor -> useSurfaceChat -> useWorkstateProposalFlow ->
useWorkstateExecutor -> useApplySessionDocument -> useOpenTabs()
(app/src/shared/session/useSessionSync.ts:18) threw because main.tsx's fixture
arm mounts ExtensionProvider > AiPanelProvider > LabwareEditorProvider >
BrowserRouter without OpenTabsProvider.

Fix (fixture arm ONLY — the normal app tree at main.tsx:39-53 is untouched, no
route additions, no prohibited files touched):

1. Arm-scoped dynamic import added inside `if (isLabwareFixture)`, after the
   existing three arm imports (import path idiom quoted in the brief,
   OpenTabsContext.tsx not opened per BEDROCK):
   `const { OpenTabsProvider } = await import('./shared/shell/OpenTabsContext')`
2. The fixture-arm nest is wrapped with a BARE `<OpenTabsProvider>` (no userId
   prop — it is optional and falls back to getCurrentUserId() at
   OpenTabsContext.tsx:412-413), placed inside AiPanelProvider and ABOVE
   LabwareEditorProvider, exactly mirroring the quoted ANCHORS. The g4labmount
   comment was replaced by a g6leg2a comment explaining the mount.

Nest order now:
StrictMode > ExtensionProvider > AiPanelProvider > OpenTabsProvider >
LabwareEditorProvider > BrowserRouter > Routes(*) = LabwareEventEditor, plus
Slot chat.panel.global inside LabwareEditorProvider.

## VERIFY (run in worktree at the committed state e671ad0d)

### 1. grep check (RED baseline at base e18cc3ee: 0)

    $ grep -c OpenTabsProvider app/src/main.tsx
    5

(Passes: >= 1.)

### 2. typecheck — `timeout 240 npm run typecheck -w app`

exit 2 with exactly ONE error, pre-existing and NOT in the changed file.
Verbatim (full output at /tmp/g6leg2a-verify/typecheck.txt):

    > @computable/app@0.1.0 typecheck
    > tsc --noEmit

    src/editor/taptab/RefCombobox.ontologyref.test.tsx(32,4): error TS2322: Type '{ suggestionPlan?: { sources: string[]; ontologies: string[]; searchField: string; isRef: boolean; isCombobox: boolean; valueShape: "ref" | "text" | "ontology-ref" | "record-ref" | "material-ref"; } | undefined; value: string; refKind: string; onSelect: Mock<...>; onCancel: Mock<...>; }' is not assignable to type 'RefComboboxProps'.
      Types of property 'suggestionPlan' are incompatible.
        Type '{ sources: string[]; ontologies: string[]; searchField: string; isRef: boolean; isCombobox: boolean; valueShape: "ref" | ... } | undefined' is not assignable to type '{ sources: string[]; ontologies: string[]; searchField: "keywords" | "tags"; isRef: boolean; isCombobox: boolean; ontologyBinding?: ...; ownedByApp?: boolean | undefined; valueShape?: "ref" | ...; lifecycleDefault?:...'.
          Type '{ sources: string[]; ontologies: string[]; searchField: string; isRef: boolean; isCombobox: boolean; valueShape: "ref" | "text" | "ontology-ref" | "record-ref" | "material-ref"; }' is not assignable to type '{ sources: string[]; ontologies: string[]; searchField: "keywords" | "tags"; ... }'.
            Types of property 'searchField' are incompatible.
              Type 'string' is not assignable to type '"keywords" | "tags"'.

    npm error Lifecycle script `typecheck` failed with error:
    npm error code 2

Pre-existence proof (measured this run): the worktree arrived with NO
node_modules (first install attempt in this unit surfaced 14 errors — 13x
TS2307 Cannot find module 'yaml'/'ajv'/'prosemirror-view' etc. plus the one
above). After `npm install --no-audit --no-fund` (exit 0, lockfile respected)
the 13 module-resolution errors vanished and exactly the one
RefCombobox.ontologyref.test.tsx TS2322 remained. It reproduces IDENTICALLY
with my change stashed (base e18cc3ee source + fresh node_modules): same single
error, same exit 2. So: main.tsx introduces zero new type errors; the
RefCombobox error is a pre-existing baseline defect in a file outside this
unit's scope (owned file was exactly one: main.tsx). The brief's "baseline:
0 errors at base" claim does not hold for the current tree at e18cc3ee; the
owner of that fix is whoever owns src/editor/taptab (outside this unit's
prohibited/scope set — escalated here, not touched).

### 3. session tests — `cd app && timeout 300 npx vitest run src/shared/session`

exit 0, fully green (verbatim tail, full output at
/tmp/g6leg2a-verify/vitest.txt):

    ✓ src/shared/session/useWorkstateExecutor.test.tsx  (16 tests) 200ms

     Test Files  9 passed (9)
          Tests  90 passed (90)
       Start at  17:51:40
       Duration  1.75s (transform 519ms, setup 499ms, collect 1.50s, tests 358ms, environment 5.29s, prepare 1.16s)

### 4. commit / cleanliness

- Commit 1 (code, exact message): e671ad0d
  "L2-SUBPROTOCOL-EXPAND-1 g6leg2a: mount OpenTabsProvider in labware-editor
  fixture arm (g5 leg2 blank-page)" — 1 file changed (app/src/main.tsx).
- Commit 2 (this report) and the marker commit follow; worktree clean at exit.

## Next actions / blockers

- Browser re-proof of the fixture arm (g6 gate, independent reviewer) is the
  remaining behavioural proof per FUNCTIONALITY-FIRST; no server changes.
- Escalate: pre-existing typecheck error in
  src/editor/taptab/RefCombobox.ontologyref.test.tsx (searchField: string vs
  "keywords" | "tags") exists at base e18cc3ee with fresh deps; outside this
  unit's scope, needs an owner.

L2-SUBPROTOCOL-EXPAND-1-g6leg2a UNIT unit DONE 5d6cc14fddc2df76401b5867a46daf1bd721650a
