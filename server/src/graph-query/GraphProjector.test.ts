/**
 * GraphProjector tests — flatten an event-graph record into well / treatment
 * / measurement nodes and edges, with provenance back to the owning record.
 */
import { describe, it, expect } from 'vitest';
import { GraphProjector, type ProjectableEventGraph } from './GraphProjector.js';

function fixtureEventGraph(): ProjectableEventGraph {
  return {
    recordId: 'EVG-ros-001',
    id: 'EVG-ros-001',
    events: [
      {
        eventId: 'evt-add-rotenone',
        event_type: 'add_material',
        details: {
          labwareId: 'plate1',
          wells: ['A1', 'A2', 'A3'],
          material_ref: 'MAT-rotenone',
        },
      },
      {
        eventId: 'evt-read-fitc',
        event_type: 'read',
        details: {
          labwareInstanceId: 'plate1',
          wells: ['A1', 'A2', 'A3'],
          readout: 'ROS',
          channel: 'FITC',
          modality: 'fluorescence',
          value: 1.2,
        },
      },
    ],
    labwares: [{ labwareId: 'plate1', name: 'Sample Plate', labwareType: 'plate_96' }],
  };
}

describe('GraphProjector', () => {
  it('projects well nodes for each targeted well with provenance', () => {
    const result = new GraphProjector().project(fixtureEventGraph());
    const wells = result.nodes.filter((n) => n.type === 'well');
    expect(wells).toHaveLength(3);
    expect(wells.map((w) => w.id)).toContain('well:EVG-ros-001:plate1:A1');
    expect(wells[0]?.source?.recordId).toBe('EVG-ros-001');
    expect(wells[0]?.label).toBe('A1');
  });

  it('projects a treatment node for add_material with material label', () => {
    const result = new GraphProjector().project(fixtureEventGraph());
    const treatments = result.nodes.filter((n) => n.type === 'treatment');
    expect(treatments).toHaveLength(1);
    expect(treatments[0]?.properties?.materialRef).toBe('MAT-rotenone');
    expect(treatments[0]?.source?.eventId).toBe('evt-add-rotenone');
  });

  it('projects a measurement node per read event with channel/value', () => {
    const result = new GraphProjector().project(fixtureEventGraph());
    const measurements = result.nodes.filter((n) => n.type === 'measurement');
    expect(measurements).toHaveLength(1);
    expect(measurements[0]?.properties?.channel).toBe('FITC');
    expect(measurements[0]?.properties?.value).toBe(1.2);
    expect(measurements[0]?.source?.eventId).toBe('evt-read-fitc');
  });

  it('emits edges: well --treated_with--> treatment and well --measured_at--> measurement', () => {
    const result = new GraphProjector().project(fixtureEventGraph());
    const wellId = 'well:EVG-ros-001:plate1:A1';
    const treatmentId = result.nodes.find((n) => n.type === 'treatment')!.id;
    const measurementId = result.nodes.find((n) => n.type === 'measurement')!.id;
    const treated = result.edges.find((e) => e.verb === 'treated_with' && e.source === wellId);
    expect(treated?.target).toBe(treatmentId);
    const measured = result.edges.find((e) => e.verb === 'measured_at' && e.source === wellId);
    expect(measured?.target).toBe(measurementId);
  });

  it('tolerates missing wells / material on an event without throwing (defensive)', () => {
    const evg: ProjectableEventGraph = {
      recordId: 'EVG-empty',
      events: [
        { eventId: 'e1', event_type: 'add_material', details: { labwareId: 'plate1', wells: [] } },
        { eventId: 'e2', event_type: 'incubate', details: { duration: 'PT1H' } },
      ],
    };
    const result = new GraphProjector().project(evg);
    expect(result.nodes.filter((n) => n.type === 'treatment')).toHaveLength(0);
    expect(result.nodes.filter((n) => n.type === 'measurement')).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('supports a singular `well` field and nested `material.materialId` (real data shapes)', () => {
    const evg: ProjectableEventGraph = {
      recordId: 'EVG-edge',
      events: [
        {
          eventId: 'e1',
          event_type: 'add_material',
          details: { labwareInstanceId: 'plate1', well: 'B1', material: { materialId: 'foundry_sample_1' } },
        },
        {
          eventId: 'e2',
          event_type: 'read',
          details: { labwareInstanceId: 'plate2', wells: ['A1'], readout: 'OD', value: 0.5 },
        },
      ],
    };
    const result = new GraphProjector().project(evg);
    const treatment = result.nodes.find((n) => n.type === 'treatment');
    expect(treatment?.properties?.materialRef).toBe('foundry_sample_1');
    // singular well B1 produces a well node
    expect(result.nodes.some((n) => n.type === 'well' && n.id === 'well:EVG-edge:plate1:B1')).toBe(true);
  });
});