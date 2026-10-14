# Lane 1 decision request — OWN-12 share entry point (platform gap) + OWN-13 FIFO split

Requested by: orchestrator tick 20261012T2240, lane 1. Answer path:
`.hermes/plans/2026-10-12_lane1-own12-share-surface-and-own13-fifo-decision.md`
(written decisions only; silence is not approval).

## Q1 — OWN-12: the browser gate found the sharing surface is dead chrome. Remedy?

**State.** OWN-12's 2-file diff (ShareRecordDialog preset row: whole lab / project
members / private to me) is merged (trunk 36402ae3), adversarially ACCEPTED (0 defects,
reviews/own12-advreview-l1t2040.md), orch-verified first-hand (scoped vitest 14/14, app
tsc 23 zero-in-touched, diff exactly 2 files). Browser gate tier-2 (OpenRouter
deepseek-v4.1-flash) rendered VERDICT: fix with full receipts
(/home/brad/.hermes/cl/receipts/OWN-12/20261013T0205/): S1 passes; S2–S7 are UNREACHABLE
because no live surface mounts the share dialog anywhere.

**Orchestrator falsification pass (my own grep at trunk @ 36402ae3 — both defects REAL):**
1. ShareRecordDialog's three mount sites are ALL orphaned:
   - `app/src/editor/RecordViewer.tsx:136` — RecordViewer is imported nowhere; its route
     `/records/:recordId` (plural) does not exist (live route is `/record/:recordId`,
     App.tsx:199 -> RecordHostPage, which has NO share control).
   - `app/src/browser/DetailPane.tsx:178` — DetailPane is imported only by BrowserBody.tsx
     behind `/browser`, which is a LegacyModeRedirect (App.tsx:182).
   - `app/src/event-editor/projects/WorkspaceShareButton.tsx:28` — mounted only by
     ProjectTabStrip.tsx, itself imported NOWHERE (the live strip is
     `shared/shell/WorkspaceTabStrip`, "generalized from ProjectTabStrip").
2. Client entry gate stale vs server: `app/src/shared/sharing/policyRoots.ts:6`
   `POLICY_ROOT_KINDS = {study, experiment, run, planned-run}` excludes `local-protocol`
   — the gate's own live probe got `{kind:local-protocol, isPolicyRoot:true, canAdmin:true}`
   from IdentityHandlers.ts:311 (permissive for any kind except user/group/access-policy).
   A third site exists: `server/src/security/AuthorizationService.ts:16` carries the SAME
   stale four-kind set. So even a wired button stays hidden for a local-protocol, and the
   server set is a second un-reconciled copy of the same vocabulary.

**Why this is scope-change, not a fix run.** OWN-12's approved contract was
"REUSES the whole existing sharing surface, adds one preset row" (files:
ShareRecordDialog.tsx + test). The surface it named turns out to be dead chrome inherited
from before the campaign. Mounting a Share control on the live record page, choosing
which surfaces/kinds get it, and reconciling TWO stale POLICY_ROOT_KINDS copies against
the server's kind rule is new product surface + a vocabulary-reconciliation decision —
per the wave-2 standing rule this is requires-rescope, not absorbable by the coder.

**Options (recommend B, but yours):**
- A. In-scope remedy: amend OWN-12's file set; fix run in wt/OWN-12-lane1-l1t1945 mounts
  the dialog on RecordHostPage chrome (kind-gated by the SERVER-returned isPolicyRoot —
  no new client-side kind list; the client list becomes server-driven or is deleted),
  then re-gate. Cost: OWN-12 scope stretch; RecordHostPage is touched by many items.
- B. New task (suggest: OWN-14 "live share entry point + policy-root kinds as ONE
  server-declared fact"): owns the RecordHostPage mount, kills BOTH dead surfaces
  (delete-or-wire decision per site — dead chrome is a defect per SOP rule 12), and
  replaces BOTH stale POLICY_ROOT_KINDS copies with the server's isPolicyRoot response
  (things-that-can-be-data-should-be-data: the kinds list is currently THREE copies of a
  policy). OWN-12 then closes on its accepted unit surface ONLY IF the follow-on gate
  can actually exercise it; otherwise OWN-12 stays in-progress as the gate's owner.
  Recommend: OWN-12 stays in-progress until a gate exercises the merged preset row
  end-to-end — its verified-by says "curl GET .../access-policy proves persistence",
  which was never reachable.
- C. Something better (e.g. route RecordViewer at /records/:recordId as the canonical
  viewer instead of mounting share into RecordHostPage — decide honestly).

Dependencies at stake: FIFO is OWN-13 -> OLIGO-AI-1 (coder-ready, spec promoted). OWN-12
is UI-gated and does not block OLIGO.

## Q2 — OWN-13: can the CLAUDE.md half be split so the lane FIFO unblocks?

OWN-13 is adversarially ACCEPTED (reviews/own13-advreview-l1t1930.md, 0 defects) with a
4/5-file diff preserved in wt/OWN-13-lane1-l1t1305 (e96fec67 — the SOLE home of
applyOwnershipDefaults.ts; do not prune). The only missing deliverable is the CLAUDE.md
rule-9 append (exact text in own13-report-l1t1900resume.md DEV-1). It is blocked by the
Hermes protected-instruction-file guard in unattended ticks — owner: Brad/interactive
session. CLAUDE.md md5 unchanged since Oct 11 (cc43d17766d5606ee3d532c5356cbff4,
re-checked this tick). The blocker has persisted across many ticks; the lane FIFO
(OWN-13 merged -> OLIGO-AI-1 dispatch) is stalled behind a one-line doc append.

Question: authorize splitting OWN-13 so the script+docs+package.json half merges now
(then the orch dry-run proof on a throwaway data-repo copy runs, OLIGO-AI-1 unblocks),
with the rule-9 append remaining an explicit named obligation on Brad's interactive
session? Or does the lane-serial FIFO stand (rule-9 is a founding-doc change and you
want it atomic)? Note: merging without rule 9 ships the migration tool one doc-rule
early; the FIFO rule itself is orchestrator policy, not Brad's — I am NOT relaxing it
unilaterally.

No credentials in either question. Evidence: task-list OWN-12/OWN-13 blocks, receipts
dirs, reports quoted above.
