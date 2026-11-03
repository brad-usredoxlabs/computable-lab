# TARGET-1 golden MANIFEST re-hash — ORCH GRADING (l2t0450, read-only, first-hand)

Item: L2-CLARIFY-TARGET-1 (branch `cl/lane2-target1-1-l2t1810`, worktree
`/mnt/vast/home/brad/git/wt/L2-CLARIFY-TARGET-1-lane2-l2t1810`, tip `a6a71bcb` = preserved WIP).
Commit under grading: `2018f966` ("D1 co-extensive carry + SPINE-6 merge-rider re-bless").
Why it needed grading: the ruling forbids re-blessing `realizationGolden`; a treeState sha256 pin
change in `server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` must therefore be proven
outcome-inert, not accepted from prose. This note records what the ORCHESTRATOR measured itself.

## Claim under test

`2018f966` moves ONE treeState pin
(`schema/scientist-intent/scientist-intent-vocabulary.yaml`, `fa919ec5…` -> `7908fa38…`) because
STEP 0 merged `cl/integration-2`, which brought the l2t2030 `identityCollapse` policy DATA onto a
file this branch also edits. Claimed: purely additive union, zero outcome change.

## Measurements I ran (all first-hand, worktree at `a6a71bcb`)

1. Pin value is real:
   `sha256sum server/schema/scientist-intent/scientist-intent-vocabulary.yaml` ->
   `7908fa38645e93f07633b580513a657383c10ad4cecfc8a120eaa9430fb2142e` — exactly the AFTER in the
   MANIFEST. (Path note: `server/schema` is a symlink to `../schema`; the TRACKED path is
   `schema/scientist-intent/scientist-intent-vocabulary.yaml`, blob `fb0c68d4`. A `git diff` on the
   `server/schema/...` path silently returns nothing — trap avoided.)
2. What the merge added from trunk (`git diff 0a3a4f18^1 0a3a4f18 -- <tracked path>`) = **8 lines,
   all additive**: the three comment lines plus
   `identityCollapse: {key: [normalized_label, candidate_level], survivor: [declared_substance, stable_order]}`.
   No verb, argument, referent level or pre-existing policy value is touched.
3. What the branch contributes (`git diff 0a3a4f18^2 0a3a4f18 -- <tracked path>`) = add_material's
   `volume` contract `required: false -> true` + `satisfiedBy: [volume]`, and the new
   `targetWells: {kind: wells, required: true}` declaration. These are Change 4/4a, already ruled
   by the architect (l2t2230 ruling (a)) — not part of the re-bless question.
4. `identityCollapse` has **no product consumer**: the only product-code reference is the TYPE
   declaration `server/src/compiler/scientistIntent/vocabulary.ts:109`; everything else is its own
   contract test (`vocabularyIdentityCollapse.test.ts`), schema/meta-schema, fixtures and
   `server/tmp/**` scratch trees. Nothing in `server/src/compiler/**` or `app/src/**` reads it.
   The provenance of the block is trunk commit `fe913e3f` (found with `git log -S`).

## Verdict

**PASS — the re-bless is exactly what it says it is.** One ledger pin, moved by the merge, on a
policy block with zero resolution path; the branch's own outcome-changing declarations are
separate, ruled, and visible in their own diff. The golden OUTCOME fixtures are untouched:
`realizationGolden` remains RED at this tip (`missing-required-argument` for `volumeUl` +
`targetWells`), which is the open Brad card `TARGET1-GOLDEN-WELLS-DATA-BRAD-CARD-l2t0255.md` — the
item does NOT hide that gap and must not, so this grading does not unblock criterion (c).

Residual caveat recorded honestly: I did NOT re-run the 553 golden replays myself; I verified the
delta's content and the absence of a consumer, which is what outcome-inertness turns on. The next
adversarial gate should still run the suite in its own tree (it did in c1: 547/549 with only the two
`realizationGolden` legs red).
