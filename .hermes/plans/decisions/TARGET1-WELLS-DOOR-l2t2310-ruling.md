RULING: TARGET-1 WELLS DOOR — option (i) in principle, SHAPE-GATED in landing. The bare (i) as the
packet describes it is REJECTED by first-hand measurement.

Filed: 2026-11-03 (architect, l2t2310 packet). Branch tip verified: cl/lane2-target1-1-l2t1810 @
42f85403. Probe: throwaway worktree /tmp/probe-l2wells at the same tip (branch worktree untouched).

## Verification of the packet (my own eyes at the tip)

- Code claims CONFIRMED, with line drift: the door skip is :490 (not :488), the wells arm is
  :408-409 (not :407), the scalar arm :516 is exact. Structure is as described.
- Baseline reproduced in the probe: declaredArgumentReachability CHARACTERIZATION fails with
  `{label:'A1:H12', argument:'targetWells', reason:'unknown-address'}`; GHOST leg fails
  needs-clarification. MATCHES the packet.
- GOLDEN CLAIM IS MISATTRIBUTED. W2-7 T1/T2 fail with `missing-required-argument` on
  volumeUl AND targetWells — NOT unknown-address. I dumped the emitted intent YAML: the lowerer
  (realizeScientistIntent.ts) emits `add_material` with NO volumeUl and NO targetWells at all.
  That bar is Change-4's required-declaration meeting a lowerer that emits nothing — no door
  option touches it. The packet's "the golden doc fires targetWells on the door" is wrong on
  mechanism.
- CRITICAL: bare (i) (`:490` -> `if (contract.kind !== 'resolvable') continue;`) MEASURED
  FAILS the pins differently — CHARACTERIZATION becomes `expected 1 to be 96` (the A1:H12 scalar
  carries no value and no bar: a SILENT DROP, the W12 class this campaign forbids), GHOST leg the
  same, and it breaks 3 shipped SPINE-7 legs (rolesSeam scalar-binding leg, goldenRolesSeam
  roles-seam, D4 spy arm) because symbolic role labels like `control_well` also stop resolving.
  19 fails vs the 16-fail probe baseline. Bare (i) converts a false bar into silent data loss.
- SHAPE-GATED (i) MEASURED WORKS: door skips a kind:wells scalar ONLY when it is an
  address literal under the ONE existing parser (expandWellTokens) plus the parity-pinned
  WELL_ADDRESS_SHAPE_RE (normalizeScientistIntent.ts:73); and normalizeScientistIntent.ts's
  mappings loop carries such an address-literal scalar as the literal event value (expander
  parses it to 96 wells) instead of wellRole. Symbolic labels (control_well etc.) keep riding the
  door's role-address arm untouched. Result: the two reachability pins go GREEN UNEDITED;
  nounResolution unknown-address pin stays green; rolesSeam legs all green; the amended run is
  exactly the probe baseline MINUS the two pins — zero new failures across
  src/compiler/resolution + src/compiler/scientistIntent (14 vs 16 probe-baseline fails; the 14
  are probe-environment artifacts of untracked MANIFEST/mirror files, identical in both runs).

## The four answers

1. OPTION AND BOUNDARY. Option (i)'s doctrine is right — wells are addresses, not nouns — but it
   lands shape-gated, in TWO files: server/src/compiler/resolution/resolutionEngine.ts (scalar arm
   skips kind:'wells' values that pass the address-literal shape test) and
   server/src/compiler/scientistIntent/normalizeScientistIntent.ts (address-literal scalar carries
   as literal value; symbolic labels keep wellRole). This lands INSIDE L2-CLARIFY-TARGET-1: it is
   the direct blast radius of the Change-4 flip the item owns, and the shape gate uses only
   existing machinery (one parser, one parity-pinned shape regex) — zero field names, zero verb
   names, zero new policy literals. Not a separate blocked-behind item. The pattern branch
   unrealizedPatternWellLabels bars scalars on pattern verbs; the coder must MEASURE whether the
   shape gate needs parity there (shipped pattern fixtures stayed green unamended — measure,
   don't assume).

2. GREEN BAR (measured, not promised). The two declaredArgumentReachability pins (CHARACTERIZATION
   :159, GHOST :369) go green UNEDITED under the shape gate — verified in the probe with zero test
   edits. The W2-7 golden pins do NOT and cannot: their bar is missing-required-argument from the
   lowerer's emission, which no door change affects. The coder's GREEN bar for the door work is the
   two reachability pins plus zero new failures; the golden is a named separate leg (4 below).

3. unknown-address STAYS REACHABLE. It remains the door arm's outcome (:408-409) for symbolic
   labels that fail the role-address arm (nounResolution.test.ts:553 `bogus_role` pin stays green)
   and for many-arm entries. A bogus address (A1:ZZ99) is not address-shaped under
   expandWellTokens+WELL_ADDRESS_SHAPE_RE, so it still enters the door and bars — the bar for
   genuinely bogus addresses survives, and the shipped (b) arm
   (UNREALIZED_DECLARED_ARGUMENT on non-address claims) is untouched. Only values that ARE
   addresses stop paying a noun-resolution toll they cannot pass.

4. BLAST-RADIUS BAR: per-leg evidence, not directory green. TARGET-1 merges only when ALL hold:
   (a) resolution + scientistIntent dirs at the coder's base-parity bar; (b) wells-dimension legs
   named and green: the two reachability pins unedited, rolesSeam SPINE-7 legs green (symbolic
   path preserved), nounResolution unknown-address green, golden MANIFEST unmoved by the door
   change; (c) W2-7 golden greened by its OWN leg — the lowerer must emit the declared
   add_material volumeUl + targetWells the Change-4 flip demands (realizeScientistIntent.ts is the
   file; realizationFixture/policy feed the values), or the golden is re-blessed ONLY with Brad's
   explicit approval (blessing a lowerer gap into the golden would hide it). Do not merge on (a)+(b)
   while (c) is red.

## Evidence

- Probe runs: baseline-at-tip vs bare-(i) vs shape-gated(i), vitest on
  src/compiler/resolution + src/compiler/scientistIntent: 16 / 19 / 14 fails respectively; the
  14-fail set is a strict subset of the 16 (only the two named pins flipped).
- Emitted golden YAML dumped at 42f85403: add_material carries material/source/target/labware
  hints only — no volumeUl, no targetWells.
- Probe harness caveat: 12 of the 14/16 fails are probe-environment drift (untracked
  goldens/MANIFEST.yaml edit + mirror-drift files not copied); parity is measured probe-vs-probe,
  never probe-vs-worktree.
- Coder must re-run its own suites in the worktree (its harness has the untracked MANIFEST edit);
  it must land the shape gate with no test-file edits and report per-leg results per §4.

END-RULING
