# Lab Splash Page Navigation Fix Plan

## Root Causes

### Bug 1: Material links send to /protocols
**File:** `app/src/collections/LabCollectionView.tsx:89`
**Code:** `onClick={() => navigate(`/lab/${record.recordId}`)}`
**Problem:** Navigates to `/lab/MAT-001`, which matches route `/lab/:category` (with category="MAT-001"). Since "MAT-001" doesn't match any known category, it defaults to the first category ("protocols"). The LabCollectionView re-renders showing protocols instead of the material.
**Fix:** Include the active category in the URL: `navigate(`/lab/${activeCategory}/${record.recordId}`)` → e.g. `/lab/materials/MAT-001`

### Bug 2: Protocol links go nowhere
**Same root cause as Bug 1.** Protocol records navigate to `/lab/PROTO-001`, which matches `/lab/:category` and defaults to showing the protocols list again (infinite loop, looks like nothing happened).
**Fix:** Same as Bug 1 — include category: `/lab/protocols/PROTO-001`

### Bug 3: Run links show "Study ID or run ID is missing"
**File:** `app/src/run/RunWorkspacePage.tsx:22-28`
**Code:** `const { studyId, runId } = useParams()` then `if (!studyId || !runId)` → error
**Route:** `/runs/:runId` (App.tsx:127) — only provides `runId`, NOT `studyId`
**Problem:** RunWorkspacePage expects BOTH `studyId` and `runId`, but the `/runs/:runId` route only provides `runId`. The `studyId` is undefined, triggering the error.
**Fix:** Make `studyId` optional in RunWorkspacePage — fetch it from the run record if not in the URL. The run record's payload has `studyId` field.

### Bug 4: /protocols redirects to / (welcome page)
**File:** `app/src/event-editor/legacyRouteResolution.ts:resolveLegacyModeRoute()`
**Code:** `return { target: '/' }`
**Problem:** The `/protocols` route redirects to `/` which redirects to `/projects`. This is intentional legacy redirect behavior, but it means any link pointing to `/protocols` bounces the user away.
**Note:** This is not directly a Lab page bug — it's a side effect of Bug 1 (material links landing on `/lab/MAT-001` → defaults to protocols category → doesn't navigate away, just shows protocols list).

## Fixes

### Fix 1: LabCollectionView — include category in entity URLs
**File:** `app/src/collections/LabCollectionView.tsx`
**Change:** Line 89: `navigate(`/lab/${record.recordId}`)` → `navigate(`/lab/${activeCategory}/${record.recordId}`)`

### Fix 2: RunWorkspacePage — make studyId optional, resolve from run record
**File:** `app/src/run/RunWorkspacePage.tsx`
**Change:** When `studyId` is not in the URL (route `/runs/:runId`), fetch the run record to get its `studyId`. If the run has no studyId, fall back to `STU-scratch`.

### Fix 3: RunCollectionView — navigate to correct route
**File:** `app/src/collections/RunCollectionView.tsx:275`
**Current:** `onNavigate(`/runs/${run.recordId}`)` — this IS correct for the `/runs/:runId` route
**Issue:** The RunWorkspacePage component doesn't handle the missing studyId. Fix 2 addresses this.

## Verification

After fixes:
1. `/lab` → click a material card → navigates to `/lab/materials/MAT-001` → LabEntityWorkspace renders
2. `/lab` → click a protocol card → navigates to `/lab/protocols/PROTO-001` → LabEntityWorkspace renders
3. `/runs` → click a run → navigates to `/runs/RUN-001` → RunWorkspacePage fetches studyId from run record → renders
