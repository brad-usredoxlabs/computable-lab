# ARCHITECT DECISION — lane 1 · QMS-7 · policy-bundle selector unwired

Date: 2026-10-04 (EDT) · Decision owner: architect (per QMS-7 stop boundary: "unusable selector -> architect")
Request: `.hermes/plans/2026-10-04_lane1-qms7-bundle-selector-unwired-decision-request.md`
Task list: NOT edited. Product code: NOT modified. QMS-7 spec file: NOT modified (amendments below are for the orchestrator to apply). Stacks: NOT restarted.

## DECISION: (a) — amend QMS-7 to an API-driven bundle lap; record the Settings selector as a known defect.

Plus: a NEW scope-amendment proposal for Brad to wire the selector properly as a *separate task* (text at the
bottom). (b) is rejected as a *QMS-7 in-scope amendment* — it is new product scope whose core question (who is
authorised to change the lab's compliance bundle, and where the gate lives) is a domain-intent decision that
belongs to Brad, not an execution clarification the architect can settle from code. (c) is rejected because the
acceptance criterion (regulated denial reproduced from the doc, bundle restored) remains fully achievable once
the *selection step* moves to the working API; descoping would discard a verifiable campaign row.

## Verification of the request's evidence (architect re-ran, not taken on faith)

All request claims CONFIRMED on `cl/integration-1` @ /mnt/vast/home/brad/git/cl-integration-1:

1. `apiClient.patchLabSettings` — repo-wide grep over `app/src` + `server/src`: exactly ONE occurrence, the
   call site `app/src/shell/SettingsPage.tsx:96`. No definition. Selector dead; live alert + no bundle change
   (orchestrator browser run) is consistent with the code.
2. Server: `routes.ts:592` registers ONLY `GET /settings/lab`. No PATCH. `PATCH /api/config` exists
   (`routes.ts:849`) and merges `lab` (`configHandlers.ts:314-322`); it writes `config.yaml`
   (`writeConfigYaml`, configHandlers.ts ~:353) and reassigns `ctx.appConfig` via `onConfigUpdate`
   (`server.ts:1248`). Enforcement reads the bundle LIVE per request (`server.ts:714` — explicit comment
   "resolve the bundle id per call"), so a PATCH /api-config bundle switch takes effect immediately. This IS
   the working path.
3. `POLICY_BUNDLE_CHANGE_FORBIDDEN` / `policy_bundle_changed`: grep over `server/src` + `app/src` → **zero
   matches** (RC=1). Docs-only, exactly as the request states. Cheatsheet §1 (verified at :25-36) describes an
   admin gate + 403 token + audit that do not exist on this trunk.
4. `PATCH /api/config` has **no auth gate and no preHandler** anywhere in `routes.ts` (grep: no
   preHandler/addHook/onRequest for this path; `authorizationService` never appears in routes.ts).

Architect ADDS two findings the request did not have:

5. **`GET /settings/lab` returns a BOOT SNAPSHOT, not live config.** `createLabSettingsHandlers(ctx.appConfig, ...)`
   (`server.ts:817`) captures the appConfig object by reference; `onConfigUpdate` *reassigns*
   `ctx.appConfig = updated` (`server.ts:1248`) and `ConfigHandlers` holds its own copy (`configHandlers.ts:362`).
   Therefore after an API-driven bundle switch, `GET /api/settings/lab` (and the Settings page display, which
   loads via `getLabSettings`, `SettingsPage.tsx:77-90`) will keep showing the OLD bundle until a server
   restart. The policy ENFORCEMENT is live; only this read-back surface is stale. Consequence for the lap:
   **verify the bundle via `GET /api/config` (`config.lab.policyBundleId`), never via `GET /settings/lab`.**
6. `SettingsPage.tsx(96,39) TS2551` is real but is **not the trunk's only pre-existing tsc failure** —
   `npx tsc --noEmit` on `app/` currently emits many unrelated errors (event-editor tests, deck-lock fields,
   etc.), and `app/package.json` build is `tsc && vite build`, so the app build is already failing on this
   trunk independent of QMS-7. Do not let anyone claim "fixing patchLabSettings makes tsc clean" — it does not.

## Rationale

- **The intent question is Brad's, not mine.** The docs (§1) assert an admin-gated bundle switch; the code has
  no gate, no dedicated route, and no audit; and the same docs are *provably stale elsewhere* (`:3001` header,
  `USR-LOCAL-ADMIN` — flagged stale in the QMS-7 spec itself). One half-truth per source is not enough to
  declare which is the contract. The selector being mounted is evidence someone intended it to work, but the
  *correct* fix is not just wiring the button: the docs' promise is an **admin-gated, audited** change, and a
  gate on a new `PATCH /settings/lab` route would be **cosmetic while the fully-ungated `PATCH /api/config`
  remains the actual write path**. Deciding actor semantics + which route gets the gate is domain policy → Brad.
- **(a) costs nothing in acceptance integrity.** The acceptance cares that an independent reviewer, following
  the doc alone, (i) selects POL-REGULATED, (ii) observes the under-granted denial, (iii) restores the bundle.
  (ii) is UI-first and stays UI-first — the denial is observed in the product surface. Only the *selection
  step* moves to `PATCH /api/config`, which is the honest working path. "UI-first" for the QMS flows is
  preserved; the campaign records the selector as dead chrome per Brad's standing rule instead of silently
  routing around it.
- **(a) keeps QMS-7 docs-only** (its declared file list), honors the stop boundary, and does not leave the
  bundle changed: the same PATCH with `POL-SANDBOX` restores it, verifiable via `GET /api/config`.
- **QMS-6B still gates the final claims** — unchanged by this decision.

## Exact amendments to the QMS-7 spec (orchestrator applies; architect does not edit the spec file)

The spec's "Verified orientation anchors" were already corrected at tick 20261004T1100 (bundle-switch API vs
UI-defect blocks at :28-42). Remaining amendments:

1. **Deliverable item 10 — rewrite as:**
   "POL-REGULATED lap: switch the bundle with
   `PATCH /api/config -H 'content-type: application/json' -d '{"lab":{"policyBundleId":"POL-REGULATED"}}'`
   against `:3092` (the working path; NOTE it has no auth gate on this trunk — the doc must NOT claim the §1
   403 `POLICY_BUNDLE_CHANGE_FORBIDDEN` or the `policy_bundle_changed` audit as current behaviour; mark §1 as
   aspirational in the corrections note). Verify the switch with `GET /api/config` →
   `config.lab.policyBundleId == POL-REGULATED` — do NOT verify via `GET /api/settings/lab`, which serves a
   boot-time snapshot (`server.ts:817` vs reassignment at `:1248`) and will keep showing the old bundle until
   restart. Then the UI lap: under-granted actor denied despite a permissive preview button. Then RESTORE with
   the same PATCH using `POL-SANDBOX` and verify via `GET /api/config`."
2. **Acceptance/receipt mapping — add:**
   `qms-regulated-bundle-selected.png` and `qms-bundle-restored.png` are captures of the
   `GET /api/config` response showing `lab.policyBundleId` (terminal/browser JSON view), NOT screenshots of the
   Settings page — the Settings page display is stale-snapshot after an API switch and the selector itself is a
   recorded defect. `qms-regulated-denial.png` remains a UI screenshot of the observed denial. The doc must
   tell the reviewer this so they do not produce a Settings-page shot that shows POL-SANDBOX and think the lap
   failed.
3. **Known-defect record (doc's UI-first section, item 10) — state precisely:** the Settings policy-bundle
   selector is non-functional on this trunk — clicking a bundle fires
   `alert("Failed to update policy bundle: apiClient.patchLabSettings is not a function")` and the bundle does
   not change; cause: `SettingsPage.tsx:96` calls `apiClient.patchLabSettings`, which is not defined on
   `apiClient` (`client.ts:1922`; only `getLabSettings` at `:2867`); `tsc` reports
   `TS2551 ... Did you mean 'getLabSettings'?`; there is no server `PATCH /settings/lab` route
   (`routes.ts:592` is GET-only); additionally `GET /settings/lab` serves a boot snapshot and will not reflect
   an API-driven bundle change. A proper fix is proposed as a separate scope amendment for Brad
   (`2026-10-04_lane1-qms7-bundle-selector-decision.md`, section "Scope amendment proposal for Brad").
4. **Corrections note:** §1 "Bundle switching — admin-gated" describes unimplemented behaviour (no gate, no
   403 token, no audit in code); the corrections note must say so explicitly and point to the API path above.
5. **Dispatch note for the in-flight doc-draft worker** (cl-senior PID 3637352, briefed from the old anchor):
   steer it with this decision — item 10 text, the receipt mapping, and the `GET /settings/lab` staleness
   warning. No spec anchor change beyond the above.

## Scope amendment proposal for Brad (NEW task, NOT enqueued — Brad approves first)

Working id `QMS-8 / WIRE-BUNDLE-SELECTOR` (lane 1). Restores the cheatsheet §1 promise as real behaviour.

- **Client:** add `patchLabSettings` to `apiClient` (`app/src/shared/api/client.ts`) calling
  `PATCH /api/config` with `{"lab":{"policyBundleId": id}}` (or a new gated route — Brad's call, see gate
  question below); update the Settings page so the selector reflects the live value.
- **Server:** make `GET /settings/lab` live (replace the boot snapshot `server.ts:817` with the established
  `getAppConfig: () => ctx.appConfig` accessor pattern already used by vendor handlers), and add the §1 gate:
  admin-only bundle change → `403 {code: POLICY_BUNDLE_CHANGE_FORBIDDEN}` + audit event
  `policy_bundle_changed {from,to}`.
- **Brad must decide (why this is his, not the architect's):**
  1. Is the selector intended-to-work, admin-gated (docs §1), or is `PATCH /api/config` the intended switch
     and the selector aspirational? (Product intent; code and docs disagree.)
  2. Who is "admin" for a compliance-bundle change — `USR-QMS-ADMIN`, a role, or nothing (no gate)?
  3. Is gating the UI path acceptable while `PATCH /api/config` — the actual write path — stays fully
     ungated, or must the gate sit inside `configHandlers.patchConfig` itself (bigger change, touches every
     Settings save)? A gate outside the real write path is cosmetic.
- **Est. shape:** server route/handler + client method + one Settings-page state fix + tests; docs §1 becomes
  true. QMS-7 does NOT wait on it under decision (a).

DECISION: a
Decision file: /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-04_lane1-qms7-bundle-selector-decision.md
