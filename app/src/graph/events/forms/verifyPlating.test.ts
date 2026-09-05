import { describe, expect, it } from 'vitest';
import { buildVerifyPlatingReadEvent, buildVerifyPlatingEvidenceDescriptor } from './verifyPlating.js';
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

  it('refuses to build the read when the rule declares no read modality (fails loudly, no TS guess)', () => {
    const noModality: BiologicalTypeRule = {
      ...CELL_LINE_RULE,
      verification: { method: 'hoechst_nuclei' },
    };
    expect(() => buildVerifyPlatingReadEvent({ details, rule: noModality, materialLabel: 'HepaRG' })).toThrow(/readModality/);
  });

  it('builds an evidence descriptor linking the read event to the seed estimate', () => {
    const evt = buildVerifyPlatingReadEvent({ details, rule: CELL_LINE_RULE, materialLabel: 'HepaRG' });
    const desc = buildVerifyPlatingEvidenceDescriptor(details, CELL_LINE_RULE, evt.eventId);
    expect(desc.eventId).toBe(evt.eventId);
    expect(desc.materialLabel).toBe('HepaRG');
    expect(desc.biologicalTypeRef?.id).toBe(details.biological_type?.id);
    expect(desc.count).toBe(50000);
    expect(desc.measuredBy).toBe('hemocytometer');
    expect(desc.readModality).toBe('microscopy');
    expect(desc.wells).toEqual(['A1', 'B1']);
  });
});