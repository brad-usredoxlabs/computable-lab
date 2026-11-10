# L2-SUBPROTOCOL-EXPAND-1 Report — u6binddoor

## sibfix1

### Problem
Production code at HEAD uses `apiClient.getRecordWithUI` (BindingModeEditor.tsx:108/119,
RunWorkspacePage.tsx:69) but two sibling test mocks never received the method, causing
7 tests to fail with "apiClient.getRecordWithUI is not a function".

### Fix
Added `getRecordWithUI` mock entries to both test files returning
`{ record: <same payload>, ui: undefined }` matching the real client signature.

### Files changed
- `app/src/graph/BindingMode/BindingModeEditor.compile.test.tsx` — added `getRecordWithUI: vi.fn()` to mock object and mockImplementation returning `{ record: ..., ui: undefined }`
- `app/src/run/RunWorkspacePage.surface.test.tsx` — added `getRecordWithUI: vi.fn(async () => ({ record: { payload: ... }, ui: undefined }))` to mock object

### Verification
Combined: Test Files 2 passed (2), Tests 7 passed (7)
Baseline: Test Files 1 passed (1), Tests 4 passed (4)

L2-SUBPROTOCOL-EXPAND-1-u6binddoorfix3pw UNIT u6binddoorfix3pw DONE edb76724b4b783b0500c320ddbcebae184f0011f

## sibfix1

### Summary
Two sibling test suites (compile.test.tsx and surface.test.tsx) fail because production code
uses `apiClient.getRecordWithUI` but the mocks only defined `getRecord`. Added
`getRecordWithUI` mock methods returning `{ record: ..., ui: undefined }` to both suites.

### Raw GREEN output (combined suite)
```
Test Files  2 passed (2)
      Tests  7 passed (7)
```

### Baseline GREEN (no regression)
```
Test Files  1 passed (1)
      Tests  4 passed (4)
```

### Changed Files (2)
1. `app/src/graph/BindingMode/BindingModeEditor.compile.test.tsx` — added `getRecordWithUI` to mock object + mockImplementation
2. `app/src/run/RunWorkspacePage.surface.test.tsx` — added `getRecordWithUI` to mock object

### Code Commits
- ac2a2d1d — compile suite mock fix
- efe4088a — surface suite mock fix

L2-SUBPROTOCOL-EXPAND-1 UNIT u6binddoorsibfix1 DONE PENDING_SHA
