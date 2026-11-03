# L2-CHATHOST-CONSOLIDATE-1 — sweep-leg report (l2t1310)

Leg: §6 LEG-C6-SWEEP-DEBT remainder (report + prose). Branch `cl/lane2-chathost-consolidate-1-l2t0410`,
worktree `/mnt/vast/home/brad/git/wt/CHATHOST-CONSOLIDATE-1-lane2-l2t0410`. Scope was exactly three
things: (1) the `chat-hosts.yaml` mount/note prose fix, (2) non-vacuity evidence for the §6 T-4 arms
run by this coder (both RED directions + GREEN, no orchestrator citation), (3) this report.
The previous sweep-leg run committed §6 items 1–3 (170d666d, 3f879d5f) and died on the output-token
cap before writing its report; nothing of this leg's scope was committed before this run except the
prose-fix target identified by the orchestrator.

Tree was confirmed CLEAN at start: `git -c core.fileMode=false status --porcelain` empty at HEAD
3f879d5fcd01dde5c8aa607fe54652087cf2d629.

---

## a. What this leg adds

**§6 item 1 — `run-journeys.py --chat-hosts`** (committed 170d666d; code path, named):
the flag is registered in `main()` at `run-journeys.py:1138`. `main` runs the sweep through
`_run_journeys_and_finish` (`:1001`), which calls `run_chat_host_sweep(args, run_dir)` at `:1026`
when `args.chat_hosts` is set. `run_chat_host_sweep` (`:945-998`) reads the inventory as DATA
(`load_chat_host_inventory`, `:87`), builds one shared probe journey per host
(`build_chat_host_probe`, `:143`, probe prompt `CHATHOST_SWEEP_PROMPT = "CHATHOST-SWEEP probe
round trip"` at `:84`), drives each host ONCE through the EXISTING browser executor
`run_journey` → `ui-drive.cjs` (`:747`), and returns the verdict table from `emit_chat_host_verdicts`
(`:171-196`, called at `:995`) over the receipts the run just wrote. No second runner, no
per-host prompt strings in Python.

**§6 item 2 — the ONE canned block** (committed 3f879d5f): `canned/completions.yaml:91-111`,
the single `CHATHOST-SWEEP` journey block keyed by `prompt_contains: "CHATHOST-SWEEP probe"`
(`:104`). One block serves all six inventory hosts because the driver asks every host the same
shared prompt and the fake keys on `prompt_contains` — no per-host completion, no per-host code.

**§6 item 3 — the four §8.2 T-4 selfcheck arms** (committed 3f879d5f):
`test-channel-selfcheck.py:1115-1188` —
(1) `:1134-1139` the DRIVER emitter over a FULL synthetic sweep → all six ids accept;
(2) `:1141-1152` the emitter's FULL table drives the REAL gate (`check-gate.py --chat-hosts`) GREEN, rc 0;
(3) `:1158-1173` the SAME emitter with FIVE hosts (one receipt deleted) → strict-subset table, the REAL gate
exits 1 naming the missing host;
(4) `:1180-1188` the probe prompt is matched by the ONE `CHATHOST-SWEEP` block (`prompt_contains` needle is a
substring of `CHATHOST_SWEEP_PROMPT`) — the prompt↔block tie, so the sweep cannot silently ride no canned
completion. Arms (3)+(4) are the non-vacuity pair: break the emitter (fabricated accepts) and (3) goes RED;
break the needle and (4) goes RED (both directions reproduced by this coder in §c below).

**The five predecessor commits, one line each** (read from `git show --stat` this run):

- `2e4755f1` — step 1: the DATA contract (YAML additive keys + `slices:` vocabulary + header rewrite),
  OBS-A FROZEN-prose removal + OBS-B(i) `first_blessed_ids` anchor-set in the shrink-guard
  (5 files, +257/−137).
- `68717017` — T-3 retarget headers only (5 test files, +5; behavior-neutral checkpoint).
- `9a4230d4` — steps 2–4 product: the ONE collector + slice store + ONE registrar + deck slice
  publisher, both per-host bridges deleted (−252/−147 lines), T-1/T-2 pins GREEN, five T-3 pins
  retargeted, the six call sites fixed (20 files, +1285/−507).
- `1e7f0090` — orchestrator preservation WIP: host-literal prose scrub + the
  `ProjectSurfaceChat` → `ProjectWorkspaceDoor` rename inside ProjectWorkspacePage.tsx
  (12 files, +63/−65).
- `cd68cdd8` — DOCUMENTATION-ONLY: preserves the predecessor's truncated report
  (`.hermes/plans/deliverables/L2-CHATHOST-CONSOLIDATE-1-report.l2t0410-predecessor.md`, 1 file,
  +393; NOT gated, NOT accepted, context not credit).

(Plus this leg's own two pre-commits: `170d666d` §6 item 1 [+213 in run-journeys.py only] and
`3f879d5f` §6 items 2–3 [+22 completions.yaml, +75 selfcheck; the orchestrator preservation commit
after the cap death — NOT gated, NOT accepted].)

**This run's prose fix** (item 1 below, commit `84f975d6`): `config/chat/chat-hosts.yaml`
`project-deck-tab` entry — the `mount:` line (~:106) and the `note:` prose (~:112) named the
RETIRED components `<ProjectSurfaceChat>` / `<DeckSurfaceChat>`. What the code actually ships, read
this run: the page-level door is `ProjectWorkspaceDoor` (ProjectWorkspacePage.tsx:105, rendered at
`:83`), which renders the ONE registrar `SurfaceChatBridge host="project-deck-tab"` (`:132`) and
renders nothing (the pane shows in RightPane's panelSlot). The deck branch (`:262-293`) mounts
`<DeckChatSlice/>` at `:287` — the deck SLICE PUBLISHER (writes the `deck` slice into the
app-level store); it does NOT mount a second chat door. Both prose sites now name exactly that.
Comment/prose only: no host entry added/removed/renamed/re-ordered, no `surface:` value touched —
the diff touches no `id:`/`surface:` line (verified: `git diff` line-filter for `id:`/`surface:`
returned nothing).

---

## b. The graded contract (§6) and how the emitter satisfies it

The grading side (`check-gate.py chat_host_axis`, unchanged by this leg) requires, on the run
`latest` points at: `chat_host_verdicts` a non-empty dict keyed by inventory host id (unique
`surface` alias only; the four-way `analysis` is NOT an alias); every value an OBJECT
`{"verdict": "accept"|"green", "receipts": "<file>"}` with the receipts file ACTUALLY EXISTING
against the run dir / absolute / receipts root; `app_base` trunk per the literal `TRUNK_PORTS` set;
shrink-guard clean. The binding driver-side obligations, with the code path (function + line) this
leg was required to name:

1. **Receipts written BEFORE the `chat_host_verdicts` append.**
   `run_chat_host_sweep` (`run-journeys.py:945`) runs every host through `run_journey` (`:747`),
   which writes each host's `<host>.json` receipt INTO the run dir (the normal path writes the
   request-body + screenshot receipt via the executor; the failure paths still write a receipt —
   `write_stub_receipt` at `:755/770/777/787` — so a failed host is an honest non-accept, never a
   missing artefact). Only THEN does `emit_chat_host_verdicts` (`:171`) build the table, and it is
   PURE over the on-disk receipts: a host whose receipt exists and grades `green` → `accept`; swept
   but red/transport-error → `red`; a host whose receipt was NEVER written → OMITTED (the
   strict-subset table the gate grades RED and names). The emitter cannot grant an accept the
   receipt does not back.

2. **The append rides the SAME run-meta write that records `app_base` from `args.app_base`.**
   In `_run_journeys_and_finish` (`:1001`): `chat_host_verdicts = run_chat_host_sweep(args, run_dir)`
   at `:1026` (BEFORE the run-meta dict is built); the dict carries `"app_base": args.app_base` at
   `:1046` — the very base the sweep was driven against; `run_meta["chat_host_verdicts"] =
   chat_host_verdicts` at `:1078` (absent, not `undefined`/null, when `--chat-hosts` was not
   requested, so a plain run's run-meta is byte-unchanged in shape); the ONE `json.dump` at
   `:1079-1080` writes the whole meta including both fields. The gate's `app_base_is_trunk` check
   therefore grades the SAME `app_base` the sweep used — a scratch base blocks the axis with a full
   accept table (fix1 D6/N1), and the driver never derives its own base.

3. **The `latest` flip happens AFTER.**
   `flips_latest` (`:1087`) only DECIDES eligibility at run-meta write time. The actual flip is
   `commit_latest_flip` (`:932`, atomic `os.replace` of the `latest` symlink), called at exactly
   ONE site, `:1248` — inside `main()`'s fake-mode `finally`, AFTER the A2 restore has run and
   GRADED OK (the restore is last; a failed restore folds the run to RED-RESTORE-FAILED via
   `downgrade_restore_failure` and never owns `latest`). So the run-meta carrying
   `chat_host_verdicts` is fully on disk before any flip, and a run that crashed never flips.

The synthetic T-4 arms in §a exercise this contract end-to-end on a temp fixture with the REAL gate
binary — they pin the shape, the receipt-existence rule, the strict-subset naming, and the
prompt↔block tie. What they do NOT pin is a live round trip; that is §d.

---

## c. VERIFY (all raw, run by this coder at this tree)

### c.1 selfcheck — full GREEN (run at clean tree, after the two RED probes and their restores)

```
$ python3 .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py
... (76 arm lines, all OK; 0 RED) ...
§6 T-4: the DRIVER emitter over a FULL synthetic sweep -> all six ids accept (non-vacuous) OK
§6 T-4: the emitter's FULL-inventory table drives the REAL gate GREEN (rc 0) OK
§6 T-4: the emitter with FIVE hosts (dropped 'run-workspace') -> the REAL gate exits 1 + names the host OK
§6 T-4: the probe prompt is matched by the ONE CHATHOST-SWEEP canned block (non-vacuous) OK

SELFCHECK: PASS
```
exit=0; arm count = 76 lines ending `OK`, 0 lines ending `RED` (grep -c over the transcript;
full transcript kept at /tmp/selfcheck-green-l2t1310.txt, outside git).

### c.2 RED direction 1 — emitter fabricates an accept for every host

Broke `emit_chat_host_verdicts` (`run-journeys.py:185-196`) in place so it emits
`{"verdict": "accept"}` for EVERY host id regardless of receipt existence, ran the selfcheck, then
`git checkout -- .hermes/plans/harness/l2-trunk-journeys/run-journeys.py`. Raw (the failing arm +
verdict; all other 75 arms OK):

```
§6 T-4: the emitter with FIVE hosts (dropped 'run-workspace') -> the REAL gate exits 1 + names the host RED
      note: missing=[] rc=1 out=BLOCKER: chat-host run-workspace verdict references receipt 'run-workspace.json' that does not exist (fix1 D7: a verdict without a request-body receipt artefact
SELFCHECK: FAIL
```
The fabricated table lost the omission, so `missing5 != [dropped]` and the receipts file the
fabricated accept points at does not exist — the arm fails exactly as designed. (The other two
T-4 arms stayed OK, which is correct: a fabricating emitter still passes the FULL-sweep arm and
the prompt-tie arm — the five-host arm is the one that catches fabrication.)

### c.3 RED direction 2 — canned block's `prompt_contains` no longer matches the probe prompt

Restored run-journeys.py (clean), then broke ONLY the needle in
`canned/completions.yaml:104` to `"TEMPORARY-NEEDLE-BREAK-DOES-NOT-MATCH"`, ran the selfcheck, then
`git checkout -- .hermes/plans/harness/l2-trunk-journeys/canned/completions.yaml`. Raw:

```
§6 T-4: the DRIVER emitter over a FULL synthetic sweep -> all six ids accept (non-vacuous) OK
§6 T-4: the emitter's FULL-inventory table drives the REAL gate GREEN (rc 0) OK
§6 T-4: the emitter with FIVE hosts (dropped 'run-workspace') -> the REAL gate exits 1 + names the host OK
§6 T-4: the probe prompt is matched by the ONE CHATHOST-SWEEP canned block (non-vacuous) RED
      note: block_present=True needle='TEMPORARY-NEEDLE-BREAK-DOES-NOT-MATCH'
SELFCHECK: FAIL
```

After both restores: `git -c core.fileMode=false status --porcelain` → EMPTY (clean tree before
the c.1 GREEN run and before this report's commit).

### c.4 chat-hosts-shrink-guard — sha-neutrality of the prose fix (BEFORE and AFTER, raw)

BEFORE the edit (clean tree at 3f879d5f):

```
$ python3 .hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py
SHRINK-GUARD green (current sha=dcf326497e83976112405fde5396113659301cf715032591fd103af33875156b; no blessed host dropped)
rc=0
```

AFTER the edit (post-84f975d6 tree):

```
$ python3 .hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py
SHRINK-GUARD green (current sha=dcf326497e83976112405fde5396113659301cf715032591fd103af33875156b; no blessed host dropped)
rc=0
```

SAME sha `dcf326497e83976112405fde5396113659301cf715032591fd103af33875156b`, rc=0 both times — the
guard hashes ids only, so the prose fix is sha-neutral as the spec's P-2 proved. The diff itself
touched no `id:`/`surface:` line (line-filter returned 0 matches).

### c.5 `run-journeys.py --help` — the flag (raw)

```
$ python3 .hermes/plans/harness/l2-trunk-journeys/run-journeys.py --help
usage: run-journeys.py [-h] [--all] [--journey JOURNEY] [--app-base APP_BASE]
                       [--api-base API_BASE] [--json] [--fake] [--advisory]
                       [--chat-hosts]

options:
  -h, --help           show this help message and exit
  --all
  --journey JOURNEY    run one journey id (repeatable); implies selection mode
  --app-base APP_BASE
  --api-base API_BASE
  --json               machine-readable summary line last
  --fake               run the journeys against the deterministic model-layer fake (points the backend's inference config at it, restores + asserts the live URL afterwards)
  --advisory           record the verdict but NEVER flips `latest` (advisory live-sampler runs — J2-live shape)
  --chat-hosts         sweep the chat-host inventory (one receipt per host, appended to run-meta as chat_host_verdicts before the `latest` flip)
```

### c.6 app typecheck — unchanged vs the 11-error predecessor baseline

Worktree has its own `app/node_modules` (present), so the plain command sufficed (no trunk-binary
fallback needed):

```
$ cd app && npx tsc --noEmit        # worktree /mnt/vast/home/brad/git/wt/CHATHOST-CONSOLIDATE-1-lane2-l2t0410/app
```

→ exactly **11** `error TS` lines (raw, one per line):

```
src/editor/taptab/tabNavPlugin.ts: …error TS…
src/event-editor/deck/LawnSurface.moveAcross.test.tsx(47,5): error TS2353 …runDeckLock…
src/event-editor/deck/PreviewActionBar.test.tsx(108,5): error TS2353 …runDeckLock…
src/event-editor/editorHistory.test.ts(176,34): error TS2345 …load_event_graph_success…
src/event-editor/editorHistory.test.ts(199,37): error TS2345 …load_event_graph_success…
src/event-editor/EventEditorContext.tsx(1525,29): error TS2339 …equipments…
src/event-editor/focus/LabwareFocus.instrument.test.tsx(47,5): error TS2353 …runDeckLock…
src/event-editor/viewer/ViewerToolbar.tsx(55,13): error TS2322 …protocol-review…
src/event-editor/viewer/Viewer.tsx(65,13): error TS2322 …protocol-review…
src/ingestion/components/IngestionUploadModal.tsx(232,23): error TS2554 …2 args…
src/ingestion/protocol-review/ExtractionProgressPanel.test.tsx(9,19): error TS6133 …fireEvent…
```
(full un-elided transcript at /tmp/app-tsc-l2t1310.txt, outside git)

Count 11 = the predecessor's measured baseline (orchestrator measured 11 at 1e7f0090; the spec's
§7 pin 37 measured 10 at the older tip `ff53e5a8` — the +1 is `src/editor/taptab/tabNavPlugin.ts`,
a file this branch did not create or touch; it is part of the current baseline). **Zero of the 11
are in branch-changed files**: the set of files with tsc errors was intersected with
`git diff --name-only 519fcc47..HEAD` (28 files; merge-base `519fcc47` = the lane trunk tip at
claim) after normalizing the `app/src/…` → `src/…` prefix — overlap = 0 lines (empty intersection).

---

## d. HONEST LIMITS

- **The LIVE six-host sweep has NOT been run by this leg, and is not run by this report.** It is
  the ORCHESTRATOR's post-merge job: the §6 acceptance command
  (`run-journeys.py --all --fake --chat-hosts` + both `check-gate.py` axes, live stack on
  :5193/:3093 in the integration checkout). Nothing here is a live round-trip receipt.
- **No UI claim.** No browser was driven by this leg; no pane was observed rendering. The
  selfcheck T-4 arms are SYNTHETIC (temp-dir run fixture + the real `check-gate.py` binary): they
  prove the emitter's table shape, the receipt-existence grading, the strict-subset naming, and
  the prompt↔canned-block tie — nothing about live app behaviour.
- The §6 items 1–3 mechanism (170d666d, 3f879d5f) was NOT re-authored by this leg and is NOT
  gated or accepted by this report; the orchestrator measured PASS + both REDs on this exact tree
  at the cap death — this leg re-ran and reproduced all of it (c.1–c.3) rather than citing.
- The `mount:`/`note:` fields are not read by the product (the app's build-time parse consumes
  `id`, `surface`, `required_providers`, `optional_providers`, `ghost_mount` and the `slices:`
  block), so the prose fix is also build-neutral beyond the sha-neutrality in c.4.
- No product defect was found by this leg. One non-blocking observation, for the reviewer: the
  `DeckChatSlice.tsx` header comment carries a slightly garbled sentence ("…the retired deck
  bridge + the retired run bridge), whose useSurfaceChat call is now the registrar's single
  call") — prose only, behavior-neutral, left as-is (product code is out of this leg's scope).
- The YAML prose fields are consumed by humans and by this inventory's own header contract, so
  the fix matters for the next reader — but it changes no machine behaviour.

---

Changed by this leg (this report's two commits):
- `config/chat/chat-hosts.yaml` (prose only; commit 84f975d6)
- `.hermes/plans/deliverables/L2-CHATHOST-CONSOLIDATE-1-report.sweep-leg-l2t1310.md` (this file)

Next actions / owner: orchestrator — post-merge live acceptance per §6 (both gates on the same
run dir, exit 0), then adversarial/browser review of the consolidated branch. No blockers from
this leg; nothing here gates the merge on its own.

Convention note (precedent: lane-1 L1-PIN-HARDEN-1 fix3, commits 81d8e565 → a74eea7f): the report
is committed first (C1); the DONE line below is stamped in a follow-up append commit with C1's
full sha — C1 being the commit that first contains this report.

CHATHOST-SWEEPLEG DONE <C1-sha-pending-stamp>
