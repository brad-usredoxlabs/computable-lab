import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractLabwareSpecCandidate } from './LabwareSpecCandidateService.js';

const SAMPLE_SPEC = `
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
Height above deck: 14.4 mm.
`;

describe('LabwareSpecCandidateService', () => {
  it('extracts topology, capacity, vendor metadata, and physical geometry from text', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'labware-spec-candidate-'));
    try {
      const result = await extractLabwareSpecCandidate({
        workspaceRoot,
        text: SAMPLE_SPEC,
        fileName: 'corning-3595.txt',
        vendor: 'Corning',
        sourceUrl: 'https://example.test/corning-3595.pdf',
      });

      expect(result.kind).toBe('labware-spec-candidate-extraction');
      expect(result.extracted).toMatchObject({
        vendor: 'Corning',
        catalogNumber: '3595',
        productKind: 'plate',
        wellCount: 96,
        rows: 8,
        columns: 12,
        maxWellVolumeUl: 360,
        wellPitchMm: 9,
      });
      expect(result.extracted.physicalGeometry).toMatchObject({
        mainMaterial: 'polystyrene',
        mainColor: 'clear',
        bottomThicknessMm: 0.6,
        bottomShape: 'flat',
        wellDiameterMm: 6.4,
        wellDepthMm: 10.8,
        deckHeightMm: 14.4,
      });
      expect(result.draftDefinition.topology).toMatchObject({
        addressing: 'grid',
        rows: 8,
        columns: 12,
        well_pitch_mm: 9,
      });
      expect(result.draftDefinition.physical_geometry).toMatchObject({
        main_material: 'polystyrene',
        main_color: 'clear',
        bottom_thickness_mm: 0.6,
        bottom_shape: 'flat',
        well_diameter_mm: 6.4,
        well_depth_mm: 10.8,
        deck_height_mm: 14.4,
        overall_dimensions_mm: {
          length: 127.8,
          width: 85.5,
          height: 14.4,
        },
      });
      expect(result.draftDefinition.render_hints.physical_geometry).toMatchObject({
        wellDiameterMm: 6.4,
        bottomThicknessMm: 0.6,
      });
      expect(result.candidatePath).toMatch(/^artifacts\/foundry\/labware-spec-candidates\//);
      await expect(readFile(join(workspaceRoot, result.candidatePath!), 'utf-8')).resolves.toContain('labware-spec-candidate-extraction');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
