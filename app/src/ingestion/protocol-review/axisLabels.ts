/**
 * Read an axis's options as the matrix they are.
 *
 * A vendor handbook names every protocol with the same boilerplate —
 * "Purification of Total DNA from Animal Blood or Cells (Spin-Column Protocol)",
 * "… from Animal Tissues (Spin-Column Protocol)", "… (DNeasy 96 Protocol)" — so
 * a list of eight options repeats the words that MATTER LEAST eight times and
 * buries the two words that distinguish them: the sample type and the method.
 * The reader sees a lump of near-identical names instead of "sample type ×
 * method", which is what the handbook actually asks.
 *
 * Compaction happens in two passes:
 *   1. a trailing bare word shared by EVERY option is filler ("… Rack");
 *   2. options that share a naming FAMILY (two or more leading words) lose that
 *      family's boilerplate. Families matter: a DNeasy list holds four
 *      "Purification of Total DNA from …" protocols AND four "Pretreatment for
 *      …" ones, so the prefix shared by all eight is empty.
 *
 * Display only: the option's value, and the record's own label, are untouched.
 * An option that would be emptied keeps its full text — a blank choice is worse
 * than a repeated word — and a lone shared leading word is kept, because
 * "cells" alone is not a choice.
 */
export function compactAxisLabels(labels: string[]): string[] {
  const trimmed = labels.map((label) => label.trim());
  if (trimmed.length < 2) {
    return trimmed;
  }
  // Nothing to distinguish (a degenerate axis, e.g. a document that prints the
  // same option twice): leaving the names whole is more useful than trimming
  // them down to the words they share.
  if (new Set(trimmed).size === 1) {
    return trimmed;
  }

  let words = trimmed.map((label) => label.split(/\s+/u));

  // Pass 1: the trailing filler every option shares.
  const globalSuffix = sharedTrailingBareWords(words);
  if (globalSuffix > 0) {
    words = words.map((entry) => entry.slice(0, entry.length - globalSuffix));
  }

  // Pass 2: group the options that share a naming family, then drop each
  // family's shared boilerplate.
  const clusters = clusterBySharedPrefix(words);
  const compacted = words.map((entry, index) => {
    const tidied = tidy(entry.join(' '));
    return tidied.length > 0 ? tidied : trimmed[index]!;
  });
  for (const cluster of clusters) {
    if (cluster.length < 2) {
      continue;
    }
    const members = cluster.map((index) => words[index]!);
    const prefix = sharedLeadingWords(members);
    if (prefix <= 0) {
      continue;
    }
    for (const index of cluster) {
      const tidied = tidy(words[index]!.slice(prefix).join(' '));
      if (tidied.length > 0) {
        compacted[index] = tidied;
      }
    }
  }
  return compacted;
}

/** The longest trailing run of identical bare words across every option. */
function sharedTrailingBareWords(words: string[][]): number {
  const shortest = Math.min(...words.map((entry) => entry.length));
  let shared = 0;
  while (shared < shortest - 1) {
    const word = words[0]![words[0]!.length - 1 - shared];
    if (!word || !/^[A-Za-z]+$/u.test(word)) break;
    if (!words.every((entry) => entry[entry.length - 1 - shared]?.toLowerCase() === word.toLowerCase())) break;
    shared += 1;
  }
  return shared;
}

/** Options that share two or more leading words, grouped in encounter order. */
function clusterBySharedPrefix(words: string[][]): number[][] {
  const clusters: number[][] = [];
  words.forEach((entry, index) => {
    let best: { cluster: number[]; shared: number } | undefined;
    for (const cluster of clusters) {
      const shared = sharedLeadingWords([entry, words[cluster[0]!]!]);
      if (shared >= 2 && (!best || shared > best.shared)) {
        best = { cluster, shared };
      }
    }
    if (best) {
      best.cluster.push(index);
    } else {
      clusters.push([index]);
    }
  });
  return clusters;
}

function sharedLeadingWords(members: string[][]): number {
  const shortest = Math.min(...members.map((entry) => entry.length));
  let shared = 0;
  while (shared < shortest) {
    const word = members[0]![shared]?.toLowerCase();
    if (!word || !members.every((entry) => entry[shared]?.toLowerCase() === word)) break;
    shared += 1;
  }
  return shared;
}

/** Drop the noise a trimmed head or tail leaves behind, never a real bracket. */
function tidy(value: string): string {
  return value
    .replace(/\s+/gu, ' ')
    .replace(/^[\s)]+/u, '')
    .replace(/\s+$/u, '')
    .replace(/\s*\([^)]*$/u, '')
    .replace(/[,\-–;]+$/u, '')
    .trim();
}

/**
 * Is this question nested inside a protocol — and is that protocol chosen?
 *
 * A handbook asks the same sub-question inside several protocols (DNeasy asks
 * "which variant of step 1?" in the spin-column protocol and again in the
 * DNeasy 96 protocol). Asking them side by side reads as a duplicate; the
 * question belongs to the protocol that raised it, so it is shown once that
 * protocol is chosen.
 */
export function isAxisVisible(
  axis: { axisId: string; sectionId?: string },
  choices: Record<string, string>,
  protocolAxisIds: string[],
): boolean {
  if (!axis.sectionId) {
    return true;
  }
  return protocolAxisIds.some((axisId) => choices[axisId] === axis.sectionId);
}
