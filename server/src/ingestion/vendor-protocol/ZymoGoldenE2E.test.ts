import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeVendorProtocolPdfFile, extractVendorProtocolCandidate } from './VendorProtocolPdf.js';
import { createZymoDeepwellAdaptationPlan, normalizeZymoProtocolCandidate } from './ZymoNormalization.js';
import { compileZymoAdaptationToEventGraphProposal } from './ZymoEventGraphProposal.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const zymoPdfPath = resolve(repoRoot, 'resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf');

describe('Zymo vendor protocol golden E2E', () => {
  it('decodes PDF, extracts candidate, normalizes, adapts, and emits a reviewable event graph proposal', async () => {
    const document = await decodeVendorProtocolPdfFile(zymoPdfPath, {
      documentId: 'vendor-protocol-zymo-magbead',
    });
    const candidate = extractVendorProtocolCandidate(document);
    const normalized = normalizeZymoProtocolCandidate(candidate);
    const plan = createZymoDeepwellAdaptationPlan(normalized, {
      directive: 'Read the ZYMO DNA MagBead prep protocol PDF and suggest a version to run in 96-well deepwell plates.',
    });
    const proposal = compileZymoAdaptationToEventGraphProposal(plan);

    expect(document.source.title).toBe('ZymoBIOMICS 96 MagBead DNA Kit');
    expect(candidate.steps).toHaveLength(17);
    expect(normalized.materialRoles.find((role) => role.roleId === 'magwash_2')).toMatchObject({
      normalizedId: 'zymo-magwash-2',
      status: 'resolved',
    });
    expect(plan.targetFormat.primaryLabwareType).toBe('96-well-deepwell-plate');
    expect(plan.reservoirPlan.allocations.length).toBeGreaterThanOrEqual(5);
    expect(plan.manualSteps.length).toBeGreaterThan(0);

    expect(proposal.eventGraph.events.length).toBeGreaterThan(20);
    expect(proposal.eventGraph.labwares).toHaveLength(3);
    expect(proposal.resourceManifest.reservoirLoads.length).toBeGreaterThan(0);
    expect(proposal.validationReport.findings.length).toBeGreaterThan(0);
    expect(proposal.gaps.length).toBeGreaterThan(0);
    expect(proposal.eventGraph.events.every((event) => event.eventId.startsWith('evt-zymo-'))).toBe(true);
    expect(proposal.sourceProtocolRef).toMatchObject({
      documentId: 'vendor-protocol-zymo-magbead',
      title: 'ZymoBIOMICS 96 MagBead DNA Kit',
      version: '1.4.1',
    });
  });
});

