import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BiologicalPlatingFields } from './BiologicalPlatingFields.js';
import type { AddMaterialDetails } from '../../../types/events.js';
import type { BiologicalTypeRule } from '../../../shared/bioTypes.js';

afterEach(cleanup);

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
    { key: 'counterDensity', label: 'Counter density (cells/µL)', required: false },
  ],
};

const baseDetails: AddMaterialDetails = {
  wells: ['A1'],
  count: 50000,
  volume: { value: 100, unit: 'uL' },
  count_estimate: { measuredBy: 'hemocytometer', isEstimate: true },
  biological_type: { kind: 'record', id: 'TERM-heparg-4abc', type: 'term', label: 'HepaRG' },
  condition_refs: [{ kind: 'record', id: 'anoxic', type: 'term', label: 'anoxic' }],
};

describe('BiologicalPlatingFields (count-first biological form)', () => {
  it('renders count + final volume + counter density for a cell line', () => {
    render(<BiologicalPlatingFields details={baseDetails} rule={CELL_LINE_RULE} onChange={() => {}} />);
    expect(screen.getByTestId('bio-count')).toBeTruthy();
    expect(screen.getByTestId('bio-volume')).toBeTruthy();
    expect(screen.getByTestId('bio-density')).toBeTruthy();
    expect(screen.getByText(/Cells per well/)).toBeTruthy();
    expect(screen.getByText(/Final volume/)).toBeTruthy();
  });

  it('shows the count-estimate mechanism and verify-plating seam from the rule', () => {
    render(<BiologicalPlatingFields details={baseDetails} rule={CELL_LINE_RULE} onChange={() => {}} onVerifyPlating={() => {}} />);
    expect(screen.getByTestId('bio-measuredby')).toBeTruthy();
    expect((screen.getByTestId('bio-measuredby') as HTMLSelectElement).value).toBe('hemocytometer');
    expect(screen.getByTestId('bio-verify-plating')).toBeTruthy();
    expect(screen.getByTestId('bio-verify-plating').textContent).toContain('microscopy');
  });

  it('renders the culture-condition multiselect with the active condition marked', () => {
    render(<BiologicalPlatingFields details={baseDetails} rule={CELL_LINE_RULE} onChange={() => {}} />);
    const anoxic = screen.getByTestId('bio-condition-anoxic');
    expect(anoxic.getAttribute('aria-pressed')).toBe('true');
    const chip = screen.getByTestId('bio-condition-organ-on-a-chip');
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  it('toggles a condition and writes condition_refs on change (controlled)', () => {
    const onChange = vi.fn();
    const { rerender } = render(<BiologicalPlatingFields details={baseDetails} rule={CELL_LINE_RULE} onChange={onChange} />);
    // add organ-on-a-chip
    fireEvent.click(screen.getByTestId('bio-condition-organ-on-a-chip'));
    const added = onChange.mock.calls[0][0] as AddMaterialDetails;
    expect(added.condition_refs?.map((r) => r.id)).toEqual(['anoxic', 'organ-on-a-chip']);
    // controlled parent applies → re-render with new details, then remove anoxic
    rerender(<BiologicalPlatingFields details={added} rule={CELL_LINE_RULE} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('bio-condition-anoxic'));
    const removed = onChange.mock.calls[1][0] as AddMaterialDetails;
    expect(removed.condition_refs?.map((r) => r.id)).toEqual(['organ-on-a-chip']);
  });

  it('derives suspension + top-up from count + density + final volume', () => {
    render(<BiologicalPlatingFields details={baseDetails} rule={CELL_LINE_RULE} onChange={() => {}} />);
    // set density 2500 → suspension = 50000/2500 = 20 uL, top-up = 80 uL
    fireEvent.change(screen.getByTestId('bio-density'), { target: { value: '2500' } });
    // re-mount with density set (controlled: parent state)
    const withDensity: AddMaterialDetails = { ...baseDetails, counter_density: { value: 2500, unit: 'cells/uL', basis: 'count_per_volume' } };
    render(<BiologicalPlatingFields details={withDensity} rule={CELL_LINE_RULE} onChange={() => {}} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('20.0 µL');
    expect(text).toContain('80.0 µL');
  });
});