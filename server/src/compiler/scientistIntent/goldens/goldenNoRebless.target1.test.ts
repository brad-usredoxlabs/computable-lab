/**
 * L2-CLARIFY-TARGET-1 (UI-gate fix run 1) — R1.7 GOLDEN SAFETY PIN: no re-bless.
 *
 * The ruling (TARGET1-UIGATE-fix1 R1.7, packet item 4) requires: NO first-turn
 * golden bytes change, NO re-bless — PROVIDED the demotion lives in
 * `server/src/ai/**` and the fix touches NONE of the MANIFEST treeState pins:
 *
 *   schema/scientist-intent/scientist-intent-vocabulary.yaml
 *   schema/workflow/scientist-intent.schema.yaml
 *   schema/registry/compile-pipelines/scientist-intent-compile.yaml
 *
 * (MANIFEST.yaml:96/:121/:133). The AI-path demotion (`demoteUnstatedQuantities`,
 * server/src/ai/**) lives UPSTREAM of the compile, so the compiler and goldens
 * stay byte-identical BY CONSTRUCTION — no golden fixture/record moves.
 *
 * This pin is the orch-owned "no re-bless required" EVIDENCE: it asserts, at
 * this fix's tip, that each of the three files still equals (a) its MANIFEST
 * treeState pin (the MANIFEST did not move AND the file did not drift) and (b)
 * the LITERAL sha256 measured at the merged base tip (b64e7f9a) and confirmed
 * unchanged by this fix run. A re-bless of ANY of the three — a change to the
 * file OR a move of the manifest pin — fails this test and forces explicit
 * acknowledgment before a future golden re-bless can land.
 *
 * RED proof (recorded in the run report + commit body): temporarily appending a
 * byte to the vocabulary file makes the pin fail with the drift message; a
 * byte-exact `git checkout` restores it (sha256sum-verified) and the pin is
 * green again. The three files are NOT edited by the fix (git log of the fix
 * commits over the three paths is empty).
 */
import { describe, expect, it } from 'vitest';
import {
  loadManifest,
  manifestTreePath,
  sha256File,
} from './replayKernel';

// The three MANIFEST treeState files the fix must NOT touch.
const TREESTATE_FILES = [
  'schema/scientist-intent/scientist-intent-vocabulary.yaml',
  'schema/workflow/scientist-intent.schema.yaml',
  'schema/registry/compile-pipelines/scientist-intent-compile.yaml',
] as const;

// LITERAL pins — the exact MANIFEST treeState sha256 values.
// The vocabulary pin moved ONCE for advc-full-l2t2475 D1+D6: dead contenderOrder
// DATA was removed (D6), changing the file bytes, so the pin was updated once to
// the measured hash (sha256sum). Chain: 212c83f5 -> d39fd67b (COMPOSITION-BIND c1precfix2a).
// The guard's teeth are intact: manifest pin, literal and actual bytes must still all agree, so any future silent move stays RED.
// A move of EITHER the file or its manifest pin fails the test.
const BASE_TREESTATE_HASHES: Record<string, string> = {
  'schema/scientist-intent/scientist-intent-vocabulary.yaml':
    'd39fd67b18c8d82486d7f43900b0114284884f4654ede016a2a56e1112185fab',
  'schema/workflow/scientist-intent.schema.yaml':
    '78682999056a930eeb86b29fd1c26e8baa27a08ac90ed45a18c175a59b8f32c6',
  'schema/registry/compile-pipelines/scientist-intent-compile.yaml':
    'b91ef3b4e5e30e619e5fa7b44daa5d2be1f45c8b7bfaad0a4c169f2ad1bd8536',
};

describe('L2-CLARIFY-TARGET-1 (R1.7) — golden safety pin: no re-bless', () => {
  it('the three MANIFEST treeState files are byte-unchanged by this fix (actual == manifest pin == literal base hash)', () => {
    const manifest = loadManifest();
    for (const path of TREESTATE_FILES) {
      const entry = manifest.treeState.find((e) => e.path === path);
      expect(entry, `MANIFEST treeState entry missing for ${path}`).toBeDefined();
      const actual = sha256File(manifestTreePath({ path }));
      // (a) the file matches its MANIFEST pin — the MANIFEST did not move and
      // the file did not drift.
      expect(
        actual,
        `${path} drifted from its MANIFEST treeState pin (manifest ${entry!.sha256} vs actual ${actual})`,
      ).toBe(entry!.sha256);
      // (b) the file matches the literal merged-base hash — this fix touched
      // none of the three. A re-bless (file change or manifest-pin move) fails
      // here, forcing explicit acknowledgment.
      expect(
        actual,
        `${path} changed from the merged-base literal pin ${BASE_TREESTATE_HASHES[path]} (re-bless required? — update this pin only with a ruling)`,
      ).toBe(BASE_TREESTATE_HASHES[path]);
    }
  });
});
