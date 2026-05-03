import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeVendorProtocolPdf, extractVendorProtocolCandidate } from './VendorProtocolPdf.js';
import { createZymoDeepwellAdaptationPlan, normalizeZymoProtocolCandidate } from './ZymoNormalization.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const zymoPdfPath = resolve(repoRoot, 'resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf');

async function adaptationPlan() {
  const document = await decodeVendorProtocolPdf(await readFile(zymoPdfPath), {
    filename: '_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf',
    documentId: 'vendor-protocol-zymo-magbead',
  });
  const candidate = extractVendorProtocolCandidate(document);
  return createZymoDeepwellAdaptationPlan(normalizeZymoProtocolCandidate(candidate), {
    directive: 'suggest a version to run in 96-well deepwell plates',
  });
}

describe('ZymoAdaptationPlan', () => {
  it('produces explicit 96-well deepwell role bindings and deck hints', async () => {
    const plan = await adaptationPlan();

    expect(plan.kind).toBe('protocol-adaptation-plan');
    expect(plan.targetFormat).toMatchObject({
      primaryLabwareType: '96-well-deepwell-plate',
      sampleCount: 96,
      sampleWellSelector: { role: 'all_wells', count: 96 },
    });
    expect(plan.labwareRoles).toEqual(expect.arrayContaining([
      expect.objectContaining({ roleId: 'primary_sample_plate', binding: '96-well-deepwell-plate', status: 'resolved' }),
      expect.objectContaining({ roleId: 'reagent_reservoir', binding: '12-well-reservoir', status: 'resolved' }),
      expect.objectContaining({ roleId: 'elution_plate', binding: '96-well-conical-pcr-plate', status: 'resolved' }),
      expect.objectContaining({ roleId: 'waste', status: 'unresolved' }),
    ]));
    expect(plan.instrumentRoles).toEqual(expect.arrayContaining([
      expect.objectContaining({ roleId: 'pipette_8ch_1000ul', binding: 'p1000-multi', status: 'resolved' }),
      expect.objectContaining({ roleId: 'bead_beater', status: 'manual' }),
      expect.objectContaining({ roleId: 'centrifuge', status: 'manual' }),
    ]));
    expect(plan.deckPlanHints).toEqual(expect.arrayContaining([
      expect.objectContaining({ roleId: 'primary_sample_plate', labwareType: '96-well-deepwell-plate' }),
      expect.objectContaining({ roleId: 'reagent_reservoir', labwareType: '12-well-reservoir' }),
      expect.objectContaining({ roleId: 'elution_plate', labwareType: '96-well-conical-pcr-plate' }),
    ]));
  });

  it('computes reservoir requirements, splits high-volume reagents, and reports capacity overflow', async () => {
    const plan = await adaptationPlan();

    const bindingBuffer = plan.reservoirPlan.allocations.find((allocation) => allocation.roleId === 'magbinding_buffer');
    expect(bindingBuffer).toMatchObject({
      materialLabel: 'ZymoBIOMICS MagBinding Buffer',
      preferredWell: 'A1',
      perSampleVolumeUl: 1100,
      sampleCount: 96,
      totalTransferVolumeUl: 105600,
      deadVolumeUl: 10560,
      requiredVolumeUl: 116160,
      requiredWells: 5,
    });
    expect(bindingBuffer?.wells.length).toBe(5);

    const water = plan.reservoirPlan.allocations.find((allocation) => allocation.roleId === 'dnase_rnase_free_water');
    expect(water).toMatchObject({
      perSampleVolumeUl: 50,
      requiredVolumeUl: 5300,
    });

    const wash2 = plan.reservoirPlan.allocations.find((allocation) => allocation.roleId === 'magwash_2');
    expect(wash2).toMatchObject({
      perSampleVolumeUl: 1800,
      requiredVolumeUl: 190080,
      requiredWells: 8,
    });
    expect(wash2?.warning).toContain('unallocated');

    expect(plan.reservoirPlan.totalCapacityUl).toBe(300000);
    expect(plan.reservoirPlan.totalRequiredVolumeUl).toBeGreaterThan(plan.reservoirPlan.totalCapacityUl);
    expect(plan.gaps).toContainEqual(expect.objectContaining({
      code: 'zymo_reservoir_capacity_exceeded',
      severity: 'warning',
    }));
  });

  it('preserves step-level adaptation, repeated washes, branch choices, and manual/off-deck gaps', async () => {
    const plan = await adaptationPlan();

    expect(plan.stepPlan).toHaveLength(17);
    expect(plan.stepPlan.find((step) => step.stepNumber === 5)?.adaptedActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionKind: 'transfer', support: 'automatable' }),
      expect.objectContaining({ actionKind: 'add', support: 'automatable', roleRefs: expect.arrayContaining(['magbinding_buffer']) }),
    ]));
    expect(plan.stepPlan.find((step) => step.stepNumber === 14)?.adaptedActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionKind: 'repeat', support: 'automatable' }),
    ]));
    expect(plan.manualSteps.map((step) => step.stepNumber)).toEqual(expect.arrayContaining([2, 3, 4, 7, 9, 11, 13, 15, 16]));
    expect(plan.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'zymo_branch_selection_required', sourceStepNumbers: [1] }),
      expect.objectContaining({ code: 'zymo_waste_handling_required' }),
      expect.objectContaining({ code: 'zymo_manual_or_offdeck_step', sourceStepNumbers: [3] }),
    ]));
    expect(plan.compileAssumptions).toEqual(expect.arrayContaining([
      expect.stringContaining('All 96 wells'),
      expect.stringContaining('Step 14 repeats'),
    ]));
  });
});
