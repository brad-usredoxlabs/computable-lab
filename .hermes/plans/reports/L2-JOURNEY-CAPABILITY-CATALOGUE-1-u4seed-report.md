# L2-JOURNEY-CAPABILITY-CATALOGUE-1 — unit u4seed report

Lane 2 · worktree /home/brad/cl-wt/L2-JCC-u4seed-lane2 · branch cl/lane2-journey-cat-u4seed-1112
Base: dd161c3abdb863a6e4a6ddc9acde69286266223e (trunk tip containing u2loader).

## STEP 0 evidence (gate satisfied, no refusal)

```
$ git rev-parse HEAD
dd161c3abdb863a6e4a6ddc9acde69286266223e

$ sed -n '1,25p' server/src/compiler/journey/capabilityCatalogue.ts
/**
 * L2-JOURNEY-CAPABILITY-CATALOGUE-1 (u2loader): admits a descriptor only when Ajv
 * validates the shape and implementation.handler_ref is in the caller's known set.
 * No throw, no normalisation, no handler-id literals; unit 3's route calls this.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import type { ErrorObject } from 'ajv';
const SCHEMA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '../../../../schema/workflow');

/** The admitted slice callers may rely on; every other field is the schema's business. */
export interface CapabilityDescriptor {
  capability_id: string;
  implementation: { handler_kind: string; handler_ref: string };
  [field: string]: unknown;
}
export type CapabilityCatalogueResult =
  | { ok: true; capabilities: CapabilityDescriptor[] }
  | { ok: false; capabilities: CapabilityDescriptor[]; diagnostics: string[] };
```

Admission shape built against: `admitCapabilityCatalogue(descriptors: ReadonlyArray<{file: string; doc: unknown}>,
knownHandlerIds: ReadonlySet<string>)` — `file` is REQUIRED (not optional), so the exactOptionalPropertyTypes
absent-or-value rule is satisfied by passing both keys always. No `undefined` is ever passed.

## What was built

1. `server/src/compiler/journey/capabilityCatalogueSeed.test.ts` (new, 88 lines): reads every `*.yaml` under
   `config/journey/capabilities/` (repo-root-resolved with `fileURLToPath(new URL('.', import.meta.url))`), parses
   with the `yaml` package, admits via the EXISTING `admitCapabilityCatalogue` with a known-handler set derived from
   `AGENT_ALLOWED_TOOLS` (imported from `../../ai/ToolBridge.js`). No capability id literal and no handler list in the
   test; the only handler-id literal is the NEGATIVE fixture `ncbi_nucleotide_search`, which is absent by design.
2. Four YAML descriptors under `config/journey/capabilities/` (37+36+34+35 lines), each `handler_kind: agent_tool`
   and `handler_ref` naming a tool that really ships:

| file | capability_id | handler_ref | effects | surfaces |
|---|---|---|---|---|
| ontology-lookup.yaml | journey.ontology-lookup | ontology_search | [read] | [knowledge] |
| material-library-search.yaml | journey.material-library-search | materials_search_addable | [read] | [find] |
| vendor-web-search.yaml | journey.vendor-web-search | web_search_exa | [read, external_disclosure] | [find] |
| ncbi-gene-search.yaml | journey.ncbi-gene-search | ncbi_gene_search | [read, external_disclosure] | [sequences] |

All four: `idempotency: pure`, `retry: none`, `reconciliation: not_required`, ports typed from the shipped
journey-port vocabulary (CommittedRecordReference / MaterialReference / StagedDraftReference / SequenceSetReference),
`availability: {}` (nothing declared), `evidence: [audit_event]`, status
`declared/implemented/available_now: true`, `browser_certified: false` (no browser has certified them; the four
claims are kept separate). Surfaces are existing registry ids from `schema/registry/surfaces/surfaces.yaml`.

## REVIEWER BAIT 1 — item-text handler ids absent from the build

Item-text ids absent from AGENT_ALLOWED_TOOLS: `ncbi_nucleotide_search`, `ncbi_sequence_fetch` — not seeded; seeding
them would be rejected on admission. The shipped registry (`server/src/ai/ToolBridge.ts:13-40`) carries
`ncbi_gene_search`, `web_search_exa`, `ontology_search`, `materials_search_addable` instead, and those are the only
ids seeded here. No registry file was touched and the enum was not widened. The item's bare "vendor search" is
represented by the real `web_search_exa` tool.

## RED (before the YAML files existed)

```
$ cd server && npx vitest run src/compiler/journey/capabilityCatalogueSeed.test.ts
 FAIL  ... > admits all four seeded descriptors
AssertionError: expected [] to have a length of 4 but got +0
 FAIL  ... > binds every seeded descriptor to a shipped agent tool
AssertionError: expected [] to have a length of 4 but got +0
 FAIL  ... > rejects a fifth candidate whose handler_ref is absent, naming the dangling id
AssertionError: expected undefined not to be undefined
 Test Files  1 failed (1)
      Tests  3 failed (3)
   Duration  5.09s
```

This is the expected RED: the directory was empty, so admission produced an empty catalogue and the count asserts
failed. It is NOT a compile error and NOT a YAML parse error — the test ran and reported on admission results.
Full log kept outside git: /home/brad/cl-wt/tmp/u4seed-RED.log

## GREEN (AC1, AC2)

```
$ cd server && npx vitest run src/compiler/journey/capabilityCatalogueSeed.test.ts
admitted ids: ["journey.material-library-search","journey.ncbi-gene-search","journey.ontology-lookup","journey.vendor-web-search"]
handler refs: ["materials_search_addable","ncbi_gene_search","ontology_search","web_search_exa"]
 ✓ src/compiler/journey/capabilityCatalogueSeed.test.ts  (3 tests) 82ms
negative diagnostic: ["dangling-candidate.yaml: /implementation/handler_ref: unknown handler id 'ncbi_nucleotide_search'"]
 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  737ms
```

AC1: 4 admitted, ids exactly the four named, each with the handler_ref per the table above.
AC2: the fifth in-memory candidate (string-built, never a committed file) is REJECTED, the diagnostic quotes
`ncbi_nucleotide_search` verbatim, and the catalogue stays at 4 — not 3.

## AC3 invariants (unchanged pins, no cap-id literals in src)

```
$ cd server && npx vitest run src/compiler/journey/capabilityDescriptor.test.ts \
    src/compiler/journey/ports.test.ts src/compiler/journey/capabilityCatalogue.test.ts
 ✓ src/compiler/journey/ports.test.ts  (12 tests) 21ms
 ✓ src/compiler/journey/capabilityDescriptor.test.ts  (7 tests) 14ms
 ✓ src/compiler/journey/capabilityCatalogue.test.ts  (6 tests) 202ms
 Test Files  3 passed (3)
      Tests  25 passed (25)

$ git diff --stat HEAD~2 -- server/src/compiler/journey/capabilityDescriptor.test.ts server/src/compiler/journey/ports.test.ts
(no output — neither pin file is in the diff)

$ grep -rn 'journey\.\(ontology-lookup\|ncbi-gene-search\)' server/src
(no match, exit 1)
```

## Typecheck

```
$ cd server && npx tsc --noEmit
(0 lines of output, TSC_EXIT=0)
```

The known `@types/semver` symlink artefact did not appear in this run.

## MUTATION PROBE (committed data, not the fixture)

Reverted one line: `ncbi-gene-search.yaml` `implementation.handler_ref: ncbi_gene_search` →
`ncbi_nucleotide_search`, then ran the targeted suite:

```
 FAIL  ... > admits all four seeded descriptors
+   "ncbi-gene-search.yaml: /implementation/handler_ref: unknown handler id 'ncbi_nucleotide_search'",
 FAIL  ... > binds every seeded descriptor to a shipped agent tool
AssertionError: expected [ { …(15) }, { …(15) }, { …(15) } ] to have a length of 4 but got 3
 FAIL  ... > rejects a fifth candidate whose handler_ref is absent, naming the dangling id
AssertionError: expected [ { …(15) }, { …(15) }, { …(15) } ] to have a length of 4 but got 3
 Test Files  1 failed (1)
      Tests  3 failed (3)
```

So the rejection path is wired to a COMMITTED file, names the dangling id, and admits 3 rather than blanking the
catalogue. Restore proven by a clean tree (no YAML diff) and a green rerun:

```
$ grep -n handler_ref config/journey/capabilities/ncbi-gene-search.yaml
22:  handler_ref: ncbi_gene_search
$ git status --short
(no output)
$ npx vitest run src/compiler/journey/capabilityCatalogueSeed.test.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

Full mutation log: /home/brad/cl-wt/tmp/u4seed-MUTATION.log

## Changed files (5, 230 insertions, 0 deletions)

```
 config/journey/capabilities/material-library-search.yaml      | 36 +++++++++
 config/journey/capabilities/ncbi-gene-search.yaml             | 35 +++++++++
 config/journey/capabilities/ontology-lookup.yaml              | 37 +++++++++
 config/journey/capabilities/vendor-web-search.yaml            | 34 +++++++++
 server/src/compiler/journey/capabilityCatalogueSeed.test.ts   | 88 ++++++++++++++++++++++
```

No prohibited file opened for edit. No bootstrap/route wiring: nothing reads this directory yet, so no lane-stack
reload or restart was attempted (unit 5 owns the bootstrap seam). Browser acceptance waived — no served surface in
this unit; the "add a YAML file and it is served" half is graded on unit 3's route.

Note on worktree infra: `server/node_modules` was absent in this fresh worktree, so it was symlinked to the shared
`/mnt/vast/home/brad/git/computable-lab/server/node_modules` (gitignored, untracked; no repository content changed).

## Commits

```
9fd10fd2 L2-JOURNEY-CAPABILITY-CATALOGUE-1 u4seed: RED - seed admission pin
4014b0ba L2-JOURNEY-CAPABILITY-CATALOGUE-1 u4seed: seed four registry-backed capability descriptors
```

## Residual risks / next actions

- Unit 3's `GET /journey/capabilities` must still be wired and browser-certified; this unit proves admission only.
- `availability: {}` on all four is a declaration of "no prerequisite" — if a later leg attaches prerequisites it
  must edit YAML, not this test.
- The seed directory is not read by any runtime path yet (unit 5).

L2-JOURNEY-CAPABILITY-CATALOGUE-1 UNIT u4seed DONE be11f8d3d79403376435c6911e3094041f3c05be
L2-JOURNEY-CAPABILITY-CATALOGUE-1-u4seed UNIT unit DONE be11f8d3d79403376435c6911e3094041f3c05be
