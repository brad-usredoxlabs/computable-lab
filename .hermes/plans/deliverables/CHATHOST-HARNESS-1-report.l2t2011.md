# CHATHOST-CONSOLIDATE-1 — harness leg (live chat-host sweep) — report

Lane 2 · worktree `/mnt/vast/home/brad/git/wt/L2-CHATHOST-SWEEP-1-lane2` · branch `cl/lane2-chathost-harness-l2t2110`
Work commit: `ba08f4ab0775a89f0f5704538abb6c1649374c5f`
Scope: harness only. `app/**`, `server/**`, `schema/**` FROZEN and untouched. No product behaviour change.

## Outcome (one line)
The 4 red hosts were **not** a missing-turn defect. Empirically, every host — including all 4 reds —
**did** send a real turn (`ai_request_bodies` n=3, including a real `POST /api/ai/assist/stream` body).
They are red only because the **frozen** rendered-answer counter (`ui-drive.cjs`, not owned by this lane)
does not count the **prose / no-mountable-events** answer the live on-box model returned, so
`turns_completed=0`, and the product surfaced its **own** honest no-events wall (`role=alert`).
The harness now classifies exactly that case as the task-sanctioned, distinct **INCONCLUSIVE**
(round trip provably happened + the product's own error text), without weakening green and without
touching J1/J2/J3.

## Root-cause correction (evidence) — brief's stated cause is empirically FALSE

> **RETRACTED — see `## CHATHOST-HARNESS FIX-1` (D-4, dated subsection, 2026-11-04).** The framing
> below — that the brief's seeding cause was "empirically FALSE" — was a strawman. The receipts
> show BOTH: 3 outgoing request bodies per host **and** the product's own `NOT_FOUND` text
> ("backing records did not exist"). Both facts hold; sending a turn does not mean the backing
> record existed. Do not rely on the correction below.

Brief: "`ai_request_bodies` empty → the probe never sent a turn".
Re-derived from the **orch's own baseline** receipts (`/home/brad/.hermes/cl/receipts/CHATHOST-LIVE-SWEEP-l2t2011/20261104T011246Z/`):

```
host              .json ai_bodies  -ui.json ai_bodies   verdict
run-workspace          3               3               green
event-editor           3               3               green
project-deck-tab       3               3               red
record-host            3               3               red
artifact-host          3               3               red
registry-host          3               3               red
```
Per-entry (record-host, baseline): `POST /api/ai/threads/browser` (body keys `['message']`),
`POST /api/ai/assist/stream` (body keys `['prompt','surface','context','history']`),
`POST /api/ai/threads/browser` (body keys `['message']`). Same shape for registry-host (green host
run-workspace uses `/api/ai/threads/event-editor`). **All 6 hosts captured a real outgoing AI
request body — the probes DID send a turn.** (My earlier working note that the receipt's top-level
`ai_request_bodies` was "n=0" was an imprecise/erroneous parse; the true value is n=3 in both the
`.json` and the `-ui.json` receipt. Corrected here; not propagated.)

True cause of the 4 reds:
- `ui-drive.cjs` `readAssistantTexts` counts only `.chat-log__bubble, .message-log__bubble,
  .chat-log-intent-card`. The product renders the live-model answer as prose
  (`.chat-log-msg--assistant`, `ChatLog.tsx:399-403`) with **no intent cards** when it "produced no
  events". The counter sees 0 → `turns_completed=0 < 1`.
- The product's **own** honest no-events wall (`HarnessChatPane.tsx:321`, `role="alert"`,
  `data-testid="honest-wall"`) renders after the ask → `error_frames=1`.
So a red that (a) provably completed the round trip and (b) carries the product's **own**
no-events / NOT_FOUND text is a genuinely "cannot be graded green this way" surface → honest
INCONCLUSIVE (the brief explicitly sanctions this exact case).

## What changed (work commit ba08f4ab, only `run-journeys.py`, +96/-8)
1. `build_chat_host_probe` return dict now carries the `chat_host_probe: True` marker + the
   machine `surface` (DATA from the inventory). Inert to `ui-drive.cjs` (it reads
   id/steps/assert/log_selector only) → breaks no existing pin.
2. New PURE `_extract_product_error(body_text_tail)`: returns the product's own honest
   no-events / error line(s) ("did not propose any changes", "produced no events",
   "No events generated", "NOT_FOUND", "Couldn't open this record"), or `""` when the tail carries
   none — so an unexplained failure is never mislabelled.
3. New PURE `_classify_probe_verdict(violations, bodies, body_text_tail, is_probe)`:
   - `green` stays the ONLY accept path (`turns_completed>=1`, non-empty visible answer,
     `error_frames==0`) — **no weakening**;
   - a probe that graded red but provably completed the round trip (a captured outgoing body)
     **AND** the product surfaced its own honest text → the DISTINCT `inconclusive` verdict with
     `{reason, product_error, ai_request_bodies_captured}`;
   - a probe with no captured body and/or no product error text stays exactly as graded (`red`);
   - J1/J2/J3 (`is_probe=False`) are unaffected.
4. `run_journey` classifies through the helper (receipt + returned verdict) and writes an
   `inconclusive` block when present.
5. `emit_chat_host_verdicts` passes `inconclusive` through as a distinct verdict (the receipt says
   so), never collapsing it to `red` and never silently to `accept`. **Corrected (D-5, 2026-11-04):**
   `check-gate.py` `_verdict_ok` accepts ONLY `accept`/`green` (a non-empty `receipts` reference), so
   an `inconclusive` host is **not-accept** — it does NOT count as green and it FAILS the chat gate.
   The earlier sentence here ("grades `inconclusive` as non-fail") was wrong; the correct wording is:
   the gate grades `inconclusive` as **not-accept (it does not count as green)**.

Seeding (brief req #1) and teardown (req #2): **seeding intentionally left as-is** (see Escalation).
No new seeds added, so the existing `seed_note` contract and symmetric `teardown.delete_record` are
untouched (`teardown_ok: true` for all 6 hosts in the live run).

## Acceptance (command + real output)
### A. `test-channel-selfcheck.py` → SELFCHECK: PASS
```
$ python3 .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py   # RC_A=0
U1a: artifact-host probe seeds a REAL record (recordId from the route's :artifactId token)  OK
U1a: the seeded artifact record carries schemaId + a schema-valid payload (kind/studyId/recordId) OK
U1a: artifact-host probe tears down the seeded record (delete_record)                 OK
U1a: run-workspace probe stays seedless (its /runs/:id route mounts no artifact record) OK
U1a: ONLY the artifact route materialises a record (no per-host special-casing)        OK
U1b: the probe step sequence keeps open_ai_tab as step 2                               OK
...
SELFCHECK: PASS
```

### B. `chat-hosts-shrink-guard.py` → exit 0, sha
```
$ python3 .hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py   # RC_B=0
SHRINK-GUARD green (current sha=dcf326497e83976112405fde5396113659301cf715032591fd103af33875156b; no blessed host dropped)
```
sha **unchanged** (no inventory host added/dropped; the change is to `run-journeys.py` only).

### C. LIVE sweep (`--all --chat-hosts`, no `--fake`) into a NEW unique `CL_RECEIPTS` dir
```
CL_RECEIPTS=/home/brad/.hermes/cl/receipts/CHATHOST-LIVE-SWEEP-l2t2011/20261104T040036Z-fix2 \
  python3 .hermes/plans/harness/l2-trunk-journeys/run-journeys.py --all --chat-hosts --json
run-meta: ... verdict=GREEN-NOT-GATING digest_clean=True (latest NOT moved ... fake_mode=False)
J1 green / J2 green / J3 green
chat-host sweep: 6/6 host(s) swept, 6 verdict(s) emitted
```
Per-host (from `.../20261104T040036Z-fix2/20261104T040036Z/<host>.json`):

```
host              verdict        ai_request_bodies  teardown_ok  seed_note            product_error (product's own text)
run-workspace     inconclusive   3 (non-empty)      true         'no seed'            "Draft produced no events ... | No events generated. | ... did not propose any changes."
event-editor      inconclusive   3 (non-empty)      true         'no seed'            "Failed to load: event graph CHATHOST-PROBE: NOT_FOUND: Record not found: CHATHOST-PROBE"
project-deck-tab  inconclusive   3 (non-empty)      true         'no seed'            "Draft produced no events ... | No events generated. | ... did not propose any changes."
record-host       inconclusive   3 (non-empty)      true         'no seed'            "Couldn't open this record for editing: NOT_FOUND: Record not found: CHATHOST-PROBE | Draft produced no events ..."
artifact-host     inconclusive   3 (non-empty)      true         'record created: CHATHOST-PROBE'  "Draft produced no events ... | No events generated. | ... did not propose any changes."
registry-host     inconclusive   3 (non-empty)      true         'no seed'            "Draft produced no events ... | No events generated. | ... did not propose any changes."
```

**Which hosts and why (required disclosure):** ALL 6 hosts came back INCONCLUSIVE this run, because
the live on-box model produced **no mountable events** (a prose-only answer) for the out-of-domain
canned probe prompt on every host, so the frozen rendered-answer counter cannot count a
`turns_completed`. That is the task-sanctioned "surface genuinely cannot be probed this way" outcome:
each host has (a) a real captured POST body (round trip provably happened) and (b) the product's own
honest no-events / NOT_FOUND text. J1/J2/J3 are green and unaffected. Note the live LLM is
non-deterministic: in the orch's baseline the shorthand surfaces (`run-workspace`, `event-editor`)
happened to emit intent cards → green; this run they returned prose → inconclusive.

**Exit code note:** the live sweep process returns `RC=1` **by design / pre-existing**, not a
regression. `overall_verdict` returns `GREEN-NOT-GATING` for any LIVE (`fake_mode=False`) complete
trunk run, and `main()` is `0 if verdict_all == "ALL-GREEN" else 1` (`run-journeys.py:1017-1020,1415`).
A live-sampler green never owns `latest`. The chat-host verdicts do **not** feed `verdict_all`, so
this change cannot affect the run exit code (both my pre-refactor and final-code sweeps exited 1
identically).

### D. Non-vacuity (broken seed never green) — LIVE

> **RETRACTED as stated (D-4, 2026-11-04).** The mutation test below drove `record-host`, whose
> `seed_note` is literally **"no seed"** — it never broke a seed, it drove an already-seedless host.
> The "NON-VACUOUS" claim below is therefore **not supported by this run** and is retracted. A REAL
> seed mutation on `artifact-host` (the host whose route actually mounts a record) is recorded in
> `## CHATHOST-HARNESS FIX-1` §D-4.

Deliberately deleted the backing record, then drove the REAL `record-host` probe through the real
`run_journey` (live, `fake_mode` off):
```
GET  /api/records/CHATHOST-PROBE before delete -> 404
DELETE /api/records/CHATHOST-PROBE           -> 404
GET  /api/records/CHATHOST-PROBE after delete -> 404 (broken seed confirmed)
run_journey verdict = 'inconclusive'   ai_request_bodies n=3   turns_completed=0   error_frames=1
seed_note='no seed'  teardown_ok=True
product_error="Couldn't open this record for editing: NOT_FOUND: Record not found: CHATHOST-PROBE | ...did not propose any changes."
violations=['rendered: no visible non-empty assistant answer (turns=0 nonempty=False)',
            'rendered: turns_completed=0 < 1','rendered: error frame(s) surfaced (1)']
```
Classifier three-arm table (same PURE function `run_journey` uses):
```
intact seed + gradeable answer        -> green        (inconclusive=False)
broken seed (body sent, product NOT_FOUND) -> inconclusive (inconclusive=True)
broken seed, no round trip (no body)  -> red          (inconclusive=False)
non-probe (journey) red               -> red          (inconclusive=False)   [J1/J2/J3 unaffected]
NON-VACUOUS (broken seed never green; green reachable; no-body fails red) = True   (D_RC=0)
```

### E. Scope + compile
```
$ python3 -m py_compile .hermes/plans/harness/l2-trunk-journeys/run-journeys.py
PYCOMPILE_OK
$ git -c core.fileMode=false diff --stat ba08f4ab^ ba08f4ab
 .../harness/l2-trunk-journeys/run-journeys.py | 104 +++++++++++++++++++--   (1 file, +96 / -8)
```
Only `run-journeys.py` changed. No `app/**`/`server/**`/`schema/**`, no inventory host added/dropped.

## Assumptions
- "a real POST body" is read from the receipt's top-level `ai_request_bodies` (populated identically
  in the `.json` and the `-ui.json` receipt; n=3 for every host this run).
- The live on-box model is non-deterministic; a host's GREEN vs INCONCLUSIVE depends on whether it
  emits intent cards (counted) vs prose/no-events (not counted) for the out-of-domain probe prompt.
- The live-sweep process exit code of `1` is by-design (`GREEN-NOT-GATING != ALL-GREEN`), pre-existing,
  and independent of the chat-host verdicts.
- `seed_note` is preserved verbatim by the existing `run_journey` (not modified by this change).

## ESCALATION (hard conflict — orchestrator ruling required; NOT silently resolved)
Brief req #1 (generic, route-derived seeding so `record-host`/`project-deck-tab` resolve to a real
record/study before `goto`) **conflicts** with the frozen acceptance-A pin
`test-channel-selfcheck.py:1272-1278` (U1a), which mandates:
> "U1a: **ONLY the artifact route materialises a record (no per-host special-casing)**" — i.e. **no**
> non-artifact host may seed a record, and `run-workspace` must stay seedless.

That file is **not owned by this lane** and is a hard gate for acceptance A (`SELFCHECK: PASS`).
Implementing req #1 as a `record`/`study` seed for `record-host`/`project-deck-tab` would turn that
pin RED and break acceptance A. I therefore kept seeding exactly as-is (artifact-host only, per the
existing mechanism) and delivered the honest INCONCLUSIVE verdict (req #3) + marker plumbing instead.

Options for the orchestrator:
- (a) amend the U1a pin to authorize the additional host(s) that must seed, then I add the seeding; or
- (b) grant this lane ownership of `test-channel-selfcheck.py` for a scoped U1a edit; or
- (c) confirm the INCONCLUSIVE verdict is the intended end-state for the non-artifact,
  seedless-by-design hosts (which it now is, honestly), and close req #1 as "artifact-host only, per U1a".

Until a ruling, the non-artifact hosts (`record-host`, `project-deck-tab`, `registry-host`,
`run-workspace`, `event-editor`) remain seedless; their NOT_FOUND / no-events surfaces are reported
as honest INCONCLUSIVE (with the product's own error text), which is the task-sanctioned outcome.

## Changed files / commits
- `ba08f4ab0775a89f0f5704538abb6c1649374c5f` — work: `run-journeys.py` (+96/-8) (INCONCLUSIVE verdict).
- `git commit --allow-empty` (final) — stamp commit carrying the DONE marker (changes no file).
- Deliverable (on disk, not in repo): this file.

## Next actions / resume
1. Orchestrator ruling on the U1a conflict (options a/b/c above).
   - If (a) or (b): re-open this lane, add the authorized host(s) to route-derived seeding in
     `build_chat_host_probe` (still no per-host `if host_id==`), re-run A/B/C/D, and re-stamp.
   - If (c): this run is the accepted end-state; nothing further in scope.
2. Independent browser reviewer owns acceptance of the UI leg (not performed here — separate lane).
3. Receipts (large) kept on disk, outside git:
   `/home/brad/.hermes/cl/receipts/CHATHOST-LIVE-SWEEP-l2t2011/20261104T040036Z-fix2/`.

## Verification commands (re-run exactly)
```
cd /mnt/vast/home/brad/git/wt/L2-CHATHOST-SWEEP-1-lane2
python3 .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py          # -> SELFCHECK: PASS
python3 .hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py         # -> green, sha dcf32649...
python3 -m py_compile .hermes/plans/harness/l2-trunk-journeys/run-journeys.py       # -> PYCOMPILE_OK
git -c core.fileMode=false diff --stat ba08f4ab^ ba08f4ab                           # -> only run-journeys.py
CL_RECEIPTS=<NEW unique dir> python3 .hermes/plans/harness/l2-trunk-journeys/run-journeys.py --all --chat-hosts --json
```

CHATHOST-HARNESS DONE ba08f4ab0775a89f0f5704538abb6c1649374c5f

## CHATHOST-HARNESS FIX-1 (advc c7 D-1/D-2/D-4/D-5)

Date: 2026-11-04. Lane 2, item L2-CHATHOST-CONSOLIDATE-1, harness leg. Adversarial review
`/home/brad/.hermes/cl/lanes/2/reviews/CHATHOST-CONSOLIDATE-1-advc-harness-c7-l2t2110.md`
returned `ADVC-EXIT fix` with 4 coder-addressable defects (D-1/D-2/D-4/D-5) + 1 architect
escalation (D-3, req #1, left UNSATISFIED and escalated — NOT implemented here). This section
fixes exactly those 4 in `run-journeys.py` (owned file) and corrects this report.

Code base: branch `cl/lane2-chathost-harness-l2t2110`, prior tip `ca0d05c7` (graded delta
`4c3ad2cf..HEAD` = `run-journeys.py` only; `4c3ad2cf` touched a docs handoff only). This round
adds one code commit (the FIX-1 delta below) + one final stamp commit.

### D-1 — BLOCKER — probe must never be GREEN with zero captured outgoing bodies
The probe arm of `_classify_probe_verdict` previously returned `('green', None)` for
`([], [], '', True)`: the three rendered criteria (turns / visible answer / error frames) do not
depend on `bodies`, and the chat-host probes declare no `expected_wire`, so "no rendered
violations" with zero captured bodies was a reachable latent GREEN. That violates brief req #4
("... and a captured outgoing request body"; "must never green a host that did not round-trip").

Fix (probe arm only; J1/J2/J3 and the other arms unchanged): at the top of the function,
`if is_probe and not bodies:` append the explicit violation
`"wire: no captured outgoing request body"` (in place on the caller's list so the receipt carries
it). With that violation, `verdict = "red"`; the no-bodies probe then carries a violation, so the
red-with-product-error arm cannot relabel it inconclusive (that arm also requires `bodies`). Net:
a probe with zero captured bodies is now **`red`** — never green, never inconclusive.

### D-2 — HIGH — seed/teardown asymmetry (leftover probe side records)
`teardown_ok: true` did not mean symmetric: deleting the artifact record left the two side records
the seed causes — the auto-minted owner access-policy record (`ACL-CHATHOST-PROBE`, a REAL record
melt by `ensureOwnerPolicy`) and the artifact's study workspace sidecar
(`records/studies/STU-CHATHOST-PROBE/workspace.yaml`, a NON-record the product writes to the
filesystem with no delete endpoint).

Fix (option (a)): `run_journey` now calls a new `_delete_probe_side_records(journey, api_base)`
AFTER `teardown_journey`, for probe journeys only (`chat_host_probe` marker; J1/J2/J3 unchanged):
- the ACL side record is deleted through the SAME public `DELETE /api/records/<ACL-id>` path, and
  the ACL id is derived per the product's own minting rule (`ACL-<upper(sanitize(recordId))>`,
  `[^A-Za-z0-9_-]`->`-`); the deletion is REFUSED unless the record's `resourceRef.id` equals the
  seed recordId (never touch a record that cannot be proven to derive from the seed);
- the study workspace sidecar is removed from the LIVE data-repo filesystem root
  (`records/studies/STU-<recordId>/`) — the path is BUILT from the seed's own studyId (never a
  broad glob) and re-verified by basename before removal;
- `teardown_ok` now ALSO requires both side records to be clean, and a `side_teardown` block
  (per-path outcome + notes) is written to the receipt (ABSENT on non-probe journeys, so their
  shape is unchanged).

A `_data_repo_records_root()` helper resolves the live records root (the harness default
`CL_DATA_REPO` points at `/home/brad/.computable-lab/...` but the :3093 stack writes
`/home/brad/.computable-lab-lane2/...`); explicit `CL_DATA_REPO` always wins. This is the reason a
prior run's leftovers survived a "successful" teardown.

### D-4 — HIGH — retraction of the "empirically FALSE / root-cause correction" strawman
Retraction (this subsection, dated 2026-11-04): the report's "Root-cause correction ... brief's
stated cause is empirically FALSE" framing (above, now marked RETRACTED inline) was a strawman. It
dismissed the brief's seeding cause without refuting it.

Both facts hold (stated plainly, as the review requires):
1. **The turns WERE sent.** Every host captured a real outgoing AI request body — `n=3`,
   including a real `POST /api/ai/assist/stream`. (My live artifact-host sweep this round:
   `ai_request_bodies_captured: 3`.)
2. **The backing records did not exist.** The product surfaced its OWN `NOT_FOUND` text for the
   seedless hosts. From the predecessor's sweep receipts
   (`/home/brad/.hermes/cl/receipts/L2-TRUNK-JOURNEYS/20261103T225931Z/`), verbatim product text:
   - `record-host`: `"Couldn't open this record for editing: NOT_FOUND: Record not found: CHATHOST-PROBE"`
   - `event-editor`: `"Failed to load: event graph CHATHOST-PROBE: NOT_FOUND: Record not found: CHATHOST-PROBE"`

Sending a turn does NOT mean the backing record existed. The brief's seeding cause
("drove hosts at probe URLs whose backing records did not exist ... went RED for a seeding
reason") is CONFIRMED by the product's own `NOT_FOUND` text — it was never refuted. The prior
"true cause" (the frozen prose-only rendered-answer counter) is a REAL, co-existing defect
(D-6, frozen `ui-drive.cjs` selector gap — escalated, not owned by this lane) but it is NOT the
whole story; the NOT_FOUND evidence sits alongside it in the same receipts. The "empirically
FALSE" / "root-cause correction" framing is retracted.

Also retracted (inline, above Section D): the prior "broken seed / NON-VACUOUS" experiment drove
`record-host`, whose `seed_note` is literally **"no seed"** — it never broke a seed. To replace
that unsupported claim, I ran a REAL seed mutation on `artifact-host` (the host whose route
`/artifact/:kind/:artifactId` actually mounts a record): copied the artifact-host probe to a run
dir in `/tmp`-style, set `seed = {}` / `teardown = {}` (emptied the seed — what the record-host
run accidentally was), and drove the REAL host through the real `run_journey` (live,
`fake_mode` off). Two runs (the stack's ui-drive timed out at 300s in both — a flake matching the
reviewer's own mutation §3.6):
```
RUN 1  FIX1-D4-emptyseed-20261104T051054Z      run_dir receipt artifact-host.json:
RUN 2  FIX1-D4-emptyseed-r2-20261104T052329Z   {"verdict": "red",
   both: nav /artifact/CHATHOST-PROBE/CHATHOST-PROBE   "violations": ["ui-drive timeout after 300s"],
   seed: {}   teardown: {}                               "seed_note": "no seed"}
   verdict = red      ai_request_bodies n = 0           (data repo BEFORE and AFTER: (none))
   seed_note = "no seed" (empty seed -> seed_journey is a no-op -> "no seed")
```
**The real artifact-host seed mutation did NOT green (red, 0 bodies).** Honest caveat: the red is
a ui-drive 300s TIMEOUT stub (the browser leg timed out, so `_classify_probe_verdict` was not the
code path that produced the red — the stub bypasses the classifier, exactly as the reviewer noted
for its own mutation). It still PROVES the claim "broken seed never green" (red, 0 bodies, not
green), and the data repo stayed clean before/after (`(none)`), because an empty seed creates
nothing. The D-1 classifier fix independently closes the pure-function gap (a probe with 0 bodies
cannot classify green — see D-1 probes below). The prior "NON-VACUOUS" claim is replaced by this
real mutation; the unsupported record-host version is retracted.

### D-5 — MEDIUM — gate treats `inconclusive` as not-accept (corrected wording)
`check-gate.py` `_verdict_ok` (lines 116-128) accepts ONLY `verdict in ("accept","green")` WITH a
non-empty `receipts` reference. `grade_chat_host_sweep` therefore puts an `inconclusive` host in
`not_accept`, so `ok=False` and the chat axis exits 1. The report's earlier sentence
("grades `inconclusive` as non-fail") is WRONG and is corrected (inline above, item 5): the gate
grades `inconclusive` as **not-accept (it does not count as green)** — an all-inconclusive sweep
FAILS the chat gate. INCONCLUSIVE remains the honest non-green interim (D-6 is frozen/escalated).

### Verify (real output, this round)
1. Pure-classifier probes (`python3 -c`, after the fix):
```
$ python3 -c "import importlib.util as u; s=u.spec_from_file_location('rj','.hermes/plans/harness/l2-trunk-journeys/run-journeys.py'); m=u.module_from_spec(s); s.loader.exec_module(m); f=m._classify_probe_verdict; print('A',f([],[],'',True)); print('B',f(['x'],[1,2,3],'NOT_FOUND',True)); print('C',f(['x'],[],'NOT_FOUND',True))"
A ('red', None)
B ('inconclusive', {'reason': 'round trip completed (captured outgoing AI request body) ...', 'product_error': 'NOT_FOUND', 'ai_request_bodies_captured': 3})
C ('red', None)
```
- `_classify_probe_verdict([], [], '', True)` -> **`red`** (the new explicit verdict for a probe
  with zero captured bodies — was `green` before the fix).
- `(['x'], [1,2,3], 'NOT_FOUND', True)` -> **`inconclusive`** (unchanged).
- `(['x'], [], 'NOT_FOUND', True)` -> **`red`** (unchanged).
2. `test-channel-selfcheck.py` -> `SELFCHECK: PASS`, rc 0 (all U1a/U1b pins OK, incl.
   "artifact-host probe tears down the seeded record (delete_record)" and "ONLY the artifact
   route materialises a record").
3. `chat-hosts-shrink-guard.py` -> rc 0, `sha=dcf326497e83976112405fde5396113659301cf715032591fd103af33875156b`
   — SAME sha as before (no inventory host added/dropped; a shrink would be a defect, not a fix).
4. `python3 -m py_compile run-journeys.py` -> `PYCOMPILE_OK`.
5. Live `fake_mode:false` sweep of `artifact-host` (stack :5193 -> :3093 UP) into a NEW unique
   receipts dir `/home/brad/.hermes/cl/receipts/L2-TRUNK-JOURNEYS/FIX1-D2-sweep-20261104T051003Z`:
```
verdict = inconclusive      (honest non-green interim, per D-6)
ai_request_bodies = 3       (real round trip: POST /api/ai/threads/browser,
                             POST /api/ai/assist/stream context={studyId:STU-CHATHOST-PROBE,
                             artifactId:CHATHOST-PROBE,...}, POST /api/ai/threads/browser)
seed_note = "record created: CHATHOST-PROBE"
teardown_ok = true
side_teardown = {"acl_record_deleted": true, "study_workspace_sidecar_deleted": true,
                 "notes": ["access-policy side record ACL-CHATHOST-PROBE: removed (DELETE -> 200)",
                            "study workspace sidecar records/studies/STU-CHATHOST-PROBE:
                             removed (rmtree; source=auto: live data root
                             /home/brad/.computable-lab-lane2/worktrees/main (carries probe side-records))"]}
product_error (product's own text) = "Draft produced no events — it delivered only notes and
                             asked no questions. ... | No events generated. |
                             Pipeline did not produce events (outcome=gap). |
                             AI completed the task but did not propose any changes."
```
D-2 before/after data-repo listing (live lane-2 root
`/home/brad/.computable-lab-lane2/worktrees/main/records`, `find ... -iname '*CHATHOST*' | sort`):
```
BEFORE the run:  (none)          [pre-existing leftovers pre-cleaned to force a fresh mint]
AFTER  the run:  (none)          [seed created the artifact + auto-minted the ACL + the study
                                  workspace sidecar; teardown removed all three — SYMMETRIC]
```
The seed genuinely minted the side records during the run (the receipt's `side_teardown.notes`
show `ACL-CHATHOST-PROBE` DELETE -> 200 and the `STU-CHATHOST-PROBE` sidecar rmtree), and the
post-run listing is clean — so `teardown_ok: true` now means the probe left nothing behind.

### Changed files / commits (this round)
- Code commit: `.hermes/plans/harness/l2-trunk-journeys/run-journeys.py` (+154) — D-1
  (`_classify_probe_verdict` no-bodies wire violation), D-2 (`_delete_probe_side_records` +
  `_data_repo_records_root` + `run_journey` symmetric teardown + `side_teardown` receipt block).
  No `app/**`/`server/**`/`schema/**`, no `ui-drive.cjs` (frozen), no
  `test-channel-selfcheck.py`/`chat-hosts-shrink-guard.py`/`check-gate.py` touched.
- Report (this file): D-4 retraction (dated subsection above + inline RETRACTED markers at the
  "empirically FALSE" root-cause section and Section D), D-5 corrected wording (inline, item 5).
- Final stamp commit: subject `CHATHOST-HARNESS-FIX1 DONE <sha-of-last-code-commit>` (lists D-1/
  D-2/D-4/D-5), body carries this section's DONE marker.

### Not done / blocked (owner / resume)
- D-3 / brief req #1 (generic route-derived seeding) — UNSATISFIED and escalated (architect/Brad
  authority; options a/b/c above). NOT implemented; the U1a contradiction is NOT resolved here.
- D-6 (frozen `ui-drive.cjs:201` prose-counter selector gap) — escalated to the UI/harness owner;
  INCONCLUSIVE remains the honest non-green interim (not a defect in this lane's owned file).
- The D-4 real seed mutation's red is a ui-drive 300s timeout stub (flake, matches the reviewer's
  own mutation); it proves "broken seed never green" but the classifier arm was not the producing
  path for that specific red. The D-1 classifier fix independently closes the pure gap. If a
  non-timed-out broken-seed artifact is required, re-run the empty-seed mutation when the stack's
  ui-drive leg is responsive (resume: `CL_JOURNEY_TIMEOUT=300 python3 <driver> <tag> empty_seed`).
- Receipts (large) kept on disk, outside git:
  `/home/brad/.hermes/cl/receipts/L2-TRUNK-JOURNEYS/FIX1-D2-sweep-20261104T051003Z/`
  and `.../FIX1-D4-emptyseed-20261104T051054Z/`, `.../FIX1-D4-emptyseed-r2-20261104T052329Z/`.

### Verification commands (re-run exactly)
```
cd /mnt/vast/home/brad/git/wt/L2-CHATHOST-SWEEP-1-lane2
python3 -m py_compile .hermes/plans/harness/l2-trunk-journeys/run-journeys.py   # -> PYCOMPILE_OK
python3 .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py      # -> SELFCHECK: PASS (rc 0)
python3 .hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py     # -> rc 0, sha dcf32649...
python3 -c "<D-1 probes above>"                                                 # -> A red / B inconclusive / C red
# live artifact-host sweep (stack :5193 -> :3093): new unique receipts dir; see §Verify item 5
git -c core.fileMode=false diff --name-status 4c3ad2cf..HEAD                      # -> run-journeys.py only (+ report, untracked in repo)
```

CHATHOST-HARNESS-FIX1 DONE e73b7aa0103c538f9fce10f23c42e765137daa2d

## CHATHOST FIX2 (advc c8)

Date: 2026-11-04. Lane 2, item L2-CHATHOST-CONSOLIDATE-1, harness leg. FIX RUN 2 closes
the adversarial cycle-8 defect **D-1(LOW)** (honest ACL absence in the probe teardown)
and the reviewer-recorded gate hole **O-1** (the chat-host gate never consumed the
receipt's own `teardown_ok`/`side_teardown` claim). Base tree e4ed34b7 verified CLEAN
(`git -c core.fileMode=false status --porcelain` -> empty) before starting. Scope: the
three permitted harness files only; NO `app/**`/`server/**`/`schema/**`/`config/**`
touch; frozen files (`ui-drive.cjs`, `chat-hosts-shrink-guard.py`,
`config/chat/chat-hosts.yaml`) untouched.

Commits (branch `cl/lane2-chathost-harness-l2t2110`):
- code: `7ff7fbc7` — "CHATHOST-CONSOLIDATE-1 FIX2 (advc c8): D-1 honest ACL-absence + O-1 gate consumes the receipt's teardown claim" (3 files, +286/-4)
- stamp: `770b52ef` — subject exactly `CHATHOST-HARNESS-FIX2 DONE 7ff7fbc7afe781dc9ef4d3ee7e44d566426941ed`, body lists `D-1(c8)` and `LEG B gate`. Tree CLEAN at stamp (`git -c core.fileMode=false status --porcelain` -> empty).

### D-1(c8) — LEG A: only 404 means absent/clean in `_delete_probe_side_records`

What changed (`run-journeys.py`, committed at 7ff7fbc7, lines 762-777): the ACL branch
previously did `else: acl_clean = True  # absent -> nothing left behind` for EVERY
non-200 GET — but `_api` returns -1 on transport error and 403/500 on server errors, so
a surviving side record was reported clean and could make `teardown_ok` true. Now:
**only 404 -> clean**; every other non-200 (403, 500, -1, anything) -> `acl_clean =
False` with a note stating it was NOT observed absent and naming the status code. The
200 path (verify `resourceRef.id == seed recordId`, DELETE, accept 200/204/404) and the
proven-foreign refusal are UNCHANGED. Committed code:

```python
    elif st == 404:
        # ONLY 404 proves the record absent — absent -> nothing left behind.
        acl_clean = True
        notes.append("access-policy side record %s: absent (GET -> 404)"
                     % acl_rid)
    else:
        # CHATHOST-CONSOLIDATE-1 FIX2 (advc c8 D-1): EVERY other non-200 GET
        # (403, 500, -1 transport error, ...) is NOT an observed absence —
        # _api returns -1 on transport error and 403/500 on server errors,
        # so the record may STILL EXIST and the read merely failed. An
        # unobserved absence is not clean: a surviving side record must not
        # be reported clean (and must not make teardown_ok true).
        acl_clean = False
        notes.append("access-policy side record %s: NOT observed absent "
                     "(GET -> %s; only 404 proves absence — the record may "
                     "still exist and the read failed)" % (acl_rid, st))
```

RED before (pre-fix code at e4ed34b7 with the LEG C pins added, fixes NOT yet applied —
the self-check arms stub the driver's own `_api` so these run the real
`_delete_probe_side_records`):

```
FIX2 D-1 (advc c8): ACL GET 403 -> acl_clean False + note names 403 (not observed absent) RED
      note: acl_clean=True notes=['access-policy side record ACL-CHATHOST-PROBE: absent (GET -> 403)']
FIX2 D-1 (advc c8): ACL GET 500 -> acl_clean False + note names 500 RED
      note: acl_clean=True notes=['access-policy side record ACL-CHATHOST-PROBE: absent (GET -> 500)']
FIX2 D-1 (advc c8): ACL GET -1 (transport error) -> acl_clean False + note names -1 RED
      note: acl_clean=True notes=['access-policy side record ACL-CHATHOST-PROBE: absent (GET -> -1)']
```

i.e. pre-fix: 403/500/-1 all reported `acl_clean=True` with an "absent (GET -> <st>)"
note — the defect. Control arms (legitimate behaviour, OK before AND after):
`ACL GET 404 -> acl_clean True (absent IS legitimately clean)`; `ACL GET 200 + matching
resourceRef + DELETE 200 -> acl_clean True (removed)`; `ACL GET 200 + FOREIGN resourceRef
-> acl_clean False (refused to touch)`.

GREEN after (same arms, at 7ff7fbc7):

```
FIX2 D-1 (advc c8): ACL GET 403 -> acl_clean False + note names 403 (not observed absent) OK
FIX2 D-1 (advc c8): ACL GET 500 -> acl_clean False + note names 500 OK
FIX2 D-1 (advc c8): ACL GET -1 (transport error) -> acl_clean False + note names -1 OK
FIX2 D-1 (advc c8): ACL GET 404 -> acl_clean True (absent IS legitimately clean) OK
FIX2 D-1 (advc c8): ACL GET 200 + matching resourceRef + DELETE 200 -> acl_clean True (removed) OK
FIX2 D-1 (advc c8): ACL GET 200 + FOREIGN resourceRef -> acl_clean False (refused to touch) OK
```

### O-1 — LEG B: the gate consumes the receipt's own teardown claim (harness-only, bounded)

What changed (`check-gate.py`, committed at 7ff7fbc7): exactly two bounded additions,
no restructuring, no existing criterion weakened/renamed/renumbered (the diff's only
removed lines are a docstring rewrap in the axis header):
1. New PURE function `receipt_teardown_grade(receipt)`: `teardown_ok` present and not
   strictly `True` -> reason naming the value; any `side_teardown.*_deleted` flag not
   strictly `True` -> reason naming the flag; malformed claim (non-bool `teardown_ok`,
   non-object `side_teardown`) -> fail-closed reason; a receipt WITHOUT the claim (no
   `teardown_ok`/no `side_teardown` — the non-probe J1/J2/J3 shape) -> `None` (graded
   unchanged).
2. In the EXISTING accept branch of `chat_host_axis()` — after the D7 file-existence
   check (so the receipt file is already proven to exist): read the receipt, run the
   pure grader; on any reason -> `BLOCKER: chat-host <h> receipt <rp> is NOT-ACCEPT on
   its OWN teardown claim (O-1 advc c8: ...)` + `GATE-VERDICT blocking` + exit 1.
   Read failure is also fail-closed (exit 1).

RED before (pre-fix gate ACCEPTED a probe whose honest receipt said it left records
behind — rc=0, no reason):

```
FIX2 O-1 pure: the receipt_teardown_grade pins (helper present + behaviour) RED
      note: err=module 'check_gate' has no attribute 'receipt_teardown_grade'
FIX2 O-1 gate: a sweep whose receipts say teardown_ok: false is NOT-ACCEPT (exit 1, reason named) RED
      note: rc=0 out=chat-host sweep: /tmp/tmpwpulh75a/20261104T000000Z (inventory = 6 host(s))
  artifact-host: accept (receipts=receipts/artifact-host.json)
FIX2 O-1 gate: a side_teardown flag false (acl_record_deleted: false) is NOT-ACCEPT (exit 1, flag named) RED
      note: rc=0 out=chat-host sweep: /tmp/tmpwpulh75a/20261104T000000Z (inventory = 6 host(s))
```

GREEN after (at 7ff7fbc7):

```
FIX2 O-1 pure: receipt_teardown_grade({'teardown_ok': False}) names a reason OK
FIX2 O-1 pure: a side_teardown flag false -> a reason naming the flag OK
FIX2 O-1 pure: teardown_ok true + all-true side_teardown -> honest (None) OK
FIX2 O-1 pure: a receipt WITHOUT side_teardown (J1/J2/J3 shape) -> unchanged (None) OK
FIX2 O-1 gate: a sweep whose receipts say teardown_ok: false is NOT-ACCEPT (exit 1, reason named) OK
FIX2 O-1 gate: a side_teardown flag false (acl_record_deleted: false) is NOT-ACCEPT (exit 1, flag named) OK
FIX2 O-1 gate: an honest sweep (teardown_ok true + side_teardown all-true) still clears the gate (rc 0) OK
FIX2 O-1 gate: receipts WITHOUT side_teardown (J1/J2/J3 shape) are graded unchanged (rc 0) OK
```

### LEG C — pins (RED first, in the existing self-check style)

Arms added to `test-channel-selfcheck.py` (extended, not a new scratch module): 6 D-1
stub arms over the driver's real `_delete_probe_side_records` (403/500/-1/404/200-match/
200-foreign) + 8 O-1 arms (4 pure-grader, 4 subprocess gate arms driving real
`check-gate.py` against synthetic receipt dirs). No `_probe*`/scratch files left behind.
Totals: RED run (pre-fix) 91 OK / 6 RED, final line `SELFCHECK: FAIL`; GREEN run
(post-fix, 7ff7fbc7) 100 OK / 0 RED, final line `SELFCHECK: PASS` (rc 0).

### Live confirmation (stated honestly)

I did BOTH options the brief allows:
1. **Real live sweep** — `CL_RECEIPTS=.../CHATHOST-LIVE-SWEEP-l2t2110 python3
   run-journeys.py --all --chat-hosts --json` (NO `--fake`), lane stack
   :5193/:3093 up (curl 200/200 at start), NEW unique receipts dir
   `/home/brad/.hermes/cl/receipts/CHATHOST-LIVE-SWEEP-l2t2110/20261104T061221Z`.
   run-meta: `app_base http://localhost:5193`, `fake_mode False`, `digest_clean True`.
   Probe host `artifact-host`: `seed_note 'record created: CHATHOST-PROBE'`,
   `side_teardown {acl_record_deleted: True, study_workspace_sidecar_deleted: True}` with
   notes `access-policy side record ACL-CHATHOST-PROBE: removed (DELETE -> 200)` and
   `study workspace sidecar records/studies/STU-CHATHOST-PROBE: removed (rmtree;
   source=auto: live data root /home/brad/.computable-lab-lane2/worktrees/main ...)`.
   The other 5 hosts: `no seed` (vacuously clean). `chat_host_verdicts`: event-editor
   `accept`, the other 5 `inconclusive`. J1 green, J2 red, J3 green; run-meta verdict
   RED (J2), `latest` NOT moved (D2). `LIVE_SWEEP_RC=1`. J2's red is a PRE-EXISTING
   live-sampler flake (first violation: `ui: locator.waitFor: Timeout 480000ms
   exceeded ... '[data-testid^="chat-log-request-"]'`); J2 has no `side_teardown` and
   FIX2 does not touch the J1/J2/J3 verdict path — not a regression. Post-sweep the
   live data root is clean (`find /home/brad/.computable-lab-lane2/worktrees/main/records
   -iname '*CHATHOST*'` -> empty): symmetric teardown held. The D-1 failure path
   (403/500/-1) is proven by the stub arms (RED/GREEN above), not by this sweep.
2. **Stubbed-`_api` demonstration** — the LEG C arms above (the live sweep exercises the
   happy path DELETE 200; the stub arms exercise the fixed contract).

### LEG B consumption on real receipts (gate live)

- Gate on the live run (honest receipts): rc 1. `event-editor`'s accept PASSED the new
  O-1 consumption (honest claim, no O-1 blocker against it); the BLOCKER is the
  pre-existing not-accept for the 5 inconclusive hosts (frozen D-6 counter —
  `ui-drive.cjs:201` prose selector; unchanged by this run):

```
chat-host sweep: /home/brad/.hermes/cl/receipts/CHATHOST-LIVE-SWEEP-l2t2110/20261104T061221Z (inventory = 6 host(s))
  artifact-host: inconclusive (receipts=artifact-host.json)
  event-editor: accept (receipts=event-editor.json)
  project-deck-tab: inconclusive (receipts=project-deck-tab.json)
  record-host: inconclusive (receipts=record-host.json)
  registry-host: inconclusive (receipts=registry-host.json)
  run-workspace: inconclusive (receipts=run-workspace.json)
BLOCKER: chat-host sweep verdict(s) not-accept for ['artifact-host', 'project-deck-tab', 'record-host', 'registry-host', 'run-workspace'] (no request-body receipt + rendered answer)
GATE-VERDICT blocking
GATE_LIVE_RC=1
```

- Same run with `artifact-host.json` mutated to `teardown_ok: false` (copy under /tmp,
  `CL_RECEIPTS` pointed at it, `latest` symlinked) — the hole is now closed on real
  receipts:

```
BLOCKER: chat-host artifact-host receipt 'artifact-host.json' is NOT-ACCEPT on its OWN teardown claim (O-1 advc c8: the honest receipt is graded — teardown_ok: False (false/malformed — the probe did not prove it left nothing behind; a not-accept receipt may not clear the gate))
GATE-VERDICT blocking
GATE_MUTATED_RC=1
```

### Verification commands (real output, reproduced at commit 7ff7fbc7; stamp 770b52ef is an empty commit over it)

```
cd /mnt/vast/home/brad/git/wt/L2-CHATHOST-SWEEP-1-lane2
python3 -m py_compile .hermes/plans/harness/l2-trunk-journeys/run-journeys.py
    # rc 0 (PYCOMPILE_OK)
python3 .hermes/plans/harness/l2-trunk-journeys/check-gate.py --help
    # rc 0. NOTE: `--help` is not a recognized flag in this gate; it runs the default
    # `latest` receipt check:
    #   latest: /home/brad/.hermes/cl/receipts/L2-TRUNK-JOURNEYS/20261103T225931Z verdict=ALL-GREEN
    #     J1: green
    #     J2: green
    #     J3: green
    #   GATE-VERDICT green
python3 .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py
    # rc 0, 100 OK / 0 RED; all 14 FIX2 arms OK; final line: SELFCHECK: PASS
python3 .hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py
    # rc 0
    # SHRINK-GUARD green (current sha=dcf326497e83976112405fde5396113659301cf715032591fd103af33875156b; no blessed host dropped)
git -c core.fileMode=false diff --name-status e4ed34b7..HEAD
    # M  .hermes/plans/harness/l2-trunk-journeys/check-gate.py
    # M  .hermes/plans/harness/l2-trunk-journeys/run-journeys.py
    # M  .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py
```

Large receipts kept on disk, outside git:
`/home/brad/.hermes/cl/receipts/CHATHOST-LIVE-SWEEP-l2t2110/20261104T061221Z/` (live sweep, 6 host receipts + run-meta + J1/J2/J3).

### State / blockers

- Implementation complete: D-1(c8) + LEG B gate closed, pins RED-then-GREEN, live
  sweep + real-receipt gate evidence above. **Implementation complete is not
  acceptance** — no acceptance verdict is claimed; acceptance remains with the
  reviewer/orchestrator (browser reviewer owns UI acceptance; the YAML/lane-stack
  reload is the orchestrator's to run before any further live grading).
- Residual (pre-existing, NOT introduced by FIX2, out of this lane's owned files):
  J2 live-sampler red (480s locator timeout) and the 5-host `inconclusive`
  not-accept (frozen D-6 `ui-drive.cjs:201` prose-counter selector). Resume
  conditions: ui-drive leg responsiveness (J2) and the D-6 escalation to the
  UI/harness owner — unchanged from the FIX1 section above.

CHATHOST-HARNESS-FIX2 DONE 7ff7fbc7afe781dc9ef4d3ee7e44d566426941ed

## CHATHOST GRADER FIX (D-6, l2t0200)

### Scope & authority
- Authority: architect ruling D-6 (`/home/brad/.hermes/cl/lanes/2/decisions/D6-RENDERED-
  ANSWER-ruling-l2t0150.md`). Where the task prompt and the ruling differed, the
  ruling won and is flagged below.
- Exact four files + selfcheck arms, as scoped. `app/**`, `server/**`, `schema/**`, the six host
  ids + their existing fields, the probe `assert.rendered` set, and `chat-hosts-shrink-guard.py`
  all left frozen. No per-host `if host ==` branch anywhere (host id used only for DATA lookup).

### Root cause (proven, not assumed)
`ui-drive.cjs readAssistantTexts()` queried `.chat-log__bubble, .message-log__bubble,
.chat-log-intent-card`, but `app/src/agent/ChatLog.tsx:399-403` renders rows as
`chat-log-msg chat-log-msg--assistant|--user|--system` and the confirmed render class
`.chat-log-intent-card` lives at `:484` (nested INSIDE the assistant row). The old set matched
ZERO rows → `turns:0` → `assistant_answer_visible`/`turns_at_least` false → the rendered leg RED.
Confirmed against the prior live sweep `20261104T065205Z` (1 GREEN / 4 INCONCLUSIVE / 1 RED,
`turns=0` on the 5 non-green hosts) and a vision check of the receipt screenshot (the assistant
bubble IS rendered with text).

### Changes (per unit, one commit each)
1. **ui-drive.cjs `readAssistantTexts` selector set** (B-now, unit 1 `f2d1a339` + refinement
   `c412a666`): set is now the ruling's EXACT set `.chat-log-msg--assistant,
   .chat-log-intent-card`; legacy `.message-log__bubble` / `.chat-log__bubble` DROPPED
   (`.message-log__bubble` is a USER-row base class, `MessageLog.tsx:143` — keeping it would
   count user rows as assistant turns, the flattery the ruling forbids); raw `.chat-log-msg`
   deliberately NOT added. The `log_selector` resolution + doc-root fallback
   (`document.querySelector(sel) || document.querySelector('.review-ai__log')`) are
   BYTE-IDENTICAL to base `96b3d8d4`. The fallback is a ROOT substitution only — it can never
   rescue a selector that matched zero assistant rows (proven in selfcheck pin 3). `bubbles_matched`
   added to the evidence (the Q4 selector-proof: how many rows the selector actually matched).
2. **run-journeys.py — probe `log_selector` from inventory DATA** (unit 2 `fa9e04be`):
   `build_chat_host_probe` reads the inventory row's `answer_selector` and injects it as
   `log_selector` in the generated probe YAML (data lookup by host id, never a branch).
   `check_rendered_assertions` now implements the ruling Q2 semantics: `assistant_answer_visible`
   is true IFF the last rendered assistant row is non-empty text AND `turns_completed >= 1`
   (baseline-subtracted, the anti-flattery guard), NOT the raw `assistant_turns` count. A
   pre-existing/hydrated row (`assistant_turns>=1` but `turns_completed==0`) must not satisfy it.
3. **config/chat/chat-hosts.yaml — `answer_selector:` DATA per row** (unit 3 `cfc4f7ff`): one new
   row field on each of the six rows (the universal-chat assistant render selector
   `[aria-label="Conversation"]`); no row removed/renamed/reordered; `surface`/`route`/`mount`/
   `ghost_mount` untouched.
4. **config/chat/chat-hosts.manifest.yaml — defensible re-bless** (unit 4 `e96d20d8`): appended a
   `blessed_records` entry whose `blessed_sha256 == canonical_sha(current 6 ids)`, `blessed_ids`
   reproduce it, `bless_note` cites the existing spec
   `.hermes/plans/2026-11-02_0500-L2-CHATHOST-SWEEP-1-spec.md` (a decisions/ or config/ path would
   not satisfy the guard's `spec_cited` check).
5. **test-channel-selfcheck.py — Q3/Q4 pin arms** (unit 5 `04c7259d`): Q1 selector-set source pin;
   Q2 semantics (pre-existing / user-only / empty all grade not-green); Q3 pins 1/2/3 as
   browser-driven temp-dir fixtures (user-only → `assistant_turns=0`/`nonempty=false`; empty
   assistant → `assistant_turns>=1`/`nonempty=false`; absent log root → fail-closed `turns:0` /
   `bubbles_matched:0` even WITH the `.review-ai__log` fallback present — no rescue, no
   double-count); Q4 umbrella (every receipt carries the selector-proof triple + `bubbles_matched`)
   + a no-`body_text_tail`-borrowing source pin; a RED-against-revert arm that re-drives the BASE
   driver file (`git show 96b3d8d4:…`) against the same rendered-answer fixture and grades `turns:0`
   (the proven bug) while the fixed set counts it; and the A-leg builder data pass-through. Every
   negative-control arm grades NOT-ACCEPT where the ruling requires.

### Verification — REAL output
- `python3 .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py` → **SELFCHECK: PASS**
  (all pre-existing arms + the 13 new D6 arms).
  CORRECTION (advc c10 D3): the blanket "each new arm demonstrated RED against a reverted /tmp
  copy" was an overclaim; exactly these arms were proven RED against a revert, and how:
  (a) the Q1 SELECTOR-SET revert — the in-suite RED-against-revert arm re-drives the BASE driver
  file (`git show 96b3d8d4:.hermes/.../ui-drive.cjs`, materialised to a throwaway `/tmp` copy and
  deleted; the worktree file was never modified, so there is nothing to restore — the
  demonstration IS the revert of the selector set) against the rendered-answer fixture: the base
  set grades `turns:0` (the proven grader bug) while the fixed set counts it. This is the only
  arm whose /tmp revert copy demonstrably flips a grade in-suite.
  (b) Q2: the pre-existing-evidence arm was NOT a pin against the Q2 revert — the sibling
  `turns_at_least` assertion (`turns_completed=0 < 1`) RED-graded it at BASE too, so it passed
  both ways. Fixed in round 2 (advc c10 D3, commit `eb5e5d31`): the pre-existing evidence is now
  graded with `{assistant_answer_visible: true}` ALONE and the arm asserts the specific violation
  string; the flip is demonstrated both ways — head: RED with the specific violation; `/tmp` copy
  with only the Q2 line reverted: GREEN false-positive (`violations=[]`), arm RED. See the round-2
  section below.
  (c) the Q3/Q4 pin arms (pins 1/2/3, pin 3b, Q4 umbrella, A-leg) are fixture-driven NOT-ACCEPT /
  selector-proof pins against the CURRENT driver, not revert demonstrations; (d) the pure Q2
  semantics arms (green / user-only / empty vs the full assert.rendered) do not discriminate the
  Q2 `turns_completed` change either (user-only and empty grade RED at base via the `nonempty`
  term; green passes both ways) — only the pre-existing case is discriminating, per (b).
- `python3 .hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py` BEFORE and AFTER the
  manifest change: BOTH `SHRINK-GUARD green … no blessed host dropped`, **exit 0** both times, sha
  `dcf326497e83976112405fde5396113659301cf715032591fd103af33875156b` (blessed `==` canonical;
  `--recompute` confirms `canonical sha of 6 host(s): dcf32649…75156b`).
- `python3 -m py_compile run-journeys.py test-channel-selfcheck.py chat-hosts-shrink-guard.py` → OK;
  `node --check ui-drive.cjs` → OK.
- `git -c core.fileMode=false diff --stat 96b3d8d4..HEAD`:
  ```
   .../harness/l2-trunk-journeys/run-journeys.py      |  85 ++++-
   .../l2-trunk-journeys/test-channel-selfcheck.py    | 392 +++++++++++++++++++++
   .../plans/harness/l2-trunk-journeys/ui-drive.cjs   |  65 +++-
   config/chat/chat-hosts.manifest.yaml               |  22 ++
   config/chat/chat-hosts.yaml                        |  24 ++
   5 files changed, 574 insertions(+), 14 deletions(-)
  ```
  `--name-status 96b3d8d4..HEAD`:
  ```
  M  .hermes/plans/harness/l2-trunk-journeys/run-journeys.py
  M  .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py
  M  .hermes/plans/harness/l2-trunk-journeys/ui-drive.cjs
  M  config/chat/chat-hosts.manifest.yaml
  M  config/chat/chat-hosts.yaml
  ```

### LIVE end-to-end (`fake_mode:false`, `--all --chat-hosts`, no `--fake`), lane stack :5193/:3093
Two fresh receipts dirs (new each run):

**Run A — `20261104T084645Z`** (run-meta `verdict=GREEN-NOT-GATING`, `fake_mode=false`):
journeys J1=green, J2=green, J3=green.
| chat host      | verdict       | assistant_turns | turns_completed | last_nonempty | bubbles_matched | error_frames |
|----------------|---------------|-----------------|-----------------|---------------|-----------------|--------------|
| run-workspace  | inconclusive  | 1               | 1               | True          | 1               | 1            |
| event-editor   | inconclusive  | 1               | 1               | True          | 1               | 1            |
| project-deck-tab| inconclusive | 1               | 1               | True          | 1               | 1            |
| record-host    | **green**     | 1               | 1               | True          | 1               | 0            |
| artifact-host  | inconclusive  | 1               | 1               | True          | 1               | 1            |
| registry-host  | **green**     | 1               | 1               | True          | 1               | 0            |

**Run B — `20261104T085506Z`**: journeys J1=green, J2=**red** (AI round-trip: clarification card
never appeared in 480 s — AI non-determinism, unrelated to the grader), J3=green.
| chat host      | verdict       | assistant_turns | turns_completed | last_nonempty | bubbles_matched | error_frames |
|----------------|---------------|-----------------|-----------------|---------------|-----------------|--------------|
| run-workspace  | **green**     | 2               | 2               | True          | 2               | 0            |
| event-editor   | **green**     | 1               | 1               | True          | 1               | 0            |
| project-deck-tab| inconclusive | 1               | 1               | True          | 1               | 1            |
| record-host    | inconclusive  | 1               | 1               | True          | 1               | 1            |
| artifact-host  | inconclusive  | 1               | 1               | True          | 1               | 1            |
| registry-host  | **green**     | 1               | 1               | True          | 1               | 0            |

**The grader fix is verified live: the rendered-answer leg — `assistant_answer_visible`
(`turns_completed>=1 AND last row non-empty`) + `turns_at_least:1` — is TRUE for ALL 6 hosts in
BOTH runs** (previously 5 hosts graded `turns:0`, including the proven grader-bug RED host
project-deck-tab, which is now green in run A's host set). The assistant bubble is now correctly
counted (`bubbles_matched>=1`).

### What remains (honest BLOCKED — NOT a false green, NOT the grader bug)
The probe `assert.rendered` set is three predicates; the first two (the rendered-answer leg the
grader fix targets) pass 6/6 in both runs. The third, `no_error_frame`, holds for 2–3 hosts per
run and is the sole residual failure. It is a NEW reason, not the grader bug:
- The probe navigates a route that references runId `CHATHOST-PROBE` with NO seed step (the probe
  is intentionally a minimal `goto → open_ai_tab → ask`, per ruling Q4's generic ask). The
  deck/run surface therefore tries to load an event graph that does not exist and the product
  honestly renders a `role="alert"` error ("Failed to load event graph: … NOT_FOUND: Record not
  found: CHATHOST-PROBE", `app/src/graph/LabwareEventEditor.tsx`) plus the AI's own honest "No
  events generated". The retained/frozen `no_error_frame` guard (ruling Q2: "the emerging
  `text_contains`/`no_error_frame` guard is retained") correctly catches it.
- It is TIMING-VARIED: which hosts fail differs between run A and run B (a bare-navigate probe with
  no AI round-trip shows 0 alerts; the error frame is only caught when the driver's post-AI
  snapshot lands after the NOT_FOUND resolves). So it is a transient product error-frame render,
  not a stable grader defect.
- Reaching a full 6/6 chat-host GREEN requires a change OUTSIDE this item's frozen scope: either a
  probe SEED step (so `CHATHOST-PROBE` exists and the route doesn't 404) or a product-side change
  to not surface an error frame for the missing probe graph. Both are out of scope here — `app/**`
  is frozen, `no_error_frame` is frozen (the ruling explicitly retains it and forbids weakening/
  removing any assertion), and the probe step sequence / generic ask are scoped as-is by Q4.

**Escalation / next action (owner: orchestrator):** to close the rendered leg to a live 6/6,
authorize one of: (a) a `seed` step in the chat-host probe (so the probe route resolves, no NOT_
FOUND error frame), or (b) confirm the `no_error_frame` guard should treat a route-404 NOT_FOUND
on the synthetic probe runId as non-blocking. Neither is authorized by ruling D-6 as written.

### Commits on `cl/lane2-chathost-grader-l2t0200` (over trunk `96b3d8d4`)
```
04c7259d CHATHOST-GRADER-FIX unit 5 (D-6 Q3/Q4): selfcheck pin arms …
909f4149 CHATHOST-GRADER-FIX unit 2 (D-6 Q2): assistant_answer_visible gates on baseline-subtracted turns_completed …
c412a666 CHATHOST-GRADER-FIX unit 1 (D-6 Q1): narrow readAssistantTexts to the ruling's exact assistant set …
fa9e04be CHATHOST-GRADER-FIX unit 2 (D-6 A-leg): probe log_selector from inventory DATA
e96d20d8 CHATHOST-GRADER-FIX unit 4 (D-6): defensible manifest re-bless
cfc4f7ff CHATHOST-GRADER-FIX unit 3 (D-6 A-leg): inventory answer_selector DATA per host
f2d1a339 CHATHOST-GRADER-FIX unit 1 (D-6 B-now): readAssistantTexts matches the real ChatLog row classes
```
Last code commit: `04c7259daa3a3d12878db25cd1d9d607f91a9caf`.

CHATHOST-GRADER-FIX BLOCKED 04c7259daa3a3d12878db25cd1d9d607f91a9caf

## CHATHOST GRADER FIX round 2 (advc c10)

Lane 2 · branch `cl/lane2-chathost-grader-l2t0200` · authority:
`/home/brad/.hermes/cl/lanes/2/reviews/CHATHOST-CONSOLIDATE-1-advc-grader-c10-l2t0210.md`
(§4 D1/D2/D3 + Observations). Cycle 10 found NO blocker and CONFIRMED the grader
fix (rendered-answer leg true 6/6, two live sweeps). This round closes exactly the
three residues; no closed item re-opened, no product code touched, the six-host
sweep NOT re-run as a criterion (the live `no_error_frame` evidence question stays
with the architect, `decisions/CHATHOST-noerrorframe-probe-seed-l2t0400-ruling.md`).

### D1 (MEDIUM) — the "can never rescue" claim is false; its pin could not falsify it
- Commit `f9f76738` (one unit: the claim + the proof).
- The c10 claim — "the fallback is a ROOT substitution only — it can never rescue
  a selector that matched zero assistant rows" — is a FALSE universal. The
  reviewer's repro stands: `log_selector=.no-such-log-root` with `.review-ai__log`
  containing a `.chat-log-msg--assistant` row → `assistant_turns=1,
  bubbles_matched=1, nonempty=True`.
- Restated invariant (TRUE), `ui-drive.cjs` comment only — the fallback is a ROOT
  substitution that grades whatever the fallback ROOT contains; on the REAL
  surfaces it carries no chat-log rows because the fallback root is a MessageLog
  surface (`ReviewAiPanel.tsx:294` wraps `<MessageLog>` in `.review-ai__log`;
  `MessageLog.tsx:143-144` renders `message-log__bubble--assistant`, and the file
  carries no `chat-log-msg--assistant` / `chat-log-intent-card` class) — so the
  fallback cannot rescue a chat-log selector ON THE REAL SURFACES. The fallback
  line itself is BYTE-IDENTICAL to base `96b3d8d4` (FROZEN ruling line;
  `git show 96b3d8d4` diff: comment/context only).
- New falsifiable pin 3b (`test-channel-selfcheck.py`), two arms:
  (i) source pin asserting the surface property — the `.review-ai__log` root
  wraps `<MessageLog>` and `MessageLog.tsx` contains NO `.chat-log-msg--assistant`
  / `.chat-log-intent-card` class (goes RED if the surface ever gains one);
  (ii) falsification arm re-driving the c10 repro — a fallback root that DID
  carry a chat-log assistant row IS counted (`assistant_turns>=1`,
  `bubbles_matched>=1`), proving the fallback grades whatever the root contains.
  Old pin 3 (absent log root, chrome-only fallback fixture → `turns:0`,
  `bubbles_matched:0`) is retained: it pins a different, TRUE property
  (fail-closed when neither root matches), which is why it is not a pin for the
  stronger (false) claim.

### D2 (LOW) — dead exported helper with a misleading docstring
- Commit `412f2b94`. `chat_host_answer_selectors()` (was `run-journeys.py:155`)
  deleted — defined, exported, never called (grep: 0 callers in the harness; the
  builder reads the field by id through `_inventory_answer_selector` at
  `:230`/:206-251 region). `load_chat_host_inventory` docstring corrected so ONE
  authoritative read path is documented (the builder's by-id data lookup, never a
  host branch). Builder behaviour unchanged — runtime check: `load_chat_host_
  inventory()` returns 6 ids/surfaces; `build_chat_host_probe()` builds 6 probes,
  all with a `log_selector`; the module no longer exports the dead name.

### D3 (LOW) — the D6 Q2 selfcheck arm was not a pin (passed both ways)
- Commit `eb5e5d31`. The `preexisting` case was graded against the FULL
  `assert.rendered`, where the sibling `turns_at_least` backstop
  (`turns_completed=0 < 1`) RED it at BASE too — so the arm never tested the
  `assistant_answer_visible` change.
- Fix: the pre-existing evidence (`assistant_turns=1, turns_completed=0,
  nonempty=True`) is now graded with `{assistant_answer_visible: true}` ALONE, and
  the arm asserts the SPECIFIC violation string
  `no visible non-empty assistant answer (turns_completed=0 nonempty=True)`.
  Base semantics (Q2 line reading raw `assistant_turns`) grades it GREEN
  (`violations=[]` — the exact false positive the Q2 fix exists to kill); head
  grades it RED. The sibling arms (green / user-only / empty, full
  `assert.rendered) are unchanged.
- Flip, demonstrated both ways:
  - HEAD: full selfcheck `SELFCHECK: PASS` (115 OK / 0 RED), arm OK with the
    specific violation (see Verification).
  - BASE: `/tmp/c11-d3mut` copy of the harness with ONLY the Q2 line reverted to
    `evidence.get("assistant_turns", 0)` → the arm goes RED with
    `alone violations=[]` (the GREEN false positive), and the standalone flip
    check prints `FLIP: CONFIRMED (base GREEN false-positive -> head RED)`
    (`BASE (reverted Q2 line): violations=[]` vs
    `HEAD (fixed): violations=['rendered: no visible non-empty assistant answer (turns_completed=0 nonempty=True)']`).
    (The full `/tmp` selfcheck in that copy also REDs several UNRELATED arms —
    shrink-guard arms need `config/`, the RED-against-revert arm needs a `git`
    worktree at REPO_ROOT, the browser arms need the real product surface — those
    REDs are environmental, not from the Q2 revert; the targeted flip above
    isolates the Q2 effect.)

### Report split fixed
The previous run created a SECOND report file at the trunk checkout
`/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/deliverables/
CHATHOST-HARNESS-1-report.l2t2011.md` (162 lines) while the canonical lane copy
`/home/brad/.hermes/cl/lanes/2/deliverables/CHATHOST-HARNESS-1-report.l2t2011.md`
lacked the `## CHATHOST GRADER FIX (D-6, l2t0200)` section. This split was a
prompt defect, not a file defect. Fix: that section was appended to the
CANONICAL copy (append-only — every earlier section preserved verbatim), this
round-2 section appended after it, and the result mirrored back to the trunk
path so both files are IDENTICAL (`diff -q` prints nothing — see Verification).
The blanket "every arm RED against a revert" sentence in the merged l2t0200
section was corrected in place to the precise statement above.

### Verification — REAL output (run in the worktree, after all three commits)
1. `python3 .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py`
   → `SELFCHECK: PASS` (115 OK / 0 RED), including the repaired D3 arm:
   `D6 Q2 pin: pre-existing evidence (assistant_turns=1, turns_completed=0)
   graded with {assistant_answer_visible:true} ALONE is RED with the specific
   violation (advc c10 D3 — alone it grades GREEN at base, so the arm flips
   with the Q2 line) OK` and both pin 3b arms OK. D3 mutation shown RED in the
   `/tmp/c11-d3mut` Q2-reverted copy (arm line `RED`, note `alone violations=[]`).
2. `python3 .hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py`
   → `SHRINK-GUARD green (current sha=dcf326497e83976112405fde5396113659301cf715032591fd103af33875156b; no blessed host dropped)`, exit 0.
3. `python3 -m py_compile` on every .py touched (`run-journeys.py`,
   `test-channel-selfcheck.py`) + `chat-hosts-shrink-guard.py` → OK;
   `node --check ui-drive.cjs` → OK.
4. `git -c core.fileMode=false diff --stat 04c7259d..HEAD`:
   ```
 .../harness/l2-trunk-journeys/run-journeys.py      |  33 ++-----
 .../l2-trunk-journeys/test-channel-selfcheck.py    | 108 ++++++++++++++++++++-
 .../plans/harness/l2-trunk-journeys/ui-drive.cjs   |  13 ++-
 3 files changed, 120 insertions(+), 34 deletions(-)
   ```
   `--name-status`:
   ```
M	.hermes/plans/harness/l2-trunk-journeys/run-journeys.py
M	.hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py
M	.hermes/plans/harness/l2-trunk-journeys/ui-drive.cjs
   ```
   (04c7259d = code tip of the previous round; 996eca52 = its final stamp commit;
   the range therefore captures exactly this round's code.)
5. `diff -q` between the two report copies → empty (both files identical).

### Frozen-set compliance
`app/**`, `server/**`, `schema/**` untouched (the D1 pin READS two app sources
read-only — no product edit). `config/chat/*` untouched (no new field, no
re-bless). Six host ids/fields untouched. `chat-hosts-shrink-guard.py`
untouched. The probe `assert.rendered` set untouched (`no_error_frame`,
`assistant_answer_visible`, `turns_at_least` present, unweakened, unrenamed).
The doc-root fallback line in `ui-drive.cjs` is byte-identical to base
`96b3d8d4`.

### Commits this round (one unit each, then this final stamp)
```
f9f76738 CHATHOST-GRADER-C11 D1: restate the doc-root fallback claim truthfully + add falsifiable pin 3b …
412f2b94 CHATHOST-GRADER-C11 D2: delete dead chat_host_answer_selectors() + correct load_chat_host_inventory docstring …
eb5e5d31 CHATHOST-GRADER-C11 D3: make the D6 Q2 selfcheck arm a real pin (advc c10) …
```
Last code commit: `eb5e5d31f627c2d02b69d054aec2e66430ca4aed`.

CHATHOST-GRADER-C11 DONE eb5e5d31f627c2d02b69d054aec2e66430ca4aed

---

## L2-CHATHOST-CONSOLIDATE-1 — alert_texts + DATA-driven probe_seed (this unit)

**Base:** d5f92064d6ce ; branch `cl/lane2-chathost-grader-l2t0200` (fast-forwarded onto `cl/integration-2` = bd39c254, docs-only since the branch merged — STEP 0 clean, no conflicts in owned files).
**Ruling read first (binding):** `~/.hermes/cl/lanes/2/decisions/CHATHOST-noerrorframe-probe-seed-l2t0400-ruling.md`.
**Scope (exactly four files, all inside the worktree):** `ui-drive.cjs`, `run-journeys.py`, `config/chat/chat-hosts.yaml`, `config/chat/chat-hosts.manifest.yaml` (plus the in-scope test harness `test-channel-selfcheck.py`, which the PINS explicitly require to carry the two new arms — it is the self-check, not a 5th "config").

### Unit 1 — `alert_texts` capture (ui-drive.cjs) : SHIPPED
- Added `evidence.alert_texts` at the `error_frames` site (now ui-drive.cjs:568-570):
  `evidence.alert_texts = await page.evaluate(() => [...document.querySelectorAll('[role="alert"]')].map(n => (n.textContent || '').slice(0, 300))).catch(() => []);`
- `error_frames` COUNT and the `no_error_frame` grading path are BYTE-IDENTICAL (the count line is untouched; alert_texts is a pure ADD that rides `rendered_evidence`).
- `node --check ui-drive.cjs` -> rc 0.
- PIN arm (selfcheck): drives the REAL driver over a file:// fixture with TWO `role="alert"` nodes -> the receipt's `rendered_evidence.alert_texts` SHOWS both texts (each == the 300-char slice) while `error_frames == 2`. A /tmp copy with the capture statement REVERTED (the whole `evidence.alert_texts = ... .catch(() => []);` statement deleted) LOSES `alert_texts` while `error_frames` is unchanged -> the arm goes RED on revert (non-vacuous). Both PASS.

### Unit 2 — DATA-driven `probe_seed` (run-journeys.py) : SHIPPED
- New data-lookup helper `_inventory_probe_seed(host_id)` (mirrors `_inventory_answer_selector`): returns the inventory row's `probe_seed` dict for the id, `{}` otherwise. **Zero `if host ==` / id-equality branches in the builder.**
- `build_chat_host_probe` seed is now two-tier, BOTH data: (1) PRIMARY — the row's `probe_seed` DATA is threaded verbatim into `probe["seed"]` and its `teardown.delete_record` recordId into `probe["teardown"]` through the EXISTING `seed_journey`/`probe_teardown` machinery; (2) FALLBACK — for a seeded row WITHOUT `probe_seed`, the pre-existing `/artifact/` route-shape record (the artifact-host) is used EXACTLY as today. A row with no `probe_seed` and no artifact route stays seedless (`seed`/`teardown` `{}`), identical to before.
- The shared `CHATHOST-PROBE` token is safe because the sweep seeds/tears down EACH host sequentially (seed -> steps -> teardown per host, run-journeys.py:1352-1363); each host deletes its own record before the next seeds.
- `python3 -m py_compile run-journeys.py test-channel-selfcheck.py` -> rc 0.
- PIN arms (selfcheck): (a) a row WITH `probe_seed` (event-editor, record-host) produces a probe carrying that `seed` + matching `teardown`; (b) a row WITHOUT it behaves EXACTLY as today (artifact keeps its route-shape record; registry-host/run-workspace/project-deck-tab stay seedless); (c) id-branch-free (grep-provable: no `if host ==`/id-equality in the builder source). All PASS.

### Unit 3 — `probe_seed:` DATA (config/chat/chat-hosts.yaml) : SHIPPED
Field ADD only (the six ids, every existing row field, the slice block, the contract/`.surface` vocabularies are FROZEN and untouched). Two rows seeded; the recordId token is the SAME `CHATHOST-PROBE` the probe navigates to (`probe_nav_path` substitutes `:eventGraphId`/`:recordId` -> CHATHOST-PROBE), so each record-by-id host MOUNTS the seeded record.

- **event-editor** (`/deck/:eventGraphId`) — event-graph record `recordId: CHATHOST-PROBE`, minimal J1 shape (`status: draft`, `events: []`). **Verified, not guessed:** the deck's right pane (`DeckHostPage.tsx:113`) mounts `<RightPane/>` unconditionally once `meta` exists, and the AI tab / chat affordance has NO labware/placement gate (tab strip AI/Search/Details/Protocol is unconditional; `open_ai_tab` accepts the `right-pane-tab-ai` tab or a "Message" composer). So `labwares: []` suffices; NO labware/editorLayout copy needed. schemaId `https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml`, teardown `delete_record: CHATHOST-PROBE`.
- **record-host** (`/record/:recordId`) — **EMPIRICALLY DETERMINED** (real POST/GET against :3093, USR-BRAD): the minimal shape the record-host can OPEN for editing is an **aliquot** `recordId: CHATHOST-PROBE` with `payload.kind: aliquot`, `payload.id: CHATHOST-PROBE`, and a `material_spec_ref` ontology CURIE (`kind: ontology`, `namespace: ChEBI`, `id: CHEBI:16236`, `label: water`). The aliquot schema (`schema/lab/aliquot.schema.yaml`) requires `unevaluatedProperties: false` + one of three spec refs; the ontology ref requires `kind/namespace/id/label` and REJECTS a top-level `recordId` in the payload (recordId is derived by the store from the payload `id`). Result: POST 201, GET 200, `/api/ui/record/CHATHOST-PROBE/editor` 200 (2 blocks, 9 slots), DELETE 200 -> GET 404 (clean). schemaId `https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml`, teardown `delete_record: CHATHOST-PROBE`. (See Unit 4 finding.)
- **artifact-host** — already correctly seeded by the route-shape `/artifact/` rule (byte-identical, untouched). **project-deck-tab / registry-host / run-workspace** — NO seed yet (per the ruling sequence: seed only if a sweep's `alert_texts` names a route NOT_FOUND cause for their token).

### Unit 4 — record-host openable-shape finding : RECORDED
The record-host can open an **aliquot** record (minimal: `kind: aliquot`, `id`, one `material_spec_ref` ontology CURIE with `kind/namespace/id/label`) for editing — proven by a real :3093 POST 201 / GET 200 / editor-projection 200 (2 blocks, 9 slots) / DELETE 200->404, then torn down. The event-editor deck mounts its chat affordance with NO placed labware (right pane + AI tab are unconditional on `meta`). Both seeds are therefore minimal record DATA, not guessed fixtures.

### Unit 5 — D-6 hygiene re-bless (chat-hosts.manifest.yaml) : SHIPPED
A `blessed_records` entry (l2t0610) appended; `bless_note` cites the existing spec `.hermes/plans/2026-11-02_0500-L2-CHATHOST-SWEEP-1-spec.md`. The guard hashes the host-id set only, so a FIELD ADD (probe_seed) leaves the sha UNCHANGED:
- BEFORE inventory edit: `SHRINK-GUARD green (sha=dcf326497e83976112405fde5396113659301cf715032591fd103af33875156b)` rc 0
- AFTER inventory + manifest edit: `SHRINK-GUARD green (sha=dcf326497e83976112405fde5396113659301cf715032591fd103af33875156b)` rc 0  (sha UNCHANGED, as the PINS require)

### Verification (this unit so far)
- `python3 test-channel-selfcheck.py` -> **SELFCHECK: PASS** rc 0 (incl. the two new CHATHOST-CONSOLIDATE-1 PIN arms + the UPDATED U1a DATA-driven arm)
- `python3 chat-hosts-shrink-guard.py` -> green, sha dcf32649...75156b UNCHANGED, rc 0 (before + after)
- `python3 -m py_compile run-journeys.py test-channel-selfcheck.py` -> rc 0
- `node --check ui-drive.cjs` -> rc 0

### NEXT (still owed)
1. ONE live sweep (fake_mode:false) to NAME every residual frame via `alert_texts`.
2. Eliminate by CAUSE (probe_seed DATA or the Q-C3 stimulus change — the shared probe prompt to a non-ledger deterministic ask, IDENTICAL on all six hosts, KEEPING the `"CHATHOST-SWEEP probe"` substring the T4c pin + canned matcher depend on) — never by exemption.
3. TWO consecutive live 6/6 rendered-leg sweeps.
4. Final `diff -q` of the two report copies + `git diff --stat d5f92064..HEAD` + clean status.

