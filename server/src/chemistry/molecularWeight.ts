type MolecularWeightSource = 'chebi' | 'pubchem' | 'formula' | 'unresolved';

export interface MolecularWeightResolution {
  resolved: boolean;
  source: MolecularWeightSource;
  molecularWeight?: number;
  formula?: string;
  matchedName?: string;
  chebiId?: string;
  pubchemCid?: number;
}

interface ChEBIFetchResult {
  chebiId: string;
  name?: string;
  formula?: string;
  molecularWeight?: number;
}

interface PubChemSearchResult {
  cid?: number;
  iupacName?: string;
  formula?: string;
  molecularWeight?: number;
}

const PUBCHEM_BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const TIMEOUT_MS = 15_000;

const ATOMIC_WEIGHTS: Record<string, number> = {
  H: 1.008,
  He: 4.0026,
  Li: 6.94,
  Be: 9.0122,
  B: 10.81,
  C: 12.011,
  N: 14.007,
  O: 15.999,
  F: 18.998,
  Ne: 20.18,
  Na: 22.99,
  Mg: 24.305,
  Al: 26.982,
  Si: 28.085,
  P: 30.974,
  S: 32.06,
  Cl: 35.45,
  Ar: 39.948,
  K: 39.098,
  Ca: 40.078,
  Sc: 44.956,
  Ti: 47.867,
  V: 50.942,
  Cr: 51.996,
  Mn: 54.938,
  Fe: 55.845,
  Co: 58.933,
  Ni: 58.693,
  Cu: 63.546,
  Zn: 65.38,
  Ga: 69.723,
  Ge: 72.63,
  As: 74.922,
  Se: 78.971,
  Br: 79.904,
  Kr: 83.798,
  Rb: 85.468,
  Sr: 87.62,
  Y: 88.906,
  Zr: 91.224,
  Nb: 92.906,
  Mo: 95.95,
  Tc: 98,
  Ru: 101.07,
  Rh: 102.91,
  Pd: 106.42,
  Ag: 107.87,
  Cd: 112.41,
  In: 114.82,
  Sn: 118.71,
  Sb: 121.76,
  Te: 127.6,
  I: 126.9,
  Xe: 131.29,
  Cs: 132.91,
  Ba: 137.33,
  La: 138.91,
  Ce: 140.12,
  Pr: 140.91,
  Nd: 144.24,
  Sm: 150.36,
  Eu: 151.96,
  Gd: 157.25,
  Tb: 158.93,
  Dy: 162.5,
  Ho: 164.93,
  Er: 167.26,
  Tm: 168.93,
  Yb: 173.05,
  Lu: 174.97,
  Hf: 178.49,
  Ta: 180.95,
  W: 183.84,
  Re: 186.21,
  Os: 190.23,
  Ir: 192.22,
  Pt: 195.08,
  Au: 196.97,
  Hg: 200.59,
  Tl: 204.38,
  Pb: 207.2,
  Bi: 208.98,
  Th: 232.04,
  U: 238.03,
};

function withTimeout(): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}

function normalizeChebiId(id: string | undefined, uri?: string): string | undefined {
  if (id && /^CHEBI:\d+$/i.test(id.trim())) return id.trim().toUpperCase();
  if (id && /^\d+$/.test(id.trim())) return `CHEBI:${id.trim()}`;
  if (uri) {
    const match = uri.match(/CHEBI_(\d+)/i);
    if (match?.[1]) return `CHEBI:${match[1]}`;
  }
  return undefined;
}

function parseNumericWeight(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function roundWeight(value: number): number {
  return Number(value.toFixed(4));
}

async function fetchChebiById(chebiId: string): Promise<ChEBIFetchResult | undefined> {
  const { signal, cleanup } = withTimeout();
  try {
    const numericId = chebiId.replace(/^CHEBI:/i, '');
    const encodedIri = encodeURIComponent(`http://purl.obolibrary.org/obo/CHEBI_${numericId}`);
    const response = await fetch(`https://www.ebi.ac.uk/ols4/api/ontologies/chebi/terms/${encodedIri}`, { signal });
    if (!response.ok) return undefined;
    const term = await response.json() as Record<string, unknown>;
    const annotation = term.annotation as Record<string, unknown> | undefined;
    const formulaValues = Array.isArray(annotation?.formula) ? annotation?.formula as unknown[] : [];
    const massValues = Array.isArray(annotation?.monoisotopicmass) ? annotation?.monoisotopicmass as unknown[] : [];
    const molecularWeight = parseNumericWeight(massValues[0]);
    return {
      chebiId: `CHEBI:${numericId}`,
      ...(typeof term.label === 'string' && term.label.trim() ? { name: term.label.trim() } : {}),
      ...(typeof formulaValues[0] === 'string' && formulaValues[0].trim() ? { formula: formulaValues[0].trim() } : {}),
      ...(typeof molecularWeight === 'number' ? { molecularWeight } : {}),
    };
  } finally {
    cleanup();
  }
}

async function searchPubChemByName(query: string): Promise<PubChemSearchResult | undefined> {
  const { signal, cleanup } = withTimeout();
  try {
    const searchUrl = `${PUBCHEM_BASE}/compound/name/${encodeURIComponent(query)}/cids/JSON`;
    const searchResponse = await fetch(searchUrl, { signal });
    if (!searchResponse.ok) return undefined;
    const searchJson = await searchResponse.json() as { IdentifierList?: { CID?: number[] } };
    const cid = searchJson.IdentifierList?.CID?.[0];
    if (!cid) return undefined;
    const propsUrl = `${PUBCHEM_BASE}/compound/cid/${cid}/property/IUPACName,MolecularFormula,MolecularWeight/JSON`;
    const propsResponse = await fetch(propsUrl, { signal });
    if (!propsResponse.ok) return { cid };
    const propsJson = await propsResponse.json() as {
      PropertyTable?: { Properties?: Array<Record<string, unknown>> };
    };
    const property = propsJson.PropertyTable?.Properties?.[0];
    if (!property) return { cid };
    const molecularWeight = parseNumericWeight(property.MolecularWeight);
    return {
      cid,
      ...(typeof property.IUPACName === 'string' && property.IUPACName.trim()
        ? { iupacName: property.IUPACName.trim() }
        : {}),
      ...(typeof property.MolecularFormula === 'string' && property.MolecularFormula.trim()
        ? { formula: property.MolecularFormula.trim() }
        : {}),
      ...(typeof molecularWeight === 'number'
        ? { molecularWeight }
        : {}),
    };
  } finally {
    cleanup();
  }
}

function mergeCounts(target: Record<string, number>, source: Record<string, number>, multiplier = 1): void {
  for (const [symbol, count] of Object.entries(source)) {
    target[symbol] = (target[symbol] ?? 0) + count * multiplier;
  }
}

function parseNumberToken(formula: string, start: number): { value: number; nextIndex: number } | null {
  let index = start;
  while (index < formula.length && /[\d.]/.test(formula[index] || '')) index += 1;
  if (index === start) return null;
  const raw = formula.slice(start, index);
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return { value, nextIndex: index };
}

function parseFormulaGroup(formula: string, startIndex = 0, stopChar?: string): { counts: Record<string, number>; nextIndex: number } | null {
  const counts: Record<string, number> = {};
  let index = startIndex;
  while (index < formula.length) {
    const char = formula[index] || '';
    if (stopChar && char === stopChar) {
      return { counts, nextIndex: index + 1 };
    }
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') {
      const closeChar = char === '(' ? ')' : char === '[' ? ']' : '}';
      const nested = parseFormulaGroup(formula, index + 1, closeChar);
      if (!nested) return null;
      index = nested.nextIndex;
      const multiplierToken = parseNumberToken(formula, index);
      const multiplier = multiplierToken?.value ?? 1;
      index = multiplierToken?.nextIndex ?? index;
      mergeCounts(counts, nested.counts, multiplier);
      continue;
    }
    if (/[A-Z]/.test(char)) {
      let symbol = char;
      index += 1;
      while (index < formula.length && /[a-z]/.test(formula[index] || '')) {
        symbol += formula[index];
        index += 1;
      }
      const multiplierToken = parseNumberToken(formula, index);
      const count = multiplierToken?.value ?? 1;
      index = multiplierToken?.nextIndex ?? index;
      counts[symbol] = (counts[symbol] ?? 0) + count;
      continue;
    }
    if (char === '+' || char === '-') {
      break;
    }
    if (/\d/.test(char)) {
      return null;
    }
    index += 1;
  }
  if (stopChar) return null;
  return { counts, nextIndex: index };
}

export function computeMolecularWeightFromFormula(formula: string): number | undefined {
  const cleaned = formula
    .trim()
    .replace(/\s+/g, '')
    .replace(/[−–]/g, '-')
    .replace(/^\.+|\.+$/g, '');
  if (!cleaned) return undefined;

  const segments = cleaned.split(/[·•.]/).filter(Boolean);
  if (segments.length === 0) return undefined;

  const combinedCounts: Record<string, number> = {};

  for (const segment of segments) {
    const leading = parseNumberToken(segment, 0);
    const multiplier = leading?.value ?? 1;
    const bodyStart = leading?.nextIndex ?? 0;
    const parsed = parseFormulaGroup(segment, bodyStart);
    if (!parsed) return undefined;
    mergeCounts(combinedCounts, parsed.counts, multiplier);
  }

  let total = 0;
  for (const [symbol, count] of Object.entries(combinedCounts)) {
    const atomicWeight = ATOMIC_WEIGHTS[symbol];
    if (!atomicWeight) return undefined;
    total += atomicWeight * count;
  }
  return roundWeight(total);
}

export async function resolveOntologyMolecularWeight(input: {
  namespace?: string;
  id?: string;
  label?: string;
  uri?: string;
}): Promise<MolecularWeightResolution> {
  const namespace = input.namespace?.trim().toUpperCase();
  const chebiId = normalizeChebiId(input.id, input.uri);
  const label = input.label?.trim();

  let chebiFormula: string | undefined;
  let searchName = label;

  if (namespace === 'CHEBI' || chebiId) {
    const chebi = chebiId ? await fetchChebiById(chebiId).catch(() => undefined) : undefined;
    if (chebi) {
      chebiFormula = chebi.formula;
      if (!searchName && chebi.name) searchName = chebi.name;
      if (typeof chebi.molecularWeight === 'number') {
        return {
          resolved: true,
          source: 'chebi',
          molecularWeight: roundWeight(chebi.molecularWeight),
          ...(chebi.formula ? { formula: chebi.formula } : {}),
          ...(chebi.name ? { matchedName: chebi.name } : {}),
          chebiId: chebi.chebiId,
        };
      }
    }
  }

  if (searchName) {
    const pubchem = await searchPubChemByName(searchName).catch(() => undefined);
    if (pubchem?.molecularWeight !== undefined) {
      return {
        resolved: true,
        source: 'pubchem',
        molecularWeight: roundWeight(pubchem.molecularWeight),
        ...(pubchem.formula ? { formula: pubchem.formula } : {}),
        ...(pubchem.iupacName || searchName ? { matchedName: pubchem.iupacName || searchName } : {}),
        ...(chebiId ? { chebiId } : {}),
        ...(typeof pubchem.cid === 'number' ? { pubchemCid: pubchem.cid } : {}),
      };
    }
    const formulaForFallback = chebiFormula || pubchem?.formula;
    const computed = formulaForFallback ? computeMolecularWeightFromFormula(formulaForFallback) : undefined;
    if (computed !== undefined) {
      return {
        resolved: true,
        source: 'formula',
        molecularWeight: computed,
        ...(formulaForFallback ? { formula: formulaForFallback } : {}),
        ...(pubchem?.iupacName || searchName ? { matchedName: pubchem?.iupacName || searchName } : {}),
        ...(chebiId ? { chebiId } : {}),
        ...(typeof pubchem?.cid === 'number' ? { pubchemCid: pubchem.cid } : {}),
      };
    }
  }

  if (chebiFormula) {
    const computed = computeMolecularWeightFromFormula(chebiFormula);
    if (computed !== undefined) {
      return {
        resolved: true,
        source: 'formula',
        molecularWeight: computed,
        formula: chebiFormula,
        ...(searchName ? { matchedName: searchName } : {}),
        ...(chebiId ? { chebiId } : {}),
      };
    }
  }

  return {
    resolved: false,
    source: 'unresolved',
    ...(chebiFormula ? { formula: chebiFormula } : {}),
    ...(searchName ? { matchedName: searchName } : {}),
    ...(chebiId ? { chebiId } : {}),
  };
}
