import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistry } from '../../ai/ToolRegistry.js';
import { DEFAULT_CONFIG } from '../../config/types.js';
import type { AppContext } from '../../server.js';
import { extractLabwareSpecCandidate } from '../../ingestion/labware-spec/LabwareSpecCandidateService.js';
import { registerOpentronsLabwareDefinitionTools } from './opentronsLabwareDefinitionTools.js';
import { generateOpentronsLabwareDefinition } from '../../ingestion/labware-spec/OpentronsLabwareDefinitionService.js';
import type { LabwareDefinitionDraft } from '../../ingestion/labware-spec/LabwareSpecCandidateService.js';

function createContext(workspaceRoot: string): AppContext {
  return {
    schemaRegistry: {} as AppContext['schemaRegistry'],
    validator: {} as AppContext['validator'],
    lintEngine: {} as AppContext['lintEngine'],
    repoAdapter: {} as AppContext['repoAdapter'],
    store: {
      get: async () => null,
    } as AppContext['store'],
    indexManager: {} as AppContext['indexManager'],
    uiSpecLoader: {} as AppContext['uiSpecLoader'],
    platformRegistry: {} as AppContext['platformRegistry'],
    lifecycleEngine: {} as AppContext['lifecycleEngine'],
    policyBundleService: {} as AppContext['policyBundleService'],
    workspaceRoot,
    recordsDir: join(workspaceRoot, 'records'),
    schemaDir: join(workspaceRoot, 'schema'),
    appConfig: DEFAULT_CONFIG,
  };
}

describe('opentrons labware definition MCP tools', () => {
  it('registers a ToolRegistry tool that generates custom labware JSON from a candidate', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'opentrons-labware-tool-'));
    try {
      const candidate = await extractLabwareSpecCandidate({
        workspaceRoot,
        vendor: 'Corning',
        text: [
          'Corning 3595 96-well flat bottom plate',
          'Catalog No. 3595',
          '96 well 8 x 12 polystyrene clear plate',
          'Well volume capacity: 360 uL',
          'Pitch: 9 mm',
          'Dimensions: 127.8 x 85.5 x 14.4 mm',
          'Well diameter: 6.4 mm',
          'Well depth: 10.8 mm',
        ].join('\n'),
      });
      const registry = new ToolRegistry();
      const mcp = new McpServer({ name: 'test', version: '0.0.0' });
      registerOpentronsLabwareDefinitionTools(mcp, createContext(workspaceRoot), registry);

      const tool = registry.get('opentrons_labware_generate_definition');
      expect(tool).toBeDefined();
      const result = await tool!.handler({
        candidatePath: candidate.candidatePath,
        loadName: 'corning_3595_96_well_plate',
      });

      expect(result.isError).not.toBe(true);
      expect(result.content[0].type).toBe('text');
      const body = JSON.parse(result.content[0].text);
      expect(body.status).toBe('generated');
      expect(body.definition.parameters.loadName).toBe('corning_3595_96_well_plate');
      expect(body.definition.ordering[0][0]).toBe('A1');
      expect(body.artifactPath).toMatch(/^artifacts\/foundry\/opentrons-labware-definitions\//);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

// L2-ONTOLOGY-ANCHOR-SOURCES-1 ldefsave-f1: a door-shaped record (RecordParser
// strips recordId from the payload when it carries `id`) must generate via the
// recordId input path, with identity derived from the record ENVELOPE.
describe('ldefsave-f1 envelope-derived identity for record input', () => {
  const ENVELOPE_RECORD_ID = 'LBW-DEF-000042';
  const PAYLOAD_ID = 'labware/pure_water_96@v1';

  // Door-shaped: exactly what RecordParser yields for a door record —
  // kind + id + display_name + topology + capacity, NO recordId in payload.
  const doorPayload = {
    kind: 'labware-definition',
    id: PAYLOAD_ID,
    display_name: 'Pure Water 96 Well Plate',
    vendor: 'PureWater',
    topology: { addressing: 'grid', rows: 8, columns: 12, well_pitch_mm: 9 },
    capacity: { max_well_volume_uL: 360 },
    physical_geometry: {
      overall_dimensions_mm: { length: 127.8, width: 85.5, height: 14.4 },
      well_depth_mm: 10.8,
      well_diameter_mm: 6.4,
      bottom_thickness_mm: 0.6,
      bottom_shape: 'flat',
    },
  };

  it('ldefsave-f1: recordId path generates from a door-shaped record (no payload recordId), identity from the envelope', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'opentrons-ldefsave-f1-'));
    try {
      const registry = new ToolRegistry();
      const mcp = new McpServer({ name: 'test', version: '0.0.0' });
      const ctx = createContext(workspaceRoot);
      ctx.store = {
        get: async (id: string) =>
          id === ENVELOPE_RECORD_ID
            ? { recordId: ENVELOPE_RECORD_ID, schemaId: 'urn:cl:labware-definition', payload: doorPayload }
            : null,
      } as AppContext['store'];
      registerOpentronsLabwareDefinitionTools(mcp, ctx, registry);

      const result = await registry.get('opentrons_labware_generate_definition')!.handler({
        recordId: ENVELOPE_RECORD_ID,
      });

      expect(result.isError).not.toBe(true);
      const textContent = result.content.find(
        (item): item is { type: 'text'; text: string } => item.type === 'text',
      );
      expect(textContent?.type).toBe('text');
      const body = JSON.parse(textContent!.text);
      expect(body.status).toBe('generated');
      expect(body.blockers).toEqual([]);
      // Envelope identity drives the result: payload id (labware/pure_water_96@v1)
      // differs from envelope recordId; loadName must derive from the ENVELOPE id.
      expect(body.loadName).toBe(ENVELOPE_RECORD_ID.toLowerCase());
      expect(body.loadName).not.toContain('pure_water_96');
      expect(body.source.recordId).toBe(ENVELOPE_RECORD_ID);
      expect(body.definition.parameters.loadName).toBe(ENVELOPE_RECORD_ID.toLowerCase());
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('ldefsave-f1: missing-field error names the field actually absent (guard keeps its teeth)', async () => {
    const full = {
      ...doorPayload,
      recordId: ENVELOPE_RECORD_ID,
    } as LabwareDefinitionDraft;
    const noTopology = { ...full } as Partial<LabwareDefinitionDraft>;
    delete noTopology.topology;
    await expect(
      generateOpentronsLabwareDefinition({ workspaceRoot: '/tmp', persist: false, labwareDefinition: noTopology as LabwareDefinitionDraft }),
    ).rejects.toThrow('labware definition is missing topology');
    const noCapacity = { ...full } as Partial<LabwareDefinitionDraft>;
    delete noCapacity.capacity;
    await expect(
      generateOpentronsLabwareDefinition({ workspaceRoot: '/tmp', persist: false, labwareDefinition: noCapacity as LabwareDefinitionDraft }),
    ).rejects.toThrow('labware definition is missing capacity');
  });
});
