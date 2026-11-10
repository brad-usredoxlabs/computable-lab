# L2-PROTOCOL-LOCAL-BIND-1 — unit u3clarify (lane 2)

Worktree: /home/brad/cl-wt/L2-LOCALBIND-u3clarify-lane2
Branch: cl/lane2-localbind-u3clarify-0110, base eaff70d4

## Scope decision

Server half only: turn a `state: 'ambiguous'` role proposal into ONE named clarification
request listing every candidate, and prove the proposals endpoint still writes nothing.
The run-surface / picker render leg is a SEPARATE unit — criterion (b) is NOT claimed
end-to-end here; the claim is "the server emits the card and writes no binding".

## Environment note (not a code change)

This fresh worktree had no `node_modules` (the checkout was built from local disk without
an install). Per "do not install dependencies", root and `server/node_modules` were
symlinked temporarily to the existing local sibling install at
/home/brad/cl-wt/L2-MATSEL-u2-lane2/ for the verification runs, and both symlinks were
removed before exit. Baselines re-measured at eaff70d4 with that install:
`npx tsc --noEmit` = 0 lines; `roleBindingProposal.test.ts` = 6 passed.
Pre-existing untracked `app/node_modules` symlink (created by dispatch, points at NFS)
was left untouched.

## Step 1 — RED

New `server/src/protocol/roleBindingClarify.test.ts` (first line
`// @vitest-environment node`) with a fixture run whose universal protocol declares two
material roles: `medium` resolves to exactly ONE matching vendor-product (`proposed`) and
`enzyme` to TWO (`ambiguous`), plus handler-level wiring tests that spy on
create/update/delete.

Raw RED (module does not exist yet):

```
 RUN  v1.6.1 /home/brad/cl-wt/L2-LOCALBIND-u3clarify-lane2/server

 ❯ src/protocol/roleBindingClarify.test.ts  (0 test)

⎯⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/protocol/roleBindingClarify.test.ts [ src/protocol/roleBindingClarify.test.ts ]
Error: Failed to load url ./roleBindingClarify.js (resolved id: ./roleBindingClarify.js) in /home/brad/cl-wt/L2-LOCALBIND-u3clarify-lane2/server/src/protocol/roleBindingClarify.test.ts. Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```
