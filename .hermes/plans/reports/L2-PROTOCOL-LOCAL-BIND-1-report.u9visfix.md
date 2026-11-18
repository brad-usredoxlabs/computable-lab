# L2-PROTOCOL-LOCAL-BIND-1 u9visfix Report

## Root Cause
The protocol ID and reason text were rendered as sibling text nodes inside a single `<p>` element:
`{protocol.protocolId}{protocol.reason ? <span style={metaStyle}> — {protocol.reason}</span> : ''}`.
React Testing Library's `getByText()` requires the full text to exist within a single DOM element.
The reason text landed inside a `<span>` containing ` — reason text`, so `getByText("protocol 'MISSING-PROTO'...")`
failed because the span's text content was `" — protocol 'MISSING-PROTO'..."` (the dash-space prefix was included).
Similarly, `getByText('MISSING-PROTO')` failed because the protocol ID text node was a sibling of the dash text
and the reason span, splitting the content across multiple elements within the `<p>`.

## Fix
Wrapped both `protocolId` and `reason` in their own `<span>` elements, keeping `" — "` as a plain text
separator between them: `<span>{protocol.protocolId}</span>{protocol.reason ? <> — <span style={metaStyle}>{protocol.reason}</span></> : ''}`.

## Changed Files
- `app/src/run/RoleBindingProposalsPanel.tsx` (1 line changed)

## BEFORE (2 failed)
```
cd /home/brad/cl-wt/L2-LOCALBIND-u9vis-lane2/app && npx vitest run src/run/RoleBindingProposalsPanel.test.tsx
-> Tests 2 failed | 6 passed (8)
FAIL: renders protocolNotFound marker and reason for a missing protocol
FAIL: renders protocol-level reason when present alongside the protocol id
```

## AFTER (all green)
```
cd /home/brad/cl-wt/L2-LOCALBIND-u9vis-lane2/app && npx vitest run src/run/RoleBindingProposalsPanel.test.tsx
-> Tests 8 passed (8)
```

## Mutation Check
Commented out reason span -> 2 tests failed. Reverted -> 8 tests passed.

L2-PROTOCOL-LOCAL-BIND-1-u9visfix UNIT unit DONE d964ac83aa76c0212b90c1250074f2c0d1c9aec5
