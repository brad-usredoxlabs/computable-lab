# DRAFT — architecture-of-record.md §8 edit (+ §3b dependent copy) — PB-CH-9 Half B item 1

Status: **DRAFTED, PENDING ARCHITECT** — never merged by the worker (binding rule: architect
reviews spec edits before merge; PB-CH-9 never touches `specifications/` in any checkout).
Worker: cl-coder lane 2, dispatch l2t2355, 2026-10-09.

Target file: `specifications/architecture-of-record.md` (tracked ONLY on `main`).
Drafted against the **b30b36dc COMMITTED text** (sha256 of committed blob:
`2fa342ab63f7e1d2a2dfa66a3f7ef5691fef4bded2deb96726e4d1c3fea34fc4`, 185 lines), read
READ-ONLY via `git -C /mnt/vast/home/brad/git/computable-lab show b30b36dc:specifications/architecture-of-record.md`.
Code cites are valid at lane-trunk code tip **c74c5214** (re-verify at architect merge time —
the doc's own authority rule, :5: "docs follow the shipped code — label the divergence").

## Divergence flags (for the architect — NOT resolved here)

1. **b30b36dc is not on the lane trunk.** `git merge-base --is-ancestor b30b36dc HEAD` FAILS on
   `cl/integration-2` (merge-base d290a7fc); neither `architecture-of-record.md` nor
   `ai-drafting-and-ui-projection.md` exists in trunk `specifications/`. Re-measured at claim
   (f9eba9cf). The architect applies these hunks on `main`, then decides lane-sync timing.
2. **main HEAD has already moved past b30b36dc for this file.** `git diff b30b36dc..main(455232cf)`
   touches exactly ONE line: §8 item 4 (:169) was rewritten by commit `7977ec96` ("docs:
   handoffs, plan archive, principles/architecture-of-record updates from Oct 3-6 working
   session"). Current main text of item 4: "…have drifted (root-owned files; several lacked
   a+r until 2026-10-06). `architecture-of-record.md` and `ai-drafting-and-ui-projection.md`
   are now tracked (commit b30b36dc); keep canonical specs in git and readable."
   Consequence: Hunk D below is drafted against b30b36dc as instructed, but the architect
   should RE-ANCHOR it against main HEAD's corrected text (the "add the b30b36dc-not-on-lane-trunk
   fact if uncorrected" condition is now partly satisfied — the tracking fact is corrected, the
   not-on-lane-trunk fact is NOT yet recorded anywhere).
3. **Brad's working-copy divergence did NOT reproduce at check time.** The PB-CH-9 spec
   (:93-94, :408-410) records ` M` on `architecture-of-record.md` (and `computable-lab-principles.md`)
   in Brad's tree. At my check (2026-10-09, `git -c core.fileMode=false status --porcelain --
   specifications/…` in `/mnt/vast/home/brad/git/computable-lab`), BOTH files are CLEAN: working
   copy == main HEAD (`0ea4a22fd53062de1986d8571bf6d0987dc060e6aac9bb3f556c1b9875232db4`), which
   differs from b30b36dc only by the 7977ec96 line above. `ai-drafting-and-ui-projection.md`
   working copy == b30b36dc committed text (`894f902c6447d54455057671b84bb36ec5b7188a0dc1df7d22bd44438da377e2`).
   I flag this instead of resolving it: the live divergence is **b30b36dc vs main HEAD**, not
   working-copy vs committed.

## Terminology rule honored in every proposed line

The ledger concept's ONE local term is **workstate-snapshot** (PB-CH-7 decision
`.hermes/plans/PB-CH-7-ledger-storage-decision.md:225`, md5 `6b9f7e3cf23d53f5fdbbf7ddf88a9c87`).
No proposed line says "revision" (reserved: `record-revision`), "record", or "history-record"
for this concept. The ledger is described as TRANSPORT state, never knowledge (decision
CHOSEN OPTION: a at :297 — "transport values only, never knowledge records").

---

## Hunk A — §3b "Agent actions" bullet, status sentence (:82) — §8-dependent copy

CURRENT (b30b36dc :82, tail of the bullet):
> Status: the schema is shipped; the runtime wiring from AI stream events through `openSurface()` is the open edge (§8.1) — this is what a future "AI emits a page view" task actually completes.

PROPOSED:
> Status: the schema is shipped AND the runtime wiring is SHIPPED for the compiled page-emission path (page-builder-channel campaign PB-CH-1..6, merged on `cl/integration-2`): Ajv-validated `agent_action` frames reach the client (`app/src/event-editor/right-pane/ai/assistStream.ts:247`), tier-1 `focus`|`open-surface` applies ON ARRIVAL through the ONE shared executor (`app/src/shared/ai/useWorkstateProposalFlow.ts:179-196` -> `app/src/shared/session/useWorkstateExecutor.ts:48` `executeTier1`), and tier-2 session-document emission rides the compile->card->accept flow (`useWorkstateProposalFlow.ts:92` single `compileWorkstateDraft` call site; `app/src/event-editor/right-pane/ai/WorkstateProposalCard.tsx:78`). Cites re-read at c74c5214. The remaining open edge is generic component-tree page building (still deferred, §8) — the "AI emits a page view" task today completes via registry + workstate composition, not a component-tree emitter.

Rationale: closes the §8.1 open-edge pointer at :82 with shipped-code cites (Half B item 1(a));
keeps the deferred component-tree claim truthful (:83 unchanged).

## Hunk B — §8 item 1 (:166) — open-edge status update

CURRENT (b30b36dc :166):
> 1. **Cross-page page composition is spec, not runtime.** `agent_intent` emits event_graph / deck_layout / create_record (+ sequence coercion); there is no declarative "compose arbitrary page view" intent yet. The universal contract exists; per-surface adoption is tracked in the projection doc's table. Coders: when a task claims to "emit a page view," its real deliverable is either a surface-registry entry + openSurface target, or a compiler adapter — name which.

PROPOSED:
> 1. **Cross-page page composition: shipped for the workstate path, open for arbitrary page views.** `agent_intent` emits event_graph / deck_layout / create_record / workspace_action / compose_workstate / compose_analysis / query_workstate_history (`server/src/ai/submitSuggestionTool.ts:443`; dispatch branches `server/src/ai/AgentOrchestrator.ts:2134`, `:2222`, `:2378` — cites at c74c5214). The compiled page-emission path is SHIPPED: tier-1 `focus`|`open-surface` applies on arrival after compile; tier-2 workstate composition compiles to a review card and applies only on Accept through the ONE shared executor (`app/src/shared/ai/useWorkstateProposalFlow.ts:92`; `app/src/shared/session/useWorkstateExecutor.ts:48`/:79; `server/src/drafts/workstateCompile.ts` + `config/drafting/workstate-tab-kinds.yaml` kind->tab policy as DATA). There is still no declarative "compose arbitrary page view" intent and generic component-tree page building remains deferred. The universal contract exists; per-surface adoption is tracked in the projection doc's table. Coders: when a task claims to "emit a page view," its real deliverable is either a surface-registry entry + openSurface target, or a compiler adapter — name which.

Rationale: marks the §8.1-named open edge (:82/:166) SHIPPED for the compiled page-emission
path with merged-tip cites (Half B item 1(a)); preserves the still-open arbitrary-page-view gap
honestly (no overclaim).

## Hunk C — NEW §8 item 5 — session-doc LWW + append-only workstate-snapshot journal

CURRENT: (no such item; insert after :169, before `## 9`)

PROPOSED:
> 5. **Session doc stays LWW; the workstate-snapshot journal is append-only transport state (PB-CH-7 decision option a, shipped by PB-CH-8).** `var/sessions/{userId}/main.yaml` remains last-writer-wins whole-session upsert (`server/src/workspace-session/WorkspaceSessionStore.ts:74`). The journal is append-only content-hashed **workstate-snapshot** files under `var/sessions/{userId}/journal/` — OUTSIDE the records git tree, transport snapshots, never lab records (`server/src/workspace-session/WorkstateJournal.ts`; decision `.hermes/plans/PB-CH-7-ledger-storage-decision.md:297`). Capture eligibility, linkage, retention, and query anchoring are DATA in `schema/workflow/workstate-journal.policy.yaml`, re-read PER call and never cached (`WorkstateJournal.ts:287`, "NEVER cached" :191); a missing or malformed policy file DISABLES capture, never defaults (:193-194, :364). Capture lives at the ROUTE call site with the RESOLVED identity only, never the header fallback (`server/src/api/routes/workspace-session.ts:76` store.put stays raw-header LWW byte-unchanged; `:83` `journal.maybeCapture` with `resolved?.userId ?? null`). Ledger answers disclose `capturedAt` and say "as captured at", never "as of" (`server/src/workspace-session/ledgerQuery.ts:377-380` `ledgerAnswerText` — the ONE wording authority). Cites re-read at c74c5214.

Rationale: Half B item 1(b). Terminology: workstate-snapshot only. Describes transport, not
knowledge (Half B item 1(d)); every claim cites shipped code at the measured tip.

## Hunk D — §8 item 4 (:169) — keep truthful + add the b30b36dc-not-on-lane-trunk fact

CURRENT (b30b36dc :169):
> 4. **`specifications/` file permissions/ownership** have drifted (root-owned files unreadable to brad at times); specs referenced by agents must stay readable and, where meant to be canonical, tracked in git (`ai-drafting-and-ui-projection.md` was untracked at time of writing).

PROPOSED (drafted against b30b36dc as instructed; architect should merge against main HEAD's
7977ec96-corrected text instead — see divergence flag 2):
> 4. **`specifications/` file permissions/ownership** have drifted (root-owned files unreadable to brad at times); specs referenced by agents must stay readable and, where meant to be canonical, tracked in git (`ai-drafting-and-ui-projection.md` was untracked at time of writing; both spec docs are now tracked on `main` at b30b36dc). NOTE: b30b36dc is NOT an ancestor of the lane trunk `cl/integration-2` (merge-base d290a7fc) — lane worktrees carry neither file, so spec-doc edits arising from lane work must be drafted against `main` and merged there by the architect.

Rationale: Half B item 1(c) — item 4 stays truthful and the not-on-lane-trunk fact (verified
this session: `merge-base --is-ancestor b30b36dc HEAD` fails at f9eba9cf) is recorded where the
doc's own item 4 lives.

## Hunk E (optional, architect's call) — §8 header date

CURRENT (:164): `## 8. Known divergences & open edges (as of 2026-10-06, verified against code)`
PROPOSED: re-date at merge time, e.g. `(as of <merge date>, cites re-verified against <merge SHA>)`.
Flagged only — the architect decides whether to bump it with this edit.

---

## What this draft does NOT do

- Does not merge anything; does not edit `specifications/` in any checkout (the files do not
  exist on the lane trunk).
- Does not resolve Brad's working-copy/HEAD state (flagged above).
- Does not describe the ledger as knowledge: every ledger line above cites shipped transport
  code and the PB-CH-7 decision's "transport values only, never knowledge records" boundary.
- Does not cite unmerged internals: every cite was re-read at c74c5214 (name-and-read table in
  `.hermes/plans/PB-CH-9-report.wip-l2t2355.md`).
