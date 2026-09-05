import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import type { AppContext } from '../server.js';
import {
  parseWellColumn,
  readDataReferenceText,
  resolvePlateWells,
  mapReturnDataToPlate,
} from './plateMappingService.js';

function makeCtx(records: Record<string, unknown>): AppContext {
  return {
    store: {
      async get(id: string) {
        return (id in records) ? { recordId: id, schemaId: 'x', payload: records[id] } : null;
      },
    },
    storageService: {
      getProvider(deviceId: string) {
        return {
          kind: 'local-mount',
          list: async () => [],
          stat: async () => ({}),
          read: async (path: string) => {
            const files: Record<string, string> = {
              'reads/plate.csv': 'well,value\nA1,42\nB1,7\nC3,oops\n',
              'reads/clean.csv': 'well,value\nA1,42\nB1,7\n',
              'reads/dup.csv': 'well,value\nA1,1\nA1,2\n',
            };
            const content = files[path];
            if (content === undefined) throw new Error(`no file ${path}`);
            return Readable.from(content);
          },
          write: async () => ({ sizeBytes: 0 }),
          delete: async () => undefined,
        };
      },
    },
  } as unknown as AppContext;
}

describe('parseWellColumn', () => {
  it('extracts well ids from a CSV header + rows', () => {
    const text = 'well,value\r\nA1,42\r\nB1,7\r\n';
    expect(parseWellColumn(text, 'well')).toEqual(['A1', 'B1']);
  });

  it('handles TSV and quoted cells', () => {
    const text = '"well"\t"value"\nA1\t42\n';
    expect(parseWellColumn(text, 'well')).toEqual(['A1']);
  });

  it('returns [] when the well column is absent', () => {
    expect(parseWellColumn('a,b\n1,2\n', 'well')).toEqual([]);
  });
});

describe('readDataReferenceText', () => {
  it('reads the raw bytes from the storage device for a data-reference', async () => {
    const ctx = makeCtx({
      'DREF-1': { kind: 'data-reference', storageDeviceId: 'usb0', path: 'reads/plate.csv' },
    });
    const { path, text } = await readDataReferenceText(ctx, 'DREF-1');
    expect(path).toBe('reads/plate.csv');
    expect(text).toContain('A1,42');
  });

  it('throws NOT_FOUND for a missing data-reference', async () => {
    await expect(readDataReferenceText(makeCtx({}), 'DREF-MISSING')).rejects.toThrow(/not found/);
  });
});

describe('resolvePlateWells', () => {
  it('extracts well ids from a plate-snapshot', async () => {
    const ctx = makeCtx({
      'PLT-1': { kind: 'plate-snapshot', wells: [{ well: 'A1' }, { well: 'B1' }] },
    });
    expect(await resolvePlateWells(ctx, 'PLT-1')).toEqual(['A1', 'B1']);
  });
});

describe('mapReturnDataToPlate', () => {
  it('maps a partial file to a clean (non-ambiguous) match against a plate snapshot', async () => {
    const ctx = makeCtx({
      'DREF-1': { kind: 'data-reference', storageDeviceId: 'usb0', path: 'reads/clean.csv' },
      'PLT-1': { kind: 'plate-snapshot', wells: [{ well: 'A1' }, { well: 'B1' }, { well: 'C1' }] },
    });
    const { mapping, wellSource } = await mapReturnDataToPlate(ctx, {
      dataReferenceId: 'DREF-1',
      wellColumn: 'well',
      plateWells: ['A1', 'B1', 'C1'],
    });
    expect(wellSource.source).toBe('provided');
    expect(mapping.ambiguous).toBe(false);
    expect(mapping.matched).toEqual(['A1', 'B1']);
    expect(mapping.missingInFile).toEqual(['C1']);
  });

  it('flags ambiguous when a file well is not on the plate (identity unclear)', async () => {
    const ctx = makeCtx({
      'DREF-1': { kind: 'data-reference', storageDeviceId: 'usb0', path: 'reads/plate.csv' },
      'PLT-1': { kind: 'plate-snapshot', wells: [{ well: 'A1' }, { well: 'B1' }, { well: 'C1' }] },
    });
    // file rows are A1,B1,C3 — C3 is not a plate well
    const { mapping, wellSource } = await mapReturnDataToPlate(ctx, {
      dataReferenceId: 'DREF-1',
      wellColumn: 'well',
      plateSnapshotId: 'PLT-1',
    });
    expect(wellSource.source).toBe('plate-snapshot');
    expect(mapping.ambiguous).toBe(true);
    expect(mapping.unmatchedInFile).toEqual(['C3']);
    expect(mapping.missingInFile).toEqual(['C1']);
  });

  it('flags ambiguous when the file has duplicate well content', async () => {
    const ctx = makeCtx({
      'DREF-2': { kind: 'data-reference', storageDeviceId: 'usb0', path: 'reads/dup.csv' },
      'PLT-1': { kind: 'plate-snapshot', wells: [{ well: 'A1' }, { well: 'B1' }] },
    });
    const { mapping } = await mapReturnDataToPlate(ctx, {
      dataReferenceId: 'DREF-2',
      wellColumn: 'well',
      plateSnapshotId: 'PLT-1',
    });
    expect(mapping.ambiguous).toBe(true);
  });

  it('maps against an explicit well list (no snapshot)', async () => {
    const ctx = makeCtx({
      'DREF-1': { kind: 'data-reference', storageDeviceId: 'usb0', path: 'reads/plate.csv' },
    });
    const { mapping } = await mapReturnDataToPlate(ctx, {
      dataReferenceId: 'DREF-1',
      wellColumn: 'well',
      plateWells: ['A1', 'B1', 'C9'],
    });
    expect(mapping.ambiguous).toBe(true); // C3 not in plate, C9 not in file
    expect(mapping.matched).toEqual(['A1', 'B1']);
  });
});