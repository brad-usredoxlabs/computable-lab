# MATRES-REPLAY — HARVEST LEG ONLY (orch draft l2t1930, pre-scout-screen)

Task: MATRES-REPLAY (campaign 2). Owner profile: cl-senior (thunderbeast; NOT the fleet
coder lock). Status intent: this spec covers ONLY the harvest+instrumentation legs that do
NOT require Brad's live rulings. The worksheet legs (intended-binding-before-panel,
signed by Brad) are explicitly DEFERRED — do not attempt them, do not fake them.

## Why partial
Replay's deps list MATRES-0 (memo r1 drafted 19:00; ratification window closes 2026-10-21
18:00 EDT). Ratification gates the *evaluation semantics* (what a binding means), not the
*harvest* (what the transcript actually contained + what the spine actually returned).
Harvest evidence is input FOR the panel/ELIG specs and stays valid under any Q1-Q8 ruling.

## Harvest-leg scope (deliverables)
H1. Transcript harvest. Persisted surfaces (orch-verified 2026-10-19, trunk
    cl/integration-2):
      - Chat transcripts: var/ai-threads/{userId}/{endpoint}.json — AiThreadStore.ts:4,52-54;
        endpoints incl. 'event-editor' (ai-threads/types.ts:13). Lane data repo root:
        /home/brad/.computable-lab-lane2/worktrees/main (currently only default/{literature,
        sequences}.json exist — event-editor threads may be sparse; harvest ALL userId dirs).
      - Workstate snapshots: var/sessions/{userId}/journal (WorkstateJournal.ts:276,282) —
        append-only; capture the workspace-context half of each turn from here.
      - Drafts are NOT persisted as files: /drafts/compile|accept (draftRoutes.ts:6-11)
        compile through the in-memory stagingStore (StagingStore.ts) — nothing reaches disk
        pre-accept. Consequence for the study: draft payloads must be reconstructed from the
        assistant messages in the thread JSON + journal snapshots, NOT from a drafts store.
        Verify this yourself (read FormDraftService) and say so in the doc.
      - Held clarifications/intents: server-side heldIntents live in memory only
        (shorthandChat.ts; the known clear-on-cancel gap, SH-QC-1 S9 F-3) — so
        clarification Q/A pairs exist ONLY as they appear in the thread text. Harvest them
        as-is; note every place the persisted form is too lossy to replay.
    Output: .hermes/plans/replay-harvest/transcripts/<thread-id>.json (COPIES only;
    never move/edit originals) + an index.md listing each harvested turn: user utterance,
    timestamp, workspace context captured, assistant/clarification text, and whether the
    canonical four-term Trypsin-EDTA/DMEM/FBS/HepG2 utterance (or a close analogue) exists.
H2. Spine instrumentation + replay of harvested material turns. For every harvested turn
    whose utterance carries material nouns: run the ResolveSpine OFFLINE (server/src/
    resolve/ResolveSpine.ts; six-tier law, tier dominates ranking per its header comment
    :4-14) against the harvested workspace context, with localOnly semantics (P6). Capture
    per noun: full candidate list with tier + referent level + the spine's own trace, AND
    classify each candidate's FATE: returned-and-ranked / suppressed (which stage),
    level-filtered (which filter), remote-clamp affected (the known clamp). Instrumentation
    via a harness script under .hermes/plans/replay-harvest/scripts/ (never product code).
    Remote tiers: run with network DISABLED or stubbed so outcomes don't depend on a fresh
    web response (task verified-by clause).
H3. Artifact-kind gap table (feeds P2/Q2): for each harvested draft reconstruction,
    record which of the four artifact kinds (material-spec/plan-slot ref | planned-run
    binding | attestation chain | candidate-protocol) the persisted payload COULD be
    confused between, given only what's stored. This is evidence for the memo's Q2, not a
    ruling on it.
H4. Static typed panel MATERIAL (not evaluation): render each replay's candidate set as
    plain text grouped referent-level x tier (flat file per turn). MINT SUPPRESSED — the
    panel is a capture format; Brad's intended-binding worksheet comes LATER and is not
    part of this dispatch.

## Explicitly OUT of this leg
- Any pre-declared failure-condition verdict (needs Brad's intended bindings first).
- The six-case required sample: harvest whatever actually exists in transcripts; if a
  required case (e.g. case-3' unspecified source) has no real transcript, RECORD ITS
  ABSENCE — do not synthesize a transcript (P: never fabricate evidence). Authoring
  synthetic cases is a separate decision after the harvest report.
- Any product-code change, any write to /home/brad/.computable-lab-lane2/**, any git op
  in Brad's trees. All artifacts under .hermes/plans/replay-harvest/ on a worktree branch
  wt/matres-replay-lane2 off cl/integration-2.

## Acceptance (this leg)
- index.md with per-turn table + honest coverage note vs the six required cases.
- >=1 instrumented replay per harvested material-bearing turn with the fate-classification
  table; harness scripts committed and re-runnable offline (node script, no network).
- H3 gap table.
- Deliverable report: .hermes/plans/MATRES-REPLAY-harvest-report.<UNIQUE-TOKEN>.md
- No product files touched (git diff outside .hermes/ clean).

## Assumptions to record
- Harvesting reads Brad's lane data repo var/ (records are TEST DATA per standing ruling);
  read-only copy is sanctioned.
