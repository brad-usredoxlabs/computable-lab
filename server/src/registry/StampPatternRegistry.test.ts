import { describe, it, expect } from 'vitest';
import { getStampPatternRegistry } from './StampPatternRegistry.js';

describe('StampPatternRegistry', () => {
  it('loads all 4 seed entries and list() returns them sorted by id', () => {
    const registry = getStampPatternRegistry();
    const entries = registry.list();

    expect(entries).toHaveLength(4);

    const ids = entries.map((e) => e.id);
    expect(ids).toEqual([
      'column_stamp',
      'column_stamp_differentiated',
      'quadrant_stamp',
      'triplicate_stamp',
    ]);
  });

  it('each entry has all required fields', () => {
    const registry = getStampPatternRegistry();
    const entries = registry.list();

    for (const entry of entries) {
      expect(entry.id).toBeDefined();
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.name).toBeDefined();
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.inputTopology).toBeDefined();
      expect(entry.inputTopology.rows).toBeGreaterThan(0);
      expect(entry.inputTopology.cols).toBeGreaterThan(0);
      expect(entry.outputTopology).toBeDefined();
      expect(entry.outputTopology.rows).toBeGreaterThan(0);
      expect(entry.outputTopology.cols).toBeGreaterThan(0);
      expect(entry.perPositionFields).toBeDefined();
      expect(Array.isArray(entry.perPositionFields)).toBe(true);
    }
  });

  it('IDs match filenames (without .yaml)', () => {
    const registry = getStampPatternRegistry();
    const entries = registry.list();

    const expectedIds = [
      'column_stamp',
      'column_stamp_differentiated',
      'quadrant_stamp',
      'triplicate_stamp',
    ];

    for (const id of expectedIds) {
      const entry = registry.get(id);
      expect(entry).toBeDefined();
      expect(entry!.id).toBe(id);
    }
  });

  it('get("quadrant_stamp") returns correct topology', () => {
    const registry = getStampPatternRegistry();
    const entry = registry.get('quadrant_stamp');

    expect(entry).toBeDefined();
    expect(entry!.id).toBe('quadrant_stamp');
    expect(entry!.name).toBe('Quadrant stamp (96 -> 384)');
    expect(entry!.inputTopology).toEqual({ rows: 8, cols: 12 });
    expect(entry!.outputTopology).toEqual({ rows: 16, cols: 24 });
    expect(entry!.perPositionFields).toEqual(['assay', 'channelMap']);
  });

  it('get("column_stamp") returns correct topology', () => {
    const registry = getStampPatternRegistry();
    const entry = registry.get('column_stamp');

    expect(entry).toBeDefined();
    expect(entry!.id).toBe('column_stamp');
    expect(entry!.inputTopology).toEqual({ rows: 8, cols: 1 });
    expect(entry!.outputTopology).toEqual({ rows: 8, cols: 1 });
    expect(entry!.perPositionFields).toEqual([]);
  });

  it('get("triplicate_stamp") returns correct topology', () => {
    const registry = getStampPatternRegistry();
    const entry = registry.get('triplicate_stamp');

    expect(entry).toBeDefined();
    expect(entry!.id).toBe('triplicate_stamp');
    expect(entry!.inputTopology).toEqual({ rows: 8, cols: 1 });
    expect(entry!.outputTopology).toEqual({ rows: 8, cols: 3 });
    expect(entry!.perPositionFields).toEqual([]);
  });

  it('get("column_stamp_differentiated") returns correct topology', () => {
    const registry = getStampPatternRegistry();
    const entry = registry.get('column_stamp_differentiated');

    expect(entry).toBeDefined();
    expect(entry!.id).toBe('column_stamp_differentiated');
    expect(entry!.inputTopology).toEqual({ rows: 1, cols: 12 });
    expect(entry!.outputTopology).toEqual({ rows: 8, cols: 12 });
    expect(entry!.perPositionFields).toEqual(['perturbant']);
  });
});
