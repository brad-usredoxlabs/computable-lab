/**
 * L2-SUITE-A-uifix2 FIX3 (advc1) — the deck-layout text resolver must never
 * GUESS. A request that names a declared layout resolves to that layout;
 * a request that only shares words with SEVERAL declared layouts — or ties
 * them — resolves to NOTHING and gets the plain-language choice wall.
 *
 * THE ADVC1 DEFECT (adversarial review of fix-run 2b, MAJOR): the scorer
 * stop-worded the very title nouns that distinguish the Manual layouts
 * (bench/plate/deck/well), so "open the Manual Bench" — which names the
 * declared title "Manual Bench (freeform)" — scored ONE shared token
 * ("manual") against ALL THREE variants and "first declared wins" mounted
 * manual_collapsed through the SUCCESS channel: a silent WRONG switch.
 * The module's own contract says a request that names NO declared layout
 * gets the wall; a request that DOES name one must never get a DIFFERENT
 * one.
 *
 * THE FIX (pinned here, RED-first):
 *   1. DISTINCTIVE TITLE WORDS — a word that appears in a declared title is
 *      a NAME word, never a stop word (do not stop-word title nouns);
 *   2. a match on words SHARED BY MULTIPLE declared variants is not
 *      distinctive (it does not identify the layout the scientist named)
 *      => resolve to NOTHING (the wall);
 *   3. a UNIQUE best score is required — a TIE resolves to NOTHING (the
 *      wall), never "first declared wins".
 *
 * Manifest data: the REAL config/platforms YAML (loadPlatformRegistry from
 * the repo root, asserted source === 'yaml' — no synthetic manual
 * vocabulary). One SYNTHETIC registry pins the tie rule generically (two
 * variants that share one title word and differ in another).
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PlatformRegistry } from '../platform-registry/PlatformRegistry.js';
import { loadPlatformRegistry } from '../platform-registry/YamlPlatformRegistryLoader.js';
import {
  resolveDeckVariantFromText,
  deckLayoutChoiceWall,
} from './deckLayoutResolution.js';

// This file lives at server/src/ai/ — the repo root is three levels up.
// If the YAML is unreadable, loadPlatformRegistry silently falls back to
// DEFAULT_PLATFORM_MANIFESTS; asserting the source keeps that impossible
// here (the manual-platform legs are graded against the REAL titles).
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

let registry: PlatformRegistry;
let source: 'yaml' | 'fallback';

beforeAll(async () => {
  ({ registry, source } = await loadPlatformRegistry(REPO_ROOT));
});

// The SYNTHETIC tie platform: two variants sharing the name word "workbench"
// and differing in exactly one word each ("blue" / "red"). Pins the tie and
// the distinctive rules without depending on the manual manifest.
const tieRegistry = new PlatformRegistry([
  {
    id: 'synth',
    label: 'Synth Bench',
    allowedVocabIds: ['liquid-handling/v1'],
    defaultVariant: 'blue',
    toolTypeIds: [],
    modules: [],
    variants: [
      { id: 'blue', title: 'Blue Workbench', slots: [] },
      { id: 'red', title: 'Red Workbench', slots: [] },
    ],
  },
]);

describe('resolveDeckVariantFromText — never-guess (advc1 FIX3), real config/platforms YAML', () => {
  it('grades the REAL config/platforms YAML, not the TS fallback', () => {
    expect(source).toBe('yaml');
  });

  it('P1 still resolves: the freeform bench from its declared title (unique distinctive words)', () => {
    expect(resolveDeckVariantFromText(registry, 'manual', 'Navigate to the freeform manual deck')).toBe(
      'manual_freeform',
    );
  });

  it('"open the Manual Bench" names the declared title "Manual Bench (freeform)" — it resolves to THAT variant (never to a sibling that merely shares "manual")', () => {
    // Before the fix this mounted manual_collapsed (first declared of a
    // three-way tie on the single shared token "manual") — the silent WRONG
    // switch. "bench" is a NAME word (it appears in a declared title), so the
    // request names exactly one layout.
    expect(resolveDeckVariantFromText(registry, 'manual', 'open the Manual Bench')).toBe(
      'manual_freeform',
    );
  });

  it('a match on words SHARED BY MULTIPLE declared variants is not distinctive — resolve to NOTHING (the wall)', () => {
    // "manual" alone appears in ALL THREE manual titles — it identifies no
    // layout. ("deck" appears in none, so it contributes nothing.)
    expect(resolveDeckVariantFromText(registry, 'manual', 'switch to the manual deck')).toBeNull();
    // Same shape, different filler words.
    expect(resolveDeckVariantFromText(registry, 'manual', 'set the manual layout please')).toBeNull();
  });

  it('a DISTINCTIVE title word resolves to the one variant that declares it (unique best score)', () => {
    expect(resolveDeckVariantFromText(registry, 'manual', 'open the Single SBS Plate')).toBe(
      'manual_single_plate',
    );
    expect(resolveDeckVariantFromText(registry, 'manual', 'switch to Manual Technician Mode')).toBe(
      'manual_collapsed',
    );
  });

  it('a TIE between two variants resolves to NOTHING (never "first declared wins")', () => {
    // "workbench" is shared by BOTH synthetic titles; "blue"/"red" are absent.
    expect(resolveDeckVariantFromText(tieRegistry, 'synth', 'switch to the workbench')).toBeNull();
    // …and a distinctive word on the same platform still resolves (the tie
    // rule is not a blanket refusal).
    expect(resolveDeckVariantFromText(tieRegistry, 'synth', 'open the Blue Workbench')).toBe('blue');
    expect(resolveDeckVariantFromText(tieRegistry, 'synth', 'the red one please')).toBe('red');
  });

  it('text that names no declared layout still resolves to NOTHING (the pre-fix honesty pin holds)', () => {
    expect(resolveDeckVariantFromText(registry, 'manual', 'show me something entirely different')).toBeNull();
  });
});

describe('deckLayoutChoiceWall — the honest menu for the never-guess cases (advc1 FIX3)', () => {
  it('a request that ties or only shares words gets the wall that offers the declared titles', () => {
    const wall = deckLayoutChoiceWall(tieRegistry, 'synth');
    expect(wall).toContain('Blue Workbench');
    expect(wall).toContain('Red Workbench');
  });

  it('the manual wall still offers the declared titles (the wall contract is unchanged)', () => {
    const wall = deckLayoutChoiceWall(registry, 'manual');
    expect(wall).toContain('Manual Bench (freeform)');
    expect(wall).toContain('Single SBS Plate');
    expect(wall).toContain('Manual Technician Mode');
  });
});
