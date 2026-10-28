/**
 * L2-SUITE-A-uifix2 FIX2 (D1) — deck-layout variant resolution from the
 * scientist's OWN WORDS, against the platform manifest (DATA).
 *
 * The small on-box model sometimes emits a deck_layout intent WITHOUT the
 * variantId (gate re-gate-3 P1: "Navigate to the freeform manual deck"). The
 * harness must handle that model-output gap HONESTLY:
 *   1. If the request text names one of the platform's variant TITLES
 *      (declared in config/platforms/*.yaml — data, never a TS vocabulary
 *      list), resolve to that variant and deliver the layout through the
 *      ordinary success channel (the client's native setPlatform/setVariant
 *      mounts the bench — DeckSurfaceChat.onDeckLayout).
 *   2. Otherwise the wall is PLAIN SCIENTIST LANGUAGE: the platform's
 *      declared layout titles offered for choice — NO variant ids, NO
 *      "deck_layout"/"intent"/"validator" vocabulary. The previous raw
 *      validator string ('deck_layout intent requires a variantId (e.g.
 *      "manual_freeform" ...)') leaked implementation jargon into the
 *      scientist chat and is retired.
 *
 * NEVER GUESS (L2-SUITE-A-uifix2 FIX3, adversarial review of fix2b — MAJOR
 * defect): a request that does NOT clearly name ONE declared layout
 * resolves to null and gets the wall. Two rules enforce this:
 *   - DISTINCTIVE TITLE WORDS: a word that appears in ANY declared title of
 *     the platform is a NAME word, never a stop word — the words that
 *     distinguish the declared layouts (bench / plate / …) are exactly the
 *     words the scientist uses to name them. STOP_WORDS therefore holds only
 *     genuinely functional words.
 *   - A UNIQUE BEST SCORE is required. A title word shared by SEVERAL
 *     declared variants (e.g. "manual" in all three Manual titles) is not
 *     distinctive — it does not identify the layout the scientist named, so
 *     a match on shared words alone resolves to null. And a TIE on score
 *     resolves to null — never "first declared wins" (the pre-FIX3 rule
 *     silently mounted the WRONG variant through the success channel for
 *     "open the Manual Bench").
 *
 * Deterministic: word-overlap scoring over manifest titles. No inference
 * calls.
 */
import type { PlatformRegistry } from '../platform-registry/PlatformRegistry.js';

/**
 * Functionally meaningless words the overlap scorer ignores — words that
 * carry no layout identity. NEVER include a word that appears in a declared
 * variant title (bench, plate, deck, …): such words are NAME words — they
 * are how the scientist names a layout (FIX3: stop-wording them turned
 * "open the Manual Bench" into a three-way tie on the one remaining word and
 * "first declared wins" mounted the wrong variant).
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'to', 'on', 'in', 'of', 'for', 'with', 'my', 'me', 'go',
  'navigate', 'switch', 'show', 'open', 'use', 'want', 'would', 'like',
  'please',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

/** The DISTINCTIVE title words: a title word that appears in exactly ONE of
 *  the platform's declared titles. A word shared by several titles
 *  identifies no layout — scoring on it would let "the manual deck" resolve
 *  (FIX3: it must not). */
function distinctiveTitleWords(titles: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const title of titles) {
    for (const word of new Set(tokenize(title))) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  const distinctive = new Set<string>();
  for (const [word, count] of counts) {
    if (count === 1) distinctive.add(word);
  }
  return distinctive;
}

/**
 * Score a variant manifest against the request text: number of DISTINCTIVE
 * title words present in the text (word-level, case-insensitive).
 */
function titleOverlapScore(title: string, textTokens: Set<string>, distinctive: Set<string>): number {
  let score = 0;
  for (const word of new Set(tokenize(title))) {
    if (distinctive.has(word) && textTokens.has(word)) score += 1;
  }
  return score;
}

/**
 * Resolve the deck variant the scientist named, from the platform's declared
 * variant TITLES (data). Returns the variantId when the text scores a
 * UNIQUE best against the distinctive title words — a word shared by
 * multiple declared variants never scores (it is not distinctive), and a
 * tie for the best score resolves to null (never "first declared wins").
 * Returns null when nothing in the text clearly names ONE declared layout —
 * the caller offers the plain-language choice wall.
 */
export function resolveDeckVariantFromText(
  registry: PlatformRegistry,
  platformId: string,
  text: string,
): string | null {
  const platform = registry.getPlatform(platformId);
  if (!platform || platform.variants.length === 0) return null;
  const textTokens = new Set(tokenize(text));
  const distinctive = distinctiveTitleWords(platform.variants.map((variant) => variant.title));
  let best: { id: string; score: number } | null = null;
  let tie = false;
  for (const variant of platform.variants) {
    const score = titleOverlapScore(variant.title, textTokens, distinctive);
    if (score <= 0) continue;
    if (best === null || score > best.score) {
      best = { id: variant.id, score };
      tie = false;
    } else if (score === best.score) {
      // Two variants equally well named: the request does not identify ONE
      // layout — never guess (no "first declared wins").
      tie = true;
    }
  }
  if (!best || tie) return null;
  return best.id;
}

/**
 * The PLAIN-LANGUAGE wall for a deck-layout request that names no declared
 * layout: offers the platform's declared layout TITLES for the scientist to
 * pick. No variant ids, no implementation vocabulary — the titles ARE the
 * YAML data. Returns null when the registry knows nothing about the platform
 * (honest: no invented menu).
 */
export function deckLayoutChoiceWall(
  registry: PlatformRegistry,
  platformId: string,
): string | null {
  const platform = registry.getPlatform(platformId);
  if (!platform || platform.variants.length === 0) return null;
  const titles = platform.variants.map((variant) => variant.title);
  const platformName = platform.label;
  if (titles.length === 1) {
    return `The ${platformName} deck has one layout — ${titles[0]}. Say "switch to the ${platformName} deck" and I will open it.`;
  }
  const menu = titles.length <= 3
    ? titles.join(' or ')
    : titles.slice(0, -1).join(', ') + ` or ${titles[titles.length - 1]}`;
  return `I could not tell which ${platformName} layout you want. The ${platformName} deck offers: ${menu}. Name one and I will switch to it.`;
}
