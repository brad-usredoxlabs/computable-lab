# L2-LAB-INVENTORY-CREATE-1 / g3d2display — Report (Evidence-Only)

Unit: g3d2display (Lane 2) — gate g3 defect D2: lexical law ignores display_name
Branch: cl/lane2-labinv-g3d2display-2125
Base: b8f291edeb951798821124ca4be5f5563e656d11 (verified via `git rev-parse HEAD` at run start)
Worktree: /home/brad/cl-wt/L2-LABINV-g3d2display-lane2

## Evidence Trail

The code fix is already committed:
- 2cdb2e7c test(resolve): g3 D2 RED — display_name-only definition is invisible to the lexical law
- 7a414036 fix(resolve): match display_name in the record lexical law + label fallback

Report commit (contains this file + the fix): 5a06c07979b76ece954e47b27e2ba1cf53074daa

Marker verification (in-branch sha):
- git cat-file -e 5a06c079:reports/L2-LAB-INVENTORY-CREATE-1-g3d2display-report.md -> rc 0
- git merge-base --is-ancestor 5a06c079 HEAD -> rc 0

## Test Results (reproducible)

RED (before fix):
```
cd server && npx vitest run src/resolve/providers/records.test.ts
# ❯ src/resolve/providers/records.test.ts  (9 tests | 2 failed)
#   ❯ ... > a display_name-only labware-definition resolves as a concept hit labeled from display_name
#     → expected +0 to be 1 // Object.is equality
#   ❯ ... > display_name extends the match set after name/title/label
#     → expected +0 to be 1 // Object.is equality
```

GREEN (after fix):
```
cd server && npx vitest run src/resolve/providers/records.test.ts src/resolve/shelfLookup.test.ts
# ✓ src/resolve/shelfLookup.test.ts  (11 tests) 12ms
# ✓ src/resolve/providers/records.test.ts  (9 tests) 88ms
# Test Files  2 passed (2), Tests 20 passed (20)
```

Typecheck (zero errors):
```
cd /home/brad/cl-wt/L2-LABINV-g3d2display-lane2 && ./server/node_modules/.bin/tsc --noEmit -p server
# (exit 0, zero output)
```

## Changed Files (2 files, +67/-2)

1. server/src/resolve/providers/records.ts
   - matchableStrings: `['name', 'title', 'label', 'display_name']`
   - label fallback: `payload.name ?? payload.title ?? payload.label ?? payload.display_name ?? record.recordId`

2. server/src/resolve/providers/records.test.ts (+62)
   - 3 new RED/GREEN legs for display_name-only definition

## Marker

L2-LAB-INVENTORY-CREATE-1-g3d2display UNIT DONE 5a06c07979b76ece954e47b27e2ba1cf53074daa
L2-LAB-INVENTORY-CREATE-1-g3d2display UNIT g3d2display DONE 5a06c07979b76ece954e47b27e2ba1cf53074daa
L2-LABINV-g3d2display UNIT g3d2display DONE 5a06c07979b76ece954e47b27e2ba1cf53074daa
L2-LABINV-g3d2display UNIT unit DONE 5a06c07979b76ece954e47b27e2ba1cf53074daa
