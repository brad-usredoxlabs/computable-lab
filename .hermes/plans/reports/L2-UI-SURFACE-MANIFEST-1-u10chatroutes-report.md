# L2-UI-SURFACE-MANIFEST-1 — unit u10chatroutes

L2-UI-SURFACE-MANIFEST-1 UNIT u10chatroutes DONE 551976643390adeb25f97dda8c45c92fea4274b1

Status: implementation unit complete. Item-level acceptance remains with adversarial/browser review.

## Base / commits
- dispatch base (after u9lintvocab): e44d66905741b7930e4d9c6a536fee1192419032
- data commit: 551976643390adeb25f97dda8c45c92fea4274b1  "l2u10chatroutes: declare 3 SurfaceChatBridge route surfaces"
- report commit follows the data commit; the marker names the DATA commit (not its own commit), no --amend.

## RED — raw census before
$ python3 scripts/check-ui-surfaces.py | head -n 3
UNRESOLVED-IMPORTS=0
ROUTES=41 DECLARED=16 MISSING=25 PHANTOM=0 CATCHALL=1 REDIRECT=2 SLOT-HOST=1

MISSING routes included:
  - /deck/:eventGraphId/:runId?
  - /project/:studyId/event-graph/:eventGraphId
  - /record/new/:nodeType/:parentId?

## GREEN — raw census after
$ python3 scripts/check-ui-surfaces.py | head -n 3
UNRESOLVED-IMPORTS=0
ROUTES=41 DECLARED=19 MISSING=22 PHANTOM=0 CATCHALL=1 REDIRECT=2 SLOT-HOST=1
(exit 0; drop is exactly 3, 25 -> 22)

$ python3 scripts/check-ui-surfaces.py | sed -n '/MISSING routes/,/^$/p' | head -n 26
MISSING routes (22): * / /browser /chat /claims/:claimId /create/study /event-editor
/event-editor/:eventGraphId /event-editor/fixit /extraction /extraction/review/:recordId
/ingestion /ingestion/:tab /ingestion/vendor-pdf/:recordId /intake /intake/:treeId
/lab/:category /lab/:category/:entityId /lab/sequences /project/:studyId/run/:runId
/protocol-builder /protocols
The three declared routes are gone; no other route disappeared.

$ python3 -c "...print(len(d['surfaces']),len(d['paneVocabulary']))"  -> 19 5
$ python3 -c "...ids unique..."                                       -> 19 19
$ git diff --stat (pre-commit)  -> config/ui/surfaces.yaml | 41 +++++ ; 1 file changed, 41 insertions(+)
$ git diff config/ui/surfaces.yaml | grep -c '^-'  -> 1 ; grep -c '^@@' -> 1 (header only, zero removals)
$ cd server && npx vitest run src/schema/SurfaceManifestLint.test.ts -> Test Files 1 passed, Tests 5 passed (5)

## Entries added (append-only, id-sorted among themselves)
1. deck-host
   route "/deck/:eventGraphId/:runId?"  (App.tsx:212 verbatim)
   panes [ai-chat, deck]
     ai-chat  app/src/shared/shell/DeckHostPage.tsx:148  <SurfaceChatBridge host="event-editor" />
     deck     app/src/shared/shell/DeckHostPage.tsx:147  <DeckChatSlice />  (+ :157 rightPane={<RightPane />})
   providers [deck]
     config/chat/chat-hosts.yaml:110  required_providers: [deck]  (host `event-editor`, the host DeckHostPage registers)
     app/src/shared/shell/DeckHostPage.tsx:142-143 header comment: "The deck slice is REQUIRED for this host"
     NOTE: brief anchor cited chat-hosts.yaml:82, which is the same `required_providers: [deck]` on the
     `run-workspace` host (:78). Same value, adjacent-entry line; the line for this host is :110. Disclosed.
   context scope_source route-param; gate leg null, reason = no live probe evidence yet.
   description from DeckHostPage header comment (:1-14, "renders an event-graph deck (plate viewer) as its
   OWN top-level tab with a full workspace shell (tab strip, deck toolbar, right pane...)").

2. project-event-graph
   route "/project/:studyId/event-graph/:eventGraphId"  (App.tsx:179 verbatim)
   panes [ai-chat, deck]
     ai-chat  app/src/event-editor/projects/ProjectWorkspacePage.tsx:146  <SurfaceChatBridge
     deck     :20 "'deck' -> DeckStage via <Viewer /> + EventEditorProvider" ; :37 import { Viewer } ; :44 import { RightPane }
   providers [deck, workspace]
     deck      :20 same left-pane dispatch comment (deck stage mounted for deck tabs)
     workspace :29 "  WorkspaceProvider," ; :80 "<WorkspaceProvider studyId={studyId}>"
   context scope_source route-param; gate leg null, reason = no live probe evidence yet.

3. record-create
   route "/record/new/:nodeType/:parentId?"  (App.tsx:209 verbatim)
   panes [ai-chat]
     ai-chat  app/src/shared/shell/RecordHostPage.tsx:53  <SurfaceChatBridge  (rendered at :198, inside the shell whose
              rightPane={<RightPane />} is at :220). No deck/event-editor/project-tabs pane is mounted on this route.
   providers [workspace]
     workspace  app/src/shared/shell/RecordHostPage.tsx:17  import { WorkspaceProvider } from '../../event-editor/workspace/WorkspaceContext'
                :196  <WorkspaceProvider studyId={studyId}>  — mounted around BOTH branches (isCreate ? RecordCreatePanel : RecordEditPanel,
                :177-193), so the create route is inside the provider, not only the edit route.
   context scope_source route-param; gate leg null, reason = no live probe evidence yet.

## Invariants / non-changes
- 16 pre-existing entries byte-identical; diff has one hunk, one '^-' line (diff header).
- paneVocabulary unchanged at 5 ids; no new vocabulary id.
- No `settles_within_ms`; no `requires.records` / `requires.endpoints`; no `requires: {}` empties.
- No timing/probe claims: every gate is leg: null plus prose.
- Untouched: schema/ui/**, scripts/check-ui-surfaces.py, app/**, server/**, tests, deliverables, reviews.
- No tsc (no .ts changed). No stack restart; this unit makes no live claim.
- Known doc-string mismatch left on record (not a defect fixed here): schema id description says ids must
  match the client `AiSurface` union, but no schema/lint rule reads it — same observation as u4chats c1.
  `deck-host`, `project-event-graph`, `record-create` were not added to app/** as union members.

## Tree
git -c core.fileMode=false status --short -> clean after the report commit.

## Next actions
- Orchestrator: reload the lane stack if any live census is taken; nothing to restart for this data change.
- Item remains open: 22 MISSING routes still need pane-vocabulary decisions in later units.
