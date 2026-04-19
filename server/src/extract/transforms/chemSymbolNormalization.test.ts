/**
 * Tests for chemical symbol normalization transform.
 */

import { describe, it, expect } from 'vitest';
import { normalizeChemSymbols } from './chemSymbolNormalization.js';
import type { ExtractionCandidate } from '../ExtractorAdapter.js';

describe('normalizeChemSymbols', () => {
  it('normalizes µL to uL and records the normalization note', () => {
    const candidates: ExtractionCandidate[] = [
      {
        target_kind: 'material-spec',
        draft: {
          name: 'Buffer solution',
          concentration: '100µL',
        },
        confidence: 0.9,
      },
    ];

    const result = normalizeChemSymbols(candidates);

    expect(result[0].draft).toEqual({
      name: 'Buffer solution',
      concentration: '100uL',
      notes: ['concentration: normalized: µ → u'],
    });
  });

  it('normalizes multiplication sign × to x in molarity values', () => {
    const candidates: ExtractionCandidate[] = [
      {
        target_kind: 'material-spec',
        draft: {
          name: 'DNA solution',
          concentration: '5×10⁶ copies/mL',
        },
        confidence: 0.95,
      },
    ];

    const result = normalizeChemSymbols(candidates);

    expect(result[0].draft).toEqual({
      name: 'DNA solution',
      concentration: '5x10⁶ copies/mL',
      notes: ['concentration: normalized: × → x'],
    });
  });

  it('normalizes degree Celsius °C to C', () => {
    const candidates: ExtractionCandidate[] = [
      {
        target_kind: 'material-spec',
        draft: {
          name: 'Incubation buffer',
          temperature: '37°C',
        },
        confidence: 0.88,
      },
    ];

    const result = normalizeChemSymbols(candidates);

    expect(result[0].draft).toEqual({
      name: 'Incubation buffer',
      temperature: '37C',
      notes: ['temperature: normalized: °C → C'],
    });
  });

  it('strips trademark symbol ™ from vendor names', () => {
    const candidates: ExtractionCandidate[] = [
      {
        target_kind: 'material-spec',
        draft: {
          name: 'ThermoFisher™ PCR Master Mix',
          vendor: 'ThermoFisher™',
        },
        confidence: 0.92,
      },
    ];

    const result = normalizeChemSymbols(candidates);

    expect(result[0].draft).toEqual({
      name: 'ThermoFisher PCR Master Mix',
      vendor: 'ThermoFisher',
      notes: [
        'name: normalized: ™ stripped',
        'vendor: normalized: ™ stripped',
      ],
    });
  });

  it('passes non-material-spec candidates through unchanged', () => {
    const candidates: ExtractionCandidate[] = [
      {
        target_kind: 'operator',
        draft: {
          name: 'Dr. Smith',
          role: 'Lab Technician',
        },
        confidence: 0.99,
      },
      {
        target_kind: 'event',
        draft: {
          name: 'PCR Run #123',
          date: '2024-01-15',
        },
        confidence: 0.95,
      },
    ];

    const result = normalizeChemSymbols(candidates);

    // Should be exactly the same objects (no modifications)
    expect(result[0].target_kind).toBe('operator');
    expect(result[0].draft).toEqual({
      name: 'Dr. Smith',
      role: 'Lab Technician',
    });
    expect(result[1].target_kind).toBe('event');
    expect(result[1].draft).toEqual({
      name: 'PCR Run #123',
      date: '2024-01-15',
    });
  });

  it('accumulates notes with existing notes array', () => {
    const candidates: ExtractionCandidate[] = [
      {
        target_kind: 'material-spec',
        draft: {
          name: 'Solution',
          notes: ['existing note 1', 'existing note 2'],
        },
        confidence: 0.9,
      },
    ];

    const result = normalizeChemSymbols(candidates);

    expect(result[0].draft).toEqual({
      name: 'Solution',
      notes: ['existing note 1', 'existing note 2'],
    });
  });

  it('handles Greek mu (μ) separately from micro sign (µ)', () => {
    const candidates: ExtractionCandidate[] = [
      {
        target_kind: 'material-spec',
        draft: {
          name: 'Test solution',
          volume: '50μL and 100µL',
        },
        confidence: 0.9,
      },
    ];

    const result = normalizeChemSymbols(candidates);

    expect(result[0].draft).toEqual({
      name: 'Test solution',
      volume: '50uL and 100uL',
      notes: [
        'volume: normalized: µ → u',
        'volume: normalized: μ (Greek mu) → u',
      ],
    });
  });

  it('normalizes superscript numbers', () => {
    const candidates: ExtractionCandidate[] = [
      {
        target_kind: 'material-spec',
        draft: {
          name: 'Chemical compound',
          formula: 'H₂O with superscript² and superscript³',
        },
        confidence: 0.85,
      },
    ];

    const result = normalizeChemSymbols(candidates);

    // Note: The current SYMBOL_MAP only handles ⁰, ², ³ (superscript 0, 2, 3)
    // H₂O won't change because subscript 2 is not in the map
    expect(result[0].draft).toEqual({
      name: 'Chemical compound',
      formula: 'H₂O with superscript2 and superscript3',
      notes: [
        'formula: normalized: superscript 2 → 2',
        'formula: normalized: superscript 3 → 3',
      ],
    });
  });

  it('strips registered trademark symbol ®', () => {
    const candidates: ExtractionCandidate[] = [
      {
        target_kind: 'material-spec',
        draft: {
          name: 'BrandName® Product',
        },
        confidence: 0.9,
      },
    ];

    const result = normalizeChemSymbols(candidates);

    expect(result[0].draft).toEqual({
      name: 'BrandName Product',
      notes: ['name: normalized: ® stripped'],
    });
  });

  it('returns unchanged candidate when no normalization occurs', () => {
    const candidates: ExtractionCandidate[] = [
      {
        target_kind: 'material-spec',
        draft: {
          name: 'Normal Buffer',
          concentration: '100mL',
        },
        confidence: 0.9,
      },
    ];

    const result = normalizeChemSymbols(candidates);

    // Should be unchanged - no notes added
    expect(result[0].draft).toEqual({
      name: 'Normal Buffer',
      concentration: '100mL',
    });
  });
});
