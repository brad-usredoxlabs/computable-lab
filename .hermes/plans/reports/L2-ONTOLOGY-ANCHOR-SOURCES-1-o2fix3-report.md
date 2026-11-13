# L2-ONTOLOGY-ANCHOR-SOURCES-1 — unit o2fix3 (advc c2 DEFECT 1 + DEFECT 2)

Worktree: /home/brad/cl-wt/L2-ONTO-SRC-o2-lane2
Branch: cl/lane2-ontologysrc-o2-0641
Base: 0cdd9c810454bcda334012610383c9d74689907f (clean tree, verified at start)
Scope: registry-fault surfacing only. DEFECT 3 (marker format) and DEFECT 4
(docs/unit1-report.md) untouched.

## Diagnosis confirmed

loadLocalSources catches the registry read/parse throw and returns
`{entries: [], failures: [{source:'registry', ...}]}`. ensureLocal() therefore
never throws, so the handler's try/catch around it was dead and
`localErrors.push(...local.failures)` ran only inside the `searchLocal` branch.
Measured pre-fix on the production path (real loader, broken registry):
- ontologies=lwo -> `{"results":[],"total":0}` (silent empty success)
- ontologies=go  -> remote results, no `errors` field (silent degradation)

## Fix (1 production line moved)

server/src/api/handlers/OntologyHandlers.ts: `localErrors.push(...local.failures)`
now runs immediately after `ensureLocal()` resolves, before the `searchLocal`
decision. The `searchLocal` branch keeps only `localHits = local.search(...)`.
`...(localErrors.length ? { errors: localErrors } : {})` at the response site
then surfaces the named registry error for every scope. No signature change, no
change to localObo.ts, no behavioural change when the registry loads.

## Pins added

server/src/resolve/providers/localObo.test.ts — (h) real
`loadLocalSources('/nonexistent/registry-xyz.yaml')` and (i) malformed-YAML
fixture both assert `{entries: [], failures:[{source:'registry', message>0}]}`.
This pins the loader half that actually executes in production (DEFECT 2).

server/src/api/handlers/OntologyHandlers.test.ts — module mock is now a partial
mock built from `vi.importActual`; the new "D1 (production path)" legs inject
ONLY the registry path (`actual.loadLocalSources(p ?? '/nonexistent/...')`) so
the real loader runs; no mocked throw is involved. Two legs:
- ontologies=lwo + registry absent -> `errors` present, source 'registry'
  (not an empty success);
- ontologies=go + registry absent -> remote result still returned, plus
  `errors` source 'registry'.

## Verification (commands + real results)

Baseline before edits (at 0cdd9c81):
  cd server && npx vitest run src/api/handlers/OntologyHandlers.test.ts \
      src/resolve/providers/localObo.test.ts
  => 17 passed

RED after tests-only commit 183cc4a8:
  same command => 21 tests, 2 failed (both new production-path legs);
  loader pins (h)/(i) already green (loader was correct — pins DEFECT 2).

GREEN after handler fix (a14559bf):
  same command => 21 passed (11 handler + 10 loader), 2 files passed
  cd server && npx tsc --noEmit => EXIT=0 (no output)

Mutation proofs (each run then reverted with git checkout; tree clean afterwards):
(i)  deleting the try/catch in localObo.ts loadLocalSources:
     npx vitest run src/resolve/providers/localObo.test.ts =>
     2 failed ((h) and (i)) | 8 passed
(ii) reverting the unconditional failures attach (back inside searchLocal):
     npx vitest run src/api/handlers/OntologyHandlers.test.ts =>
     2 failed (lwo leg and go leg) | 9 passed

## Environment note (pre-existing, not repo content)

This worktree's server/node_modules is a symlink into the shared integration
store (/mnt/vast/home/brad/git/cl-integration-2/app/node_modules), which was
incomplete at start:
- node_modules/@types/semver was an empty directory -> copied the 9 files from
  a healthy sibling worktree's identical install;
- the pinned @aws-sdk+client-s3@3.1164.0 pnpm dir was missing (store only has
  3.1165.0; lockfile drift) -> created the 1164.0 store path as a symlink to
  the 3.1165.0 package. No tracked file touched.
Without these, `npx tsc --noEmit` fails at HEAD with TS2688/TS2307 on
unrelated files. With them, EXIT=0.

## Changed files

- server/src/resolve/providers/localObo.test.ts  (+22 lines, 2 pins)
- server/src/api/handlers/OntologyHandlers.test.ts (+60 lines, partial mock + 2 legs)
- server/src/api/handlers/OntologyHandlers.ts      (attach moved, -1/+6 lines)

## Next actions / residual risk

- None for this unit. Registry-failure surfacing is pinned end-to-end on the
  real loader; the D3 test that mocks a throw is left in place (it still
  exercises the defensive catch) but is no longer the only coverage.
- Reviewer: read the D1 describe block + pins (h)/(i); mutation commands above
  reproduce both RED states.

L2-ONTOLOGY-ANCHOR-SOURCES-1 o2fix3 DONE ad82cfe52954acd762b62e9e00d7d31005c95a62
