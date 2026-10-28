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
 * Deterministic: word-overlap scoring over manifest titles, first-declared
 * wins ties. No inference calls.
 */
import type { PlatformRegistry } from '../platform-registry/PlatformRegistry.js';

/** Stop-words the overlap scorer ignores (functional words, not names). */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'to', 'on', 'in', 'of', 'for', 'with', 'my', 'me', 'go',
  'navigate', 'switch', 'show', 'open', 'use', 'want', 'would', 'like',
  'please', 'deck', 'bench', 'plate', 'well', 'wells',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

/**
 * Score a variant manifest against the request text: number of distinct
 * title words present in the text (word-level, case-insensitive).
 */
function titleOverlapScore(title: string, textTokens: Set<string>): number {
  const titleWords = tokenize(title);
  let score = 0;
  for (const word of titleWords) {
    if (textTokens.has(word)) score += 1;
  }
  return score;
}

/**
 * Resolve the deck variant the scientist named, from the platform's declared
 * variant TITLES (data). Returns the variantId of the best match when at
 * least one title word of that variant appears in the text; ties keep the
 * FIRST declared variant (manifest order is the platform's own ranking).
 * Returns null when nothing in the text names a declared layout.
 */
export function resolveDeckVariantFromText(
  registry: PlatformRegistry,
  platformId: string,
  text: string,
): string | null {
  const platform = registry.getPlatform(platformId);
  if (!platform || platform.variants.length === 0) return null;
  const textTokens = new Set(tokenize(text));
  let best: { id: string; score: number } | null = null;
  for (const variant of platform.variants) {
    const score = titleOverlapScore(variant.title, textTokens);
    if (score > 0 && (best === null || score > best.score)) {
      best = { id: variant.id, score };
    }
  }
  return best?.id ?? null;
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
