import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import YAML from 'yaml';
import type {
  LabwareDefinitionDraft,
  LabwareSpecCandidateResult,
} from './LabwareSpecCandidateService.js';

export interface GenerateOpentronsLabwareDefinitionInput {
  workspaceRoot: string;
  candidate?: LabwareSpecCandidateResult;
  candidatePath?: string;
  labwareDefinition?: LabwareDefinitionDraft;
  labwareDefinitionPath?: string;
  namespace?: string;
  version?: number;
  loadName?: string;
  persist?: boolean;
}

export interface OpentronsGenerationBlocker {
  code: string;
  message: string;
  field?: string;
}

export interface GenerateOpentronsLabwareDefinitionResult {
  kind: 'opentrons-labware-definition-generation';
  status: 'generated' | 'blocked';
  source: {
    kind: 'candidate' | 'labware-definition';
    path?: string;
    recordId: string;
  };
  loadName: string;
  namespace: string;
  version: number;
  blockers: OpentronsGenerationBlocker[];
  definition?: OpentronsLabwareDefinition;
  artifactPath?: string;
}

export interface OpentronsLabwareDefinition {
  ordering: string[][];
  brand: {
    brand: string;
    brandId: string[];
  };
  metadata: {
    displayName: string;
    displayCategory: string;
    displayVolumeUnits: 'µL';
    tags: string[];
  };
  dimensions: {
    xDimension: number;
    yDimension: number;
    zDimension: number;
  };
  wells: Record<string, OpentronsWellDefinition>;
  groups: Array<{
    metadata: {
      wellBottomShape?: string;
    };
    wells: string[];
  }>;
  parameters: {
    format: string;
    quirks: string[];
    isTiprack: boolean;
    loadName: string;
    isMagneticModuleCompatible: boolean;
  };
  cornerOffsetFromSlot: {
    x: number;
    y: number;
    z: number;
  };
  namespace: string;
  version: number;
  schemaVersion: 2;
}

export interface OpentronsWellDefinition {
  depth: number;
  totalLiquidVolume: number;
  shape: 'circular' | 'rectangular';
  x: number;
  y: number;
  z: number;
  diameter?: number;
  xDimension?: number;
  yDimension?: number;
}

type LabwareDefinitionWithPhysicalGeometry = LabwareDefinitionDraft & {
  physical_geometry?: {
    overall_dimensions_mm?: {
      length?: number;
      width?: number;
      height?: number;
    };
    bottom_thickness_mm?: number;
    bottom_shape?: string;
    well_shape?: string;
    well_diameter_mm?: number;
    well_depth_mm?: number;
    well_length_mm?: number;
    well_width_mm?: number;
    deck_height_mm?: number;
  };
  platform_aliases?: Array<{ platform: string; alias: string }>;
};

export async function generateOpentronsLabwareDefinition(
  input: GenerateOpentronsLabwareDefinitionInput,
): Promise<GenerateOpentronsLabwareDefinitionResult> {
  const loaded = await loadSourceDefinition(input);
  const labware = normalizeLabwareDefinition(loaded.definition);
  const namespace = input.namespace?.trim() || namespaceFor(labware);
  const version = input.version ?? 1;
  const loadName = input.loadName?.trim() || loadNameFor(labware);
  const blockers = validateRequiredGeometry(labware);
  if (blockers.length > 0) {
    return {
      kind: 'opentrons-labware-definition-generation',
      status: 'blocked',
      source: {
        kind: loaded.kind,
        ...(loaded.path ? { path: loaded.path } : {}),
        recordId: labware.recordId,
      },
      loadName,
      namespace,
      version,
      blockers,
    };
  }

  const definition = buildOpentronsDefinition(labware, { loadName, namespace, version });
  const result: GenerateOpentronsLabwareDefinitionResult = {
    kind: 'opentrons-labware-definition-generation',
    status: 'generated',
    source: {
      kind: loaded.kind,
      ...(loaded.path ? { path: loaded.path } : {}),
      recordId: labware.recordId,
    },
    loadName,
    namespace,
    version,
    blockers: [],
    definition,
  };

  if (input.persist !== false) {
    const artifactPath = await writeOpentronsArtifact(input.workspaceRoot, loadName, definition);
    result.artifactPath = artifactPath;
  }
  return result;
}

async function loadSourceDefinition(input: GenerateOpentronsLabwareDefinitionInput): Promise<{
  kind: 'candidate' | 'labware-definition';
  definition: LabwareDefinitionWithPhysicalGeometry;
  path?: string;
}> {
  if (input.labwareDefinition) {
    return { kind: 'labware-definition', definition: input.labwareDefinition as LabwareDefinitionWithPhysicalGeometry };
  }
  if (input.candidate) {
    return { kind: 'candidate', definition: input.candidate.draftDefinition as LabwareDefinitionWithPhysicalGeometry };
  }
  if (input.candidatePath) {
    const path = resolveInsideCandidateArtifacts(input.workspaceRoot, input.candidatePath);
    const parsed = JSON.parse(await readFile(path, 'utf-8')) as LabwareSpecCandidateResult;
    if (parsed.kind !== 'labware-spec-candidate-extraction') {
      throw new Error('candidatePath must point to a labware-spec-candidate-extraction artifact');
    }
    return {
      kind: 'candidate',
      definition: parsed.draftDefinition as LabwareDefinitionWithPhysicalGeometry,
      path: relative(input.workspaceRoot, path),
    };
  }
  if (!input.labwareDefinitionPath) {
    throw new Error('candidate, candidatePath, labwareDefinition, or labwareDefinitionPath is required');
  }
  const path = resolveInsideWorkspace(input.workspaceRoot, input.labwareDefinitionPath);
  const parsed = YAML.parse(await readFile(path, 'utf-8')) as Record<string, unknown>;
  return {
    kind: 'labware-definition',
    definition: stripSchema(parsed) as unknown as LabwareDefinitionWithPhysicalGeometry,
    path: relative(input.workspaceRoot, path),
  };
}

function normalizeLabwareDefinition(value: LabwareDefinitionWithPhysicalGeometry): LabwareDefinitionWithPhysicalGeometry {
  if (value.kind !== 'labware-definition') {
    throw new Error('labware definition kind must be labware-definition');
  }
  if (!value.recordId || !value.display_name || !value.topology || !value.capacity) {
    throw new Error('labware definition is missing recordId, display_name, topology, or capacity');
  }
  return value;
}

function validateRequiredGeometry(labware: LabwareDefinitionWithPhysicalGeometry): OpentronsGenerationBlocker[] {
  const blockers: OpentronsGenerationBlocker[] = [];
  const topology = labware.topology;
  const physical = labware.physical_geometry;
  const dims = physical?.overall_dimensions_mm;
  if (!dims?.length || !dims.width || !dims.height) {
    blockers.push({
      code: 'missing_overall_dimensions',
      field: 'physical_geometry.overall_dimensions_mm',
      message: 'Opentrons generation requires overall length, width, and height in mm.',
    });
  }
  if (!labware.capacity.max_well_volume_uL || labware.capacity.max_well_volume_uL <= 0) {
    blockers.push({
      code: 'missing_max_volume',
      field: 'capacity.max_well_volume_uL',
      message: 'Opentrons generation requires max well volume in uL.',
    });
  }
  if (!physical?.well_depth_mm || physical.well_depth_mm <= 0) {
    blockers.push({
      code: 'missing_well_depth',
      field: 'physical_geometry.well_depth_mm',
      message: 'Opentrons generation requires well depth in mm.',
    });
  }
  const hasCircularSize = Boolean(physical?.well_diameter_mm && physical.well_diameter_mm > 0);
  const hasRectangularSize = Boolean(physical?.well_length_mm && physical.well_width_mm && physical.well_length_mm > 0 && physical.well_width_mm > 0);
  if (!hasCircularSize && !hasRectangularSize) {
    blockers.push({
      code: 'missing_well_xy_geometry',
      field: 'physical_geometry',
      message: 'Opentrons generation requires well_diameter_mm or both well_length_mm and well_width_mm.',
    });
  }
  if (topology.addressing === 'grid') {
    if (!topology.rows || !topology.columns) {
      blockers.push({
        code: 'missing_grid_topology',
        field: 'topology',
        message: 'Grid labware requires rows and columns.',
      });
    }
    if (!xPitch(topology) || !yPitch(topology)) {
      blockers.push({
        code: 'missing_grid_pitch',
        field: 'topology',
        message: 'Grid labware requires well_pitch_mm or row/column pitch values.',
      });
    }
  } else if (topology.addressing === 'linear') {
    if (!topology.linear_count) {
      blockers.push({
        code: 'missing_linear_count',
        field: 'topology.linear_count',
        message: 'Linear labware requires linear_count.',
      });
    }
    if (!xPitch(topology)) {
      blockers.push({
        code: 'missing_linear_pitch',
        field: 'topology',
        message: 'Linear labware requires well_pitch_mm or col_pitch_mm.',
      });
    }
  } else if (topology.addressing !== 'single') {
    blockers.push({
      code: 'unsupported_topology',
      field: 'topology.addressing',
      message: `Unsupported topology addressing mode: ${String(topology.addressing)}`,
    });
  }
  return blockers;
}

function buildOpentronsDefinition(
  labware: LabwareDefinitionWithPhysicalGeometry,
  options: { loadName: string; namespace: string; version: number },
): OpentronsLabwareDefinition {
  const physical = labware.physical_geometry!;
  const dims = physical.overall_dimensions_mm!;
  const dimensions = {
    xDimension: round3(dims.length!),
    yDimension: round3(dims.width!),
    zDimension: round3(dims.height!),
  };
  const ordering = orderingFor(labware);
  const wells = buildWells(labware, dimensions);
  const allWells = ordering.flat();
  const bottomShape = normalizeBottomShape(physical.bottom_shape);
  return {
    ordering,
    brand: {
      brand: labware.vendor || 'Custom',
      brandId: [],
    },
    metadata: {
      displayName: labware.display_name,
      displayCategory: displayCategoryFor(labware),
      displayVolumeUnits: 'µL',
      tags: labware.compatibility_tags ?? [],
    },
    dimensions,
    wells,
    groups: [{
      metadata: {
        ...(bottomShape ? { wellBottomShape: bottomShape } : {}),
      },
      wells: allWells,
    }],
    parameters: {
      format: opentronsFormat(labware, allWells.length),
      quirks: [],
      isTiprack: isTiprack(labware),
      loadName: options.loadName,
      isMagneticModuleCompatible: false,
    },
    cornerOffsetFromSlot: { x: 0, y: 0, z: 0 },
    namespace: options.namespace,
    version: options.version,
    schemaVersion: 2,
  };
}

function buildWells(
  labware: LabwareDefinitionWithPhysicalGeometry,
  dimensions: { xDimension: number; yDimension: number; zDimension: number },
): Record<string, OpentronsWellDefinition> {
  const physical = labware.physical_geometry!;
  const topology = labware.topology;
  const depth = round3(physical.well_depth_mm!);
  const z = round3(physical.bottom_thickness_mm ?? 0);
  const volume = round3(labware.capacity.max_well_volume_uL);
  const circular = Boolean(physical.well_diameter_mm);
  const common = {
    depth,
    totalLiquidVolume: volume,
    shape: (circular ? 'circular' : 'rectangular') as 'circular' | 'rectangular',
    z,
    ...(circular
      ? { diameter: round3(physical.well_diameter_mm!) }
      : {
          xDimension: round3(physical.well_length_mm!),
          yDimension: round3(physical.well_width_mm!),
        }),
  };
  const wells: Record<string, OpentronsWellDefinition> = {};
  if (topology.addressing === 'single') {
    wells['A1'] = {
      ...common,
      x: round3(dimensions.xDimension / 2),
      y: round3(dimensions.yDimension / 2),
    };
    return wells;
  }
  if (topology.addressing === 'linear') {
    const pitch = xPitch(topology)!;
    const count = topology.linear_count!;
    const startX = centeredStart(dimensions.xDimension, pitch, count);
    const y = dimensions.yDimension / 2;
    for (let index = 0; index < count; index += 1) {
      const well = `A${index + 1}`;
      wells[well] = {
        ...common,
        x: round3(startX + index * pitch),
        y: round3(y),
      };
    }
    return wells;
  }

  const rows = topology.rows!;
  const columns = topology.columns!;
  const colPitch = xPitch(topology)!;
  const rowPitch = yPitch(topology)!;
  const startX = centeredStart(dimensions.xDimension, colPitch, columns);
  const backY = dimensions.yDimension - centeredStart(dimensions.yDimension, rowPitch, rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const well = `${rowName(row)}${col + 1}`;
      wells[well] = {
        ...common,
        x: round3(startX + col * colPitch),
        y: round3(backY - row * rowPitch),
      };
    }
  }
  return wells;
}

function orderingFor(labware: LabwareDefinitionWithPhysicalGeometry): string[][] {
  const topology = labware.topology;
  if (topology.addressing === 'single') return [['A1']];
  if (topology.addressing === 'linear') {
    return [Array.from({ length: topology.linear_count! }, (_, index) => `A${index + 1}`)];
  }
  return Array.from({ length: topology.rows! }, (_, row) =>
    Array.from({ length: topology.columns! }, (_, col) => `${rowName(row)}${col + 1}`),
  );
}

function xPitch(topology: LabwareDefinitionWithPhysicalGeometry['topology']): number | undefined {
  return topology.col_pitch_mm ?? topology.well_pitch_mm;
}

function yPitch(topology: LabwareDefinitionWithPhysicalGeometry['topology']): number | undefined {
  return topology.row_pitch_mm ?? topology.well_pitch_mm;
}

function centeredStart(dimension: number, pitch: number, count: number): number {
  return (dimension - ((count - 1) * pitch)) / 2;
}

function rowName(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function displayCategoryFor(labware: LabwareDefinitionWithPhysicalGeometry): string {
  const profile = String(labware.render_hints?.['profile'] ?? '').toLowerCase();
  const text = `${labware.display_name} ${profile} ${(labware.compatibility_tags ?? []).join(' ')}`.toLowerCase();
  if (text.includes('tip')) return 'tipRack';
  if (text.includes('reservoir')) return 'reservoir';
  if (text.includes('tube')) return 'tubeRack';
  return 'wellPlate';
}

function opentronsFormat(labware: LabwareDefinitionWithPhysicalGeometry, wellCount: number): string {
  if (isTiprack(labware)) return `${wellCount}Standard`;
  if (labware.topology.addressing === 'grid' && wellCount === 96) return '96Standard';
  if (labware.topology.addressing === 'grid' && wellCount === 384) return '384Standard';
  if (labware.topology.addressing === 'linear') return 'irregular';
  if (labware.topology.addressing === 'single') return 'irregular';
  return `${wellCount}Standard`;
}

function isTiprack(labware: LabwareDefinitionWithPhysicalGeometry): boolean {
  const text = `${labware.display_name} ${(labware.compatibility_tags ?? []).join(' ')}`.toLowerCase();
  return text.includes('tip') || text.includes('tiprack');
}

function loadNameFor(labware: LabwareDefinitionWithPhysicalGeometry): string {
  const opentronsAlias = labware.platform_aliases?.find((alias) =>
    alias.platform === 'opentrons_ot2' || alias.platform === 'opentrons_flex',
  )?.alias;
  return safeOpentronsName(opentronsAlias || labware.id.split('/').pop()?.replace(/@v\d+$/i, '') || labware.recordId);
}

function namespaceFor(labware: LabwareDefinitionWithPhysicalGeometry): string {
  return safeOpentronsName(labware.vendor || 'custom');
}

function normalizeBottomShape(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'u') return 'u';
  if (normalized === 'v') return 'v';
  if (normalized.includes('flat')) return 'flat';
  if (normalized.includes('round')) return 'round';
  if (normalized.includes('conical')) return 'v';
  return normalized;
}

async function writeOpentronsArtifact(
  workspaceRoot: string,
  loadName: string,
  definition: OpentronsLabwareDefinition,
): Promise<string> {
  const artifactRoot = resolve(workspaceRoot, 'artifacts', 'foundry', 'opentrons-labware-definitions');
  const path = join(artifactRoot, `${safeOpentronsName(loadName)}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(definition, null, 2)}\n`, 'utf-8');
  return relative(workspaceRoot, path);
}

function resolveInsideCandidateArtifacts(workspaceRoot: string, path: string): string {
  const artifactRoot = resolve(workspaceRoot, 'artifacts', 'foundry', 'labware-spec-candidates');
  const resolved = resolve(workspaceRoot, path);
  const rel = relative(artifactRoot, resolved);
  if (rel === '' || (!rel.startsWith('..') && !resolve(rel).startsWith('..'))) {
    return resolved;
  }
  throw new Error(`candidatePath must be inside ${artifactRoot}`);
}

function resolveInsideWorkspace(workspaceRoot: string, path: string): string {
  const resolved = resolve(workspaceRoot, path);
  const rel = relative(workspaceRoot, resolved);
  if (rel === '' || (!rel.startsWith('..') && !resolve(rel).startsWith('..'))) {
    return resolved;
  }
  throw new Error(`${basename(path)} must be inside the workspace`);
}

function stripSchema(value: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _schema, ...rest } = value;
  return rest;
}

function safeOpentronsName(value: string): string {
  return value
    .toLowerCase()
    .replace(/@v\d+$/i, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'custom_labware';
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
