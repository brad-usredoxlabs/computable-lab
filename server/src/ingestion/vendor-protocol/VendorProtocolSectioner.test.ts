import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createVendorProtocolDocumentFromText,
  decodeVendorProtocolPdf,
  extractVendorProtocolCandidate,
} from './VendorProtocolPdf.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const zymoPdfPath = resolve(repoRoot, 'resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf');

describe('VendorProtocolSectioner', () => {
  it('identifies the primary Zymo protocol section and excludes appendices/ordering content', async () => {
    const document = await decodeVendorProtocolPdf(await readFile(zymoPdfPath), {
      filename: '_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf',
      documentId: 'vendor-protocol-zymo-magbead',
    });

    const protocol = document.sections.find((section) => section.kind === 'protocol');
    expect(protocol).toBeDefined();
    expect(protocol?.sourceText).toContain('Sample Lysis');
    expect(protocol?.sourceText).toContain('17. Transfer the supernatant');
    expect(protocol?.sourceText).not.toContain('Appendices\nAppendix A');
    expect(protocol?.sourceText).not.toContain('Ordering Information');
    expect(protocol?.provenance.pageStart).toBeGreaterThan(0);
    expect(protocol?.provenance.pageEnd).toBeGreaterThanOrEqual(protocol!.provenance.pageStart);
  });

  it('extracts protocol-relevant tables with page provenance', async () => {
    const document = await decodeVendorProtocolPdf(await readFile(zymoPdfPath), {
      filename: '_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf',
      documentId: 'vendor-protocol-zymo-magbead',
    });

    const sampleInput = document.tables.find((table) => table.id === 'table-sample-input');
    expect(sampleInput).toBeDefined();
    expect(sampleInput?.headers).toEqual(['Sample Type', 'Maximum Input']);
    expect(sampleInput?.rows).toContainEqual({ 'Sample Type': 'Feces', 'Maximum Input': '100 mg' });
    expect(sampleInput?.provenance.pageStart).toBeGreaterThan(0);

    const productContents = document.tables.find((table) => table.id === 'table-product-contents');
    expect(productContents).toBeDefined();
    expect(productContents?.rows.some((row) => row.Component.includes('MagBinding Buffer'))).toBe(true);
  });
});

describe('page-margin furniture on a heading line (the D4300T blind spot)', () => {
  // Real text, ZymoBIOMICS DNA Miniprep page 4: the heading shares its line
  // with the page's technical-assistance blurb. A whole-line pattern found no
  // protocol section, so that manual produced zero steps and no sample table.
  const MANUAL = `Product Contents
Component Amount
Lysis Solution 4 ml

Protocol                    For Technical Assistance:
                            1-888-882-9682 or E-mail

  1. Add sample to a ZR BashingBead Lysis Tube (0.1 & 0.5 mm).
  2. Secure in a bead beater and homogenize.

Appendix A
Sample Collection
`

  it('finds the protocol section when the heading line carries margin text', () => {
    const document = createVendorProtocolDocumentFromText(MANUAL, { filename: 'd4300t.pdf', documentId: 'doc-d4300t' })
    const protocol = document.sections.find((s) => s.kind === 'protocol')
    expect(protocol).toBeDefined()
    expect(protocol!.sourceText).toContain('Add sample to a ZR BashingBead Lysis Tube')

    const candidate = extractVendorProtocolCandidate(document)
    expect(candidate.steps.map((s) => s.id)).toEqual(['step-1', 'step-2'])
  })

  it('does not mistake a sentence that starts with the word for a heading', () => {
    const document = createVendorProtocolDocumentFromText(
      `Product Contents
Component Amount

Protocol steps were reviewed by the lab and no changes are needed.
1. Not a protocol, this is prose.

Appendix A
Sample Collection
`,
      { filename: 'prose.pdf', documentId: 'doc-prose' },
    )
    expect(document.sections.some((s) => s.kind === 'protocol')).toBe(false)
  })

  it('reads Qiagen-style "Protocol: <name>" headings and skips the contents page', () => {
    // The DNeasy handbook writes its protocol headings with a colon and its
    // contents page prints the same lines with a dot leader and page number.
    // Matching only a bare "Protocol" found nothing in a 69-page handbook, so
    // the whole document yielded zero steps and zero questions.
    const HANDBOOK = `Contents
Protocol: Purification of Total DNA from Animal Blood or Cells (Spin-Column Protocol) ..... 29
Protocol: Purification of Total DNA from Animal Tissues (Spin-Column Protocol) .......... 33

Protocol: Purification of Total DNA from Animal
Blood or Cells (Spin-Column Protocol)
This protocol is designed for purification of total DNA from animal blood.

Procedure
1. For blood with non-nucleated erythrocytes, follow step 1a; for blood with nucleated
   erythrocytes, follow step 1b; for cultured cells, follow step 1c.
   1a. Non-nucleated: Pipet 20 µl Proteinase K into a tube.
   1b. Nucleated: Pipet 20 µl Proteinase K and add 5–10 µl blood.
   1c. Cultured cells: Centrifuge the cells.
2. Add 200 µl Buffer AL and incubate at 56°C.

Protocol: Purification of Total DNA from Animal
Tissues (Spin-Column Protocol)
1. Cut up to 25 mg tissue and add 180 µl Buffer ATL.
`
    const document = createVendorProtocolDocumentFromText(HANDBOOK, { filename: 'dneasy.pdf', documentId: 'doc-dneasy' })
    const protocols = document.sections.filter((s) => s.kind === 'protocol')

    // One section per protocol, named the way the contents page names them.
    expect(protocols.map((s) => s.title)).toEqual([
      'Purification of Total DNA from Animal Blood or Cells (Spin-Column Protocol)',
      'Purification of Total DNA from Animal Tissues (Spin-Column Protocol)',
    ])
    // The contents page is NOT the protocol body.
    expect(protocols[0]!.sourceText).not.toContain('..... 29')
    expect(protocols[0]!.sourceText).toContain('For blood with non-nucleated erythrocytes')

    const candidate = extractVendorProtocolCandidate(document)
    // Steps keep the manual's own sub-labels and the section they came from.
    expect(candidate.steps.map((s) => `${s.id}:${s.stepNumber}${s.substep ?? ''}`)).toEqual([
      'step-1:1',
      'step-2:1a',
      'step-3:1b',
      'step-4:1c',
      'step-5:2',
      'step-6:1',
    ])
    expect(new Set(candidate.steps.map((s) => s.sectionId)).size).toBe(2)
  })
})
