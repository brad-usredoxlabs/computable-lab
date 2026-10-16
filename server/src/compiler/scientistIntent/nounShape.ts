/**
 * SH-QA-3 — the noun-shape DATA (OQ1 ruling): what counts as a CURIE-worthy
 * lab term vs a prose sentence is DECLARED policy, not a TypeScript branch.
 *
 * The policy lives in the drafting-config home
 * `config/drafting/shorthand-drafting.yaml` under a `nounShape:` section (the
 * per-call drafting-config precedent — never process-cached, so a data edit
 * needs no stack restart; the cue loader is the sibling idiom). It declares:
 *   • `mintRefusePatterns:` — sentence-shape DATA patterns seeded ONLY by what
 *     the RED plan pins (a ratio blob naming a word after it, a spaced
 *     percentage naming a word after it, a prose connective flanked by words);
 *   • `connectives:` — the words the redundancy residue step (mixtureLabel
 *     Redundancy) may delete as glue.
 *
 * A label is MINT-REFUSED when it matches a DATA pattern. A cue hit alone must
 * NOT refuse mint ("1 mM Clofibrate in DMSO" hits the " in " cue and is a
 * legitimately mintable formulation when unbound — the refusal is keyed on
 * sentence SHAPE, never on " in " or "%" alone). The refusal never removes the
 * QUESTION — only the mint affordance.
 *
 * Loader contract (cue-loader parity): malformed DATA THROWS naming the path;
 * an absent `nounShape:` section ⇒ null ⇒ NO refusals (disclosed, silent-off).
 * Zero phrase literals in TypeScript: the TS knows only "this label matches a
 * DATA pattern".
 */
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

const NOUN_SHAPE_PATH = new URL('../../../../config/drafting/shorthand-drafting.yaml', import.meta.url);

export interface NounShapePolicy {
  /** Compiled sentence-shape patterns (DATA regexes from the YAML). */
  mintRefusePatterns: readonly RegExp[];
  /** DATA connective words (lowercased) the residue step may delete. */
  connectives: ReadonlySet<string>;
  /** Compiled quantity/unit residue patterns (DATA): glue the residue step
   *  may also delete (bare counts, unit abbreviations). */
  residueIgnorePatterns: readonly RegExp[];
}

/** Load + validate the `nounShape:` section PER call. Absent file or absent
 *  section ⇒ null (NO refusals). A present-but-malformed section throws,
 *  naming the path (malformed DATA is not an off-state). */
export function loadNounShape(path: URL | string = NOUN_SHAPE_PATH): NounShapePolicy | null {
  const displayPath = String(path);
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`noun-shape data unreadable: ${error instanceof Error ? error.message : String(error)} (${displayPath})`);
  }
  if (raw === undefined || raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const section = (raw as Record<string, unknown>).nounShape;
  if (section === undefined || section === null) return null;
  if (typeof section !== 'object' || Array.isArray(section)) {
    throw new Error(`noun-shape data (${displayPath}): \`nounShape:\` must be an object`);
  }
  const patterns = (section as Record<string, unknown>).mintRefusePatterns;
  const connectives = (section as Record<string, unknown>).connectives;
  const residueIgnore = (section as Record<string, unknown>).residueIgnorePatterns;
  if (patterns === undefined && connectives === undefined) return null;
  if (!Array.isArray(patterns) || patterns.length === 0 || !patterns.every((p) => typeof p === 'string' && p.trim().length > 0)) {
    throw new Error(`noun-shape data (${displayPath}): \`nounShape.mintRefusePatterns\` must be a non-empty string list`);
  }
  const compileList = (raw: unknown, key: string): RegExp[] => {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || !raw.every((p) => typeof p === 'string' && p.trim().length > 0)) {
      throw new Error(`noun-shape data (${displayPath}): \`nounShape.${key}\` must be a string list`);
    }
    return raw.map((pattern) => {
      try {
        return new RegExp(String(pattern), 'iu');
      } catch (error) {
        throw new Error(
          `noun-shape data (${displayPath}): invalid ${key} entry "${pattern}": `
          + `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  };
  const compiled = compileList(patterns, 'mintRefusePatterns');
  const residueIgnorePatterns = compileList(residueIgnore, 'residueIgnorePatterns');
  const words = new Set<string>();
  if (connectives !== undefined) {
    if (!Array.isArray(connectives) || !connectives.every((w) => typeof w === 'string' && w.trim().length > 0)) {
      throw new Error(`noun-shape data (${displayPath}): \`nounShape.connectives\` must be a string list`);
    }
    for (const word of connectives) words.add(word.trim().toLowerCase());
  }
  return { mintRefusePatterns: compiled, connectives: words, residueIgnorePatterns };
}

/** The shared mint gate BOTH offer surfaces call (engine unknown-noun arm +
 *  the chat card map): a label is mintable unless a DATA sentence-shape
 *  pattern refuses it. An absent policy (null) ⇒ everything mintable (NO
 *  refusals). Cue membership is NOT consulted here — a cue hit never refuses
 *  mint (the clofibrate/lysozyme/Triton canon). */
export function isMintableLabel(label: string, shape: NounShapePolicy | null): boolean {
  if (!shape) return true;
  const normalized = label.trim().replace(/\s+/gu, ' ').toLowerCase();
  if (!normalized) return false;
  return !shape.mintRefusePatterns.some((pattern) => pattern.test(normalized));
}
