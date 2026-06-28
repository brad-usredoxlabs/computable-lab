# Chaos-Mode Browser Review: Splash Page Search

**Task:** t_a03e5eb3
**URL:** http://computable:5174
**Date:** 2026-06-27
**Scope:** Search Projects popover - stress and error conditions

## Executive Summary

11 test steps executed against the StudyPickerPopover search component.
Found **2 bugs** (1 medium, 1 high) and **1 code quality issue**.

| Severity | Count |
|----------|-------|
| Critical | 0     |
| High     | 1     |
| Medium   | 1     |
| Low      | 0     |

## Test Results

### Step 1: Navigate to splash page - PASS
Landed at http://computable:5174 successfully. Search Projects button visible and functional.

### Step 2: Very long query (500+ chars) - FAIL (Medium)
**Bug:** The "No studies match - create" button renders the full 500+ character query as its text content with no truncation. While the input field handles overflow via scrolling, the button text is unbounded.

**Steps:** Type 500+ 'a' characters into search.
**Expected:** Query truncated with ellipsis in button text.
**Actual:** Full query rendered as button text: `No studies match — create "aaaaa..."`
**Code:** StudyPickerPopover.tsx line 227-228 - no truncation of `query.trim()` in button text.
**Fix:** Apply `text-overflow: ellipsis` + `max-width` + `white-space: nowrap` to the create button, or truncate the string in JS.

### Step 3: Special characters / XSS - PASS
- `<script>alert('xss')</script>` rendered as literal text (not executed)
- `"'\`'\"` and emoji 🧪 rendered correctly
- No XSS execution, no console errors
- Special chars displayed safely in both input and result button

### Step 4: Rare terms (no results state) - PASS
"xyznonexistent12345" correctly showed "No studies match - create" button. Graceful empty state.

### Step 5: Rapid-fire typing / debounce - PARTIAL (High)
**Bug:** StudyPickerPopover has NO debounce on search. Every keystroke triggers an immediate `apiClient.searchProjects()` call.

**Evidence:** StudyPickerPopover.tsx lines 75-100 - the search `useEffect` depends directly on `query` with no debounce delay. The only protection is the `cancelled` flag that discards stale responses, but every keystroke still fires a network request.

**Impact:** Under rapid typing, N keystrokes = N API calls. This floods the backend with search requests.

**Fix:** Add a 200-300ms debounce to the search effect (e.g., `useDebounce` or `setTimeout`-based approach).

### Step 6: Search open + click "New project" - PASS
Popover dismissed cleanly. Navigated to /create/study form without errors.

### Step 7: Search open + navigate via URL bar - PASS
Navigated to /project/STU-nanoplastics-wd9m while search was open. Popover dismissed, no console errors.

### Step 8: Multiple rapid clicks on search button - PASS
Clicked Search Projects 3 times rapidly. Only ONE popover rendered - no duplicates. The toggle logic (`setPickerOpen(o => !o)`) handles this correctly.

### Step 9: Old results replaced on new query - PASS
Typed "nano" -> got Nanoplastics result. Typed "brad" -> got Brad's Project, Brad1 results. Old results fully replaced with no ghost entries.

### Step 10: Console errors - PASS
No JS errors. Only React Router v7 future flag warnings (informational, not actionable).

### Step 11: Network debouncing - FAIL (see Step 5)
Confirmed: search has no debounce. Every keystroke fires an API call.

## Bugs Found

### BUG-1: No search debounce (HIGH)
- **File:** app/src/event-editor/projects/StudyPickerPopover.tsx (lines 75-100)
- **Issue:** useEffect on `query` fires API call on every keystroke
- **Fix:** Wrap search in debounce (200-300ms). Consider: `const debouncedQuery = useDebounce(query, 300)` then search on `debouncedQuery`

### BUG-2: Long query overflow in "Create" button (MEDIUM)
- **File:** app/src/event-editor/projects/StudyPickerPopover.tsx (line 228)
- **Issue:** Button text includes raw `query.trim()` with no length limit
- **CSS:** `.study-picker-popover__row--create` lacks truncation
- **Fix:** Truncate query in JS (e.g., `query.trim().slice(0, 50)`) AND add `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` to the CSS class

## Screenshots
- Long query overflow: browser_screenshot_485e0d4453db4758b76bc5c323abb02a.png
- XSS safe rendering: browser_screenshot_84da0097e64b4fa4aad24a53bfe78590.png
- Current state: browser_screenshot_2a7eaa5abbd24bd8b3ebaadec0d9699a.png
