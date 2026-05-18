import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFoundryAcquisitionStructuredResult } from './FoundryAcquisitionOutputs.js';

describe('FoundryAcquisitionOutputs', () => {
  it('summarizes artifact paths, records, and blockers from tool-agent traces', async () => {
    const root = await mkdtemp(join(tmpdir(), 'foundry-acquisition-outputs-'));
    try {
      const tracePath = join(root, 'trace.jsonl');
      await writeFile(tracePath, [
        JSON.stringify({
          type: 'tool_result',
          tool: 'labware_spec_extract_candidate',
          result: {
            ok: true,
            content: JSON.stringify({
              kind: 'labware-spec-candidate-extraction',
              candidatePath: 'artifacts/foundry/labware-spec-candidates/corning-3595.json',
              draftDefinition: { recordId: 'lbw-def-corning-3595' },
              gaps: [{ code: 'missing_well_depth', severity: 'warning', message: 'Missing well depth.' }],
            }),
          },
        }),
        JSON.stringify({
          type: 'tool_result',
          tool: 'labware_spec_promote_candidate',
          result: {
            ok: true,
            content: JSON.stringify({
              kind: 'labware-spec-candidate-promotion',
              status: 'promoted',
              recordId: 'lbw-def-corning-3595',
              outputPath: 'records/seed/labware-definition/lbw-def-corning-3595.yaml',
              sidecarPath: 'records/seed/labware-definition/lbw-def-corning-3595.yaml.promotion.json',
              blockers: [],
            }),
          },
        }),
        JSON.stringify({
          type: 'tool_result',
          tool: 'opentrons_labware_generate_definition',
          result: {
            ok: true,
            content: JSON.stringify({
              kind: 'opentrons-labware-definition-generation',
              status: 'blocked',
              source: { recordId: 'lbw-def-corning-3595' },
              blockers: [{ code: 'missing_well_depth', message: 'Opentrons generation requires well depth.' }],
            }),
          },
        }),
      ].join('\n'));

      const summary = await buildFoundryAcquisitionStructuredResult({ tracePath });

      expect(summary.status).toBe('blocked');
      expect(summary.artifacts).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'artifacts/foundry/labware-spec-candidates/corning-3595.json' }),
        expect.objectContaining({ path: 'records/seed/labware-definition/lbw-def-corning-3595.yaml' }),
      ]));
      expect(summary.records).toEqual(expect.arrayContaining([
        expect.objectContaining({ recordId: 'lbw-def-corning-3595' }),
      ]));
      expect(summary.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'missing_well_depth', tool: 'opentrons_labware_generate_definition' }),
      ]));
      expect(summary.toolRuns.map((run) => run.tool)).toEqual([
        'labware_spec_extract_candidate',
        'labware_spec_promote_candidate',
        'opentrons_labware_generate_definition',
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
