# L2-UI-SURFACE-MANIFEST-1 — unit u9lintvocab

Base at dispatch: `254201d4c50d98e30f1ddd8085f998fe9c03f1c5` (git rev-parse HEAD, tree clean).
Data commit: `cfb24a53e1df25d0785cfc325b75d045718baec0`.
The marker line below names the data commit; it lands in the following report commit.

## Change
`schema/ui/surface-manifest.lint.yaml` — one added line `- collection-list` (last value of the
`in` predicate list, matching config/ui/surfaces.yaml paneVocabulary order). Nothing else touched.

## Verification (raw)
- RED first: `Tests 2 failed | 3 passed (5)` (L-SM-2 zero-findings + drift pin).
- Post-fix vitest: `Test Files 1 passed (1)` / `Tests 5 passed (5)`.
- Census: `ROUTES=41 DECLARED=16 MISSING=25 PHANTOM=0 CATCHALL=1 REDIRECT=2 SLOT-HOST=1`.
- Vocab: `16 5`. Removed lines in lint yaml diff: `1` (header only). Rule count: `1`.
- `git diff --stat`: `1 file changed, 1 insertion(+)`. config/ui/ and schema.yaml untouched.
- `git status --short`: clean.

No tsc/suite/stack restart — one YAML line. No blockers.

L2-UI-SURFACE-MANIFEST-1 UNIT u9lintvocab DONE cfb24a53e1df25d0785cfc325b75d045718baec0
