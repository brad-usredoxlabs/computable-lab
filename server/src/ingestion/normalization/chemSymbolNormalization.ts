export interface NormalizationResult {
  normalized: string;
  changed: boolean;
  changes: string[];
}

const SYMBOL_REPLACEMENTS: Array<[RegExp, string, string]> = [
  [/[△∆]/g, 'Δ', 'normalized delta symbol'],
  [/−/g, '-', 'normalized minus sign'],
  [/\s+/g, ' ', 'collapsed whitespace'],
];

export function normalizeChemicalName(input: string): NormalizationResult {
  let value = input.trim();
  const changes: string[] = [];

  for (const [pattern, replacement, label] of SYMBOL_REPLACEMENTS) {
    const next = value.replace(pattern, replacement);
    if (next !== value) {
      value = next;
      changes.push(label);
    }
  }

  const collapsed = value
    .replace(/\b([A-Za-z])\s+(\d+)\b/g, '$1$2')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();

  return {
    normalized: collapsed,
    changed: collapsed !== input.trim() || changes.length > 0,
    changes,
  };
}
