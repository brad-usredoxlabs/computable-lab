# L2-PROMPT2-VOLUME-N1-MISREAD-1 — Unit u2close (paperwork close-out)

HEAD sha: 99c2ddd5

## Commits (verbatim subjects)

2221fdd5: L2-PROMPT2-VOLUME-N1-MISREAD-1-u1fix: restore value-dependence in labelled clause fall-through + corrected N1 pin + over-keep + 100-vs-stated-1 guards

99c2ddd5: L2-PROMPT2-VOLUME-N1-MISREAD-1-u1fix: hygiene — revert pnpm-lock churn, untrack app/node_modules symlink (orchestrator paperwork; product+test diff in 2221fdd5 untouched)

## Verification

### vitest (RED — pre-existing missing vocabulary YAML)
```
FAIL  src/ai/demoteUnstatedQuantities.test.ts
Error: scientist-intent vocabulary vocabulary file not found:
  server/schema/scientist-intent/scientist-intent-vocabulary.yaml
  the vocabulary triplet is required; there is no default verb set
Test Files  1 failed (1)
```
The vocabulary file does not exist on disk. This is a pre-existing infrastructure gap,
not introduced by 2221fdd5. No code changes attempted in this unit.

### Typecheck (GREEN)
```
tsc --noEmit — exit code 0, 0 errors
```

## Product code
No product or test files were modified in this unit. This unit is paperwork close-out only.

L2-PROMPT2-VOLUME-N1-MISREAD-1 UNIT u2close DONE 4c6ed1508e6ab3d606d8fdde8ce7894f83853079
