# QMS-7b — bounded FIX RUN: item 10 → API-driven POL-REGULATED lap + receipt mapping

Task: QMS-7 (same item; fresh run id `qms-7b-lane1-20261004T1255`) · campaign light-qms-records-browser · lane 1
Authored by the lane-1 orchestrator tick 2026-10-04T1255. DOCS-ONLY. Nothing here may be claimed as passing
until QMS-6B returns VERDICT: accept.

## Why this fix run exists

The QMS-7 doc-draft run (`fd25b242`, branch `wt/qms-7-lane1-20261004T1110`, report
`/home/brad/.hermes/cl/lanes/1/qms-7-report-20261004T1110.md`) is ACCEPTED as a base: +291/-0, all 12 items
present, corrections note present, and its own divergence flag is correct. Its defect: **item 10 was written
from the PRE-amendment spec** — it still drives the POL-REGULATED switch through the Settings selector and
labels `qms-bundle-restored.png` as a Settings-page screenshot.

The architect decision (option (a)) and the amended spec
(`.hermes/plans/2026-10-04_qms7-ui-runbook-regulated-lap-spec.md`, §"Architect decision applied", item 10)
require the **selection/restore to use `PATCH /api/config`**, the selector recorded as a known defect, and the
receipts re-mapped. This run applies ONLY that delta.

## Exact delta to apply (nothing else)

Edit `docs/qms-manual-testing-cheatsheet.md` (the `## UI-first runbook (2026-10-04, lane 1)` section ONLY;
leave the legacy 2026-09-27 sections and the corrections list as-is except as noted in D3).

**D1 — item 10 step 1 becomes the API switch.** Replace the "click the Regulated bundle in /settings" selection
step with:
```bash
# SELECT the regulated bundle via the WORKING api path (no restart; live per-request)
curl -s -X PATCH http://localhost:3092/api/config \
  -H 'content-type: application/json' -H 'x-user-id: USR-QMS-ADMIN' \
  -d '{"lab":{"policyBundleId":"POL-REGULATED"}}'
# VERIFY — GET /api/config, NOT /settings/lab (the latter serves a boot snapshot)
curl -s -H 'x-user-id: USR-QMS-ADMIN' http://localhost:3092/api/config   # → lab.policyBundleId == "POL-REGULATED"
```
Keep the existing accurate caveats: this route has NO auth gate on this trunk (no `POLICY_BUNDLE_CHANGE_FORBIDDEN`,
no `policy_bundle_changed` audit — verified absent in `server/src`); the Settings selector is a recorded defect
(keep the existing divergence note / known-defect paragraph; it is correct).

**D2 — item 10 step 5 RESTORE via the same API path.** Replace the "/settings → Sandbox" restore with the same
`PATCH /api/config -d '{"lab":{"policyBundleId":"POL-SANDBOX"}}'` (read `GET /api/config` FIRST to capture the
pre-lap value and restore to THAT, never hardcode), verified via `GET /api/config`. Keep "restore even if the
lap fails; never leave the bundle changed".

**D3 — receipt mapping note (architect item 2).** Add/keep an explicit line telling the reviewer:
`qms-regulated-bundle-selected.png` and `qms-bundle-restored.png` are captures of the **`GET /api/config` JSON**
showing `lab.policyBundleId` (terminal/JSON view), **NOT** Settings-page shots — after an API switch the Settings
display is a stale boot snapshot (`server.ts:817` vs `:1248`) and the selector is a defect; a Settings-page shot
showing POL-SANDBOX is NOT a failed lap. `qms-regulated-denial.png` remains a **UI screenshot** of the observed
denial (the browser denial in step 4 is unchanged and stays in the doc).

**D4 — corrections note (spec item + architect item):** ensure the corrections list states that legacy §1
"Bundle switching — admin-gated" describes **unimplemented** behaviour on this trunk (no gate / no 403 token /
no audit in code) and points to the `PATCH /api/config` path. Do not rewrite §1 itself.

Do NOT change: step 2 (actor switch to USR-BRAD), step 3 (permissive-preview), step 4 (the 422
LIFECYCLE_TRANSITION_DENIED UI denial) — these are already correct. Do NOT touch code, YAML, or other sections.
Do NOT claim fixing `patchLabSettings` makes `tsc` clean.

## Hard boundary (unchanged)

DO NOT mutate lane state: a QMS-6B browser gate is RUNNING against `:3092`/`:5192` and the lane data dir. Read-only
GET probes only (you do NOT need to run the lap — document it). Do NOT restart the lane stack. Docs only.
Do NOT merge.

## Deliverable

`docs/qms-manual-testing-cheatsheet.md` — the item-10 delta only. Commit on your branch with a message naming
this as the item-10 API-lap fix. Working tree clean after commit.

REPORT (unique path — write EXACTLY this):
`/home/brad/.hermes/cl/lanes/1/qms-7b-report-20261004T1255.md`

End your FINAL message with:
`STATUS: done` (or `STATUS: blocked`)
branch commit sha; the file changed (+/- lines); which of D1-D4 you applied; and, if blocked, the structured
blocker fields (blocker_kind/owner/portion/evidence/completed/independent_work/recommendation/resume_condition).
