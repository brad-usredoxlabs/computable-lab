import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractCaymanPlateMapSpreadsheet } from './caymanPlateMapSpreadsheet.js';

describe('extractCaymanPlateMapSpreadsheet', () => {
  it('parses plate assignments and chemical enrichment from the Cayman workbook', async () => {
    const workbook = await readFile(resolve(process.cwd(), '../tmp/downloads/Cayman-Lipid-Library.xlsx'));
    const extraction = await extractCaymanPlateMapSpreadsheet({
      contentBase64: workbook.toString('base64'),
      fileName: 'Cayman-Lipid-Library.xlsx',
    });

    expect(extraction.title).toContain('Bio-Active Lipid I Screening Library');
    expect(extraction.uniquePlateNumbers).toHaveLength(13);
    expect(extraction.entries.some((entry) => entry.well === 'A2' && entry.itemNumber === '10010')).toBe(true);

    const prostaglandin = extraction.materialMetadata?.find((entry) => entry.itemNumber === '10010');
    expect(prostaglandin).toBeTruthy();
    expect(prostaglandin?.molecularWeight).toEqual({ value: 336.5, unit: 'g/mol' });
    expect(prostaglandin?.chemicalProperties?.molecular_formula).toBe('C₂₀H₃₂O₄');
    expect(prostaglandin?.chemicalProperties?.cas_number).toBe('14152-28-4');
    expect(prostaglandin?.chemicalProperties?.solubility).toContain('DMSO: 50 mg/ml');
  }, 20000);
});
