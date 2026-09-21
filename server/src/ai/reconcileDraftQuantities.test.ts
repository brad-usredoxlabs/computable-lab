import { describe, it, expect } from 'vitest';
import { reconcileDraftQuantities, isVolumeUnit, normalizeVolumeUnit, extractQuantity } from './reconcileDraftQuantities.js';

describe('extractQuantity — read the biologist\'s verbatim "N unit" for a material', () => {
  it('reads a volume with its unit from the user sentence', () => {
    const q = extractQuantity('Add 200 µL of DMEM', 'DMEM');
    // the unit is normalised to the canonical microlitre spelling
    expect(q).toEqual({ value: 200, unit: 'uL', kind: 'volume' });
  });

  it('reads a count (cells) as a count', () => {
    const q = extractQuantity('Add 10,000 HepG2 cells', 'HepG2 cells');
    expect(q).toEqual({ value: 10000, unit: 'cells', kind: 'count' });
  });

  it('reads bare entity count (beads) as a count', () => {
    const q = extractQuantity('Add 10 beating beads to each well', 'beads');
    expect(q).toEqual({ value: 10, unit: 'beads', kind: 'count' });
  });

  it('reads 200uL (no space, no µ) as a microlitre volume', () => {
    const q = extractQuantity('Add 200uL of DMEM', 'DMEM');
    expect(q).toEqual({ value: 200, unit: 'uL', kind: 'volume' });
  });

  it('reads mL and L as volume', () => {
    expect(extractQuantity('add 1.5 mL media', 'media')!.kind).toBe('volume');
    expect(extractQuantity('add 2 L buffer', 'buffer')!.kind).toBe('volume');
  });

  it('returns null when the sentence has no amount for that material', () => {
    expect(extractQuantity('Add DMEM to the plate', 'DMEM')).toBeNull();
  });
});

describe('isVolumeUnit / normalizeVolumeUnit', () => {
  it('classifies the volume-unit spellings biologists actually type', () => {
    for (const unit of ['µL', 'µl', 'μL', 'μl', 'uL', 'ul', 'UL', 'ml', 'mL', 'ML', 'l', 'L']) {
      expect(isVolumeUnit(unit), unit).toBe(true);
    }
    for (const unit of ['cells', 'beads', 'mg', 'mM', 'units', 'particles']) {
      expect(isVolumeUnit(unit), unit).toBe(false);
    }
  });

  it('normalizes to a single canonical unit', () => {
    expect(normalizeVolumeUnit('µL')).toBe('uL');
    expect(normalizeVolumeUnit('ul')).toBe('uL');
    expect(normalizeVolumeUnit('mL')).toBe('mL');
    expect(normalizeVolumeUnit('ml')).toBe('mL');
    expect(normalizeVolumeUnit('L')).toBe('L');
  });
});

describe('reconcileDraftQuantities — the model misfiled a volume as a count, or vice versa', () => {
  // Brad, 2026-09-21: "When I did 'Add 200ul of DMEM', the AI added 200 counts
  // of DMEM versus 200 ul." The materials[] schema had a count slot but no
  // volume slot, so a volume-dosed material reached for count and dropped the
  // unit. The biologist's verbatim words carry the unit — use them to heal it.
  it('converts a count that is really a volume back into a volume', () => {
    const event = {
      event_type: 'add_material',
      details: {
        labwareId: 'lw-1',
        wells: ['A2'],
        material_ref: { kind: 'local', label: 'DMEM' },
        count: 200, // misfiled by the model; the user said µL
      },
    } as unknown;
    const { events } = reconcileDraftQuantities([event], ['Add 200uL of DMEM to A2']);
    const details = (events[0] as { details: Record<string, unknown> }).details;
    expect(details.count).toBeUndefined();
    expect(details.volume).toEqual({ value: 200, unit: 'uL' });
  });

  it('keeps a genuine count as a count', () => {
    const event = {
      event_type: 'add_material',
      details: { labwareId: 'lw-1', wells: ['A2'], material_ref: { kind: 'local', label: 'HepG2 cells' }, count: 10000 },
    } as unknown;
    const { events } = reconcileDraftQuantities([event], ['Add 10,000 HepG2 cells to A2']);
    const details = (events[0] as { details: Record<string, unknown> }).details;
    expect(details.count).toBe(10000);
    expect(details.volume).toBeUndefined();
  });

  it('leaves an explicitly-stated volume alone (already correct)', () => {
    const event = {
      event_type: 'add_material',
      details: {
        labwareId: 'lw-1',
        wells: ['A2'],
        material_ref: { kind: 'local', label: 'DMEM' },
        volume: { value: 200, unit: 'uL' },
      },
    } as unknown;
    const { events, notes } = reconcileDraftQuantities([event], ['Add 200uL of DMEM to A2']);
    expect((events[0] as { details: Record<string, unknown> }).details.volume).toEqual({ value: 200, unit: 'uL' });
    expect(notes).toEqual([]);
  });

  it('is a silent no-op when the prompt carries no unit for that material', () => {
    const event = {
      event_type: 'add_material',
      details: { labwareId: 'lw-1', wells: ['A2'], material_ref: { kind: 'local', label: 'DMEM' }, count: 200 },
    } as unknown;
    const { events, notes } = reconcileDraftQuantities([event], ['Add DMEM to A2']);
    // No unit in the words → do not guess; leave the model's field (the gate /
    // review may still surface it). Do NOT invent a fabricate.
    expect((events[0] as { details: Record<string, unknown> }).details.count).toBe(200);
    expect(notes).toEqual([]);
  });
});