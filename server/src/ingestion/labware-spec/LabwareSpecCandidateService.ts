import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { extractVendorPdfText } from '../../vendor-documents/pdfAcquisition.js';

export interface ExtractLabwareSpecCandidateInput {
  workspaceRoot: string;
  artifactPath?: string;
  contentBase64?: string;
  text?: string;
  fileName?: string;
  vendor?: string;
  sourceUrl?: string;
  persist?: boolean;
}

export interface LabwareSpecEvidence {
  field: string;
  value: string | number | boolean;
  evidenceSpan: string;
  confidence: number;
}

export interface LabwareSpecGap {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  field?: string;
}

export interface LabwareDefinitionDraft {
  kind: 'labware-definition';
  recordId: string;
  type: 'labware_definition';
  id: string;
  display_name: string;
  vendor?: string;
  read_only: boolean;
  source: {
    kind: 'imported';
    url?: string;
    hash: string;
    version?: string;
  };
  topology: {
    addressing: 'grid' | 'linear' | 'single';
    rows?: number;
    columns?: number;
    linear_count?: number;
    well_pitch_mm?: number;
    row_pitch_mm?: number;
    col_pitch_mm?: number;
    orientation_default?: 'landscape' | 'portrait';
    orientation_allowed?: Array<'landscape' | 'portrait'>;
  };
  capacity: {
    max_well_volume_uL: number;
    min_working_volume_uL?: number;
  };
  physical_geometry?: CanonicalLabwarePhysicalGeometry;
  compatibility_tags: string[];
  notes: string;
  render_hints: Record<string, unknown>;
}

export interface LabwareSpecCandidateResult {
  kind: 'labware-spec-candidate-extraction';
  source: {
    inputKind: 'text' | 'pdf';
    artifactPath?: string;
    fileName: string;
    sha256: string;
    sourceUrl?: string;
  };
  extracted: {
    displayName: string;
    vendor?: string;
    catalogNumber?: string;
    productKind: 'plate' | 'reservoir' | 'tube' | 'tiprack' | 'rack' | 'other';
    wellCount?: number;
    rows?: number;
    columns?: number;
    maxWellVolumeUl?: number;
    minWorkingVolumeUl?: number;
    wellPitchMm?: number;
    dimensionsMm?: {
      length?: number;
      width?: number;
      height?: number;
    };
    physicalGeometry?: LabwarePhysicalGeometry;
  };
  draftDefinition: LabwareDefinitionDraft;
  evidence: LabwareSpecEvidence[];
  gaps: LabwareSpecGap[];
  candidatePath?: string;
}

export interface LabwarePhysicalGeometry {
  mainMaterial?: string;
  mainColor?: string;
  bottomMaterial?: string;
  bottomColor?: string;
  bottomThicknessMm?: number;
  bottomShape?: string;
  wellShape?: string;
  wellDiameterMm?: number;
  wellDepthMm?: number;
  wellLengthMm?: number;
  wellWidthMm?: number;
  deckHeightMm?: number;
}

export interface CanonicalLabwarePhysicalGeometry {
  overall_dimensions_mm?: {
    length?: number;
    width?: number;
    height?: number;
  };
  main_material?: string;
  main_color?: string;
  bottom_material?: string;
  bottom_color?: string;
  bottom_thickness_mm?: number;
  bottom_shape?: string;
  well_shape?: string;
  well_diameter_mm?: number;
  well_depth_mm?: number;
  well_length_mm?: number;
  well_width_mm?: number;
  deck_height_mm?: number;
}

const KNOWN_VENDORS = [
  'Agilent',
  'Axygen',
  'Bio-Rad',
  'Corning',
  'Eppendorf',
  'Greiner',
  'Integra',
  'NEST',
  'Sartorius',
  'Thermo Fisher',
  'Thermo Scientific',
  'VWR',
];

const DEFAULT_CAPACITY_UL: Record<string, number> = {
  plate_384: 120,
  plate_96_deep: 2000,
  plate_96: 350,
  reservoir: 22000,
  tube_50ml: 50000,
  tube_15ml: 15000,
  tube_2ml: 2000,
  tube_1p5ml: 1500,
  tiprack: 1000,
  other: 1000,
};

export async function extractLabwareSpecCandidate(
  input: ExtractLabwareSpecCandidateInput,
): Promise<LabwareSpecCandidateResult> {
  const loaded = await loadLabwareSpecText(input);
  const evidence: LabwareSpecEvidence[] = [];
  const gaps: LabwareSpecGap[] = [];
  const text = normalizeText(loaded.text);
  const vendor = input.vendor ?? extractVendor(text, evidence);
  const catalogNumber = extractCatalogNumber(text, evidence);
  const displayName = extractDisplayName(text, vendor, catalogNumber);
  evidence.push({ field: 'display_name', value: displayName, evidenceSpan: displayName, confidence: 0.65 });
  const productKind = inferProductKind(text, displayName);
  const geometry = inferTopology(text, displayName, productKind, evidence, gaps);
  const capacity = inferCapacity(text, productKind, geometry.wellCount, evidence, gaps);
  const dimensions = extractDimensions(text, evidence);
  const physicalGeometry = extractPhysicalGeometry(text, evidence);
  const canonicalPhysicalGeometry = canonicalPhysicalGeometryFrom({
    ...(dimensions ? { dimensions } : {}),
    ...(physicalGeometry ? { physicalGeometry } : {}),
  });
  const recordId = `lbw-def-${safeSlug([vendor, catalogNumber, displayName].filter(Boolean).join('-'))}`;
  const draftDefinition: LabwareDefinitionDraft = compact({
    kind: 'labware-definition' as const,
    recordId,
    type: 'labware_definition' as const,
    id: `${safeSlug(vendor || 'vendor')}/${safeSlug(catalogNumber || displayName)}@v1`,
    display_name: displayName,
    ...(vendor ? { vendor } : {}),
    read_only: true,
    source: compact({
      kind: 'imported' as const,
      ...(input.sourceUrl ? { url: input.sourceUrl } : {}),
      hash: loaded.sha256,
    }),
    topology: topologyDraft(geometry),
    capacity: compact({
      max_well_volume_uL: capacity.maxWellVolumeUl,
      ...(capacity.minWorkingVolumeUl !== undefined ? { min_working_volume_uL: capacity.minWorkingVolumeUl } : {}),
    }),
    ...(canonicalPhysicalGeometry ? { physical_geometry: canonicalPhysicalGeometry } : {}),
    compatibility_tags: compatibilityTags(productKind, geometry.wellCount, displayName),
    notes: buildNotes({
      ...(catalogNumber ? { catalogNumber } : {}),
      inferredCapacity: capacity.inferred,
      gaps,
    }),
    render_hints: compact({
      profile: renderProfile(productKind),
      ...(dimensions ? { dimensions_mm: dimensions } : {}),
      ...(physicalGeometry ? { physical_geometry: physicalGeometry } : {}),
      ...(catalogNumber ? { catalog_number: catalogNumber } : {}),
    }),
  });

  const result: LabwareSpecCandidateResult = {
    kind: 'labware-spec-candidate-extraction',
    source: compact({
      inputKind: loaded.inputKind,
      ...(loaded.artifactPath ? { artifactPath: loaded.artifactPath } : {}),
      fileName: loaded.fileName,
      sha256: loaded.sha256,
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    }),
    extracted: compact({
      displayName,
      ...(vendor ? { vendor } : {}),
      ...(catalogNumber ? { catalogNumber } : {}),
      productKind,
      ...(geometry.wellCount !== undefined ? { wellCount: geometry.wellCount } : {}),
      ...(geometry.rows !== undefined ? { rows: geometry.rows } : {}),
      ...(geometry.columns !== undefined ? { columns: geometry.columns } : {}),
      maxWellVolumeUl: capacity.maxWellVolumeUl,
      ...(capacity.minWorkingVolumeUl !== undefined ? { minWorkingVolumeUl: capacity.minWorkingVolumeUl } : {}),
      ...(geometry.wellPitchMm !== undefined ? { wellPitchMm: geometry.wellPitchMm } : {}),
      ...(dimensions ? { dimensionsMm: dimensions } : {}),
      ...(physicalGeometry ? { physicalGeometry } : {}),
    }),
    draftDefinition,
    evidence,
    gaps,
  };

  if (input.persist !== false) {
    result.candidatePath = await writeCandidateArtifact(input.workspaceRoot, result);
  }
  return result;
}

async function loadLabwareSpecText(input: ExtractLabwareSpecCandidateInput): Promise<{
  inputKind: 'text' | 'pdf';
  text: string;
  fileName: string;
  sha256: string;
  artifactPath?: string;
}> {
  if (input.text) {
    return {
      inputKind: 'text',
      text: input.text,
      fileName: input.fileName ?? 'labware-spec.txt',
      sha256: createHash('sha256').update(input.text).digest('hex'),
    };
  }
  const extraction = await extractVendorPdfText({
    workspaceRoot: input.workspaceRoot,
    ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
    ...(input.contentBase64 ? { contentBase64: input.contentBase64 } : {}),
    ...(input.fileName ? { fileName: input.fileName } : {}),
    mode: 'both',
  });
  const text = extraction.layoutText?.pages.map((page) => page.text).join('\n\n')
    || extraction.plainText?.text
    || '';
  return {
    inputKind: 'pdf',
    text,
    fileName: extraction.source.fileName,
    sha256: extraction.source.sha256,
    ...(extraction.source.artifactPath ? { artifactPath: extraction.source.artifactPath } : {}),
  };
}

function normalizeText(text: string): string {
  return text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function extractVendor(text: string, evidence: LabwareSpecEvidence[]): string | undefined {
  for (const vendor of KNOWN_VENDORS) {
    const match = new RegExp(`\\b${escapeRegExp(vendor)}\\b`, 'i').exec(text);
    if (match) {
      evidence.push({ field: 'vendor', value: vendor, evidenceSpan: span(text, match.index, vendor.length), confidence: 0.8 });
      return vendor;
    }
  }
  return undefined;
}

function extractCatalogNumber(text: string, evidence: LabwareSpecEvidence[]): string | undefined {
  const patterns = [
    /\b(?:cat(?:alog)?|part|item|product|sku)\s*(?:no\.?|number|#|id|code)?\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]{2,})/i,
    /\b(?:ref)\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]{2,})/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = match?.[1]?.replace(/[),.;:]+$/, '');
    if (match && value) {
      evidence.push({ field: 'catalog_number', value, evidenceSpan: span(text, match.index, match[0].length), confidence: 0.75 });
      return value;
    }
  }
  return undefined;
}

function extractDisplayName(text: string, vendor: string | undefined, catalogNumber: string | undefined): string {
  const lines = text.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length <= 160);
  const productLine = lines.find((line) => labwareWords().test(line) && !/^(table|figure|ordering|specifications?)\b/i.test(line));
  if (productLine) return trimDisplayName(productLine);
  const firstLine = lines[0] ? trimDisplayName(lines[0]) : 'Vendor Labware';
  return [vendor, catalogNumber, firstLine].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function trimDisplayName(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/[|•]+/g, ' ').trim().slice(0, 140);
}

function inferProductKind(text: string, displayName: string): LabwareSpecCandidateResult['extracted']['productKind'] {
  const haystack = `${displayName}\n${text}`.toLowerCase();
  if (/\btip\s*rack|tiprack|pipette tips?\b/.test(haystack)) return 'tiprack';
  if (/\breservoir|trough\b/.test(haystack)) return 'reservoir';
  if (/\btube rack|tuberack\b/.test(haystack)) return 'rack';
  if (/\btubes?\b|microcentrifuge|conical\b/.test(haystack)) return 'tube';
  if (/\bplates?\b|wellplate|microplate|pcr plate\b/.test(haystack)) return 'plate';
  return 'other';
}

function inferTopology(
  text: string,
  displayName: string,
  productKind: LabwareSpecCandidateResult['extracted']['productKind'],
  evidence: LabwareSpecEvidence[],
  gaps: LabwareSpecGap[],
): { addressing: 'grid' | 'linear' | 'single'; rows?: number; columns?: number; linearCount?: number; wellCount?: number; wellPitchMm?: number } {
  const haystack = `${displayName}\n${text}`;
  const explicitGrid = /\b([1-9]\d?)\s*[x×]\s*([1-9]\d?)\b/i.exec(haystack);
  const wellCount = extractWellCount(haystack, evidence);
  const pitch = extractPitch(haystack, evidence);
  if (explicitGrid?.[1] && explicitGrid[2]) {
    const first = Number(explicitGrid[1]);
    const second = Number(explicitGrid[2]);
    const rows = Math.min(first, second);
    const columns = Math.max(first, second);
    evidence.push({ field: 'topology.grid', value: `${rows}x${columns}`, evidenceSpan: span(haystack, explicitGrid.index, explicitGrid[0].length), confidence: 0.85 });
    return compact({ addressing: 'grid' as const, rows, columns, wellCount: rows * columns, ...(pitch !== undefined ? { wellPitchMm: pitch } : {}) });
  }
  if (productKind === 'reservoir') {
    if (!wellCount || wellCount === 1) return compact({ addressing: 'single' as const, linearCount: 1, wellCount: 1, ...(pitch !== undefined ? { wellPitchMm: pitch } : {}) });
    return compact({ addressing: 'linear' as const, linearCount: wellCount, wellCount, ...(pitch !== undefined ? { wellPitchMm: pitch } : {}) });
  }
  const grid = gridForWellCount(wellCount);
  if (grid) return compact({ addressing: 'grid' as const, rows: grid.rows, columns: grid.columns, wellCount: wellCount ?? grid.rows * grid.columns, ...(pitch !== undefined ? { wellPitchMm: pitch } : {}) });
  if (productKind === 'tube') return { addressing: 'single', linearCount: 1, wellCount: 1 };
  if (wellCount) return compact({ addressing: 'linear' as const, linearCount: wellCount, wellCount, ...(pitch !== undefined ? { wellPitchMm: pitch } : {}) });
  gaps.push({
    code: 'topology_inferred_single',
    severity: 'warning',
    message: 'Could not find a well count or grid geometry; defaulted to single-address labware.',
    field: 'topology',
  });
  return { addressing: 'single', linearCount: 1, wellCount: 1 };
}

function extractWellCount(text: string, evidence: LabwareSpecEvidence[]): number | undefined {
  const match = /\b(1|2|4|6|8|12|24|48|96|384|1536)\s*[- ]?\s*(?:well|position|tube|tip)s?\b/i.exec(text);
  if (!match?.[1]) return undefined;
  const value = Number(match[1]);
  evidence.push({ field: 'well_count', value, evidenceSpan: span(text, match.index, match[0].length), confidence: 0.85 });
  return value;
}

function extractPitch(text: string, evidence: LabwareSpecEvidence[]): number | undefined {
  const match = /\b(?:pitch|spacing)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*mm\b/i.exec(text)
    ?? /\b(\d+(?:\.\d+)?)\s*mm\s*(?:pitch|spacing)\b/i.exec(text);
  if (!match?.[1]) return undefined;
  const value = Number(match[1]);
  evidence.push({ field: 'well_pitch_mm', value, evidenceSpan: span(text, match.index, match[0].length), confidence: 0.75 });
  return value;
}

function inferCapacity(
  text: string,
  productKind: LabwareSpecCandidateResult['extracted']['productKind'],
  wellCount: number | undefined,
  evidence: LabwareSpecEvidence[],
  gaps: LabwareSpecGap[],
): { maxWellVolumeUl: number; minWorkingVolumeUl?: number; inferred: boolean } {
  const maxMatch = /\b(?:max(?:imum)?|well|working)?\s*(?:well\s*)?(?:volume|capacity)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(uL|ul|µL|mL|ml)\b/i.exec(text)
    ?? /\b(\d+(?:\.\d+)?)\s*(uL|ul|µL|mL|ml)\s*(?:well\s*)?(?:volume|capacity|max(?:imum)?)\b/i.exec(text);
  if (maxMatch?.[1] && maxMatch[2]) {
    const value = toMicroliters(Number(maxMatch[1]), maxMatch[2]);
    evidence.push({ field: 'max_well_volume_uL', value, evidenceSpan: span(text, maxMatch.index, maxMatch[0].length), confidence: 0.8 });
    return compact({ maxWellVolumeUl: value, inferred: false });
  }
  const key = defaultCapacityKey(productKind, wellCount, text);
  const fallback = DEFAULT_CAPACITY_UL[key] ?? DEFAULT_CAPACITY_UL.other ?? 1000;
  gaps.push({
    code: 'capacity_inferred',
    severity: 'warning',
    message: `Could not find a max well volume; defaulted to ${fallback} uL for ${key}.`,
    field: 'capacity.max_well_volume_uL',
  });
  return { maxWellVolumeUl: fallback, inferred: true };
}

function extractDimensions(text: string, evidence: LabwareSpecEvidence[]): LabwareSpecCandidateResult['extracted']['dimensionsMm'] | undefined {
  const match = /\b(?:dimensions?|size)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*mm\b/i.exec(text);
  if (!match?.[1] || !match[2] || !match[3]) return undefined;
  const dims = {
    length: Number(match[1]),
    width: Number(match[2]),
    height: Number(match[3]),
  };
  evidence.push({ field: 'dimensions_mm', value: `${dims.length}x${dims.width}x${dims.height}`, evidenceSpan: span(text, match.index, match[0].length), confidence: 0.75 });
  return dims;
}

function extractPhysicalGeometry(text: string, evidence: LabwareSpecEvidence[]): LabwarePhysicalGeometry | undefined {
  const mainMaterial = extractEnumLike(text, /\b(polypropylene|polystyrene|polycarbonate|cyclic olefin polymer|cyclic olefin copolymer|coc|cop|glass)\b/i, 'main_material', evidence);
  const mainColor = extractEnumLike(text, /\b(clear|transparent|black|white|natural|opaque|amber)\b/i, 'main_color', evidence);
  const bottomMaterial = extractEnumLike(text, /\b(?:bottom|film|base).{0,40}?(glass|polymer|polystyrene|polypropylene|cyclic olefin polymer|cyclic olefin copolymer|coc|cop)\b/i, 'bottom_material', evidence);
  const bottomColor = extractEnumLike(text, /\b(?:bottom|film|base).{0,40}?(clear|transparent|black|white|natural|opaque|amber)\b/i, 'bottom_color', evidence);
  const bottomShape = extractEnumLike(text, /\b(flat|round|u|v|conical)[ -]bottom\b/i, 'bottom_shape', evidence);
  const wellShape = extractEnumLike(text, /\b(round|square|conical|flat|v-shaped|u-shaped)\s+wells?\b/i, 'well_shape', evidence);
  const bottomThicknessMm = extractNumberWithUnit(text, /\b(?:bottom|film|base).{0,40}?(?:thickness|thick)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*mm\b/i, 'bottom_thickness_mm', evidence);
  const wellDiameterMm = extractNumberWithUnit(text, /\b(?:well\s*)?(?:diameter|dia\.?)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*mm\b/i, 'well_diameter_mm', evidence);
  const wellDepthMm = extractNumberWithUnit(text, /\b(?:well\s*)?depth\s*[:=]?\s*(\d+(?:\.\d+)?)\s*mm\b/i, 'well_depth_mm', evidence);
  const deckHeightMm = extractNumberWithUnit(text, /\b(?:deck\s*(?:height|z)|height\s*(?:from|above)\s*deck)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*mm\b/i, 'deck_height_mm', evidence);
  const wellSize = /\bwell\s*(?:size|dimensions?)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*mm\b/i.exec(text);
  let wellLengthMm: number | undefined;
  let wellWidthMm: number | undefined;
  if (wellSize?.[1] && wellSize[2]) {
    wellLengthMm = Number(wellSize[1]);
    wellWidthMm = Number(wellSize[2]);
    evidence.push({
      field: 'well_size_mm',
      value: `${wellLengthMm}x${wellWidthMm}`,
      evidenceSpan: span(text, wellSize.index, wellSize[0].length),
      confidence: 0.75,
    });
  }

  const physical = compact({
    ...(mainMaterial ? { mainMaterial } : {}),
    ...(mainColor ? { mainColor } : {}),
    ...(bottomMaterial ? { bottomMaterial } : {}),
    ...(bottomColor ? { bottomColor } : {}),
    ...(bottomThicknessMm !== undefined ? { bottomThicknessMm } : {}),
    ...(bottomShape ? { bottomShape } : {}),
    ...(wellShape ? { wellShape } : {}),
    ...(wellDiameterMm !== undefined ? { wellDiameterMm } : {}),
    ...(wellDepthMm !== undefined ? { wellDepthMm } : {}),
    ...(wellLengthMm !== undefined ? { wellLengthMm } : {}),
    ...(wellWidthMm !== undefined ? { wellWidthMm } : {}),
    ...(deckHeightMm !== undefined ? { deckHeightMm } : {}),
  });
  return Object.keys(physical).length > 0 ? physical : undefined;
}

function canonicalPhysicalGeometryFrom(input: {
  dimensions?: LabwareSpecCandidateResult['extracted']['dimensionsMm'];
  physicalGeometry?: LabwarePhysicalGeometry;
}): CanonicalLabwarePhysicalGeometry | undefined {
  const p = input.physicalGeometry;
  const canonical = compact({
    ...(input.dimensions ? { overall_dimensions_mm: input.dimensions } : {}),
    ...(p?.mainMaterial ? { main_material: p.mainMaterial } : {}),
    ...(p?.mainColor ? { main_color: p.mainColor } : {}),
    ...(p?.bottomMaterial ? { bottom_material: p.bottomMaterial } : {}),
    ...(p?.bottomColor ? { bottom_color: p.bottomColor } : {}),
    ...(p?.bottomThicknessMm !== undefined ? { bottom_thickness_mm: p.bottomThicknessMm } : {}),
    ...(p?.bottomShape ? { bottom_shape: p.bottomShape } : {}),
    ...(p?.wellShape ? { well_shape: p.wellShape } : {}),
    ...(p?.wellDiameterMm !== undefined ? { well_diameter_mm: p.wellDiameterMm } : {}),
    ...(p?.wellDepthMm !== undefined ? { well_depth_mm: p.wellDepthMm } : {}),
    ...(p?.wellLengthMm !== undefined ? { well_length_mm: p.wellLengthMm } : {}),
    ...(p?.wellWidthMm !== undefined ? { well_width_mm: p.wellWidthMm } : {}),
    ...(p?.deckHeightMm !== undefined ? { deck_height_mm: p.deckHeightMm } : {}),
  });
  return Object.keys(canonical).length > 0 ? canonical : undefined;
}

function extractEnumLike(
  text: string,
  pattern: RegExp,
  field: string,
  evidence: LabwareSpecEvidence[],
): string | undefined {
  const match = pattern.exec(text);
  const value = match?.[1];
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  evidence.push({ field, value: normalized, evidenceSpan: span(text, match.index, match[0].length), confidence: 0.65 });
  return normalized;
}

function extractNumberWithUnit(
  text: string,
  pattern: RegExp,
  field: string,
  evidence: LabwareSpecEvidence[],
): number | undefined {
  const match = pattern.exec(text);
  const raw = match?.[1];
  if (!raw) return undefined;
  const value = Number(raw);
  evidence.push({ field, value, evidenceSpan: span(text, match.index, match[0].length), confidence: 0.7 });
  return value;
}

function topologyDraft(geometry: { addressing: 'grid' | 'linear' | 'single'; rows?: number; columns?: number; linearCount?: number; wellPitchMm?: number }): LabwareDefinitionDraft['topology'] {
  return compact({
    addressing: geometry.addressing,
    ...(geometry.rows !== undefined ? { rows: geometry.rows } : {}),
    ...(geometry.columns !== undefined ? { columns: geometry.columns } : {}),
    ...(geometry.linearCount !== undefined ? { linear_count: geometry.linearCount } : {}),
    ...(geometry.wellPitchMm !== undefined ? { well_pitch_mm: geometry.wellPitchMm } : {}),
    orientation_default: 'landscape' as const,
    orientation_allowed: ['landscape', 'portrait'] as Array<'landscape' | 'portrait'>,
  });
}

function gridForWellCount(count: number | undefined): { rows: number; columns: number } | undefined {
  if (count === 384) return { rows: 16, columns: 24 };
  if (count === 96) return { rows: 8, columns: 12 };
  if (count === 48) return { rows: 6, columns: 8 };
  if (count === 24) return { rows: 4, columns: 6 };
  if (count === 12) return { rows: 3, columns: 4 };
  if (count === 6) return { rows: 2, columns: 3 };
  return undefined;
}

function toMicroliters(value: number, unit: string): number {
  return /ml/i.test(unit) ? value * 1000 : value;
}

function defaultCapacityKey(
  productKind: LabwareSpecCandidateResult['extracted']['productKind'],
  wellCount: number | undefined,
  text: string,
): keyof typeof DEFAULT_CAPACITY_UL {
  if (productKind === 'reservoir') return 'reservoir';
  if (productKind === 'tiprack') return 'tiprack';
  if (productKind === 'tube') {
    if (/\b50\s*ml\b/i.test(text)) return 'tube_50ml';
    if (/\b15\s*ml\b/i.test(text)) return 'tube_15ml';
    if (/\b2\s*ml\b/i.test(text)) return 'tube_2ml';
    return 'tube_1p5ml';
  }
  if (wellCount === 384) return 'plate_384';
  if (wellCount === 96 && /\bdeep\b/i.test(text)) return 'plate_96_deep';
  if (wellCount === 96) return 'plate_96';
  return 'other';
}

function compatibilityTags(
  productKind: LabwareSpecCandidateResult['extracted']['productKind'],
  wellCount: number | undefined,
  displayName: string,
): string[] {
  return Array.from(new Set([
    productKind,
    ...(wellCount ? [`${wellCount}-well`] : []),
    ...(/\bsbs\b|\bansi\b|\bslas\b/i.test(displayName) ? ['sbs-footprint'] : []),
  ]));
}

function renderProfile(productKind: LabwareSpecCandidateResult['extracted']['productKind']): string {
  if (productKind === 'reservoir') return 'reservoir';
  if (productKind === 'tube') return 'tube';
  if (productKind === 'tiprack') return 'tiprack';
  if (productKind === 'rack') return 'rack';
  return 'plate';
}

function buildNotes(input: { catalogNumber?: string; inferredCapacity: boolean; gaps: LabwareSpecGap[] }): string {
  const notes = [
    'Draft extracted from vendor labware specification. Review dimensions, compatibility, and capacity before promoting.',
    ...(input.catalogNumber ? [`Catalog number: ${input.catalogNumber}.`] : []),
    ...(input.inferredCapacity ? ['Max well volume was inferred because no explicit capacity was found.'] : []),
    ...(input.gaps.length ? [`Open gaps: ${input.gaps.map((gap) => gap.code).join(', ')}.`] : []),
  ];
  return notes.join(' ');
}

async function writeCandidateArtifact(workspaceRoot: string, result: LabwareSpecCandidateResult): Promise<string> {
  const candidateRoot = resolve(workspaceRoot, 'artifacts', 'foundry', 'labware-spec-candidates');
  const path = join(candidateRoot, `${safeSlug(result.draftDefinition.recordId)}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, 'utf-8');
  return relative(workspaceRoot, path);
}

function labwareWords(): RegExp {
  return /\b(?:plate|microplate|wellplate|reservoir|trough|tube|tip|tiprack|rack|vial|strip)\b/i;
}

function span(text: string, index: number | undefined, length: number): string {
  const start = Math.max(index ?? 0, 0);
  return text.slice(start, start + length).replace(/\s+/g, ' ').trim().slice(0, 220);
}

function safeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'labware-spec';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compact<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
  return record;
}
