# HARNESS-SEQ-1 — browser gate r3 (tier-2) — receipts

Task: HARNESS-SEQ-1 (lane 2) — unified harness chat on the sequences surface.
Served candidate: trunk cl/integration-2, HEAD 82d61c32 (docs-only) on top of the merge 353800da
(HARNESS-SEQ-1 + fix1 25758f0d). Stack: frontend http://localhost:5193, backend :3093.
Reviewer: cl-browser-reviewer, READ-ONLY on the product tree.

Receipts in this directory:
- `trail.json` — the browser-harness trail (visual legs at /lab/sequences and /runs/:runId)
- `spec-wall-trail.json` — the command-leg trail (spec walls, unit wall, served-revision checks)
- `logs/` — raw outputs of every run (primary-spec, three-pane, seq-scroll run1-6, vitest-agent, visual-harness)
- `shots/` — screenshots (numbers match the harness trail steps)
- `scroll-artifacts/run6/` — Playwright artifacts for the one scroll-wall failure I persisted

## Served-revision confirmation (before measuring)

- `git merge-base --is-ancestor 353800da HEAD` → YES; `git diff 353800da..HEAD` = 1 file, +34 lines,
  a `.hermes/plans` doc only — ZERO product delta. (spec-wall-trail.json n1-n2)
- `curl http://localhost:5193/src/agent/HarnessChatPane.tsx` → HTTP 200, `text/javascript`, 10842 bytes,
  body contains `harness-chat-pane` → the REAL Vite module, not an HTML fallback. (n3)
- `curl http://localhost:5193/src/e2e/sequences-harness-chat.spec.ts` → SPA HTML fallback, i.e. not served
  as a module. (n4)
- Observation (not in the brief, no impact): `curl http://localhost:5193/e2e/sequences-harness-chat.spec.ts`
  IS served as a Vite-transformed module, because `e2e/` sits inside this dev server's Vite root. It is a
  dev-server artifact, not a product surface, and the product pane code is untouched. (n5)
- `git ls-files | grep -i SequenceChat` → empty; `app/src/sequences/SequenceChat.tsx` is gone (promoted to
  `app/src/agent/ChatLog.tsx`). Criterion "no SequenceChat.tsx in tree" holds. (n7)
- sha256 of all three pinned specs recorded and verified identical before and after every run; the tree
  shows ZERO hunks under `app/e2e/`. (n8)

## Acceptance criteria (verbatim, spec `.hermes/plans/2026-10-14_0755-HARNESS-SEQ-1-harness-chat.md` §Acceptance criteria)

  /lab/sequences right pane is HarnessChatPane (no SequenceChat.tsx in tree); focus header follows
  tab/record changes without a model call; three-pane-harness.spec.ts passes UNMODIFIED; pane
  honest-empty without registered chat. Browser gate :5193; VERDICT: accept.

| criterion | result | receipt |
|---|---|---|
| /lab/sequences right pane is HarnessChatPane | PASS | trail.json steps 1-2; `shots/00-01-sequences-pane-open.png` (right pane is the "AI Chat" harness pane) |
| no SequenceChat.tsx in tree | PASS | spec-wall-trail.json n7 |
| focus header follows tab changes, no model call | PASS | trail.json steps 4-13: header `Sequences — Editor` → click Analysis → `Sequences — Analysis`; captured `/api/ai/assist/stream` resource count 0 before AND after the click; `shots/10-02-focus-follows-analysis-tab.png` |
| focus header follows record changes | PASS (stub-proven) | primary spec :100-101 clicks the stubbed pUC19 library button and asserts `Sequences — Editor · pUC19` (log `logs/primary-spec.log`). Live :5193 has no sequence records (see Data gap), so the live leg is a data gap, not a defect. |
| three-pane-harness.spec.ts passes UNMODIFIED | PASS | `logs/three-pane.log` — 5 passed; spec sha256 unchanged; zero hunks in `app/e2e/` |
| pane honest-empty without registered chat | PASS | `logs/vitest-agent.log` — `HarnessChatPane.test.tsx` "is honestly empty when no surface has registered a chat" / "does not send while honestly empty" / "drops the honest empty state the moment a chat registers"; 24/24 tests pass |

## Flows exercised

1. PRIMARY LEG — `e2e/sequences-harness-chat.spec.ts` (the fixed spec, UNMODIFIED, sha `ae89e50d…`) against :5193:
   **1 passed (2.4s), exit 0** (`logs/primary-spec.log`). The clarification round-trip leg passed:
   the stub emits `clarification:{prompt,options}` → `Which enzyme should cut this?` + `1. EcoRI` / `2. BamHI`
   render; clicking `1. EcoRI` runs `expect.poll` to the exact increment (before+1), a SECOND stream request
   fires carrying `Use EcoRI for sequence.` in its body, and `EcoRI it is.` lands in the log. The r1 defect
   (eager single count read ~20-37ms before the fetch) is closed; the fix is product-neutral (+10 comment/poll
   lines in the spec only — `git show 25758f0d --stat`).
2. REGRESSION WALL — `three-pane-harness.spec.ts`: **5 passed**, spec unmodified. `sequence-chat-scroll.spec.ts`:
   **6 standalone runs → 3 fail / 3 pass** (see Finding 1).
3. VISUAL EVIDENCE at /lab/sequences (extended receipt harness, `trail.json` steps 1-13): `harness-chat-pane`
   visible; `surface-focus-header` reads the Sequences focus and updates on the tab change; captured
   `/api/ai/assist/stream` count `0` before and `0` after; `consoleErrors: []`, `pageErrors: []`.

   Note on the two `status: fail` harness entries: (a) step 5 is my `assertText "Working focus"` — the DOM
   textContent is `Working focus` (the primary spec's `toContainText` passes on it) while the harness reads
   innerText, which is uppercased by CSS; the criterion's value assertion (step 6, `Sequences — Editor`) passed.
   NOT a defect — the run page's own pre-existing chip is uppercased identically (see the run-page screenshot),
   and SurfaceFocusHeader is spec'd to mirror ChatContextHeader's visual contract. (b) step 18 is the EXPECTED
   negative — `surface-focus-header` must be absent on the run page.
4. RUN-PAGE NON-REGRESSION — `/runs/RUN-2026-09-07-run-nzrs` (the id `three-pane-harness.spec.ts` itself uses).
   `chat-context-header` present, reading `No step focused — ask the AI to navigate`; `agent-chat-pane` present;
   `surface-focus-header` ABSENT (failed `assertVisible` + `shots/17-fail-assertVisible.png`).
   `shots/13-03-run-page-open.png` (mid-load) and `shots/18-04-run-page-chat-context-header.png` (loaded) both
   show the chip `No step focused — ask the AI to navigate`.
   - `/runs/EXR-LANE2-AI10` from the gate prompt 404s as a run (`/api/runs/EXR-LANE2-AI10` → 404) — it resolves
     only as a record (`/api/records/EXR-LANE2-AI10` → 200). Per the brief this is not a defect; the route is
     proven on a real run id above.
   - ChatContextHeader strings unchanged: `git diff 9c7bb5ab^ HEAD -- …/ChatContextHeader.tsx` adds ONLY an
     optional-delegation branch; the run page publishes no ChatFocusContext, so it renders the pre-existing
     `useProtocolSelection` path byte-for-byte — label `Working focus`, empty value
     `No step focused — ask the AI to navigate`, testid `chat-context-header`. Confirmed in the screenshot.
   - GATE BOUND respected: no live model clarification turn was attempted (stub-proven; HARNESS-SEQ-2 owns live emission).

## Findings

1. `e2e/sequence-chat-scroll.spec.ts` is INTERMITTENT on :5193 (my 6 standalone runs: fail, fail, pass, pass,
   pass, fail — every failure at `spec:95`). **Pre-existing, NOT a HARNESS-SEQ-1 regression.** Attribution:
   (i) the identical `Latest messages` pill assertion PASSED earlier in the same failing runs (`spec:80`, before
   `page.setViewportSize`) and fails only at `spec:95` afterwards — i.e. the scroll spine's
   resize-vs-user-scroll disambiguation branch, not a dead component; `shots/05-scroll-flap-run6-failure.png`
   shows the log snapped back to the bottom (tail `New text while reading history` lines) with no pill;
   (ii) `app/src/agent/ChatLog.tsx` is a git-mv of `app/src/sequences/SequenceChat.tsx` and its
   `followLatest` / `ResizeObserver` / `onScroll` body is byte-identical to `git 9c7bb5ab^:app/src/sequences/SequenceChat.tsx`
   (compared side by side);
   (iii) the spec is frozen (sha256 `788d3f57…`, unchanged).
   Independently documented as the known :5193 vite load-timing flap by the coder
   (`.hermes/plans/HARNESS-SEQ-1-report.wip-l2t0805.md:124` — "observed 3 failures across ~15 runs … on
   TRUNK-served code"; `reports/HARNESS-SEQ-1-report-fix1.l2t1040.md:59`) and flagged retry-at-gate by the
   orchestrator handoffs (`2026-10-14_0920`, `2026-10-14_1010`). Severity: informational / pre-existing flake.
   It is NOT among this gate's verbatim acceptance criteria, and the criterion's pinned spec
   (`three-pane-harness.spec.ts`) is green 5/5. Flagged for the orchestrator (retry-at-gate as already agreed);
   if a future gate wants this leg green deterministically, the resize-vs-scroll race in ChatLog is the place to fix.

## Data gap (not a defect, no fixture created)

Live :5193 `/api/sequences/catalog` returns 4 records, all `kind: analysis-run`; there are ZERO
`sequence`/`oligo-spec` records, so the Library nav is empty and the record-click focus leg
(`Sequences — … · <label>`) is unreachable on live data. That leg is proven by the passing primary spec on a
stubbed catalog (spec:100-101). The reviewer is read-only on product data and did not seed anything.

## Honesty notes

- Every claim above traces to a file in `logs/`, `trail.json`/`spec-wall-trail.json`, or a named PNG.
- The tier-1 failure mode is explicitly avoided: the primary spec's PASS is read from `logs/primary-spec.log`
  (`1 passed`, exit 0), not asserted from memory.
- No negative claim is unsupported: "zero stream requests" is a captured in-page count (trail step 12, plus the
  primary spec's independent fetch-spy assertion); "surface-focus-header absent on the run page" is a failed
  `assertVisible` plus `shots/17-fail-assertVisible.png`.
- I did not touch, edit or restart anything. The trunk tree was read-only for me; helper plan/trail files live
  only under this receipts directory.

VERDICT: accept
