import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractLabwareSpecCandidate } from './LabwareSpecCandidateService.js';
import { generateOpentronsLabwareDefinition } from './OpentronsLabwareDefinitionService.js';

const COMPLETE_SPEC = `
Corning 3595 96-well Clear Flat Bottom Microplate
Catalog No. 3595
Material: polystyrene. Color: clear.
Format: 96 well, 8 x 12, SBS footprint.
Well volume capacity: 360 uL.
Pitch: 9 mm.
Dimensions: 127.8 x 85.5 x 14.4 mm.
Well diameter: 6.4 mm.
Well depth: 10.8 mm.
Bottom thickness: 0.6 mm.
`;

describe('OpentronsLabwareDefinitionService', () => {
  it('generates a persisted Opentrons v2-style definition from a complete labware candidate', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'opentrons-labware-gen-'));
    try {
      const candidate = await extractLabwareSpecCandidate({
        workspaceRoot,
        text: COMPLETE_SPEC,
        vendor: 'Corning',
      });

      const result = await generateOpentronsLabwareDefinition({
        workspaceRoot,
        candidatePath: candidate.candidatePath,
        loadName: 'corning_3595_96_well_plate',
        namespace: 'corning',
      });

      expect(result.status).toBe('generated');
      expect(result.blockers).toEqual([]);
      expect(result.definition?.schemaVersion).toBe(2);
      expect(result.definition?.parameters.loadName).toBe('corning_3595_96_well_plate');
      expect(result.definition?.parameters.format).toBe('96Standard');
      expect(result.definition?.ordering).toHaveLength(8);
      expect(result.definition?.ordering[0]).toHaveLength(12);
      expect(Object.keys(result.definition?.wells ?? {})).toHaveLength(96);
      expect(result.definition?.wells.A1).toMatchObject({
        shape: 'circular',
        diameter: 6.4,
        depth: 10.8,
        totalLiquidVolume: 360,
        z: 0.6,
      });
      expect(result.definition?.wells.H12.x).toBeGreaterThan(result.definition?.wells.A1.x ?? 0);
      expect(result.definition?.wells.A1.y).toBeGreaterThan(result.definition?.wells.H12.y ?? 0);
      expect(result.artifactPath).toBe('artifacts/foundry/opentrons-labware-definitions/corning_3595_96_well_plate.json');
      await expect(readFile(join(workspaceRoot, result.artifactPath!), 'utf-8')).resolves.toContain('"schemaVersion": 2');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('returns blockers instead of guessing missing well geometry', async () => {
    const result = await generateOpentronsLabwareDefinition({
      workspaceRoot: '/tmp',
      persist: false,
      labwareDefinition: {
        kind: 'labware-definition',
        recordId: 'lbw-def-incomplete',
        type: 'labware_definition',
        id: 'test/incomplete@v1',
        display_name: 'Incomplete 96 Well Plate',
        read_only: true,
        source: { kind: 'imported', hash: 'abc' },
        topology: { addressing: 'grid', rows: 8, columns: 12, well_pitch_mm: 9 },
        capacity: { max_well_volume_uL: 200 },
        compatibility_tags: ['plate', '96-well'],
        notes: 'Missing geometry.',
        render_hints: { profile: 'plate' },
      },
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers.map((blocker) => blocker.code)).toEqual(expect.arrayContaining([
      'missing_overall_dimensions',
      'missing_well_depth',
      'missing_well_xy_geometry',
    ]));
    expect(result.definition).toBeUndefined();
  });
});
