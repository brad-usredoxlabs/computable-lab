# Architect decision request — QMS-7's POL-REGULATED lap is not executable: the UI policy-bundle selector is unwired (lane 1)

Task: QMS-7 (light-qms-records-browser, lane 1) · raised by the lane-1 orchestrator tick 20261004T1100
Date: 2026-10-04 ~11:35 EDT · blocker_kind: architecture · decision owner: architect (then Brad if scope changes)

## One-line question

QMS-7's acceptance requires the **Settings policy-bundle selector** to switch the lab to `POL-REGULATED`.
That selector is **not wired** on this trunk. Decide: (a) amend QMS-7 to drive the bundle switch via the
working API (`PATCH /api/config`) and document the selector as a known defect, (b) authorise an in-scope
repair of the client method + a server route, or (c) descope the UI lap to a new campaign item.

## Evidence (all orchestrator-verified this tick, not worker claims)

1. **Dead UI handler (compile error + live failure).**
   - `app/src/shell/SettingsPage.tsx:96` calls `apiClient.patchLabSettings({ policyBundleId: bundleId })`.
   - `apiClient` is a plain object literal (`app/src/shared/api/client.ts:1922 export const apiClient = {`,
     typed `export type ApiClient = typeof apiClient`). It has `getLabSettings()` (`client.ts:2867`) but
     **no `patchLabSettings`** anywhere in the repo (repo-wide grep: exactly ONE occurrence — the call site).
   - `npx tsc --noEmit` (app): `src/shell/SettingsPage.tsx(96,39): error TS2551: Property 'patchLabSettings'
     does not exist … Did you mean 'getLabSettings'?`
   - Live on `:5192/settings` (orchestrator browser run): clicking the **Regulated** bundle button fires
     `alert("Failed to update policy bundle: apiClient.patchLabSettings is not a function")` and the
     bundle does **not** change (`GET /api/settings/lab` → `{"policyBundleId":"POL-SANDBOX","activePolicyBundle.id":"POL-SANDBOX"}`
     before and after). This is "dead chrome" by the standing rule.

2. **No server-side counterpart.**
   - `server/src/api/routes.ts:592` exposes only `GET /settings/lab` (`labSettingsHandlers.getLabSettings`);
     no PATCH/PUT lab-settings route exists.
   - `PATCH /api/config` exists (`routes.ts:849` → `configHandlers.patchConfig`) and DOES merge
     `lab.policyBundleId` (`configHandlers.ts:314-322`); it has **no authorization gate and no preHandler**
     (grep `preHandler|addHook|onRequest` in routes.ts → none for this path).
   - `POLICY_BUNDLE_CHANGE_FORBIDDEN` and the audit token `policy_bundle_changed` appear **only in docs**
     (`docs/qms-manual-testing-cheatsheet.md:32,35`) and in the QMS-7 spec (:30-31) — **zero occurrences in
     `server/src` or `app/src`**. The cheatsheet's §1 "Bundle switching — admin-gated" section therefore
     describes behaviour that is not implemented on this trunk.

## Why this blocks QMS-7

QMS-7 acceptance (verbatim): "independent reviewer follows ONLY the doc: … regulated denial observed, bundle
restored; shots qms-regulated-bundle-selected.png, qms-regulated-denial.png, qms-bundle-restored.png". The
lap's first step — switch the bundle via the Settings selector — cannot succeed. QMS-7's stop_boundary says
exactly this is an architect call ("unusable selector -> architect. Never weaken policy YAML").

## Options (with consequences)

- **(a) Amend QMS-7 (recommended).** Keep QMS-7 docs-only. Re-specify the lap as: switch the bundle with
  `PATCH /api/config {"lab":{"policyBundleId":"POL-REGULATED"}}` (documented as the working path), then
  exercise the under-granted-actor denial, then RESTORE. Document the Settings selector as a **known
  defect** (with the exact alert text + TS error) in the UI-first section and in the "corrections to the
  2026-09-27 sections" note. No product code; no scope amendment. Consequence: QMS-7's browser lap partially
  rewrites the campaign's "UI-first" premise for this one control; the defect is recorded, not fixed.
- **(b) Authorise an in-scope repair.** Add `apiClient.patchLabSettings` + a server `PATCH /settings/lab`
  route (ideally with the admin gate + `policy_bundle_changed` audit the docs already claim). This is NEW
  product scope (not in QMS-7's file list: docs-only) → requires an architect amendment AND Brad's approval.
  Consequence: a new small task; QMS-7 waits on it.
- **(c) Descope the UI lap.** Ship the runbook + API-driven denial documentation; move "wire the bundle
  selector" to a future campaign. Consequence: the campaign's last unverified policy row stays unverified
  in the UI.

## Exact uncertainty

Whether the product INTENT is that the Settings bundle selector be a working, admin-gated control (making
this a bug to fix) or whether the API-driven `PATCH /api/config` is the intended switch and the selector is
early/aspirational UI. The docs' §1 (aspirational admin-gated 403) vs the code (no gate, no route) disagree;
the architect/Brad owns which is true.

## Recommended smallest next action

Adopt (a) for QMS-7 now (unblocks the docs-only deliverable and truthfully records the defect), and record a
separate one-line campaign item for (b). If the architect judges the selector is intended-to-work, return
(b) as a concrete scope amendment for Brad.

## Lane state carried

- QMS-7 doc-draft is running (cl-senior PID 3637352, worktree `/mnt/vast/home/brad/git/wt/qms-7-lane1-20261004T1110`),
  instructed to mark QMS-6B-dependent claims provisional; it was briefed from the OLD (wrong) spec anchor.
- QMS-6B remains environment-blocked (4th appliance-2 vision abort) and escalated to Brad.
