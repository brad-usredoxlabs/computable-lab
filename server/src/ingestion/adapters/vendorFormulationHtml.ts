import { extractHtmlSections } from '../html/HtmlSectionExtractionService.js';

export interface VendorFormulationIngredient {
  componentName: string;
  role: 'solute' | 'solvent' | 'buffer_component' | 'additive' | 'activity_source' | 'cells' | 'other';
  amountText: string;
  concentration?: { value: number; unit: string; basis: string } | undefined;
  rowIndex: number;
  tableIndex: number;
}

export interface VendorFormulationVariant {
  id: string;
  label: string;
  sourceSection: string;
  ingredients: VendorFormulationIngredient[];
}

export interface VendorFormulationExtraction {
  title: string;
  sourceUrl?: string | undefined;
  vendor: string;
  variants: VendorFormulationVariant[];
  warnings: string[];
  sha256: string;
  htmlExcerpt: string;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'variant';
}

function inferRole(name: string): VendorFormulationIngredient['role'] {
  if (/\bwater\b|h2o/i.test(name)) return 'solvent';
  if (/\bbicarbonate\b|\bphosphate\b|\bhepes\b|\bchloride\b|\bsulfate\b/i.test(name)) return 'buffer_component';
  if (/\bglucose\b|\bglutamine\b|\bpyruvate\b|\bphenol red\b|\bvitamin\b/i.test(name)) return 'additive';
  if (/\bserum\b|\balbumin\b/i.test(name)) return 'activity_source';
  return 'solute';
}

function concentrationBasis(unit: string): string | undefined {
  if (['M', 'mM', 'uM', 'nM', 'pM', 'fM'].includes(unit)) return 'molar';
  if (['g/L', 'mg/mL', 'ug/mL', 'ng/mL'].includes(unit)) return 'mass_per_volume';
  if (['U/mL', 'U/uL'].includes(unit)) return 'activity_per_volume';
  if (['cells/mL', 'cells/uL'].includes(unit)) return 'count_per_volume';
  if (unit === '% v/v') return 'volume_fraction';
  if (unit === '% w/v') return 'mass_fraction';
  return undefined;
}

function parseConcentration(amountText: string): VendorFormulationIngredient['concentration'] {
  const match = amountText.match(/([0-9]+(?:\.[0-9]+)?)\s*(M|mM|uM|nM|pM|fM|g\/L|mg\/mL|ug\/mL|ng\/mL|U\/mL|U\/uL|cells\/mL|cells\/uL|% v\/v|% w\/v)\b/i);
  if (!match) return undefined;
  const unit = match[2] ?? '';
  const basis = concentrationBasis(unit);
  if (!basis) return undefined;
  return {
    value: Number(match[1]),
    unit,
    basis,
  };
}

function isLikelyHeaderRow(cells: string[]): boolean {
  const first = cells[0]?.toLowerCase() ?? '';
  const second = cells[1]?.toLowerCase() ?? '';
  return /component|ingredient|constituent/.test(first) || /amount|concentration|quantity|g\/l|mg\/ml/.test(second);
}

async function loadHtml(input: { contentBase64?: string; sourceUrl?: string }): Promise<string> {
  if (input.contentBase64) {
    return Buffer.from(input.contentBase64, 'base64').toString('utf8');
  }
  if (!input.sourceUrl) {
    throw new Error('Vendor formulation HTML ingestion requires contentBase64 or sourceUrl.');
  }
  const response = await fetch(input.sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch vendor formulation HTML: HTTP ${response.status}`);
  }
  return await response.text();
}

export async function extractVendorFormulationHtml(input: {
  contentBase64?: string;
  sourceUrl?: string;
}): Promise<VendorFormulationExtraction> {
  const html = await loadHtml(input);
  const extracted = extractHtmlSections(html);
  const warnings: string[] = [];
  const variants: VendorFormulationVariant[] = [];

  for (const section of extracted.sections) {
    if (!/rpmi|formulation|medium/i.test(section.title) && !/component|ingredient|medium/i.test(section.text)) {
      continue;
    }
    const table = section.tables.find((candidate) => candidate.rows.some((row) => row.cells.length >= 2));
    if (!table) continue;
    const ingredientRows = table.rows.filter((row, index) => {
      if (row.cells.length < 2) return false;
      if (index === 0 && isLikelyHeaderRow(row.cells)) return false;
      return true;
    });
    if (ingredientRows.length === 0) {
      warnings.push(`Section "${section.title}" did not contain ingredient rows.`);
      continue;
    }
    const ingredients = ingredientRows.map((row) => {
      const componentName = row.cells[0] ?? '';
      const amountText = row.cells.slice(1).join(' ').trim();
      return {
        componentName,
        role: inferRole(componentName),
        amountText,
        concentration: parseConcentration(amountText),
        rowIndex: row.rowIndex,
        tableIndex: table.index,
      };
    }).filter((row) => row.componentName && row.amountText);

    if (ingredients.length === 0) continue;
    variants.push({
      id: `variant-${slug(section.title)}`,
      label: section.title,
      sourceSection: section.title,
      ingredients,
    });
  }

  return {
    title: extracted.title,
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    vendor: /sigma/i.test(extracted.title) || /sigma/i.test(extracted.text) ? 'Sigma-Aldrich' : 'Vendor',
    variants,
    warnings,
    sha256: extracted.sha256,
    htmlExcerpt: extracted.text.slice(0, 500),
  };
}
