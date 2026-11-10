# L2-SUBPROTOCOL-EXPAND-1 — Unit u4noexpander Report

## Scope
Add `requireExpander(verb)` to `BiologyVerbExpander.ts` that returns a typed `NO_EXPANDER` error
naming the verb, while `getExpander` stays as the non-throwing probe.

## Changed Files
- `server/src/compiler/biology/BiologyVerbExpander.ts` — added `ExpanderLookupResult` type and `requireExpander` function
- `server/src/compiler/biology/BiologyVerbExpander.test.ts` — added `describe('requireExpander')` block with 2 tests

## Decisions
- Discriminated union: `{ ok: true; expander }` | `{ ok: false; code: 'NO_EXPANDER'; verb }` — no optional fields
- No verb literals in BiologyVerbExpander.ts, no schema import
- Single `_registry` unchanged; `_resetRegistryForTest` still clears exactly one map

## Verification
- Tests: 38 passed (38) in BiologyVerbExpander.test.ts (was 36, +2 new)
- Mutation probe: corrupted function to `return { ok: true, expander: _registry.get(verb)! }` → 1 failed (NO_EXPANDER test)
- Typecheck: `npx tsc --noEmit -p .` exit 0, zero output
- Git: clean tree at exit

## Next Actions
None — unit is complete. The store/execute legs will call `requireExpander` in their scope.

L2-SUBPROTO-u4noexpander UNIT u4noexpander DONE 1419980af8c1886a99e6e57d4cada1317bc792db
