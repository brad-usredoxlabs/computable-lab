/** Sequence algorithms. Symbol sets and complements are declared in alphabets.yaml. */
export interface AlphabetSpec { symbols: Record<string, string>; complements?: Record<string, string> }
export interface Template { id: string; revisionId?: string; alphabet?: string; residues: string; topology: string }
export interface PcrParameters { minLength: number; maxLength: number; maxMismatches: number; exactThreePrime: number; maxProducts: number }
export interface BindingSite { start: number; end: number; strand: '+' | '-'; mismatches: number[] }
export interface Product {
  referenceId: string; referenceRevisionId?: string; start: number; end: number; strand: '+' | '-'; wrapsOrigin: boolean;
  length: number; residues: string; templateResidues: string; forward: BindingSite; reverse: BindingSite; probeSites: BindingSite[];
}
export function normalizeSequence(raw: string, alphabet: AlphabetSpec): string {
  const value = raw.replace(/\s+/g, '').toUpperCase();
  if (!value) throw new Error('Sequence is empty.');
  for (let i = 0; i < value.length; i++) if (!alphabet.symbols[value[i]!]) throw new Error(`Unrecognized sequence symbol '${value[i]}' at base ${i + 1}. Keep modifications in the oligo specification.`);
  return value;
}
export function reverseComplement(value: string, alphabet: AlphabetSpec): string {
  if (!alphabet.complements) throw new Error('This alphabet has no reverse complement.');
  return [...value].reverse().map(x => {
    const complement = alphabet.complements![x];
    if (!complement) throw new Error(`Cannot complement ${x}`);
    return complement;
  }).join('');
}
function matchingSites(template: string, primer: string, p: PcrParameters, alphabet: AlphabetSpec): Array<{ offset: number; mismatches: number[] }> {
  const sites: Array<{ offset: number; mismatches: number[] }> = [];
  for (let i = 0; i <= template.length - primer.length; i++) {
    const mismatches: number[] = [];
    for (let j = 0; j < primer.length; j++) {
      // Conservative ambiguity: every possible template base must be covered by the primer symbol.
      const query = alphabet.symbols[primer[j]!]!;
      const subject = alphabet.symbols[template[i + j]!]!;
      if (![...subject].every(x => query.includes(x))) {
        if (j >= primer.length - p.exactThreePrime) { mismatches.push(-1); break; }
        mismatches.push(j + 1);
        if (mismatches.length > p.maxMismatches) break;
      }
    }
    if (!mismatches.includes(-1) && mismatches.length <= p.maxMismatches) sites.push({ offset: i, mismatches });
  }
  return sites;
}
/** Predictions only. Coordinates refer to the submitted reference, 1-based inclusive. */
export function virtualPcr(templates: Template[], forward: string, reverse: string, probe: string | undefined, p: PcrParameters, alphabet: AlphabetSpec): Product[] {
  if (p.minLength > p.maxLength) throw new Error('Minimum product length exceeds maximum length.');
  if (p.exactThreePrime > Math.min(forward.length, reverse.length)) throw new Error('Exact 3-prime length exceeds primer length.');
  forward = normalizeSequence(forward, alphabet); reverse = normalizeSequence(reverse, alphabet);
  if (probe) probe = normalizeSequence(probe, alphabet);
  const result: Product[] = [];
  for (const t of templates) {
    const original = normalizeSequence(t.residues, alphabet); const n = original.length;
    for (const strand of ['+', '-'] as const) {
      const oriented = strand === '+' ? original : reverseComplement(original, alphabet);
      const extended = t.topology === 'circular' ? oriented + oriented : oriented;
      const fSites = matchingSites(extended, forward, p, alphabet).filter(x => x.offset < n);
      // Match the reverse primer in its own 5'→3' orientation so the 3' rule applies correctly.
      const reverseTemplate = reverseComplement(extended, alphabet);
      const rSites = matchingSites(reverseTemplate, reverse, p, alphabet).map(x => ({ ...x, offset: extended.length - x.offset - reverse.length }));
      const coordinate = (i: number) => strand === '+' ? (i % n) + 1 : n - (i % n);
      for (const f of fSites) for (const r of rSites) {
        const end = r.offset + reverse.length; const length = end - f.offset;
        if (r.offset < f.offset + forward.length || length < p.minLength || length > p.maxLength || length > n) continue;
        const residues = extended.slice(f.offset, end);
        const probeSites: BindingSite[] = [];
        if (probe) {
          const internal = residues.slice(forward.length, -reverse.length);
          for (const ps of ['+', '-'] as const) {
            const search = ps === '+' ? internal : reverseComplement(internal, alphabet);
            for (const hit of matchingSites(search, probe, { ...p, maxMismatches: 0, exactThreePrime: 0 }, alphabet)) {
              const offset = f.offset + forward.length + (ps === '+' ? hit.offset : internal.length - hit.offset - probe.length);
              probeSites.push({ start: coordinate(offset), end: coordinate(offset + probe.length - 1), strand: ps === '+' ? strand : strand === '+' ? '-' : '+', mismatches: [] });
            }
          }
        }
        result.push({ referenceId: t.id, ...(t.revisionId?{referenceRevisionId:t.revisionId}:{}), start: coordinate(f.offset), end: coordinate(end - 1), strand, wrapsOrigin: end > n, length, templateResidues: residues, residues:forward+residues.slice(forward.length,-reverse.length)+reverseComplement(reverse,alphabet),
          forward: { start: coordinate(f.offset), end: coordinate(f.offset + forward.length - 1), strand, mismatches: f.mismatches },
          reverse: { start: coordinate(end - 1), end: coordinate(r.offset), strand: strand === '+' ? '-' : '+', mismatches: r.mismatches }, probeSites });
        if (result.length > p.maxProducts) throw new Error('Product limit exceeded. Narrow the reference collection or increase maxProducts explicitly.');
      }
    }
  }
  return result.sort((a,b) => a.referenceId.localeCompare(b.referenceId) || a.start-b.start || a.end-b.end || a.strand.localeCompare(b.strand));
}
export function parseFasta(text: string): Array<{ label: string; residues: string }> {
  const entries: Array<{ label: string; residues: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('>')) entries.push({ label: line.slice(1).trim(), residues: '' });
    else if (line.trim()) {
      if (!entries.length) throw new Error('FASTA must begin with a >name header.');
      entries[entries.length - 1]!.residues += line.trim();
    }
  }
  if (entries.some(x => !x.label || !x.residues)) throw new Error('Every FASTA entry needs a name and sequence.');
  return entries;
}
