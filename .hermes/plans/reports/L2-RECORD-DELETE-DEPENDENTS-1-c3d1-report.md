# L2-RECORD-DELETE-DEPENDENTS-1 c3-defect1 Report

## Unit
c3-defect1: Make absent cascade-policy YAML return empty Map (default-refuse) instead of hard boot throw.

## Decision
- Changed `loadCascadePolicy` catch branch in `server/src/store/referenceCascade.ts` to check `(err as NodeJS.ErrnoException).code === 'ENOENT'`. When ENOENT, returns `new Map()` (empty policy = fail-closed). All other errors still throw.
- Parse/shape validation at lines 97-108 left unchanged — malformed files still crash loudly.

## Changed Files
1. `server/src/store/referenceCascade.ts` — ENOENT returns empty Map, other errors throw
2. `server/src/store/RecordDeleteReferences.test.ts` — added `describe('loadCascadePolicy — absent vs malformed')` with 2 pins: absent path returns empty Map, malformed YAML throws

## Verification Results
- `npx vitest run src/store/RecordDeleteReferences.test.ts src/store/ReferenceCascadeSweep.test.ts` -> 11/11 pass (2 files)
- `npx tsc --noEmit` -> exit 0
- `npx tsx -e "..."` absent path probe -> NO-THROW
- `npx tsx -e "..."` malformed file probe -> THROWS: Cascade policy YAML parse error
- `git status --porcelain` -> empty (all committed)

## Commits
- 303a8005: c3-defect1: loadCascadePolicy returns empty Map on ENOENT (absent policy = default-refuse)

L2-RECORD-DELETE-DEPENDENCIES-c3d1b UNIT unit DONE 303a80053d57b18552144941b6b22ff9556d2980
