import { describe, it, expect, vi } from 'vitest';
import { createTreeHandlers, type StudyInventoryUsageResponse } from './TreeHandlers.js';

/**
 * Exercises GET /studies/:studyId/inventory-usage: it walks the study tree,
 * reads each run's method event graph, and aggregates materials + labware with
 * per-run anchors.
 */

const STUDY_TREE = [
  {
    recordId: 'STU-1',
    title: 'Project A',
    experiments: [
      {
        recordId: 'EXP-1',
        title: 'Exp A',
        runs: [
          { recordId: 'RUN-1', title: 'Run 1' },
          { recordId: 'RUN-2', title: 'Run 2' },
          { recordId: 'RUN-3', title: 'Run 3' }, // no method graph → skipped
        ],
      },
    ],
  },
];

function addMaterial(id: string, label: string) {
  return { event_type: 'add_material', details: { material_ref: { kind: 'record', id, type: 'material', label } } };
}

const RECORDS: Record<string, { payload: Record<string, unknown> }> = {
  'RUN-1': { payload: { methodEventGraphId: 'EVG-1' } },
  'RUN-2': { payload: { methodEventGraphId: 'EVG-2' } },
  'RUN-3': { payload: {} }, // no methodEventGraphId
  'EVG-1': {
    payload: {
      events: [addMaterial('MAT-dmem', 'DMEM')],
      labwares: [{ labwareId: 'lw-1', name: 'Plate 1', sourceRecordId: 'LBW-1' }],
    },
  },
  'EVG-2': {
    payload: {
      events: [addMaterial('MAT-dmem', 'DMEM'), addMaterial('MAT-feno', 'Fenofibrate')],
      labwares: [{ labwareId: 'lw-2', name: 'Plate 2' }], // no sourceRecordId → keyed by runtime id
    },
  },
};

function makeHandlers() {
  const indexManager = { getStudyTree: vi.fn().mockResolvedValue(STUDY_TREE) } as never;
  const recordStore = { get: vi.fn(async (id: string) => RECORDS[id] ?? null) } as never;
  const platformRegistry = { hasPlatform: () => false } as never;
  return createTreeHandlers(indexManager, recordStore, platformRegistry);
}

function reply() {
  return { status: vi.fn().mockReturnThis() } as never;
}

describe('getStudyInventoryUsage', () => {
  it('aggregates materials + labware across runs with per-run anchors', async () => {
    const handlers = makeHandlers();
    const res = (await handlers.getStudyInventoryUsage(
      { params: { studyId: 'STU-1' } } as never,
      reply(),
    )) as StudyInventoryUsageResponse;

    const dmem = res.materials.find((m) => m.refId === 'MAT-dmem')!;
    expect(dmem.title).toBe('DMEM');
    expect(dmem.anchors.map((a) => a.runId).sort()).toEqual(['RUN-1', 'RUN-2']); // used in both runs
    expect(dmem.anchors[0]!.experimentTitle).toBe('Exp A');

    const feno = res.materials.find((m) => m.refId === 'MAT-feno')!;
    expect(feno.anchors.map((a) => a.runId)).toEqual(['RUN-2']);

    expect(res.labwares.find((l) => l.refId === 'LBW-1')?.anchors.map((a) => a.runId)).toEqual(['RUN-1']);
    // No sourceRecordId → keyed by the runtime labware id.
    expect(res.labwares.find((l) => l.refId === 'lw-2')?.anchors.map((a) => a.runId)).toEqual(['RUN-2']);
  });

  it('404s for an unknown study', async () => {
    const handlers = makeHandlers();
    const r = reply();
    const res = await handlers.getStudyInventoryUsage({ params: { studyId: 'STU-nope' } } as never, r);
    expect((r as unknown as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(404);
    expect(res).toMatchObject({ error: 'NOT_FOUND' });
  });
});
