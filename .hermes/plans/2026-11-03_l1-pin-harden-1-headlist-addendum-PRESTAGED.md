# L1-PIN-HARDEN-1 — PRE-STAGED addendum for the head-list cycle (option A)

STATUS: **PRE-STAGED, NOT AUTHORIZED.** Nothing here executes until Brad answers the freeze card
(`.hermes/plans/2026-11-03_l1-pin-harden-1-freeze-brad-card.md`) with **A**. The architect's DECISION A
(`.hermes/plans/2026-11-03_l1-pin-harden-1-cycle2-cap-decision.md`) permits exactly ONE final fix cycle and
forbids a fourth cycle without Brad's word; pre-staging the artefacts does not start a cycle and no coder
may be dispatched from this document.

Author: lane-1 orchestrator, 2026-11-03 (275th tick). Amends §2 (contract) and §4 (RED-first) of
`.hermes/plans/2026-11-03_l1-pin-harden-1-nesting-aware-scan-spec.md`, and nothing else. It is derived
first-hand from the targeted re-probe's §7 fix direction
(`~/.hermes/cl/lanes/1/reviews/L1-PIN-HARDEN-1-reprobe-fix2-l1t0500.md`) and my own reproduction on the tip.

## Base

Branch `cl/lane1-pin-harden-1-l1t0020` @ `6ea3ec29` (fix-2 tip; functional commit `68384616`), tree CLEAN,
worktree `/mnt/vast/home/brad/git/wt/l1-pin-harden-1-lane1`. Verified this tick: tip clean, `1a443259` is
an ancestor of trunk `e05f57b0`, and the trunk changed NO file under `app/src/analysis`, `schema/ui` or
`server/src/ui` since `1a443259` — so no merge/rebase is needed before the cycle starts. `merge-tree HEAD x
branch` is conflict-free (tree `2be279dd`), which is also what makes option B shippable in one command.

## The one contract clause that changed

Old (implicit, wrong): *a nested head is prefixed to the parent as a whole string*. New, binding:

> **A nested rule's emitted selector set is the CARTESIAN PRODUCT of the parent's selector parts and the
> nested head's selector parts.** Each emitted selector is exactly one `parentPart " " headPart` pair, so
> every emitted part retains its full ancestor chain. Where the head contains `&`, the `&` is substituted by
> one parent part at a time under the same product rule; where placement is ambiguous, fail closed (widen the
> emitted set, never narrow it). Resolution may WIDEN the set of emitted selectors; it may never DROP a
> chain-carrying part.

Consequence for the pin: `sourceViolations` is a per-emitted-PART predicate. A joined-string
`.toContain(...)` over a comma list is no longer admissible evidence, because it cannot distinguish "some
part carries the table scope" from "each part carries its own scope".

## Required fixtures (all RED before the fix; each currently returns [])

| # | fixture (nested inside a `.view-spec__table` scope unless stated) | must flag |
|---|---|---|
| F1 | `.wrap, td { overflow-wrap: anywhere; }` | yes |
| F2 | `.wrap, th { overflow-wrap: anywhere; }` | yes |
| F3 | `.a, .b, td { overflow-wrap: anywhere; }` | yes |
| F4 | outer head list: `.other, .view-spec__table { .wrap, td { … } }` | yes |
| F5 | deep: `.view-spec__table { .wrap { .x, td { … } } }` | yes |
| F6 | ambiguous `&`: `.view-spec__table { :is(&) .x, td { … } }` | yes |

Controls that must not change: `.view-spec__table { td, .wrap { … } }` keeps flagging (first head part is
the cell token); the 11 mandated fixtures from the spec keep flagging; non-cell nested rules
(`.analyses { .wrap, .x { … } }`) keep returning `[]`; the shipped `AnalysisPage.css` blob stays
`c6930c66…` and still returns `[]`.

## Acceptance (the targeted re-probe after the cycle, not a fresh full review)

1. All six fixtures above flag, through the pin's OWN `sourceViolations`, with the emitted selector printed
   so the parent chain is visible per part.
2. Per-part invariant test: for every emitted part that targets a table cell, the part itself carries the
   table scope. Proven by a test that fails if the composition drops a parent chain (RED first).
3. Controls and no-false-positive set unchanged; shipped CSS `[]`.
4. `it()` and `expect()` counts strictly greater than at `6ea3ec29` (a cycle may add, never weaken).
5. `npx vitest run src/analysis/` green in the worktree; `tsc` no NEW errors vs the per-worktree baseline
   (12 lines, 0 in `src/analysis`); `diff --stat 6ea3ec29..HEAD` confined to the three permitted app files
   + `deliverables/`; `AnalysisPage.css` blob unchanged.
6. The false docstring claim is gone everywhere (grep for the "can only make MORE text visible" sentence
   returns nothing) and the corrected sentence states the composition rule.

## Environment fact (found + repaired this tick, applies to any future cycle here)

`app/node_modules` in the worktree is EMPTY (only a `.vite` cache, no `.bin/vitest`) — yet the fix-2 run's
transcript shows vitest v1.6.1 running with `cwd` = that `app/`. Sanctioned invocation, measured
first-hand at tip `6ea3ec29`: use the TRUNK checkout's installed binaries with the worktree as cwd
(`/mnt/vast/home/brad/git/cl-integration-1/app/node_modules/.bin/{vitest,tsc}`), which gives
**25 files / 372 tests passed** and **12 `error TS` lines / 0 in `src/analysis`**. Do NOT `npm ci` here
(pre-existing lockfile drift) and do NOT symlink `app/node_modules` — `.gitignore`'s `node_modules/`
pattern does not match a symlink, so the symlink shows as untracked and would fail the launcher's
WT-TIP/clean gate (verified: `?? app/node_modules`, then restored to dirty=0).

## Pre-staged artefacts (present, never executed — and gated so they CANNOT execute unasked)

- Prompt: `~/.hermes/cl/lanes/1/prompts/coder-L1-PIN-HARDEN-1-fix3-l1t0700.txt`
  (drafted by `cl-spec-composer`, reviewed and promoted by the orchestrator).
- Launcher: `~/.hermes/cl/lanes/1/launchers/launch-L1-PIN-HARDEN-1-fix3-l1t0700.sh` — fix-2's launcher plus
  a WT-TIP gate (`EXPECT_TIP=6ea3ec29`, tree must be clean) ahead of the slot grab. Verified: `bash -n`
  clean; a sandbox copy exits **7 SERIAL-BLOCKED** against the live fleet (lane 2's `CHATHOST-CONSOLIDATE-1`
  pid 439409 holds slot-1 at 06:42), which is the correct refusal under the one-decode-slot rule.
- Re-probe prompt: `~/.hermes/cl/lanes/1/prompts/reprobe-L1-PIN-HARDEN-1-fix3-l1t0700.txt` (the §Acceptance
  list above as an ordered checklist, plus a self-attack set and the environment commands).
- Re-probe launcher: `~/.hermes/cl/lanes/1/launchers/reprobe-L1-PIN-HARDEN-1-fix3-l1t0700.sh` — `bash -n`
  clean, refuses while a live L1-PIN-HARDEN-1 coder holds a slot.
- **Both launchers carry an AUTHORIZATION GATE**: they exit **8 NOT-AUTHORIZED** unless
  `~/.hermes/cl/lanes/1/L1-PIN-HARDEN-1-fix3-AUTHORIZED` exists with a first line beginning `A`. Verified
  live at 06:45:39 (coder launcher rc=8) and 06:45:59 (re-probe rc=8) with the item FROZEN. So the
  pre-staged kit cannot start a cycle by accident or by a stale retry: the orchestrator must first read a
  real answer on the card and then write that marker.

## What option B would need instead (one command, already verified conflict-free)

`git -c core.fileMode=false merge --no-ff cl/lane1-pin-harden-1-l1t0020` (tip `6ea3ec29`, run from the
`cl/integration-1` worktree at `e05f57b0`). Then: record the head-list family as a
documented escape in the module docstring + a carried evidence-debt entry in the lane list, and file a
follow-up campaign item. Blast radius of the merge: the 3 app files + `deliverables/` only (23 paths,
+2753/−60 vs base `1a443259`), no shipped CSS, no schema, no server.
