import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractVendorProtocolCandidateFromInput } from './VendorProtocolCandidateService.js';

const SAMPLE_PROTOCOL = `
Example DNA Extraction Protocol

Product Contents
ZymoBIOMICS MagBinding Buffer
ZymoBIOMICS MagWash 1

Protocol
1. Add 100 ul ZymoBIOMICS MagBinding Buffer to the deep-well block.
2. Mix for 5 minutes at room temperature.
3. Place the plate on a magnetic stand for 3 minutes.
`;

describe('VendorProtocolCandidateService', () => {
  it('extracts a protocol candidate from text and persists the candidate artifact', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'vendor-protocol-candidate-'));
    try {
      const result = await extractVendorProtocolCandidateFromInput({
        workspaceRoot,
        text: SAMPLE_PROTOCOL,
        fileName: 'example-protocol.txt',
        documentId: 'doc-example-protocol',
        vendor: 'Example Vendor',
      });

      expect(result.source.inputKind).toBe('text');
      expect(result.document.sectionCount).toBeGreaterThanOrEqual(2);
      expect(result.candidate.kind).toBe('vendor-protocol-candidate');
      expect(result.candidate.steps.map((step) => step.stepNumber)).toEqual([1, 2, 3]);
      expect(result.candidate.steps[0]?.actions[0]).toMatchObject({
        actionKind: 'add',
        material: 'ZymoBIOMICS MagBinding Buffer',
      });
      expect(result.candidate.steps[2]?.actions[0]).toMatchObject({
        actionKind: 'magnetize',
        equipment: 'magnetic stand',
      });
      expect(result.candidatePath).toBe('artifacts/foundry/protocol-candidates/doc-example-protocol.json');
      await expect(readFile(join(workspaceRoot, result.candidatePath!), 'utf-8')).resolves.toContain('vendor-protocol-candidate');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
