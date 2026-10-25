# ANSWER-FOLD-NULL-1 — coder spec (DRAFT, lane 2, composer l2t1055, 2026-10-23)

Status: DRAFT for orchestrator review. Not canonical until promoted to
`.hermes/plans/`. Item text authority: lanes/2/task-list.md @ id ANSWER-FOLD-NULL-1
(Brad-approved 2026-10-23, FRONT OF QUEUE). Architect basis (BINDING):
`.hermes/plans/decisions/REVISEGHOST1-gate-f1-answerfold-decision.md` — every cite there
re-confirmed by the composer at current trunk 0cec0bf0 (all four touched files are
byte-identical between 24997f1b and 0cec0bf0; verified via
`git -c core.fileMode=false diff 24997f1b HEAD --stat -- <the four files>` = empty).

## 1. Goal

One sentence: make the deterministic answer-fold converge on the canonical 5-card hold —
first by logging WHICH null arm fires (additive server diagnostics), then by fixing the
named arm RED-first so a 5/5 answer submit folds with zero model calls.

## 2. Files in scope / out of scope

IN SCOPE (server leg):
- server/src/ai/AgentOrchestrator.ts — ONLY the fold-null else-arm at :1417-1422
  (re-verified at 0cec0bf0: `} else {` :1417, `holdShorthandIntent(conversationKey, held)` :1420,
  the `no 1:1 mapping` console.log :1421). Log insertion site: inside this else-arm.
- server/src/ai/shorthandChat.ts — fold is `foldAnswersIntoShorthand` :578-665;
  content-key join `factRequestId` :502-512. Leg 1 adds an exported pure diagnostic
  alongside it; Leg 2's fix lands inside the fold (see §5).
- One new server test file beside the existing shorthand suite (naming per convention,
  e.g. server/src/ai/shorthandChat.foldNullArms.test.ts) + a colocated fixture if needed.
  Canonical fixture material is ALREADY IN TRUNK:
  .hermes/plans/REVISE-GHOST-1-discriminator-artifact.md (the shorthand YAML
  `intentId: seed-hepg2-32wells` with the composition entries) and the SSE done-frame
  capture of the exact 5 clarification facts with their actionLocations;
  .hermes/plans/REVISE-GHOST-1-discriminator-payload.json (assist/stream body shape).

OUT OF SCOPE (explicit):
- app/** — except the CONDITIONAL leg in §6, and only if §5's measurement names the UI hazard.
- server/src/compiler/resolution/resolutionEngine.ts — read-only context (:148-164
  clarificationFor spreads req.actionLocation at :162; the request factory constructs
  actionLocation unconditionally at :439-452). No edit.
- schema/** YAML — no change. (If you feel a schema edit is needed, STOP and raise an OQ.)
- The intentional holds: AgentOrchestrator.ts :3753-3762 (legacy raw-event_graph material
  follow-up hold; `parsed.events = []` at :3758; the architect's ":3728/:3759" cites point
  at this region) and app AiTabPanel.tsx :1538 ("Answer the questions above to continue.")
  — byte-identical required, do not weaken.
- factRequestId's key composition (:502-512) — the content key MUST NOT change shape
  (pinned: AgentOrchestrator.shorthandChat.test.ts:497; mid-flight clients echo it verbatim).
- The legacy digits fallback :606-613 — keep, and it must stay shadowed by content ids.
- The task list, canonical .hermes/plans/ paths, trunk, the lane stack config.

## 3. Acceptance criteria (verbatim from the task list's "verified by")

(1) the new arm-log line appears in .run/backend.log on a fresh canonical-run answer submit;
(2) the canonical utterance, answered 5/5, reaches 'shorthand answer folded deterministically
... no model call' with events>0;
(3) a server test locks the RED->GREEN;
(4) no app/ edits unless leg 2 named them.

## 4. Leg 1 — server, ADDITIVE-ONLY arm diagnostics

Smallest change, chosen and shown: RE-DERIVE the arm in a new pure exported helper in
shorthandChat.ts rather than threading it out of the fold (threading changes the fold's
return type and every destructure site for a diagnostic — not the smallest change; the
fold itself stays byte-identical in Leg 1).

New export (name is the coder's to adjust; shape is the contract):

    export function foldNullArm(held: HeldShorthandIntent,
      answers: readonly AgentClarificationAnswer[]): FoldNullArm | null   // null = fold would NOT be null

Walks the SAME guards in the SAME order as the fold, returning the FIRST arm that would
return null, with the requestId that triggered it and (for the slot arm) the actual
`typeof` (or `Array` tag) of the slot value. Arms, with fold sites at 0cec0bf0
(the architect's five + the sixth exit — the item text says "five", the code has six exits):

    arm 'no-answers'        :582  answers.length === 0
    arm 'join-miss'         :604-615  factByKey.get(requestId) miss AND legacy-digit
                                      fallback (:610-613) miss  (report requestId)
    arm 'empty-label'       :616-619  answer.label missing/blank (report requestId)
    arm 'no-action-location':620-621  fact lacks loc / actionIndex not number /
                                      argument not string (report requestId)
    arm 'slot-not-string'   :622-623  doc.actions[loc.actionIndex][loc.argument]
                                      is not a string — REPORT requestId, argument, and
                                      typeof/Array-tag of the slot value (this tag is the
                                      discriminator, see §5)
    arm 'nothing-answered'  :633  answered.size === 0
    arm 'ajv-reparse-fail'  :653-663  parseShorthandForChat threw
                                      ScientistIntentValidationError
    (returns null when no arm fires ⇒ the fold cannot be the null source; log 'none'
     in that case — an anomaly worth seeing once.)

Log site: AgentOrchestrator.ts, in the else-arm body after :1420 (before or merged with
the existing :1421 line — do not remove or reword :1421; the gate trail greps it).
Required content: requestId of the triggering answer, the arm tag, and
answer-count vs held-fact-count, e.g.

    [agent ${tid}] fold-null arm=${arm} requestId=${requestId} answers=${clarificationAnswers.length} heldFacts=${held.clarifications.length} slotType=${slotType}

(slotType present only for 'slot-not-string' — conditional-spread/optional-string discipline
does NOT apply here because this is a flat template string, see §11 bait #1.)

The helper must be a MIRROR of the fold guards, not a reimplementation with drift: keep it
directly under the fold in the file and add a comment pinning the arm line numbers.

## 5. Leg 2 — replay the canonical utterance, name the arm, fix it RED-first

Replay protocol against the LIVE lane backend :3093 (do NOT write to records — the chat
surface is propose-only; the W28-A5m probe idiom /tmp/w28a5m-probe.py is the shape model,
but the chat fold lives behind /api/ai/assist/stream, routes.ts:668, so replay there):

  A. Warm the store once: `curl -m 180 -s http://localhost:3093/api/records -o /dev/null`
     (store is slow-cold; the gate report's reproduce block mandates this).
  B. POST /api/ai/assist/stream (curl -N, body shape per
     .hermes/plans/REVISE-GHOST-1-discriminator-payload.json — surface workspace.deck,
     context with studyId/activeTabKind/labwares) with the canonical draft prompt,
     VERBATIM (trail.json step 4):
       "50/50 Trypsin-EDTA/DMEM + 10% FBS with 200 HepG2 cells/uL across A1:A3 of the seeding plate"
  C. Parse the SSE done frame: clarificationRequests[].id (unresolved-c-<10hex>) — this is
     the held card-set; the conversation key is deriveContextCacheKey(surface, context)
     (systemPrompt.ts:642), so POST #2 MUST send the identical surface+context object.
  D. POST #2, same body plus clarificationAnswers: one answer per card,
     { requestId: <id from C>, label: <chosen candidate label>, ref: { id: <candidate ref> } } —
     bind to real records where the candidate list has them (e.g. MAT-trypsin-edta-100w,
     MAT-dmem-ykg0, MAT-fbs-3776, MAT-hepg2-cells-4oys — all real refs visible in the
     in-trunk discriminator capture). 5/5, nothing accumulated, nothing stale.
  E. Read the new arm-log line in /mnt/vast/home/brad/git/cl-integration-2/.run/backend.log.
     Server TS hot-reloads via tsx --watch; only YAML needs a restart
     (restart via /home/brad/.hermes/profiles/orchestrator/scripts/cl-lane-stack.sh 2 restart —
     run it background=true; the foreground call hit the 600s timeout once and left the stack down).

The null-arm map (0cec0bf0 cites, §4 numbering) and what is excluded for the canonical set:

  - 'empty-label' and 'no-action-location' are EXCLUDED BY CONSTRUCTION for round 1: all
    five canonical cards are engine facts (unknown-noun labware/material + 4x ambiguous-noun
    material; diag3.json + discriminator capture) and the engine always fills label and
    always carries actionLocation (resolutionEngine.ts:148-164 spreads req.actionLocation;
    the request factory :439-452 constructs it unconditionally). This is the architect's
    (b)/(c) exclusion.
  - The architect ruled the round-1 null is one of 'join-miss' / 'slot-not-string' /
    'ajv-reparse-fail' and UNMEASURED. SCREENING EVIDENCE pointing at the answer (composer
    first-hand, still not the measurement — the arm log is): the in-trunk discriminator
    capture shows FOUR of the five facts carry
    actionLocation { actionIndex: 0, action: 'add_material', argument: 'composition' }
    while doc.actions[0].composition is an ARRAY of declared entries
    (scientist-intent.schema.yaml :180-200, COMP-4). The fold guard at :623 requires
    `typeof action[loc.argument] === 'string'` — an array slot FAILS it, deterministically,
    on EVERY round with FRESH answers. That single arm explains everything the
    architect flagged unexplained (5/5 fresh answers refused round 1; identical refusal every
    round; "the accumulation theory does not straightforwardly predict 5 every round").
    Scout screening corroborates: no code path in shorthandChat.ts handles array-valued
    slots (composer verified at :621-623 directly — scout is screening, not authority).
  - What the arm log will distinguish: 'slot-not-string' names the array slot (expect this);
    'join-miss' at round >=2 with requestIds absent from the held set names the UI-accumulation
    class (see §6); 'ajv-reparse-fail' would mean the spliced doc itself is invalid and would
    require the payload dump of yamlText before claiming a fix.

  Fix (RED-first, only once the log names the arm; the paragraph above is a hypothesis to
  confirm, not permission to pre-fix). If the named arm is 'slot-not-string' on
  argument='composition', the minimal fold-machinery fix shape: when the slot value is an
  array of entry-objects and the fact's label matches an entry's symbolic noun field
  (entry.material === fact.label), splice THAT ENTRY (entry.material = chosen label),
  otherwise keep returning null (never guess — the fold's null contract at :567-577 stays).
  Two follow-on wrinkles the GREEN test must cover (both are inside the fold-success path):
    (i) answeredSlots/ledger same-slot collision: four AnsweredSlot entries share
        slot:0:composition and dropSatisfiedFacts keys by `slot:<i>:<arg>`
        (shorthandChat.ts :685, AgentOrchestrator.ts :1372-1377) — last-write-wins today;
        verify the re-derive/ledger pass does not resurrect closed composition cards
        (the events>0 criterion covers it; if it doesn't, this is an OQ, not a redesign).
    (ii) bindings (:597-631) ride per-answer — per-entry splicing keeps working, but the
        test should assert bindings for at least the composition cards (REVISE-GHOST-1
        reuse rides the fold-success path — it is a downstream consumer, §9).
  Hardcoded-name caution: if the fix must name the slot, prefer deriving array-ness/entry-field
  from the vocabulary/schema data (vocabulary argContracts, argContracts(...).domain) over a
  literal 'composition' TS branch — see OQ2; stay minimal either way, this item does NOT
  redesign the fold.

  The RED test is shaped on the canonical 5-card set: build the held intent by
  parseShorthandForChat over the discriminator artifact's shorthand YAML (fixture strings
  live ONLY in the test — repo rip-out rule, see the header of
  AgentOrchestrator.shorthandChat.test.ts), derive the five requestIds via factRequestId,
  answer 5/5, assert foldAnswersIntoShorthand returns a folded doc (RED today: null;
  GREEN after the fix), assert the per-entry splice, and an AgentOrchestrator-level leg
  (shaped on AgentOrchestrator.shorthandChat.test.ts's answer-fold round-trip) asserting
  the folded-success done line with events>0 and zero model calls on the second turn.

## 6. Conditional app/ leg — pre-registered gate (SH-QA serialization)

ONLY if §5's measurement names the AiTabPanel accumulation hazard as cause or aggravator —
i.e. the arm log shows 'join-miss' with requestIds that are NOT in the held card-set, on a
round where the client re-sent stale/accumulated answers. Hazard sites at 0cec0bf0
(re-verified; architect cites 1135-1147 hold):
  - resolvedClarificationsRef declared :957; keyed `refId ?? a.requestId` :1139; re-sends
    the accumulated `all` :1141 + :1145 on every submit.
  - Cleared on: fresh send :1101, cancel :1158, protocol-draft :1326, extract-CTA :1361.
  - NEVER cleared when a NEW held card-set arrives after a failed fold — the missing clear
    site. Note: the degenerate identical candidate rows (diag3.json: the same formulation
    label x12) make refId-collapsing of distinct cards' answers possible, but the backend
    logged clarificationAnswers=5 EVERY round, which the accumulation theory does not
    straightforwardly predict — measure, don't assume (architect, verbatim intent).
If the leg activates: it is exactly ONE bounded change (the missing clear site), the coder
MUST serialize against the AiTabPanel hot-file cluster per the SH-QA rule (no concurrent
worker touching app/src/event-editor/right-pane/ai/AiTabPanel.tsx), and verified-by (4)
then records WHY app/ was named, citing the arm-log lines. If the log shows
'slot-not-string' and clean round-1 requestIds (the composer's screened hypothesis), the
app/ leg STAYS DARK — verified-by (4) then means zero app/ edits.

## 7. First targeted check (run this before anything else, Leg 1 in hand)

    cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run src/ai/shorthandChat.foldNullArms.test.ts -t 'canonical'

Expected at end of Leg 1: GREEN with the helper reporting arm='slot-not-string' (with
array tag) for the canonical 5-card fixture. Then the LIVE discriminator for verified-by (1):
repeat §5 steps A-E once and grep:
    grep -a "fold-null arm=" /mnt/vast/home/brad/git/cl-integration-2/.run/backend.log | tail
If the live arm disagrees with the unit fixture's arm, the LIVE arm wins — re-scope the RED
test to the live shape before writing the fix.

## 8. Verification commands (with expected output)

Leg 1 + Leg 2, server only:
  1. RED->GREEN lock (verified-by 3):
     cd /mnt/vast/home/brad/git/cl-integration-2/server
     npx vitest run src/ai/shorthandChat.foldNullArms.test.ts
     Expected: RED at pre-fix HEAD (paste into report), GREEN after fix, 0 failed files.
  2. Scoped shorthand suite:
     npx vitest run src/ai/shorthandChat src/ai/AgentOrchestrator.shorthand
     Expected: all shorthand suite files PASS, 0 failed (baseline is green here — do not
     accept "same failures as before" hand-waving; run it at HEAD first and record).
  3. Typecheck: npm run typecheck -w server (from repo root).
     Expected: zero NEW error lines vs HEAD baseline (the lane carries a known pre-existing
     baseline; capture `tsc --noEmit | sort` before/after and diff — must be empty for
     owned files).
  4. Live convergence (verified-by 1 + 2): §5 replay. In .run/backend.log expect, in order:
     a line `[agent <tid>] fold-null arm=...` on the pre-fix round (capture evidence BEFORE
     the fix lands, per verified-by 1's "fresh canonical-run answer submit"), and post-fix:
     `[agent <tid>] shorthand answer folded deterministically onto the held intent (...) — no model call`
     (AgentOrchestrator.ts:1359) followed by
     `[agent <tid>] done shorthand-fold success=true events=N` with N > 0 (:1414).
     events>0 matters: the needs-clarification swallow arm (shorthandResultFromCompile,
     events:[]) is a DIFFERENT failure the fold-success alone does not preclude.
  5. Full server suite comm-check vs HEAD baseline (house rule): zero NEW failing files.
  6. (4) no app/ edits: `git -c core.fileMode=false diff --stat <trunk-tip-at-dispatch> -- app/`
     must be empty unless §6 activated with cited arm evidence.

## 9. Worker contract

- Worktree: wt/ANSWER-FOLD-NULL-1-lane2-<tag> branched off the trunk tip AT DISPATCH
  (this draft verified at 0cec0bf0; MIXROLE-1 holds the fleet lock — do NOT preempt a live
  coder; cuts ahead of CELLRATE-1/FULFIL/PANEL/CHAIN per Brad's ruling).
- Branch: item id + tag, no trunk edits.
- Deliverable: unique report path /home/brad/.hermes/cl/lanes/2/ANSWER-FOLD-NULL-1-report.<tag>.md
  (orchestrator promotes to canonical). Include: RED output, GREEN output, live arm-log
  excerpts (pre-fix arm AND post-fix folded line with events>0), tsc before/after diff,
  the §5 arm measurement named explicitly.
- Propose-never-write: chat turns on this surface mutate no records; the replay is safe by
  construction; still never POST to record-write endpoints during probes.
- NO browser gate for this item's own acceptance (server convergence + tests). Downstream,
  NOT scope: REVISE-GHOST-1 gate attempt 5 rides this merge per the architect ruling (F1+F2
  whole §4C, store-warm first) — the coder must not open Playwright and must not re-shape
  that gate. No model-side router involvement (D5): the fix is deterministic fold machinery;
  the tiny-model shadow-router must stay untouched.
- Stack etiquette: server TS hot-reloads (tsx --watch); YAML edits need
  cl-lane-stack.sh 2 restart run background=true. If the stack must come up, verify
  :3093 /api/health == 200 before replaying.

## 10. Constraints carried (binding)

- Propose-never-write, everywhere on this surface.
- No policy in TS branches where data can carry it — BUT this item is fold machinery:
  stay minimal, do NOT redesign the fold, the ledger, or the clarification pipeline.
- Do NOT weaken the intentional holds: AgentOrchestrator.ts :3753-3762 legacy hold and
  AiTabPanel.tsx :1538 hold string (+ Cancel escape) — byte-identical.
- D5: zero model/router involvement in the fix path.
- exactOptionalPropertyTypes on backend (server/tsconfig.json:13): optional means absent
  OR value, never undefined — conditional-spread discipline for every new optional field
  (e.g. the diagnostic's slotType goes into the log STRING, or if a structured field is
  ever added, `...(x !== undefined ? { x } : {})`).
- The fold's null contract (ANY answer without a 1:1 map ⇒ null, :567-577) must survive
  the fix verbatim — the fix widens WHAT a 1:1 splice can target, never relaxes "never guess".

## 11. Reviewer bait (expect these in adversarial review; pre-empt them)

1. exactOptionalPropertyTypes: any object-literal the diagnostic or fix touches with an
   optional property — a `slotType: string | undefined` assignment fails typecheck ONLY at
   these sites; mirror the `...(cond ? {k} : {})` pattern used at :1354-1356/:1393.
2. YAML-reload trap: the fix is TS-only; if a reviewer sees ANY schema/*.yaml in the diff,
   demand justification (none expected) and a stack restart proof — tsx --watch does NOT
   reload YAML. Conversely, don't restart casually: a restart drops held shorthand intents
   (process memory), invalidating a mid-replay card-set.
3. Ontology terms: the fold splices SYMBOLIC nouns (the scientist's words), never record
   ids — a fix that writes MAT-* into the doc is wrong by construction (:571-573 comment;
   the spine re-binds). Test must assert the folded doc still parses as scientist-intent.
4. Hardcode boundary: a literal 'composition' string in server/src/** is the classic bait —
   either derive from vocabulary/schema data, or (if truly smallest) name it with a comment
   tying it to the schema-declared slot AND the repo rip-out rule (no fixture-domain strings
   in src/ — see the test header rule; the label 'Trypsin-EDTA' in src/ would be a REJECT).
5. factRequestId key change: any diff touching :502-512 is a scope violation — the content
   key is pinned (test :497) and changing it orphans mid-flight card-sets. The legacy-digit
   fallback must remain unreachable for content ids (:606-613).
6. The sixth exit: the item text says "five arms"; the code has SIX null exits (+ the
   should-not-happen none case). A diagnostic that enumerates only five mislabelled
   'nothing-answered' as something else — the helper's arm table must map 1:1 to :582,
   :615, :619, :621, :623, :633, :662.
7. events>0 vs the swallow arm: `success=true events=0 clarifications=5` on the
   fold-success path is the SAME gate defect shape (the REVISE-GHOST-1 discriminator pinned
   it) — GREEN means events>0 AND no second 5-card hold for already-closed slots (ledger
   check §5(i)).
8. Hold-weakening bait: any hunk near :1420-1421 that rewords :1421, near :3753-3762, or
   near AiTabPanel :1538 — diff must show additive-only there.
9. Accumulation over-reach: landing the app/ clear-site (§6) WITHOUT arm-log evidence
   naming it violates verified-by (4). Screenshots/live log lines, not theory.

## 12. Open questions for the orchestrator

OQ1 — Arm-log evidence ordering vs verified-by (1): the arm line only appears while the bug
  still exists. Plan assumes Leg 1 lands on the lane stack, live replay captures the arm
  line (criterion 1 satisfied pre-fix), THEN Leg 2 fixes. If the orchestrator wants
  criterion 1 provable post-merge too, an intentional null probe (answer with a bogus
  requestId) would show 'join-miss' forever — confirm that reading or waive it.
  Checked: fold-null is now unreachable on the canonical set post-fix, so criterion 1 as
  literally worded is a pre-fix-phase artifact.
OQ2 — If the fix needs to name the composition slot in TS: is a literal slot name with a
  data-cite comment acceptable as "smallest change", or does the orchestrator want me to
  first check whether argContracts/vocabulary data can carry entry-foldability (bigger
  diff, cleaner boundary)? Checked: the fold only consults vocabulary at
  clarificationsFromUnresolvedFacts (:524-540); no existing data flag marks array-entry
  slots as foldable; the entry symbolic-noun field is `material` per
  scientist-intent.schema.yaml :187-195.
OQ3 — Ledger same-slot collision (§5 wrinkle (i)): if the GREEN end-to-end needs a ledger
  key fix (slot+label or slot+entry index), is that in THIS item's minimal boundary or a
  follow-on? Checked: dropSatisfiedFacts (:677-695) and the orchestrator ledger merge
  (:1372-1387) both key by slot only; with four composition entries closed in one fold,
  last-write-wins is real; the events>0 criterion may pass anyway because the re-compile
  stops re-deriving resolved bars — measurable, not guessed.

TRUNK VERIFIED AGAINST: 0cec0bf0a5e0d96e7ff75c62e9db0d612116389b (cl/integration-2; all architect cites re-confirmed byte-identical since 24997f1b for AgentOrchestrator.ts, shorthandChat.ts, resolutionEngine.ts, AiTabPanel.tsx)

## 13. ORCHESTRATOR RATIFICATION (l2t1130, 2026-10-23 ~11:55 EDT)

Promoted to canonical after first-hand re-verification at trunk 34848b7c (composer
verified at 0cec0bf0; ancestor confirmed, only docs commits between):
- fold null exits at shorthandChat.ts :582/:615/:619/:621/:623/:633/:662 — opened, confirmed;
- AgentOrchestrator.ts else-arm (holdShorthandIntent + 'no 1:1 mapping' log) — opened, confirmed;
- AiTabPanel.tsx handleClarificationsSubmit accumulation site (resolvedClarificationsRef
  keyed refId ?? requestId, re-sends `all`) — opened, confirmed;
- discriminator artifact: EXACTLY 4 facts carry actionLocation {actionIndex:0,
  argument:'composition'} + 1 on 'material'; shorthand doc.actions[0].composition is an
  ARRAY — the composer's 'slot-not-string' screening hypothesis is consistent with the
  artifact, still NOT the measurement (§7 first-check stands);
- resolutionEngine.ts:148-164 conditional spread + factory :439-452 unconditional
  actionLocation — confirmed at server/src/compiler/resolution/resolutionEngine.ts;
- ledger slot-keying (`slot:<i>:<arg>` last-write-wins) at shorthandChat.ts :684-688 and
  AgentOrchestrator.ts :1372 — confirmed.

OQ RULINGS (binding for the coder):
- OQ1 RULED: criterion (1) is a pre-fix-phase artifact, confirmed reading. The coder
  captures the live arm-log excerpt BEFORE the fix lands (report evidence), post-merge
  permanence is NOT required; no permanent bogus-requestId probe needed.
- OQ2 RULED: generic-mirror shape preferred, smallest: when the slot value is an Array,
  splice the FIRST entry-object whose declared symbolic-noun field equals fact.label
  (generic: first string-valued property of the entry that equals the label — do NOT
  hardcode the field name 'composition'/'material' as a policy branch; a data-cite
  comment to scientist-intent.schema.yaml is required). If no entry matches => keep
  returning null (never guess). No vocabulary redesign this item.
- OQ3 RULED: ledger fix rides THIS item ONLY if the events>0 / no-reopened-cards
  criterion actually fails with the slot-only key. Measurable, not guessed: if GREEN
  passes as-is, the ledger stays untouched byte-identical.

Downstream binding: REVISE-GHOST-1 gate attempt 5 unblocks on THIS merge (architect
ruling). CELLRATE-1 is live in the fleet coder slot; ANSWER-FOLD-NULL-1 waits on the
flock (queue script lanes/2/queue-answerfoldnull1-<tag>.sh) — no preemption.
