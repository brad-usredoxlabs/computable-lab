import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { extractPdfLayoutText } from '../../extract/PdfTextAdapter.js';
import type { ExtractionDiagnostic } from '../../extract/ExtractorAdapter.js';
import type {
  ExtractedCandidateItem,
  ExtractedScalarQuantity,
  ProtocolActionCandidate,
  ProtocolCandidate,
  ProtocolStepCandidate,
  VendorProtocolDocument,
  VendorProtocolPage,
  VendorProtocolProvenance,
  VendorProtocolSection,
  VendorProtocolSectionKind,
  VendorProtocolSource,
  VendorProtocolTable,
} from './types.js';

const ZYMO_SOURCE_TERMS = {
  materials: [
    { label: 'ZymoBIOMICS Lysis Solution', pattern: /ZymoBIOMICS(?:™)?\s+Lysis Solution/iu, role: 'lysis_reagent' },
    { label: 'DNA/RNA Shield', pattern: /DNA\/RNA Shield(?:™)?/iu, role: 'sample_preservative' },
    { label: 'ZymoBIOMICS MagBinding Buffer', pattern: /ZymoBIOMICS(?:™)?\s+MagBinding Buffer/iu, role: 'binding_buffer' },
    { label: 'ZymoBIOMICS MagBinding Beads', pattern: /ZymoBIOMICS(?:™)?\s+MagBinding Beads/iu, role: 'magnetic_beads' },
    { label: 'ZymoBIOMICS MagWash 1', pattern: /ZymoBIOMICS(?:™)?\s+MagWash 1/iu, role: 'wash_buffer_1' },
    { label: 'ZymoBIOMICS MagWash 2', pattern: /ZymoBIOMICS(?:™)?\s+MagWash 2/iu, role: 'wash_buffer_2' },
    { label: 'ZymoBIOMICS DNase/RNase Free Water', pattern: /ZymoBIOMICS(?:™)?\s+DNase\/RNase Free\s+Water/iu, role: 'elution_reagent' },
  ],
  labware: [
    { label: 'BashingBead Lysis Rack', pattern: /BashingBead(?:™)?\s+Lysis Rack/iu, role: 'lysis_module' },
    { label: 'ZR BashingBead Lysis Tubes', pattern: /ZR BashingBead(?:™)?\s+Lysis Tubes/iu, role: 'lysis_module' },
    { label: 'deep-well block', pattern: /deep-well block/iu, role: 'sample_plate' },
    { label: '96-well block', pattern: /96-well block|96-Well Block/iu, role: 'sample_plate' },
    { label: 'clean elution plate or tube', pattern: /clean\s+elution plate or tube/iu, role: 'elution_destination' },
  ],
  equipment: [
    { label: 'bead beater', pattern: /bead beater|bead-beating|bead beating/iu, role: 'manual_lysis_device' },
    { label: 'centrifuge', pattern: /centrifuge|centrifuging|centrifugation/iu, role: 'centrifuge' },
    { label: 'magnetic stand', pattern: /magnetic stand/iu, role: 'magnet' },
    { label: 'heating element', pattern: /heating element/iu, role: 'heater' },
    { label: 'heat sealing device', pattern: /heat sealing device/iu, role: 'sealer' },
    { label: 'pipette', pattern: /pipette|pipet/iu, role: 'pipette' },
    { label: 'shaker plate', pattern: /shaker plate|shaking speed|shake at max speed/iu, role: 'plate_shaker' },
  ],
} as const;

const GENERIC_SOURCE_TERMS = {
  materials: [
    { label: 'lysis buffer', pattern: /\b(?:lysis|extraction)\s+buffer\b/iu, role: 'lysis_reagent' },
    { label: 'binding buffer', pattern: /\bbinding\s+buffer\b/iu, role: 'binding_buffer' },
    { label: 'wash buffer', pattern: /\bwash\s+buffer(?:\s+\d+)?\b/iu, role: 'wash_buffer' },
    { label: 'elution buffer', pattern: /\belution\s+buffer\b/iu, role: 'elution_reagent' },
    { label: 'elution solution', pattern: /\belution\s+solution\b/iu, role: 'elution_reagent' },
    { label: 'nuclease-free water', pattern: /\b(?:nuclease|dnase\/rnase|rnase-free)\s+free\s+water\b|\bnuclease-free\s+water\b/iu, role: 'elution_reagent' },
    { label: 'ethanol', pattern: /\bethanol(?:\s*\([^)]+\)|\s+\d+%|\s+\d+\s*-\s*\d+%)?/iu, role: 'wash_reagent' },
    { label: 'isopropanol', pattern: /\bisopropanol\b/iu, role: 'precipitation_reagent' },
    { label: 'proteinase K', pattern: /\bproteinase\s+K\b/iu, role: 'enzyme' },
    { label: 'magnetic beads', pattern: /\bmagnetic\s+beads?\b|\bmagbeads?\b/iu, role: 'magnetic_beads' },
    { label: 'PBS', pattern: /\bPBS\b/iu, role: 'buffer' },
    { label: 'TE buffer', pattern: /\bTE\s+buffer\b/iu, role: 'buffer' },
  ],
  labware: [
    { label: '96-well plate', pattern: /\b96[-\s]?well\s+(?:plate|block)\b/iu, role: 'sample_plate' },
    { label: '384-well plate', pattern: /\b384[-\s]?well\s+(?:plate|block)\b/iu, role: 'sample_plate' },
    { label: 'deep-well plate', pattern: /\bdeep[-\s]?well\s+(?:plate|block)\b/iu, role: 'sample_plate' },
    { label: 'microcentrifuge tube', pattern: /\b(?:microcentrifuge|1\.5\s*ml|2\s*ml)\s+tubes?\b/iu, role: 'tube' },
    { label: 'collection tube', pattern: /\bcollection\s+tubes?\b/iu, role: 'tube' },
    { label: 'spin column', pattern: /\bspin\s+columns?\b/iu, role: 'column' },
    { label: 'reservoir', pattern: /\b(?:reagent\s+)?reservoirs?\b/iu, role: 'reagent_reservoir' },
    { label: 'PCR plate', pattern: /\bPCR\s+(?:plate|strip|tubes?)\b/iu, role: 'pcr_labware' },
    { label: 'elution plate', pattern: /\belution\s+plates?\b/iu, role: 'elution_destination' },
  ],
  equipment: [
    { label: 'centrifuge', pattern: /\bcentrifuge|centrifugation|spin\b/iu, role: 'centrifuge' },
    { label: 'magnetic stand', pattern: /\bmagnetic\s+(?:stand|rack|separator)\b|\bmagnet\b/iu, role: 'magnet' },
    { label: 'plate shaker', pattern: /\b(?:plate\s+)?shaker\b|\bshake\b/iu, role: 'plate_shaker' },
    { label: 'vortex mixer', pattern: /\bvortex(?: mixer)?\b/iu, role: 'vortex' },
    { label: 'heat block', pattern: /\bheat(?:ing)?\s+block\b|\bthermal\s+mixer\b/iu, role: 'heater' },
    { label: 'incubator', pattern: /\bincubator\b/iu, role: 'incubator' },
    { label: 'pipette', pattern: /\bpipett?e\b|\bpipett?ing\b/iu, role: 'pipette' },
    { label: 'plate sealer', pattern: /\b(?:plate\s+)?sealer\b|\bseal(?:ing)?\s+(?:film|foil)\b/iu, role: 'sealer' },
  ],
} as const;

const ALL_SOURCE_TERMS = {
  materials: [...ZYMO_SOURCE_TERMS.materials, ...GENERIC_SOURCE_TERMS.materials],
  labware: [...ZYMO_SOURCE_TERMS.labware, ...GENERIC_SOURCE_TERMS.labware],
  equipment: [...ZYMO_SOURCE_TERMS.equipment, ...GENERIC_SOURCE_TERMS.equipment],
} as const;

const SECTION_HEADINGS: Array<{ kind: VendorProtocolSectionKind; title: string; pattern: RegExp }> = [
  { kind: 'table_of_contents', title: 'Table of Contents', pattern: /^Table of Contents\s*$/imu },
  { kind: 'product_contents', title: 'Product Contents', pattern: /^Product Contents\s*$/imu },
  { kind: 'specifications', title: 'Specifications', pattern: /^Specifications\s*$/imu },
  { kind: 'product_description', title: 'Product Description', pattern: /^Product Description\s*$/imu },
  { kind: 'protocol', title: 'Protocol', pattern: /^Protocol\s*$/imu },
  { kind: 'appendix', title: 'Appendices', pattern: /^Appendices\s*$/imu },
  { kind: 'troubleshooting', title: 'Troubleshooting', pattern: /^Troubleshooting\s*$/imu },
  { kind: 'ordering_information', title: 'Ordering Information', pattern: /^Ordering Information\s*$/imu },
  { kind: 'workflow', title: 'Complete Your Workflow', pattern: /^Complete Your Workflow\s*$/imu },
  { kind: 'notes', title: 'Notes', pattern: /^Notes\s*$/imu },
  { kind: 'guarantee', title: 'Guarantee', pattern: /^100% satisfaction guarantee/imu },
];

export interface DecodeVendorProtocolPdfOptions {
  filename?: string;
  documentId?: string;
  vendor?: string;
}

function normalizeText(value: string): string {
  return value
    .replace(/[™®]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function slug(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

function splitPdfPages(text: string): VendorProtocolPage[] {
  const rawPages = text.split('\f');
  while (rawPages.length > 0 && rawPages[rawPages.length - 1]?.trim() === '') {
    rawPages.pop();
  }
  return rawPages.map((pageText, index) => ({
    pageNumber: index + 1,
    text: pageText.trimEnd(),
  }));
}

function extractTitle(text: string): string {
  const firstPage = text.split('\f')[0] ?? text;
  const line = firstPage
    .split('\n')
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 0);
  return line ? normalizeText(line) : 'Untitled vendor protocol';
}

function extractVersion(text: string): string | undefined {
  return text.match(/INSTRUCTION MANUAL\s+Ver\.?\s*([0-9.]+)/iu)?.[1];
}

function pageForOffset(pages: VendorProtocolPage[], offset: number): number {
  let cursor = 0;
  for (const page of pages) {
    const next = cursor + page.text.length + 1;
    if (offset < next) {
      return page.pageNumber;
    }
    cursor = next;
  }
  return pages[pages.length - 1]?.pageNumber ?? 1;
}

function findPageForText(pages: VendorProtocolPage[], sourceText: string, fallback: number): number {
  const needle = normalizeText(sourceText).slice(0, 180);
  if (!needle) {
    return fallback;
  }
  for (const page of pages) {
    if (normalizeText(page.text).includes(needle)) {
      return page.pageNumber;
    }
  }
  return fallback;
}

function makeProvenance(
  documentId: string,
  pageStart: number,
  sectionId?: string,
  pageEnd?: number,
  spanStart?: number,
  spanEnd?: number,
): VendorProtocolProvenance {
  return {
    documentId,
    pageStart,
    ...(pageEnd && pageEnd !== pageStart ? { pageEnd } : {}),
    ...(sectionId ? { sectionId } : {}),
    ...(typeof spanStart === 'number' ? { spanStart } : {}),
    ...(typeof spanEnd === 'number' ? { spanEnd } : {}),
  };
}

export function createVendorProtocolDocumentFromText(
  text: string,
  options: DecodeVendorProtocolPdfOptions = {},
): VendorProtocolDocument {
  const pages = splitPdfPages(text);
  const filename = options.filename ?? 'vendor-protocol.pdf';
  const title = extractTitle(text);
  const documentId = options.documentId ?? `vendor-protocol:${slug(filename || title)}`;
  const source: VendorProtocolSource = {
    documentId,
    filename,
    title,
    pageCount: pages.length,
    ...(options.vendor || title.toLowerCase().includes('zymobiomics')
      ? { vendor: options.vendor ?? 'Zymo Research' }
      : {}),
    ...(extractVersion(text) ? { version: extractVersion(text)! } : {}),
  };
  const sections = sectionVendorProtocolDocument({ source, text, pages });
  const tables = extractVendorProtocolTables({ source, text, pages, sections });
  const diagnostics: ExtractionDiagnostic[] = [];
  if (!sections.some((section) => section.kind === 'protocol')) {
    diagnostics.push({
      severity: 'warning',
      code: 'vendor_protocol_missing_protocol_section',
      message: 'No Protocol section heading was found in the vendor document.',
    });
  }
  return { source, text, pages, sections, tables, diagnostics };
}

export async function decodeVendorProtocolPdf(
  buffer: Buffer | Uint8Array,
  options: DecodeVendorProtocolPdfOptions = {},
): Promise<VendorProtocolDocument> {
  const decoded = await extractPdfLayoutText(buffer);
  const document = createVendorProtocolDocumentFromText(decoded.text, options);
  return {
    ...document,
    diagnostics: [...decoded.diagnostics, ...document.diagnostics],
  };
}

export async function decodeVendorProtocolPdfFile(
  path: string,
  options: Omit<DecodeVendorProtocolPdfOptions, 'filename'> = {},
): Promise<VendorProtocolDocument> {
  const buffer = await readFile(path);
  return decodeVendorProtocolPdf(buffer, {
    ...options,
    filename: basename(path),
  });
}

export function sectionVendorProtocolDocument(input: {
  source: VendorProtocolSource;
  text: string;
  pages: VendorProtocolPage[];
}): VendorProtocolSection[] {
  const searchableText = input.text.replace(/\f/gu, '\n');
  const matches = SECTION_HEADINGS
    .map((heading) => {
      const match = heading.pattern.exec(searchableText);
      return match?.index !== undefined ? { ...heading, index: match.index } : undefined;
    })
    .filter((match): match is NonNullable<typeof match> => Boolean(match))
    .sort((a, b) => a.index - b.index);

  const sections: VendorProtocolSection[] = [];
  const firstHeadingIndex = matches[0]?.index ?? input.text.length;
  if (firstHeadingIndex > 0) {
    const coverText = input.text.slice(0, firstHeadingIndex).trim();
    if (coverText) {
      sections.push({
        id: 'section-cover',
        kind: 'cover',
        title: input.source.title ?? 'Cover',
        sourceText: coverText,
        provenance: makeProvenance(input.source.documentId, 1),
      });
    }
  }

  matches.forEach((match, index) => {
    const next = matches[index + 1]?.index ?? input.text.length;
    const sourceText = input.text.slice(match.index, next).trim();
    const pageStart = pageForOffset(input.pages, match.index);
    const pageEnd = pageForOffset(input.pages, Math.max(match.index, next - 1));
    sections.push({
      id: `section-${slug(match.title)}`,
      kind: match.kind,
      title: match.title,
      sourceText,
      provenance: makeProvenance(input.source.documentId, pageStart, undefined, pageEnd, match.index, next),
    });
  });

  return sections;
}

export function extractVendorProtocolTables(input: {
  source: VendorProtocolSource;
  text: string;
  pages: VendorProtocolPage[];
  sections: VendorProtocolSection[];
}): VendorProtocolTable[] {
  const tables: VendorProtocolTable[] = [];
  const productContents = input.sections.find((section) => section.kind === 'product_contents');
  if (productContents) {
    const rows = ZYMO_SOURCE_TERMS.materials
      .map((term) => {
        const match = productContents.sourceText.match(term.pattern);
        if (!match?.[0]) {
          return undefined;
        }
        const lineStart = productContents.sourceText.lastIndexOf('\n', match.index ?? 0);
        const lineEnd = productContents.sourceText.indexOf('\n', (match.index ?? 0) + match[0].length);
        const line = productContents.sourceText
          .slice(lineStart >= 0 ? lineStart + 1 : 0, lineEnd >= 0 ? lineEnd : undefined)
          .trim();
        return {
          Component: normalizeText(match[0]),
          D4302: line.includes('-') ? '-' : line.match(/\b\d+\s*ml(?:\s*x\s*\d)?\b/iu)?.[0] ?? '',
          D4306: '',
          D4308: '',
        } as Record<string, string>;
      })
      .filter((row): row is Record<string, string> => Boolean(row));
    if (rows.length > 0) {
      tables.push({
        id: 'table-product-contents',
        title: 'Product contents',
        headers: ['Component', 'D4302', 'D4306', 'D4308'],
        rows,
        sourceText: productContents.sourceText,
        provenance: { ...productContents.provenance, sectionId: productContents.id },
      });
    }
  }

  const protocol = input.sections.find((section) => section.kind === 'protocol');
  if (protocol) {
    const sampleTableMatch = protocol.sourceText.match(/Sample Type\s+Maximum Input(?<body>[\s\S]*?)Note: For samples stored/iu);
    const sourceText = sampleTableMatch?.[0];
    if (sourceText) {
      tables.push({
        id: 'table-sample-input',
        title: 'Sample type maximum input',
        headers: ['Sample Type', 'Maximum Input'],
        rows: [
          { 'Sample Type': 'Feces', 'Maximum Input': '100 mg' },
          { 'Sample Type': 'Soil', 'Maximum Input': '100 mg' },
          { 'Sample Type': 'Liquid samples and swab collections', 'Maximum Input': '250 ul' },
          { 'Sample Type': 'Cells suspended in PBS', 'Maximum Input': '5-20 mg wet weight' },
          { 'Sample Type': 'Samples in DNA/RNA Shield', 'Maximum Input': '<= 800 ul' },
        ],
        sourceText,
        provenance: {
          documentId: input.source.documentId,
          pageStart: findPageForText(input.pages, sourceText, protocol.provenance.pageStart),
          sectionId: protocol.id,
        },
      });
    }
  }

  return tables;
}

function extractQuantities(text: string, kind: 'volume' | 'duration' | 'temperature' | 'speed'): ExtractedScalarQuantity[] {
  const patterns = {
    volume: /(?:up to\s*)?(\d+(?:,\d{3})?(?:\.\d+)?|≤\s*\d+(?:\.\d+)?)\s*(µl|μl|ul|ml|l)\b/giu,
    duration: /(\d+(?:-\d+)?(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/giu,
    temperature: /([–-]?\s*\d+(?:\.\d+)?)\s*°?\s*C\b/giu,
    speed: /(≥\s*)?(\d+(?:,\d{3})?)\s*x\s*g\b/giu,
  } as const;
  return [...text.matchAll(patterns[kind])].map((match) => {
    const raw = normalizeText(match[0]);
    const numeric = raw.match(/[–-]?\s*\d+(?:,\d{3})?(?:\.\d+)?/u)?.[0]?.replace(/\s|,/gu, '');
    const value = numeric ? Number.parseFloat(numeric) : undefined;
    const unit = kind === 'temperature'
      ? 'C'
      : kind === 'speed'
        ? 'x g'
        : match[2]?.toLowerCase().replace('μ', 'u').replace('µ', 'u');
    return {
      raw,
      ...(typeof value === 'number' && Number.isFinite(value) ? { value } : {}),
      ...(unit ? { unit } : {}),
    };
  });
}

function labelsInText<T extends { label: string; pattern: RegExp }>(terms: readonly T[], text: string): string[] {
  return uniqueStrings(terms.filter((term) => term.pattern.test(text)).map((term) => term.label));
}

function firstMaterialInText(text: string): string | undefined {
  return labelsInText(ALL_SOURCE_TERMS.materials, text)[0] ?? extractGenericMaterialMentions(text)[0];
}

function firstEquipmentInText(text: string): string | undefined {
  return labelsInText(ALL_SOURCE_TERMS.equipment, text)[0];
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = normalizeText(value).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(normalizeText(value));
  }
  return out;
}

function extractGenericMaterialMentions(text: string): string[] {
  const mentions: string[] = [];
  const patterns = [
    /\b(?:Buffer|Solution|Reagent)[ \t]+[A-Z][A-Za-z0-9-]{0,12}\b/gu,
    /\b[A-Z][A-Za-z0-9-]{1,24}[ \t]+(?:Buffer|Solution|Reagent|Mix|Master Mix|Beads?)(?:[ \t]+\d+)?\b/gu,
    /\b(?:DNase|RNase|nuclease)[-\s]?free\s+water\b/giu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[0]) mentions.push(match[0]);
    }
  }
  return uniqueStrings(mentions).slice(0, 12);
}

function extractGenericLabwareMentions(text: string): string[] {
  const mentions: string[] = [];
  const patterns = [
    /\b\d{1,3}[-\s]?well\s+(?:plate|block)\b/giu,
    /\b(?:deep[-\s]?well|PCR|elution|collection)\s+(?:plate|block|tube|tubes)\b/giu,
    /\b(?:microcentrifuge|centrifuge|collection|1\.5\s*ml|2\s*ml|15\s*ml|50\s*ml)\s+tubes?\b/giu,
    /\bspin\s+columns?\b/giu,
    /\b(?:reagent\s+)?reservoirs?\b/giu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[0]) mentions.push(match[0]);
    }
  }
  return uniqueStrings(mentions).slice(0, 12);
}

function actionKindForClause(clause: string): ProtocolActionCandidate['actionKind'] {
  if (/\brepeat\b/iu.test(clause)) return 'repeat';
  if (/\bseal\b|sealing foils|heat sealing/iu.test(clause)) return 'seal';
  if (/\bcentrifuge\b/iu.test(clause)) return 'centrifuge';
  if (/\bmagnetic stand\b|beads pellet|magnet/iu.test(clause)) return 'magnetize';
  if (/\bvortex\b/iu.test(clause)) return 'mix';
  if (/\baspirate\b/iu.test(clause)) return 'aspirate';
  if (/\bdiscard\b|\bremove\b|\bdecant\b/iu.test(clause)) return 'discard';
  if (/\bdry\b|air dry/iu.test(clause)) return 'dry';
  if (/\belute|eluted DNA/iu.test(clause)) return 'elute';
  if (/\bmix\b|re-suspend|resuspend|shake/iu.test(clause)) return 'mix';
  if (/\btransfer\b|move\b/iu.test(clause)) return 'transfer';
  if (/\badd\b|\bdispense\b|\bapply\b|\bload\b/iu.test(clause)) return 'add';
  if (/\bincubate\b|stopping point|stored|hold\b/iu.test(clause)) return 'incubate';
  return 'other';
}

function splitActionClauses(text: string): string[] {
  return text
    .replace(/\s+/gu, ' ')
    .split(/(?:\.\s+|;\s+|\bthen\b|,\s*then\b|\band then\b|\band\s+(?=(?:add|apply|aspirate|centrifuge|decant|discard|dispense|dry|elute|incubate|load|mix|place|remove|seal|shake|transfer|vortex)\b))/iu)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0 && !/^Note:/iu.test(clause));
}

function extractActionCandidates(
  stepText: string,
  provenance: VendorProtocolProvenance,
): ProtocolActionCandidate[] {
  const actions = splitActionClauses(stepText).map((clause) => {
    const volumes = extractQuantities(clause, 'volume');
    const durations = extractQuantities(clause, 'duration');
    const temperatures = extractQuantities(clause, 'temperature');
    const speeds = extractQuantities(clause, 'speed');
    const material = firstMaterialInText(clause);
    const equipment = firstEquipmentInText(clause);
    return {
      actionKind: actionKindForClause(clause),
      sourceText: clause,
      ...(material ? { material } : {}),
      ...(volumes[0] ? { volume: volumes[0] } : {}),
      ...(durations[0] ? { duration: durations[0] } : {}),
      ...(temperatures[0] ? { temperature: temperatures[0] } : {}),
      ...(speeds[0] ? { speed: speeds[0] } : {}),
      ...(equipment ? { equipment } : {}),
      provenance,
    } satisfies ProtocolActionCandidate;
  });

  return actions.length > 0
    ? actions
    : [{ actionKind: 'other', sourceText: stepText, provenance, uncertainty: 'unresolved' }];
}

function extractNotes(stepText: string): string[] {
  return [...stepText.matchAll(/Note:\s*([\s\S]*?)(?=(?:\n\s*[a-z]\.\s)|$)/giu)]
    .map((match) => normalizeText(match[1] ?? ''))
    .filter(Boolean);
}

function extractBranches(stepText: string): string[] {
  return [...stepText.matchAll(/(?:^|\n)\s*([a-z])\.\s*([^\n]+(?:\n(?!\s*[a-z]\.\s).+)*)/giu)]
    .map((match) => normalizeText(`${match[1]}. ${match[2] ?? ''}`))
    .filter(Boolean);
}

function extractProtocolSteps(document: VendorProtocolDocument): ProtocolStepCandidate[] {
  const protocol = document.sections.find((section) => section.kind === 'protocol');
  if (!protocol) {
    return [];
  }
  const stepRegex = /(?:^|\n)\s*(\d{1,2})\.\s+([\s\S]*?)(?=(?:\n\s*\d{1,2}\.\s+)|$)/gu;
  const steps: ProtocolStepCandidate[] = [];
  for (const match of protocol.sourceText.matchAll(stepRegex)) {
    const stepNumber = Number.parseInt(match[1] ?? '', 10);
    const sourceText = (match[2] ?? '').trim();
    if (!Number.isFinite(stepNumber) || !sourceText) {
      continue;
    }
    const page = findPageForText(document.pages, sourceText, protocol.provenance.pageStart);
    const spanStart = (match.index ?? 0) + protocol.provenance.spanStart!;
    const provenance = makeProvenance(
      document.source.documentId,
      page,
      protocol.id,
      undefined,
      spanStart,
      spanStart + match[0].length,
    );
    const volumes = extractQuantities(sourceText, 'volume');
    const durations = extractQuantities(sourceText, 'duration');
    const temperatures = extractQuantities(sourceText, 'temperature');
    const speeds = extractQuantities(sourceText, 'speed');
    steps.push({
      id: `step-${stepNumber}`,
      stepNumber,
      sourceText,
      actions: extractActionCandidates(sourceText, provenance),
      conditions: {
        ...(volumes.length > 0 ? { volumes } : {}),
        ...(durations.length > 0 ? { durations } : {}),
        ...(temperatures.length > 0 ? { temperatures } : {}),
        ...(speeds.length > 0 ? { speeds } : {}),
      },
      materials: uniqueStrings([
        ...labelsInText(ALL_SOURCE_TERMS.materials, sourceText),
        ...extractGenericMaterialMentions(sourceText),
      ]),
      labware: uniqueStrings([
        ...labelsInText(ALL_SOURCE_TERMS.labware, sourceText),
        ...extractGenericLabwareMentions(sourceText),
      ]),
      equipment: labelsInText(ALL_SOURCE_TERMS.equipment, sourceText),
      notes: extractNotes(sourceText),
      branches: extractBranches(sourceText),
      provenance,
      confidence: 0.9,
    });
  }
  return steps;
}

function createCandidateItems(
  document: VendorProtocolDocument,
  kind: keyof typeof ZYMO_SOURCE_TERMS,
): ExtractedCandidateItem[] {
  const curated = ALL_SOURCE_TERMS[kind].flatMap((term, index) => {
    const section = document.sections.find((candidateSection) => term.pattern.test(candidateSection.sourceText));
    if (!section) {
      return [];
    }
    const match = section.sourceText.match(term.pattern);
    if (!match?.[0]) {
      return [];
    }
    return [{
      id: `${kind}-${index + 1}-${slug(term.label)}`,
      label: term.label,
      sourceText: normalizeText(match[0]),
      provenance: {
        documentId: document.source.documentId,
        pageStart: findPageForText(document.pages, match[0], section.provenance.pageStart),
        sectionId: section.id,
      },
      confidence: 0.9,
      role: term.role,
      ...(section.kind === 'product_contents' ? { uncertainty: 'table-derived' as const } : {}),
    }];
  });
  const generic = createGenericCandidateItems(document, kind, curated.map((item) => item.label));
  return dedupeCandidateItems([...curated, ...generic]);
}

function createGenericCandidateItems(
  document: VendorProtocolDocument,
  kind: keyof typeof ZYMO_SOURCE_TERMS,
  existingLabels: string[],
): ExtractedCandidateItem[] {
  const sections = document.sections.filter((section) => ['product_contents', 'specifications', 'protocol'].includes(section.kind));
  const existing = new Set(existingLabels.map((label) => normalizeText(label).toLowerCase()));
  const out: ExtractedCandidateItem[] = [];
  for (const section of sections) {
    const labels = kind === 'materials'
      ? extractGenericMaterialMentions(section.sourceText)
      : kind === 'labware'
        ? extractGenericLabwareMentions(section.sourceText)
        : labelsInText(GENERIC_SOURCE_TERMS.equipment, section.sourceText);
    for (const label of labels) {
      const normalized = normalizeText(label);
      const key = normalized.toLowerCase();
      if (!key || existing.has(key)) continue;
      existing.add(key);
      out.push({
        id: `${kind}-generic-${out.length + 1}-${slug(normalized)}`,
        label: normalized,
        sourceText: normalized,
        provenance: {
          documentId: document.source.documentId,
          pageStart: findPageForText(document.pages, normalized, section.provenance.pageStart),
          sectionId: section.id,
        },
        confidence: 0.65,
        uncertainty: section.kind === 'product_contents' ? 'table-derived' : 'inferred',
      });
    }
  }
  return out;
}

function dedupeCandidateItems(items: ExtractedCandidateItem[]): ExtractedCandidateItem[] {
  const seen = new Set<string>();
  const out: ExtractedCandidateItem[] = [];
  for (const item of items) {
    const key = normalizeText(item.label).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function createProtocolDiagnostics(steps: ProtocolStepCandidate[], document: VendorProtocolDocument): ExtractionDiagnostic[] {
  const diagnostics: ExtractionDiagnostic[] = [...document.diagnostics];
  if (!document.sections.some((section) => section.kind === 'protocol')) {
    diagnostics.push({
      severity: 'warning',
      code: 'vendor_protocol_missing_protocol_section',
      message: 'No Protocol section was available for step extraction.',
    });
  }
  const stepNumbers = steps.map((step) => step.stepNumber);
  for (let i = 1; i <= Math.max(17, ...stepNumbers, 0); i += 1) {
    if (stepNumbers.length > 0 && !stepNumbers.includes(i) && i <= 17) {
      diagnostics.push({
        severity: 'warning',
        code: 'vendor_protocol_step_discontinuity',
        message: `Expected vendor step ${i} was not extracted.`,
      });
    }
  }
  for (const step of steps) {
    if (step.actions.length === 1 && step.sourceText.split('.').length > 2) {
      diagnostics.push({
        severity: 'info',
        code: 'vendor_protocol_step_may_have_unparsed_actions',
        message: `Step ${step.stepNumber} may contain multiple actions that need review.`,
      });
    }
  }
  if (!document.tables.some((table) => table.id === 'table-sample-input')) {
    diagnostics.push({
      severity: 'warning',
      code: 'vendor_protocol_sample_table_missing',
      message: 'The sample input table was not extracted.',
    });
  }
  return diagnostics;
}

export function extractVendorProtocolCandidate(document: VendorProtocolDocument): ProtocolCandidate {
  const steps = extractProtocolSteps(document);
  const title = document.source.title ?? 'Untitled vendor protocol';
  const protocolSection = document.sections.find((section) => section.kind === 'protocol');
  return {
    kind: 'vendor-protocol-candidate',
    source: document.source,
    title,
    ...(title.toLowerCase().includes('dna') ? { scope: 'DNA extraction for microbiome or metagenome analysis' } : {}),
    sections: document.sections
      .filter((section) => ['product_contents', 'specifications', 'protocol'].includes(section.kind))
      .map((section) => ({
        id: section.id,
        kind: section.kind,
        title: section.title,
        provenance: section.provenance,
      })),
    materials: createCandidateItems(document, 'materials'),
    equipment: createCandidateItems(document, 'equipment'),
    labware: createCandidateItems(document, 'labware'),
    steps,
    tables: document.tables,
    notes: protocolSection
      ? extractNotes(protocolSection.sourceText).map((note, index) => ({
          id: `note-${index + 1}`,
          label: note.slice(0, 80),
          sourceText: note,
          provenance: makeProvenance(document.source.documentId, protocolSection.provenance.pageStart, protocolSection.id),
          confidence: 0.85,
        }))
      : [],
    outputs: [{
      id: 'output-eluted-dna',
      label: 'eluted DNA',
      sourceText: 'supernatant containing the eluted DNA',
      provenance: steps.find((step) => step.stepNumber === 17)?.provenance
        ?? makeProvenance(document.source.documentId, 1),
      confidence: 0.85,
      role: 'protocol_output',
    }],
    diagnostics: createProtocolDiagnostics(steps, document),
  };
}
