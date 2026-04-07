import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractCaymanPlateMapPdf } from './caymanPlateMapPdf.js';

describe('Cayman plate map PDF adapter', () => {
  it('extracts plate rows, unused wells, and wrapped names from the Cayman library PDF', async () => {
    const repoRoot = resolve(process.cwd(), '..');
    const pdfPath = resolve(repoRoot, 'tmp/flex/cayman-lipid-library.pdf');
    const buffer = await readFile(pdfPath);
    const result = await extractCaymanPlateMapPdf({
      contentBase64: buffer.toString('base64'),
      fileName: 'cayman-lipid-library.pdf',
    });

    expect(result.title).toContain('Bio-Active Lipid I Screening Library');
    expect(result.uniquePlateNumbers).toHaveLength(13);
    expect(result.entries.length).toBeGreaterThanOrEqual(13 * 96);
    expect(result.unusedWellCount).toBeGreaterThan(0);
    expect(result.entries.find((entry) => entry.plateNumber === 1 && entry.well === 'A2')?.normalizedContents).toBe('Prostaglandin A1');
    expect(result.entries.find((entry) => entry.plateNumber === 1 && entry.well === 'A3')?.normalizedContents).toContain('1-Arachidonoyl Lysophosphatidic Acid (sodium salt)');
    expect(result.entries.find((entry) => entry.plateNumber === 1 && entry.well === 'A8')?.normalizedContents).toContain('15-deoxy-Δ12,14-Prostaglandin A1');
  });
});
