# L2-SUBPROTOCOL-EXPAND-1 UNIT f5lprkind2 — Closeout Report

**Item:** L2-SUBPROTO-EXPAND-1-f5lprkind2-pw  
**Branch:** cl/lane2-expand-f5lprkind2-0125  
**Commit:** 41871480fd58d49bb5c3c0895a515ec810cc7219  
**Base:** cfe9f455  

## What Changed

Commit 41871480 ("discriminate local protocol by type key, not kind envelope")
changed two files:

1. **app/src/run/RunProtocolStepsLoader.tsx** — Discrimination logic switched from
   checking `kind === 'local-protocol'` (which fails when the served shape carries
   `kind:'record'` as envelope tag) to a three-way check:
   - The ref came from `localProtocolRef` key (structural signal)
   - `protoRef.type === 'local-protocol'` (correct discriminator in served payloads)
   - `protoRef.kind === 'local-protocol'` (legacy fixtures, backwards compat)

   The type annotation was extended to include `type?: string`. Line 97 verbatim:
   `    // the ref carries \`type:'local-protocol'\` (served shape has`

2. **app/src/run/RunProtocolStepsLoader.test.tsx** — Added a new test case:
   "follows localProtocolRef with type=local-protocol (served shape has kind=record)
   to inherited steps" — validates the fix against the real served-box payload
   where `kind:'record'` but `type:'local-protocol'`.

## Evidence

### Vitest Results

```
RUN  v1.6.1 /home/brad/cl-wt/L2-SUBPROTOCOL-EXPAND-1-f5lprkind2-lane2/app

 ✓ src/run/RunProtocolStepsLoader.test.tsx  (8 tests) 434ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  01:45:21
   Duration  18.20s
```

All 8 tests pass, including the new `type`-key discrimination test.

### Commit Verification

```
git log --oneline -3:
41871480 L2-SUBPROTOCOL-EXPAND-1 unit f5lprkind2: discriminate local protocol by type key, not kind envelope
cfe9f455 docs(lane2): handoff l2t0115 addendum
```

### Anchor Verification

Line 97 of RunProtocolStepsLoader.tsx matches expected:
`    // the ref carries \`type:'local-protocol'\` (served shape has`

L2-SUBPROTOCOL-EXPAND-1 UNIT f5lprkind2 DONE 41871480fd58d49bb5c3c0895a515ec810cc7219

L2-SUBPROTO-EXPAND-1-f5lprkind2-pw UNIT f5lprkind2 DONE 41871480fd58d49bb5c3c0895a515ec810cc7219
