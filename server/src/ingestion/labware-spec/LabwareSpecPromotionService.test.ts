import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractLabwareSpecCandidate } from './LabwareSpecCandidateService.js';
import { promoteLabwareSpecCandidate } from './LabwareSpecPromotionService.js';

const SPEC_TEXT = `
Thermo Fisher AB12345 96-well PCR plate
Cat. No. AB12345
96 well 8 x 12 polypropylene plate
Maximum well volume: 200 uL
Pitch: 9 mm
`;

describe('LabwareSpecPromotionService', () => {
  it('promotes a persisted labware-spec candidate to labware-definition YAML with sidecar provenance', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'labware-spec-promote-'));
    try {
      const candidate = await extractLabwareSpecCandidate({
        workspaceRoot,
        text: SPEC_TEXT,
        vendor: 'Thermo Fisher',
      });

      const result = await promoteLabwareSpecCandidate({
        workspaceRoot,
        candidatePath: candidate.candidatePath,
      });

      expect(result.status).toBe('promoted');
      expect(result.outputPath).toBeDefined();
      expect(result.sidecarPath).toBeDefined();
      expect(result.recordId).toContain('thermo-fisher');
      const yaml = await readFile(join(workspaceRoot, result.outputPath!), 'utf-8');
      expect(yaml).toContain('$schema: https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml');
      expect(yaml).toContain('kind: labware-definition');
      expect(yaml).toContain('physical_geometry');
      const sidecar = JSON.parse(await readFile(join(workspaceRoot, result.sidecarPath!), 'utf-8'));
      expect(sidecar.kind).toBe('labware-spec-candidate-promotion-sidecar');
      expect(sidecar.evidence.length).toBeGreaterThan(0);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('blocks promotion when the target YAML already exists unless overwrite is true', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'labware-spec-promote-existing-'));
    try {
      const candidate = await extractLabwareSpecCandidate({
        workspaceRoot,
        text: SPEC_TEXT,
        vendor: 'Thermo Fisher',
      });

      const first = await promoteLabwareSpecCandidate({ workspaceRoot, candidate });
      expect(first.status).toBe('promoted');

      const second = await promoteLabwareSpecCandidate({ workspaceRoot, candidate });
      expect(second.status).toBe('blocked');
      expect(second.blockers[0]).toMatchObject({ code: 'record_exists' });

      const overwrite = await promoteLabwareSpecCandidate({ workspaceRoot, candidate, overwrite: true });
      expect(overwrite.status).toBe('promoted');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
