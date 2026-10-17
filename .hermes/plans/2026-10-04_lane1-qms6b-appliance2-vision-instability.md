# Escalation — appliance-2 vision endpoint instability blocks the QMS-6B browser gate (lane 1)

Author: lane-1 orchestrator tick, 2026-10-04 ~10:50 EDT. Audience: Brad (environment / model service).
Status: **environment blocker — no product defect; no lane-side remedy available.**

## The blocker in one line

The QMS-6B integrated browser acceptance gate needs ~8+ fresh screenshots plus vision model calls spread
over several minutes against **appliance-2 `qwen3.6-35b-a3b`** (`http://appliance-2:11434/v1`). The
reviewer's model calls intermittently receive **`HTTP 503: Loading model`**, which aborts the whole run.
**Three consecutive attempts** have now died on exactly this, each ~10-15 minutes in.

## Attempt log (all lane-1, all identical terminal error)

| attempt | dispatch | process | log | outcome |
|---|---|---|---|---|
| 1 | 2026-10-04 09:25 | PID 3400103 | `~/.hermes/cl/lanes/1/qms-6b-browser-20261004T0925.log` | aborted ~09:50, `503 Loading model` |
| 2 | 2026-10-04 09:56 | PID 3459406 | `~/.hermes/cl/lanes/1/qms-6b-browser2-20261004T1005.log` | aborted ~10:09, same |
| 3 | 2026-10-04 10:22 | PID 3511252 | `~/.hermes/cl/lanes/1/qms-6b-browser3-20261004T1030.log` | aborted ~10:35, same (57-byte log) |

Run 3's receipts (`~/.hermes/cl/receipts/QMS-6B/2026-10-04_103500/`) hold trail.json + 25 shots and **no
verdict**; `BLOCKED-INFRA.md` in that dir documents it. Runs 1-2 similarly left partial receipts.

## Orchestrator probes — the endpoint looks HEALTHY when probed

Direct probes of the same endpoint, interleaved with the aborts:

- 10:21 EDT — text chat completion -> **200**; vision chat completion with an 8x8 PNG -> **200**
  (correctly answered "Red"), 0.56 s.
- 10:41 EDT — 6 rounds x (vision + text) -> **12/12 HTTP 200**, sub-second.
- 10:42 EDT — a **117 KB reviewer screenshot** (real shot from the aborted run) -> **200**, but
  **65.7 s** cold, then 5.8 s, then 0.8 s (encoder cache).
- 10:44 EDT — 3-way concurrency (long text generation + 2x the same 117 KB image) -> **all 200**,
  round-1 latencies 109 s / 89 s / 89 s, later rounds 14 s / 4 s / 3.5 s.

So the failure is **not reproducible from a quiet client** at any load level I can generate. The 503
windows correlate with the reviewer running for several minutes, not with any single request shape.

## Interpretation (evidence, not proof)

- `Loading model` is a **model (re)load in progress** response — the server is loading/evicting the
  model, not rejecting an oversized request.
- `/v1/models` on that server also advertises **`ornith-1.5-9b-mtp`** and **`ornith-1.0-9b`**. A shared
  server that swaps models would unload `qwen3.6-35b-a3b` when another client asks for a different model,
  producing exactly this 503 for the next 35B request. Whoever/whatever requests those models is not
  visible from lane 1.
- Cold latencies of 65-109 s for a fresh 117 KB image are ~4x the documented ~16 s/CPU-vision-encode
  baseline, which is consistent with the box being under heavy concurrent load during those windows.
- Consequence: "probe returns 200" is **not** a sufficient predictor of gate viability — the previous
  tick's resume condition ("re-dispatch once appliance-2 serves a vision request without 503") is now
  known to be insufficient, because the endpoint served cleanly immediately before AND after this abort.

## What lane 1 wants from Brad (one concrete question)

Please stabilise or confirm the intended steady state of appliance-2's inference serving for
`qwen3.6-35b-a3b`, or point lane 1 at an endpoint that will not reload/swap the model mid-gate.
Concretely, one of:

1. Pin `qwen3.6-35b-a3b` on appliance-2 so it is not evicted/swapped while other models
   (`ornith-*`) are requested by other clients; or
2. tell lane 1 which client is requesting the other models so the contention can be scheduled around; or
3. name an alternative vision endpoint for the QMS-6B gate.

**Constraint observed by the lane:** the orchestrator may not restart or reconfigure model services, so
no lane-side remedy is attempted.

## Meanwhile

- QMS-6B stays `todo`, environment-blocked, with the corrected re-dispatch brief prepared
  (`/tmp/qms6b-task4.txt` at the time of writing; contents summarised in the handoff) — ready to fire the
  moment the endpoint is stable.
- **This is NOT a product defect.** The partial trail's repeated password-fill failures are a reviewer
  harness bug (invalid Playwright selector), documented in the receipts dir; they must not be read as
  QMS-6B findings.
- Every QMS-6B alternative (and therefore QMS-7) is blocked on this. OPS-1's remaining trunk items are
  unaffected (separate cl-senior worker, thunderbeast).

## 2026-10-04 ~13:25 EDT update — failure mode CHANGED: the endpoint is now WEDGED, not 503ing

Attempts 1-6 saw intermittent `HTTP 503: Loading model`. The current state is different and worse:
**appliance-2's ollama `:11434` accepts TCP but never returns an HTTP response.**

- TCP connect to `100.69.173.99:11434` **succeeds** (`/dev/tcp` open) — the listener is up.
- `curl http://appliance-2:11434/v1/models` and `http://100.69.173.99:11434/v1/models` **time out
  (000) at 8s, 4/4 tries** at 13:20-13:22 — no HTTP bytes are ever sent.
- `ping 100.69.173.99` is clean (0% loss, ~8 ms) — host, network and the TCP listener are fine; the
  **HTTP/model-serving process is hung** (consistent with a model load that never completes, or a
  deadlocked ollama). Contrast `:22` (000 in 0.47 s = immediate refusal) with `:11434` (000 after the
  full timeout = accepted-then-silent).
- Sustained **≥1h45m** (attempt-6 reviewer PID 3692585 alive since 11:40, 0.2% CPU, session
  `20261004_114053_b479f8` last activity `waiting on qwen3.6-35b-a3b — 420s with no output`,
  219 msgs / 106 api calls, receipts `~/.hermes/cl/receipts/QMS-6B/2026-10-04_120000/` still EMPTY —
  no verdict, and none is possible).

**Consequence for the ask:** a wedged listener will **not** clear on its own and a client-side retry
budget (attempt 6's `api_max_retries=10`) cannot ride it out — this needs the **ollama service on
appliance-2 restarted**, beyond merely pinning the model. The one concrete question to Brad is unchanged
in shape but sharper: **restart appliance-2's ollama `:11434` serving `qwen3.6-35b-a3b`** (or name an
alternative vision endpoint).

**Note on `http://100.111.141.22:11434` (= computable itself):** it is reachable (200) but serves only
`ornith-1.5-9b-mtp` / `ornith-1.0-9b` — **no vision model, not a substitute** for the gate's
`qwen3.6-35b-a3b`. Do not mistake it for the gate endpoint.

**Lane-side remedy: none.** The orchestrator may not restart/reconfigure model services; the lane merely
records this and leaves attempt 6 running (not killed).

## 2026-10-04 ~14:22 EDT update — RECOVERED (13:41), re-dispatched, then DEGRADED AGAIN (14:20)

The endpoint's state changed materially at ~13:41: `/v1/models` returned 200 in ~7-16 ms (6/6 probes) and
advertised **only** `qwen3.6-35b-a3b` (the `ornith-*` models that implied eviction/swap were GONE), and a
real vision chat completion (image_url) returned 200 in 0.67 s. That met the blocker's resume condition, so
lane 1 re-dispatched the gate as **attempt 7** (cl-browser-reviewer PID 3989879/3989963, receipts
`~/.hermes/cl/receipts/QMS-6B/2026-10-04_140000/`).

Attempt 7 was the **most productive run yet** — it ran genuinely for ~25 min (97 tool calls, 93 api calls,
session `20261004_135549_fb7b07`, `browser_vision` + `browser_type` + a live headless chromium), i.e. it was
deep in the surfaces. But at ~14:20 the endpoint **flapped again**: 4 probes timed out (curl 000 at 6-8 s)
or were refused, while `ping 100.69.173.99` stayed clean (0% loss, ~4.6 ms). The reviewer is now blocked in
`waiting on qwen3.6-35b-a3b — 270s with no output`.

**Conclusion: the "recovered" window at 13:41 was real but NOT durable.** The instability is recurring and
time/load-correlated (this is the same wedged/hung-listener failure mode as attempt 6, reached after a
healthy start). This strengthens the ask: the ollama service on appliance-2 serving `qwen3.6-35b-a3b` needs a
**restart and a pin** (or an alternative, stable vision endpoint) before a multi-minute browser gate can
complete. `endpoint served a request without error` is again insufficient as a resume signal.

**Lane-side remedy: none.** Attempt 7 was left RUNNING at the checkpoint (not killed).

## 2026-10-04 ~15:19 EDT update — attempt 7 recovered again, made real progress, stalled again

Timeline (all orchestrator-observed, not worker claims):

- **13:55** attempt 7 dispatched (PID 3989879/3989963, session `20261004_135549_fb7b07`, candidate `e4c76142`).
- **~14:20** endpoint flapped; reviewer stalled at 191 msgs / 93 api calls.
- **14:40–14:48** endpoint healthy again: `/v1/models` 200 in ~13 ms (only `qwen3.6-35b-a3b`); a real TEXT
  completion 200 in 9.3 s. Reviewer at `error retry backoff (8/10)`.
- **~14:49–15:07** endpoint degraded again: text completion 000 (60 s), a real VISION completion with a
  29 KB PNG 000 (120 s), `/v1/models` 000 (10 s) — while `ping 100.69.173.99` stayed clean (0% loss,
  ~2.3 ms). Reviewer rode backoff 9/10.
- **15:08–15:09** endpoint recovered a third time and the reviewer **resumed and advanced** — messages
  191 → 207, api calls 93 → 101. This is genuine forward progress (5 new tool calls).
- **15:09–15:19** stalled again at 207 msgs; `/v1/models` 000 (8 s) at 15:19.

Net: over ~84 min the endpoint oscillated healthy↔dead at least four times. Attempt 7 is the deepest run
ever (207 msgs / 101 api calls, live chromium, real `browser_vision`/`browser_type`) but has written **zero
receipts** (`~/.hermes/cl/receipts/QMS-6B/2026-10-04_140000/` still empty — no report.md, no shots). No
verdict. It is left RUNNING (not killed); if the endpoint stabilises it may still finish.

**Conclusion unchanged and now sharper: the appliance-2 `qwen3.6-35b-a3b` service is not stable across a
multi-minute browser gate.** No lane-side remedy exists (the lane may not restart/reconfigure model
services). `endpoint served a request without error` is again disproven as a resume signal.

### Options for Brad (pick one; the lane cannot)

1. **Restart + pin** appliance-2's ollama `:11434` serving `qwen3.6-35b-a3b` (best). A pin that refuses
   model swaps/eviction is what the oscillation points to.
2. **Name a stable alternative vision endpoint** the lane may use for `cl-browser-reviewer`.
3. **Authorise a reduced gate**: a DOM/API-only browser review (Playwright text assertions + the three
   D6-D9 API probes) with no screenshots — most of the 11 surfaces are structural, but this **drops the
   vision requirement** and is a methodology change, so it needs your explicit approval (and ideally the
   architect's).
4. **Authorise a paid vision endpoint** (e.g. the openrouter qwen-VL used by `vision_analyze`) for the gate.

Until one is chosen, lane 1 will not dispatch an 8th attempt.

## 2026-10-04 ~15:48 EDT update — the VISION path specifically is hung (text still works); no fleet alternative

This tick separated the two code paths on the same endpoint, at the same moment. That is the new, decisive
evidence:

- **15:41** `GET /v1/models` -> **200** in 4-8 ms (3/3 probes), advertising only `qwen3.6-35b-a3b`.
- **15:41** **TEXT** chat completion (`"Say OK"`, max_tokens 20) -> **200** in **10.7 s**, content `"OK"`.
- **15:42** **VISION** chat completion (a 64x64 PNG, `image_url`, max_tokens 30) -> **curl 000 after a 90 s
  timeout** — no HTTP response at all. The request never returns.
- **15:47** `GET /v1/models` on the same endpoint -> **000** again (8 s / 4 s). So the endpoint went
  healthy -> text-ok/vision-hung -> fully-unreachable inside **six minutes**.

**Reading:** the gate's blocker is the *multimodal* path. `qwen3.6-35b-a3b` is advertised with
`capabilities: ["completion","multimodal"]`, and plain text generations succeed, but any request carrying an
image hangs the serving process until the listener stops answering. Every reviewer attempt dies at its first
`browser_vision` screenshot call — which is exactly why attempts 1-7 got deep into the surfaces (text-only
navigation) and then wrote **zero receipts** (receipts are written after the vision calls).

**Fleet sweep (this tick) — option 2 has no candidate:** no other reachable node serves a vision-capable model.
`thunderbeast:8080` = `qwen3.8-flash-next` (text), `computable:11434` = `ornith-1.5-9b-mtp` /
`ornith-1.0-9b` (text, no vision), `computable:8080` = `spark-4b-thinking` (text). `appliance-01` and
`bobbert` answered nothing on `:11434`/`:8080`. So an alternative vision endpoint would have to be *supplied*
(paid/remote), not merely re-pointed.

**Attempt 7 status at this checkpoint:** ALIVE (1 h 50 m), session `20261004_135549_fb7b07`, 209 msgs /
106 tool calls / 102 api calls, cycling `waiting on qwen3.6-35b-a3b — 240s with no output`; receipts
`~/.hermes/cl/receipts/QMS-6B/2026-10-04_140000/` **still 0 files**. Left RUNNING (not killed).

**Sharpened options** (options 1/3/4 from above are unchanged; option 2 is now known to need a supplied
endpoint, not an existing one):

1. **Restart + pin** appliance-2's ollama `:11434` for `qwen3.6-35b-a3b` — and confirm the **vision/`mmproj`
   projector** loads, since text works while images hang (a pin alone may not fix a hung multimodal path).
2. **Supply** an alternative vision endpoint (none exists in the fleet today).
3. **Authorise the reduced gate**: DOM/API-only review (Playwright text assertions + the three D6-D9 API
   probes) with no screenshots — drops the vision requirement; needs Brad's explicit approval.
4. **Authorise a paid vision endpoint** (e.g. the openrouter qwen-VL behind `vision_analyze`) for the gate.

The reviewer profile's `model` and `vision` blocks both point at `http://appliance-2:11434/v1`
(`~/.hermes/profiles/cl-browser-reviewer/config.yaml`), so options 2/4 are a config re-point plus (for 4)
a spend decision — both Brad's call, not the lane's.

## Appendix — if you pick option 3, here is exactly what a vision-free gate would and would not prove

*Written by the lane as decision support only. It is NOT dispatched and NOT a claim that option 3 is
sufficient: dropping vision is a methodology change to the campaign's acceptance criteria, so it needs your
explicit approval (and ideally the architect's). Nothing below has been executed.*

A DOM/API-only run would still be Playwright-driven against `:5192` — it would assert element presence,
text content and non-emptiness, plus API read-back; it would simply stop taking screenshots and remove the
`browser_vision` calls that are hanging the endpoint.

Proveable WITHOUT vision (structural assertions + API read-back):

| surface | vision-free evidence |
|---|---|
| 1 editor sections/fields/body | DOM: the three section headings + one `<input>`/`<textarea>` per declared slot, `.tiptap`/`contenteditable` for `body`; edit→save→reload→reopen proven by `GET /records/DOC-DEMO-SOP` payload read-back |
| 2 budget sections | DOM on `BUD-DEMO-LANE1` (header-summary / line-items / notes) |
| 3 CAL-DEMO-GC fallback | DOM: every declared field present, zero `[data-testid*="lifecycle"]` nodes |
| 4 TRR-DEMO-1 regression | DOM: zero lifecycle nodes |
| 5 wrong password | DOM text of `[data-testid="signature-modal-error"]` + `GET /records` state still `in_review` |
| 7 approve → approved | DOM receipt text (snapshot id/hash) + API: `GET /records/DOC-DEMO-SOP/revisions`, the SIG record, the audit event |
| 9 orphan SIG | DOM: orphan row present, never in the applied set |
| 10 lock + draft-copy | DOM: Save replaced by draft-copy; new draft opens; API: original byte-identical, copy has `derivedFromRevisionRef` and no inherited reviewer/approver/signatureRefs |
| 11 revision readout | DOM text vs `GET /records/:id/revisions` count |
| 3 API probes | unchanged — pure API |

NOT proveable without vision, and honestly weaker even with it — say so in the verdict:

- **Layout/visibility truth**: DOM presence ≠ visibly rendered. The round-3 defect was a *blank* editor whose
  sections existed in the DOM; a DOM-only gate can catch that only via emptiness heuristics (no child nodes /
  zero text), not by seeing it. This is the single biggest loss and the reason option 1/2/4 are preferred.
- Surface 6 (same-person denial) needs a credential for the **author** — the transition's guard is
  `requires_different_person: author` and `DOC-DEMO-SOP.authorRef` is `USR-BRAD`, so approving *as*
  `USR-BRAD` is what would trigger the denial; the current single-`qms-admin` plan cannot exercise it, with
  or without vision. That is a separate credential question the lane would need you to settle. (Surface 8
  does NOT have this problem — `approved→effective` carries only `requires_signature`, so `USR-QMS-ADMIN`'s
  approver role covers it.)
- Any "renders correctly / not visual garbage" claim.

Minimum viable shape if approved: keep the 11 surface *assertions* above, mark every vision-dependent clause
`blocked (methodology)`, and report `VERDICT: accept-with-exception` rather than a clean accept — the lane
will not report an unexercised visual clause as passing.


## 2026-10-04 ~16:10 EDT — lane-1 cron tick update: the endpoint is now FULLY down (attempt 7 still live)

- **Endpoint now fully unreachable, not just multimodal-broken.** 16:00 EDT probes: `GET :11434/v1/models`
  -> 000/6s; a **TEXT** chat completion (`"Say OK"`, max_tokens 10) -> **000/25s**; a **VISION** chat
  completion (1x1 PNG, 60s cap) -> timeout at 60s. The 15:45 finding (text OK / images hang) has degraded to
  no-HTTP-at-all; `ping 100.69.173.99` stayed clean. The failure is now total, so the "multimodal path only"
  framing from 15:45 no longer applies.
- **QMS-6B attempt 7** (cl-browser-reviewer PID 3989963, session `20261004_135549_fb7b07`) is ALIVE at
  **2h10m**, 209 msgs / 106 tool calls / 102 api calls, last activity `waiting on qwen3.6-35b-a3b — 240s with
  no output`; receipts `~/.hermes/cl/receipts/QMS-6B/2026-10-04_140000/` still **0 files**. Left RUNNING —
  not killed, not re-dispatched.
- **Vision-independent progress made this tick (non-mutating orchestrator verification):** the live D6-D9
  contract surface on :3092 is mounted and gated — `GET /records/DOC-DEMO-SOP/revisions` -> 200;
  `POST /signatures` (empty body) -> 400; `POST /signatures` (wrong password) -> 403 `REAUTH_FAILED`. The
  three rejection tokens (`STALE_SIGNATURE` 409, `SIGNED_CONTENT_CHANGED` 409, `SIGNATURE_TARGET_MISMATCH`
  422) are all reachable in the `PUT /records/:id` path, traced at
  `server/src/api/handlers/RecordHandlers.ts:741-754` (order: SIGNATURE_REVISION_REQUIRED -> STALE_SIGNATURE
  -> SIGNED_CONTENT_CHANGED -> SIGNATURE_TARGET_MISMATCH).
- **Surface-6 credential gap is probably LANE-RESOLVABLE, not a Brad turn:** `USR-BRAD` (the lane's fallback
  identity, and `DOC-DEMO-SOP.authorRef`) resolves as a *concrete* non-system actor — `x-user-id: USR-BRAD` on
  `POST /signatures` returned 403 `REAUTH_FAILED`, i.e. it PASSED the 401 "no concrete user" check — so it can
  mint its own lane-local password via the self-service `POST /auth/set-password` and log in. NOTE/TO-VERIFY at
  gate time: the `in_review -> approved` transition ALSO requires the **reviewer** role; whether a
  USR-BRAD-as-author denial probe reaches the `requires_different_person: author` guard or is stopped first by
  a role check (403) is NOT yet verified — if role gating preempts it, the lane user would need the reviewer
  role granted (a lane fixture change, not product code). No Brad turn needed either way for the *credential*.
- **CORRECTION to the caveat above (same tick, code-traced):** role gating does NOT preempt the
  `requires_different_person` guard by default — `RecordHandlers.ts:776` reads
  `enforceTransitionRoles = (security?.getPolicySettings?.().enforceTransitionRoles ?? 'allow') === 'deny'`,
  i.e. transitions are role-enforced ONLY when policy explicitly says `deny`. So a USR-BRAD-as-author denial
  probe on `in_review -> approved` should reach the different-person guard without any fixture role change
  (verify live at gate time). Also note the signature-integrity checks run BEFORE the lifecycle/role guard,
  so the three D6-D9 tokens are reachable even on a role-denied or invalid transition.
