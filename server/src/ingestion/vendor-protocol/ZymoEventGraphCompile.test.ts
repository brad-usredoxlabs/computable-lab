import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeVendorProtocolPdf, extractVendorProtocolCandidate } from './VendorProtocolPdf.js';
import { createZymoDeepwellAdaptationPlan, normalizeZymoProtocolCandidate } from './ZymoNormalization.js';
import { compileZymoAdaptationToEventGraphProposal } from './ZymoEventGraphProposal.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const zymoPdfPath = resolve(repoRoot, 'resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf');

async function zymoProposal() {
  const document = await decodeVendorProtocolPdf(await readFile(zymoPdfPath), {
    filename: '_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf',
    documentId: 'vendor-protocol-zymo-magbead',
  });
  const candidate = extractVendorProtocolCandidate(document);
  const normalized = normalizeZymoProtocolCandidate(candidate);
  const plan = createZymoDeepwellAdaptationPlan(normalized, {
    directive: 'suggest a version to run in 96-well deepwell plates',
  });
  return compileZymoAdaptationToEventGraphProposal(plan);
}

describe('ZymoEventGraphCompile', () => {
  it('compiles an adapted Zymo plan into non-empty reviewable proposal artifacts', async () => {
    const proposal = await zymoProposal();

    expect(proposal.kind).toBe('vendor-event-graph-proposal');
    expect(proposal.eventGraph.status).toBe('draft');
    expect(proposal.eventGraph.labwares).toEqual(expect.arrayContaining([
      expect.objectContaining({ labwareId: 'lwi-zymo-primary-deepwell', labwareType: '96-well-deepwell-plate' }),
      expect.objectContaining({ labwareId: 'lwi-zymo-reagent-reservoir', labwareType: '12-well-reservoir' }),
      expect.objectContaining({ labwareId: 'lwi-zymo-elution-plate', labwareType: '96-well-conical-pcr-plate' }),
    ]));
    expect(proposal.labwareAdditions).toEqual(expect.arrayContaining([
      expect.objectContaining({ roleId: 'primary_sample_plate', labwareType: '96-well-deepwell-plate' }),
      expect.objectContaining({ roleId: 'reagent_reservoir', labwareType: '12-well-reservoir' }),
      expect.objectContaining({ roleId: 'elution_plate', labwareType: '96-well-conical-pcr-plate' }),
    ]));
    expect(proposal.eventGraph.events.length).toBeGreaterThan(20);
    expect(proposal.eventGraph.events.map((event) => event.event_type)).toEqual(expect.arrayContaining([
      'add_material',
      'transfer',
      'mix',
      'other',
    ]));
  });

  it('includes reservoir loads, supportable liquid events, manual placeholders, resources, and validation findings', async () => {
    const proposal = await zymoProposal();

    const reservoirLoad = proposal.eventGraph.events.find((event) =>
      event.event_type === 'add_material' &&
      event.details.roleId === 'magbinding_buffer' &&
      Array.isArray(event.details.wells) &&
      event.details.wells.includes('A1'));
    expect(reservoirLoad).toBeDefined();
    expect(reservoirLoad?.details.volume_uL).toBe(25000);

    const magWash2Transfer = proposal.eventGraph.events.find((event) =>
      event.event_type === 'transfer' &&
      event.details.roleId === 'magwash_2' &&
      event.details.sourceStepNumber === 12);
    expect(magWash2Transfer).toMatchObject({
      details: {
        volume_uL: 900,
      },
    });

    const elutionTransfer = proposal.eventGraph.events.find((event) =>
      event.event_type === 'transfer' &&
      event.details.sourceStepNumber === 17);
    expect(elutionTransfer).toMatchObject({
      details: {
        source: expect.objectContaining({ labwareId: 'lwi-zymo-primary-deepwell' }),
        target: expect.objectContaining({ labwareId: 'lwi-zymo-elution-plate' }),
        volume_uL: 50,
      },
    });

    const manualPlaceholders = proposal.eventGraph.events.filter((event) => event.event_type === 'other');
    expect(manualPlaceholders.length).toBeGreaterThanOrEqual(5);
    expect(manualPlaceholders).toContainEqual(expect.objectContaining({
      details: expect.objectContaining({
        manual: true,
        sourceStepNumber: 3,
        equipmentRoles: expect.arrayContaining(['bead_beater']),
      }),
    }));

    expect(proposal.resourceManifest.tipRacks).toEqual([
      { pipetteType: 'p1000-multi', rackCount: 1 },
    ]);
    expect(proposal.resourceManifest.reservoirLoads).toContainEqual(expect.objectContaining({
      reservoirRef: 'lwi-zymo-reagent-reservoir',
      well: 'A1',
      reagentKind: 'magbinding_buffer',
      volumeUl: 25000,
    }));
    expect(proposal.resourceManifest.consumables).toEqual(expect.arrayContaining([
      '96-well-deepwell-plate',
      '12-well-reservoir',
      '96-well-conical-pcr-plate',
    ]));
    expect(proposal.validationReport.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'zymo_reservoir_capacity_exceeded', severity: 'warning' }),
      expect.objectContaining({ category: 'zymo_waste_handling_required', severity: 'warning' }),
      expect.objectContaining({ category: 'zymo_high_volume_wash_review', severity: 'warning' }),
      expect.objectContaining({ category: 'zymo_preview_not_execution_ready', severity: 'info' }),
    ]));
    expect(proposal.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'zymo_reservoir_capacity_exceeded' }),
      expect.objectContaining({ code: 'zymo_waste_handling_required' }),
    ]));
  });
});

