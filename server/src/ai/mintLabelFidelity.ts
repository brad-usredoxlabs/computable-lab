/**
 * A minted label must be the user's words, not the model's paraphrase.
 *
 * Observed 2026-09-20: the user wrote "add 100,000 HepG2 cells to each well" and
 * the model minted **"HepG23"**. Harm: the clarification then asks "Which
 * material is 'HepG23'?" and the picker searches a name that exists nowhere, so
 * the biologist is left hunting a typo the model invented.
 *
 * The rule here is conservative on purpose — the words belong to the biologist:
 *
 *   - a label that already appears in the user's message (or the resolved
 *     context) is left EXACTLY as minted;
 *   - a label with an unambiguous near-match in the user's own words (an
 *     off-by-one edit, or a prefix relation) is replaced by THAT phrase, and the
 *     substitution is reported in plain language;
 *   - anything else is left alone and reported, never guessed at.
 *
 * Nothing is invented: every replacement is a substring of what the user typed.
 */

type Dict = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Normalize for comparison: case, whitespace, and trailing punctuation. */
export function normalizeWords(value: string): string {
  return value.trim().toLowerCase().replace(/[.,;]+$/, '').replace(/\s+/g, ' ');
}

/** Bounded edit distance — we only care about "one or two characters off". */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** Is `label` present in the source text as written? */
export function labelIsTraceable(label: string, sources: readonly string[]): boolean {
  const needle = normalizeWords(label);
  if (!needle) return false;
  return sources.some((source) => normalizeWords(source).includes(needle));
}

/**
 * The user's own phrase that the label was probably meant to be. Returns null
 * when nothing is close enough, or when two candidates are equally close (an
 * ambiguous guess is worse than no guess).
 */
export function nearestUserPhrase(label: string, source: string): string | null {
  const needle = normalizeWords(label);
  if (!needle) return null;
  const words = source.split(/\s+/).filter((w) => w.trim().length > 0);
  const candidates = new Map<string, number>();
  // Compare against single words and two-word phrases: a material name is
  // usually one of those ("HepG2", "1 mM clofibrate").
  for (let i = 0; i < words.length; i += 1) {
    for (const span of [1, 2]) {
      const phrase = words.slice(i, i + span).join(' ');
      if (!phrase) continue;
      const normalized = normalizeWords(phrase);
      if (!normalized) continue;
      const tolerance = Math.max(1, Math.floor(normalized.length / 4));
      const distance = editDistance(needle, normalized, tolerance);
      if (distance <= tolerance) candidates.set(phrase, distance);
    }
  }
  if (candidates.size === 0) return null;
  const sorted = [...candidates.entries()].sort((a, b) => a[1] - b[1]);
  if (sorted.length > 1 && sorted[0]![1] === sorted[1]![1]) return null; // ambiguous
  return sorted[0]![0]!;
}

const MINT_REF_FIELDS = [
  'material_ref',
  'material_spec_ref',
  'material_instance_ref',
  'aliquot_ref',
  'vendor_product_ref',
] as const;

/** The minted label a ref carries, if it is a mint at all. */
function mintedLabelOf(ref: Dict): string {
  const mint = ref['mint'];
  if (mint && typeof mint === 'object' && !Array.isArray(mint)) {
    const label = asString((mint as Dict)['label']) || asString((mint as Dict)['name']);
    if (label) return label;
  }
  const id = asString(ref['id']);
  if (id.startsWith('mint:')) return id.slice('mint:'.length).trim();
  if (asString(ref['kind']) === 'draft') return asString(ref['label']);
  return '';
}

/**
 * Replace off-by-a-character minted labels with the user's own words. Mutates
 * nothing: returns new events plus a plain-language note per substitution.
 */
export function repairMintedLabelsAgainstUserWords<T>(
  events: readonly T[],
  userWords: readonly string[],
): { events: T[]; notes: string[] } {
  const notes: string[] = [];
  const out = events.map((ev) => {
    if (!ev || typeof ev !== 'object') return ev;
    const e = ev as Dict;
    const details = (e['details'] && typeof e['details'] === 'object' ? (e['details'] as Dict) : null);
    if (!details) return ev;
    let nextDetails: Dict | null = null;
    for (const field of MINT_REF_FIELDS) {
      const ref = details[field];
      if (!ref || typeof ref !== 'object' || Array.isArray(ref)) continue;
      const label = mintedLabelOf(ref as Dict);
      if (!label) continue;
      if (labelIsTraceable(label, userWords)) continue;
      let replacement: string | null = null;
      for (const source of userWords) {
        replacement = nearestUserPhrase(label, source);
        if (replacement) break;
      }
      if (!replacement) continue;
      const refDict = ref as Dict;
      const mint = refDict['mint'];
      const patched: Dict = mint && typeof mint === 'object' && !Array.isArray(mint)
        ? { ...refDict, mint: { ...(mint as Dict), label: replacement } }
        : { ...refDict, label: replacement };
      nextDetails = { ...(nextDetails ?? details), [field]: patched };
      notes.push(
        `I used your words "${replacement}" instead of the model's "${label}" (it did not appear in your message).`,
      );
    }
    return nextDetails ? ({ ...e, details: nextDetails } as T) : ev;
  });
  return { events: out, notes };
}
