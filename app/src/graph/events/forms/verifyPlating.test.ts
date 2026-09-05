import { describe, expect, it } from 'vitest';
import { buildVerifyPlatingReadEvent, verifyReadModality } from './verifyPlating.js';
import type { AddMaterialDetails } from '../../../types/events.js';
import type { BiologicalTypeRule } from '../../../shared/bioTypes.js';

const CELL_LINE_RULE: BiologicalTypeRule = {
  id: 'cell-line',
  label: 'Cell Line',
  domains: ['cell_line'],
  termKinds: ['organism'],
  match: { labels: ['HepaRG'], curies: [] },
  measures: { primary: 'count', units: ['cells-per-well'], concentrationBasis: 'count_per_volume' },
  verification: { method: 'hoechst_nuclei', readModality: 'microscopy' },
  fields: [
    { key: 'count', label: 'Cells per well', required: true },
    { key: 'volume', label: 'Final volume (µL)', required: true },
  ],
};

const details: AddMaterialDetails = {
  wells: ['A1', 'B1'],
  material_ref: { kind: 'record', id: 'TERM-heparg-4abc', type: 'term', label: 'HepaRG' },
  count: 50000,
  count_estimate: { measuredBy: 'hemocytometer', isEstimate: true },
  biological_type: { kind: 'record', id: 'TERM-heparg-4abc', type: 'term', label: 'HepaRG' },
};

describe('verifyPlating (D3 verification-read seam)', () => {
  it('stages a read event on the SAME wells with the type\'s verification modality', () => {
    const evt = buildVerifyPlatingReadEvent({ details, rule: CELL_LINE_RULE, materialLabel: 'HepaRG' });
    expect(evt.event_type).toBe('read');
    expect((evt.details as { wells?: string[] }).wells).toEqual(['A1', 'B1']);
    expect((evt.details as { modality?: string }).modality).toBe('microscopy');
    expect((evt.details as { channels?: string[] }).channels).toEqual(['hoechst_nuclei']);
  });

  it('mentions the seed count + estimate mechanism in the read notes (honesty layer)', () => {
    const evt = buildVerifyPlatingReadEvent({ details, rule: CELL_LINE_RULE, materialLabel: 'HepaRG' });
    const notes = (evt.details as { notes?: string }).notes ?? '';
    expect(notes).toContain('50000');
    expect(notes.toLowerCase()).toContain('hemocytometer');
  });

  it('verifyReadModality maps mechanisms to schema modalities', () => {
    expect(verifyReadModality('hoechst_nuclei')).toBe('microscopy');
    expect(verifyReadModality('total_protein')).toBe('absorbance');
    expect(verifyReadModality('od600')).toBe('absorbance');
    expect(verifyReadModality('cfu')).toBe('absorbance');
    expect(verifyReadModality(undefined)).toBe('other');
  });
});