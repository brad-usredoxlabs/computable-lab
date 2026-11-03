# TARGET-1 golden MANIFEST merge-rider re-bless — ARCHITECT AUTHORIZATION (l2t0830 packet)

VERDICT: AUTHORIZED

Filed: 2026-11-03 (architect, l2t0830 bounded decision request).
Item: L2-CLARIFY-TARGET-1 — branch `cl/lane2-target1-1-l2t1810`, worktree
`/mnt/vast/home/brad/git/wt/L2-CLARIFY-TARGET-1-lane2-l2t1810`, tip `16f3b403` (fix run 3 live —
untouched; all reads via `git -c core.fileMode=false show <sha>:<path>` on committed blobs).

## The authorization statement (quotable by the next adversarial gate)

> **ARCHITECT AUTHORIZATION (l2t0830):** the single `treeState` sha256 pin at
> `server/src/compiler/scientistIntent/goldens/MANIFEST.yaml:85`
> (`path: schema/scientist-intent/scientist-intent-vocabulary.yaml`) moved
> `fa919ec5f0114701ff8276fd8c9676674d4489d06ef48c6b05bc89351eb139cc` →
> `7908fa38645e93f07633b580513a657383c10ad4cecfc8a120eaa9430fb2142e` in commit `2018f966` as a
> **MERGE RIDER, blessed ONCE**: the pin tracks the ledger's hash of the vocabulary file's BYTES,
> and those bytes moved exclusively because STEP 0 merge `0a3a4f18` carried trunk's `identityCollapse`
> policy data onto the file — the pin edit records that fact, it does not cause it, and it changes no
> golden outcome. **This authorization is bounded to that one treeState ledger line: the outcome
> goldens (MANIFEST `fixtures`/`records` hashes) and `realizationGolden` T1/T2 remain UNTOUCHED and
> RED (`missing-required-argument` volumeUl + targetWells), and the open Brad card
> `TARGET1-GOLDEN-WELLS-DATA-BRAD-CARD-l2t0255.md` stays the sole route for criterion (c). Any
> FURTHER MANIFEST write inside this item — any second pin, any fixture/records entry, any edit of
> the two red legs — is NOT covered by this authorization and is a stop-and-escalate event.**

## Why this is a merge rider, not a branch outcome change (my own measurements, not citations)

All commands run with `git -c core.fileMode=false` in the item worktree unless noted.

1. **The hashes are exactly what the record claims (measured on committed blobs, so fix run 3's
   dirty worktree cannot contaminate them):**
   - `git show 0a3a4f18^1:schema/scientist-intent/scientist-intent-vocabulary.yaml | sha256sum`
     → `fa919ec5f0114701ff8276fd8c9676674d4489d06ef48c6b05bc89351eb139cc` (branch side, BEFORE)
   - `git show 0a3a4f18:schema/scientist-intent/scientist-intent-vocabulary.yaml | sha256sum`
     → `7908fa38645e93f07633b580513a657383c10ad4cecfc8a120eaa9430fb2142e` (merge result, AFTER)
   - `git show 16f3b403:schema/scientist-intent/scientist-intent-vocabulary.yaml | sha256sum`
     → same `7908fa38…` — the file NEVER moved again between the merge and the item tip
     (`git diff 0a3a4f18 16f3b403 -- <path>` = 0 lines). The pin pins bytes the merge created.
   - Three-way provenance fully consistent: merge base `428a47ed` vocab = `4f72ede5…`,
     trunk side `0a3a4f18^2` = `01bcfe9e…`, branch side = `fa919ec5…`, merge = `7908fa38…` —
     the exact union the commit message and orchestrator grading (`2026-11-03_0510-L2-TARGET1-manifest-rehash-grading.md`) describe.

2. **The merge's trunk contribution to the vocabulary is 8 lines, ALL additive**
   (`git diff --numstat 0a3a4f18^1 0a3a4f18 -- <path>` → `8 0`): three comment lines plus the new
   `identityCollapse: {key: [normalized_label, candidate_level], survivor: [declared_substance, stable_order]}`
   block. The branch's own 16/1 additions are Change 4/4a (`targetWells` required, `volume` satisfiedBy),
   separately ruled (l2t2230 (a)) and NOT part of this question.

3. **`identityCollapse` has no product consumer (re-verified at HEAD via `git grep` over committed
   blobs):** in `server/src` + `app/src` the ONLY non-test reference is the optional TYPE
   declaration `server/src/compiler/scientistIntent/vocabulary.ts:109`
   (`identityCollapse?: { key: readonly string[]; survivor: readonly string[] }`). Every other hit is
   its own contract test `vocabularyIdentityCollapse.test.ts`, meta-schema files, and
   `fixtures/vocab-identity-collapse*` vocab copies. Nothing in `server/src/compiler/**` resolution
   or `app/src/**` READS the block — declared-but-unwired data, outcome-inert by construction.

4. **No other MANIFEST entry moved (measured):**
   `git diff 0a3a4f18 16f3b403 -- server/src/compiler/scientistIntent/goldens/MANIFEST.yaml | grep '^[+-].*sha256'`
   shows exactly ONE pin line changed (the vocab treeState line); `2018f966 --stat` = MANIFEST +
   normalizeScientistIntent.ts + the new co-extensivity test. No fixture/record hash touched. The
   ledger line sits at `MANIFEST.yaml:85` as the packet states (verified via `git show 16f3b403:… | sed -n '85p'`).

5. **B4 control verified mechanically, not taken on faith:** `replayKernel.ts:376-384`
   (`manifestHashMismatches`) compares `sha256File(<repo-root path>)` against each pin and pushes
   `treeState <path>: manifest <pinned> actual <actual>` on ANY mismatch; the B4 leg
   (`goldenProseBlobStrip.test.ts:109-111`) asserts the list is empty. With the base MANIFEST
   (pin `fa919ec5…`, measured above) against the merged file (`7908fa38…`, measured above), a FAIL
   with the reviewer's exact quoted message is arithmetically forced; at HEAD pin == actual, so
   B4 passes. The reviewer's `/tmp` control run
   (`reviews/L2-CLARIFY-TARGET-1-advc-wellsfix-fix2-l2t0745.md` §COMMANDS #12) corroborates the same.
   Note the ONLY alternative to the re-bless was to leave the ledger asserting a false hash — the
   ledger existing to tell the truth is the whole point of the pin.

6. **Precedent respected:** this is the same merge-rider discipline already blessed once at
   LABSTATE-CONTENTS-1 (`b6bb2386 chore(lane2): re-bless scientist-intent vocabulary golden pin
   (LABSTATE-CONTENTS-1 merge rider)`; trunk MANIFEST lines 40-56 carry the chain
   0ce55142→15e5820d→4f72ede5). One ledger line, BEFORE/AFTER comment block, no fixture/record move.

## Criterion (b) of the l2t2310 ruling — satisfaction AS WRITTEN, and amendment

Criterion (b) as written ends: *"…golden MANIFEST unmoved by the door change."*

**Finding:** the pin move **satisfies (b) on its causal reading but not on a maximal literal
reading** — which is precisely why defect 4 could be filed at all. Causally, the door change did NOT
move the MANIFEST: the door/fix code lives in `normalizeScientistIntent.ts` (and the ruling's
resolutionEngine shape gate), and the pin moved because merge `0a3a4f18` changed the hashed file's
bytes — the reviewer's own R5 confirms the MANIFEST "is not moved by the door commit". But the
sentence does not define "by the door change", so a strict reader can (and did) read ANY MANIFEST
edit inside the item delta as a (b) violation, making the criterion non-decidable at the gate.
The l2t2310 ruling's other clause — golden "re-blessed ONLY with Brad's explicit approval" — sits in
§4(c) and is bound by its sentence to the OUTCOME golden (`realizationGolden` re-bless blessing a
lowerer gap); it does not, and per this ruling does not, extend to treeState ledger hashes reflecting
merge-carried bytes. That reading is now made explicit below so the ambiguity dies here.

**Amendment to (b) — replacement wording (binding for future rulings/gates):**

> (b) wells-dimension legs named and green: the two reachability pins unedited, rolesSeam SPINE-7
> legs green (symbolic path preserved), nounResolution unknown-address green, and the golden
> MANIFEST's OUTCOME entries unmoved: no `fixtures`/`records` hash changed and no test pin of a green
> or red golden altered. A `treeState` ledger pin MAY be re-hashed inside an item ONLY as a merge
> rider: the re-hash must cite the merge commit whose carried bytes moved the underlying file, must
> change no other MANIFEST entry, must carry a first-hand `sha256sum` of the merged file in the
> commit message or an orchestrator grading note, and must be blessed ONCE by the architect or Brad
> in a decisions/ file; the "Brad's explicit approval" clause governs OUTCOME golden changes
> (fixtures/records, realizationGolden re-bless) only. Any treeState re-pin NOT attributable to a
> merge is an outcome-scope write and needs the same explicit approval.

Under this wording today's pin move is cleanly (b)-legal (merge rider, cited merge `0a3a4f18`, one
entry, real sha measured by orch + reviewer + me, architect blessing = this file). The l2t2310 ruling
is NOT otherwise amended; §4(c) and its Brad-card dependency stand unchanged.

## Hard constraints carried forward (gate-checkable)

- `realizationGolden` T1/T2 stay RED and their test file stays byte-identical to base
  (`0e806e79` md5 per advc R6); the only permitted red set remains those two legs.
- No further MANIFEST write of any kind inside L2-CLARIFY-TARGET-1 under this authorization.
- Criterion (c) remains gated solely on `TARGET1-GOLDEN-WELLS-DATA-BRAD-CARD-l2t0255.md`; this
  authorization does not unblock it and must not be quoted as if it did.

## Side finding for the orchestrator (not part of the ruling; no action taken by me)

Trunk itself currently carries the stale pin this re-bless fixed on the branch: at
`cl/integration-2` tip `a0f074e5`, the tracked vocabulary blob hashes `01bcfe9e…`
(`git show HEAD:schema/scientist-intent/scientist-intent-vocabulary.yaml | sha256sum`, worktree clean)
while trunk's `goldens/MANIFEST.yaml:55` still pins `4f72ede5…` — trunk commit `fe913e3f` landed the
`identityCollapse` data WITHOUT re-blessing (verified: `git log HEAD -- <MANIFEST>` does not include
`fe913e3f`). B4/versions-current must therefore be failing on a clean trunk worktree today, and will
clear naturally when this item merges (the item's pin `7908fa38…` matches the post-merge bytes). If
any trunk-level gate trips on a vocabulary treeState mismatch before that merge, the answer is the
same merge-rider re-bless discipline, not a revert of `fe913e3f`.

Read-only boundary honored: no product file, golden, MANIFEST, or test edited; no merge, push,
rebase, or checkout performed.

END-RULING
