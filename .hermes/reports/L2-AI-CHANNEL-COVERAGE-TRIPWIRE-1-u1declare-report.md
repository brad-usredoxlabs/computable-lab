# u1declare report — L2-AI-CHANNEL-COVERAGE-TRIPWIRE-1

- worktree: /home/brad/cl-wt/L2-AI-CHANNEL-COVERAGE-TRIPWIRE-1-u1declare-1745-lane2
- branch: cl/lane2-aichtripwire-u1declare-1745
- base: dc456071e0f5ce6e18b26b31e7adb64e0b94743f
- unit: u1declare (1 of 3) — the channel declaration as data: YAML registry + Ajv schema + validated loader.

## Files created (4 files, 297 lines total — within the 300 budget)

| file | lines |
|---|---|
| schema/registry/ai-deliverable-channels/ai-deliverable-channels.yaml | 35 |
| schema/registry/ai-deliverable-channels/ai-deliverable-channels.schema.yaml | 40 |
| server/src/aiChannels/channels.ts | 108 |
| server/src/aiChannels/channels.test.ts | 114 |

The registry declares exactly the 11 TREATMENT-MAP channels (events=answer,
clarification=card, recordCreations/labwareAdditions/equipmentRequirements/
labwareRequirements/deckLayout/sequenceProposal/protocolEdit/instrumentJob=wall,
proseDeliverable=answer) — 9 wall, 1 card, 2 answer, 0 mount/navigate.
`wall` is the honest declaration of today's reality per Amendment 1: the
universal pane cannot present those channels yet; u2 upgrades their handling.

Schema (draft-2020-12, $id ai-deliverable-channels-registry.schema.yaml) mirrors
the surfaces schema style: required [version, channels]; per channel required
[id, meaning, treatment], id pattern ^[a-z][A-Za-z]*$, meaning minLength 10,
treatment enum [card, mount, navigate, wall, answer] — "ignore" is impossible
by construction; additionalProperties: false; uniqueIds on channel id.

Loader exports: `AiDeliverableChannel` interface, `loadAiDeliverableChannels(schemaDir)`,
`loadDefaultAiDeliverableChannels(schemaDir)` (resolves
registry/ai-deliverable-channels/ai-deliverable-channels.yaml, mirroring
loadDefaultSurfacesRegistry at surfaces.ts:170), `assertChannelTreated(channels, id)`
which throws `channel "<id>" has no declared treatment` — the named-failure
primitive u2/u3 call. Ajv2020 compiles the schema from disk exactly as
surfaces.ts:118-135 does; duplicate channel ids are named before Ajv runs.

## Decisions and deviations

1. node_modules: the worktree shipped without a dependency store (root and
   server/). Created the same gitignored symlinks the sibling lane worktrees
   use (verified against 6 sibling lanes): node_modules ->
   /mnt/vast/home/brad/git/cl-integration-2/node_modules and
   server/node_modules -> /mnt/vast/home/brad/git/cl-integration-2/server/node_modules.
   `git status --porcelain` stays clean (node_modules is gitignored).
2. V1 baseline is NOT clean as the brief's baseline claimed ("clean, 0 errors").
   Measured at base dc456071e with the store in place: 6 pre-existing errors,
   all in Fastify handlers (AIHandlers.ts:332/438/716, AiIngestionHandlers.ts:291,
   ExtractProtocolHandler.ts:63, sequenceRoutes.ts:37 — `request.parts()` /
   `request.file()` typing). Re-measured on the integration-2 trunk store at
   7b9ec0ad0: the same 6 error classes. The brief's "0 errors" baseline is
   stale; the governing constraint is "stay clean / no NEW errors", which holds:
   the after-run error list is byte-identical to the base list (diff = empty).
3. Output budget: first draft was 353 lines (>300). Trimmed comments/boilerplate
   to 297 without dropping any acceptance assertion. Did not BLOCK on it.
4. `tsc --noEmit` excludes **/*.test.ts (server tsconfig), so V1 covers
   channels.ts only; channels.test.ts is exercised by V2.
5. Brief cites surfaces.ts:1283 for the default-loader precedent; in the
   current tree it is surfaces.ts:170. Repository wins; the anchor was
   re-verified by grep.

## Verification (measured on the final commit d366e4622)

- V1 `npm --prefix server run typecheck`: 6 errors, byte-identical to the base
  dc456071e baseline (diff of the two error lists is empty). 0 new errors from
  this unit.
- V2 `npx vitest run src/aiChannels` (from server/):
  Test Files  1 passed (1) / Tests  8 passed (8).
  Assertions: (a) real file loads, exactly the 11 ids, each treatment in the
  enum, meanings ≥10 chars; (b) a channel missing treatment fails with an Ajv
  error `must have required property 'treatment'`; (c) treatment: ignore fails
  with `must be equal to one of the allowed values`; (d) assertChannelTreated
  throws `channel "mysteryChannel" has no declared treatment` for an undeclared
  id; (e) ≥1 channel is wall and none is outside the enum. Negative mutation
  check: deleting instrumentJob from the YAML makes 2 tests fail (the exactly-11
  and map guards), then the file was restored and re-verified green.
- V3 `grep -c 'id:' schema/registry/ai-deliverable-channels/ai-deliverable-channels.yaml`: 11.

## Commits (after base dc456071e)

- 5f7c9f492ade4884f43a93df17f819330999b227 — u1declare: channel declaration data + schema
- d366e46220a05f2fa52f076d9956ed894500c862 — u1declare: validated loader + coverage test
- (this report commit — step 3)

Worktree `git status --porcelain` is clean at exit. No files outside the 4
owned files were modified; server.ts wiring, app/src, surfaces.*, AiTabPanel,
and server/src/ai/ were untouched (PROHIBITED scope respected).

## Next actions (u2/u3)

- u2: wire loadDefaultAiDeliverableChannels into server.ts (precedent:
  server.ts:1290) and the universal pane; implement wall handling so Accept
  refuses wall-channel effects (Amendment 1); upgrade recordCreations.
- u3: emptiness predicate computed from the declaration (rule 4).

L2-AI-CHANNEL-COVERAGE-TRIPWIRE-1 UNIT u1declare DONE d366e46220a05f2fa52f076d9956ed894500c862
