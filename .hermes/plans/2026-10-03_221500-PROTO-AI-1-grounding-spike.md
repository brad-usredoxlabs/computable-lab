# Spec — PROTO-AI-1 · Grounding spike (server-gate audit, stepId allocation, settings envelope, prompt-context trace, ChangesPanel contract)

Lane: 2 · Trunk: `cl/integration-2` @ `1472a027` (merge of main @ `d290a7fc` into the lane trunk — the
campaign baseline; see handoff).
Campaign: `ai-protocol-edit-and-router` (see `~/.hermes/cl/lanes/2/task-list.md`).
Type: READ-ONLY SPIKE. **No product code may change.** The only committed artifact is a doc under
`.hermes/plans/`. `git diff` outside `.hermes/` must be empty at hand-off.

## Why this exists
Every later task (PROTO-AI-2..13) rides the seams this spike maps. The orchestrator must not re-derive
this per task, and any gate found to be client-only must become PROTO-AI-5's explicit work list rather
than a silent assumption an AI write could slip through. Locked decisions (D1–D6, LOCKED engineering
decisions) in the task list are binding — the spike documents reality against them, it does not
re-litigate them.

## Deliverable (UNIQUE output path)
Write the map to:
  `.hermes/plans/PROTO-AI-1-grounding-map.wip-l2t2215.md`
in the worker worktree. The orchestrator promotes it to the canonical path
`.hermes/plans/PROTO-AI-1-grounding-map.md` after acceptance. Do not write the canonical name yourself.

Format: markdown. Every factual claim carries a `file:line` citation into THIS tree (the worker
worktree, which is `cl/integration-2` @ `1472a027`). No paraphrase without a citation. If something is
absent, say "absent" and cite the search you ran, not a guess.

## Environment / how to run things
- Worktree: `/mnt/vast/home/brad/git/wt/PROTO-AI-1-lane2` (branch `wt/PROTO-AI-1-lane2`, off `cl/integration-2`).
- Lane dev stack (already up, do NOT restart unless you change YAML — you must not change YAML):
  backend `http://localhost:3093`, frontend `http://localhost:5193`.
- Manage stack: `/home/brad/.hermes/profiles/orchestrator/scripts/cl-lane-stack.sh 2 status|restart`.
  NEVER touch `:3001`/`:5174` (Brad's stack) or the shared main checkout
  `/mnt/vast/home/brad/git/computable-lab`.
- `exactOptionalPropertyTypes` is ON for the backend: optional means absent OR a value, never `undefined`.
- Read-only recon may use `search_files`/`grep`/`read_file` freely. You may `curl` the lane backend
  `:3093` read-only (GET) to observe live behaviour. Do NOT issue any write (PUT/POST/PATCH/DELETE).

## Questions to answer (a)–(e), with anchors already located
Anchors below are the orchestrator's orientation (verified to exist in this tree); you still must read
the code and cite the exact lines.

(a) **GATE AUDIT.** For each human gate, decide SERVER-side / CLIENT-only / ABSENT, and cite the
    enforcement point (or its absence):
      1. inherited / protocol-kind-only editable
      2. content-locked / controlled protocols locked
      3. >=1 step must remain
      4. executed steps undeletable
    - Known: executed-delete is server-side at `server/src/api/routes/protocol-steps.ts:502-503`.
      Confirm and find the rest.
    - The client-side gate module is `app/src/event-editor/right-pane/protocol/protocolStepEditing.ts`
      (+ its test `protocolStepEditing.test.ts`). Compare its rules against the server.
    - CRITICAL: check BOTH the dedicated protocol-steps endpoints (`server/src/api/routes/protocol-steps.ts`)
      AND the whole-record path `PUT /records/:id` → `RecordHandlers.updateRecord`
      (`server/src/api/handlers/RecordHandlers.ts`; route registered at `server/src/api/routes.ts:233`).
      If a gate holds on the step endpoints but NOT on the whole-record PUT, that is a GAP — name it.
    - Produce an explicit table: gate → server/client/absent → file:line → note.

(b) **stepId ALLOCATION.** How the human editor mints new stepIds. Locate the modal
    (`app/src/event-editor/right-pane/protocol/ProtocolStepEditModal.tsx`) and whatever insert helper
    lives in `protocolStepEditing.ts` (the task calls it `insertProtocolStep`). State the exact id
    shape/pattern and the code path, so the AI apply path can reuse it verbatim.

(c) **SETTINGS envelope.** What `server/src/api/routes/protocol-steps.ts` requires of a `settings`
    payload — the task points at ~`:748-797` (cycling-program validation). State precisely: which step
    kinds accept settings, the allowed shape per kind, required vs optional fields, and how invalid
    settings are rejected (error code + message). This becomes the op-envelope's `settings` shape.

(d) **PROMPT CONTEXT.** Trace the real server prompt-construction path for the event-editor chat.
    - Server composition: `server/src/ai/systemPrompt.ts`; the prompt doc is
      `server/prompts/event-graph-agent.md`.
    - App-side candidate: `app/src/event-editor/right-pane/ai/systemPromptForViewer.ts`.
    - Answer: when a protocol is attached to the chat, are the protocol's step list
      (stepId, ordinal, label, kind) and its declared role inventory (roleId, description,
      expectedLabwareKinds) ALREADY injected into the outbound model request? Cite the exact
      injection site and the code that assembles the attached-protocol block (or state it is absent).
    - This determines PROTO-AI-6's edit site.

(e) **CHANGESPANEL contract.** `app/src/event-editor/right-pane/ai/ChangesPanel.tsx` is typed on
    `EventGraphChange` (in `app/src/event-editor/right-pane/ai/sidebarState.ts`). Document the MINIMUM
    contract extension a protocol-edit diff needs without breaking event-graph review: what fields the
    panel reads today (op/description/warnings/onApply/onDiscard), and the smallest additive change
    that can render a protocol-edit proposal (target protocol named; per-op before/after for step text,
    kind, settings, position; role add/update/remove incl. expectedLabwareKinds). Propose the type
    shape; do not implement it.

## Acceptance criteria (the task's `verified by`, verbatim)
- Spec doc committed in the lane worktree's `.hermes/plans/` with `file:line` citations for (a)–(e).
- An explicit table of each gate → server/client/absent.
- Named open questions.
- No product code changed (`git diff` clean outside `.hermes/`).

## Out of scope
- No implementation, no schema authoring, no lint authoring. Those are PROTO-AI-2..13.
- Do not activate any commented lint rule.
- Do not edit the task list; the orchestrator owns it.

## Open questions (carry forward — fill as you find them)
- Any gate that is CLIENT-only on the step endpoints but ALSO absent on the whole-record PUT?
- Does the attached-protocol context block exist today at all, or must PROTO-AI-6 create it?
- Are `insertProtocolStep`-minted ids collision-checked against existing stepIds?