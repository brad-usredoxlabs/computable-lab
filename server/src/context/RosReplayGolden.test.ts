import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ContextEngine } from './ContextEngine.js';
import { diffContexts } from './ContextDiff.js';
import type { EventGraph } from './types.js';

const REPO_ROOT = path.resolve(process.cwd(), '..');
const EXAMPLES = path.join(REPO_ROOT, 'records', 'examples');

function loadGraph(fileName: string): EventGraph {
  const raw = fs.readFileSync(path.join(EXAMPLES, fileName), 'utf8');
  const obj = parseYaml(raw) as { id: string; events: unknown[]; subject_ref?: unknown };
  return {
    id: obj.id,
    events: obj.events as EventGraph['events'],
    ...(obj.subject_ref ? { subject_ref: obj.subject_ref as EventGraph['subject_ref'] } : {}),
  };
}

describe('ROS replay — golden', () => {
  const engine = new ContextEngine();

  const subject = { kind: 'record' as const, id: 'LI-PLATE-ROS-1:A1', type: 'well' };

  it('positive control context has H2O2 and fluorescence reading', () => {
    const graph = loadGraph('event-graph-ros-positive-control.yaml');
    const ctx = engine.computeContext(subject, graph);

    const hasH2O2 = (ctx.contents ?? []).some(c => {
      const ref = c.material_ref as { id?: string } | undefined;
      return ref?.id === 'MAT-SPEC-H2O2';
    });
    expect(hasH2O2).toBe(true);

    const observed = (ctx as unknown as { observed: Record<string, unknown> }).observed;
    const ros = observed['ros-fluorescence'];
    const rosValue = typeof ros === 'number' ? ros : (ros as { value: number }).value;
    expect(rosValue).toBe(12345);
  });

  it('vehicle context lacks H2O2 and has lower fluorescence', () => {
    const graph = loadGraph('event-graph-ros-vehicle-control.yaml');
    const ctx = engine.computeContext(subject, graph);

    const hasH2O2 = (ctx.contents ?? []).some(c => {
      const ref = c.material_ref as { id?: string } | undefined;
      return ref?.id === 'MAT-SPEC-H2O2';
    });
    expect(hasH2O2).toBe(false);

    const observed = (ctx as unknown as { observed: Record<string, unknown> }).observed;
    const ros = observed['ros-fluorescence'];
    const rosValue = typeof ros === 'number' ? ros : (ros as { value: number }).value;
    expect(rosValue).toBeLessThan(12345);
  });

  it('diffContexts(vehicle, positive) shows fluorescence going up and H2O2 added', () => {
    const vehicleCtx = engine.computeContext(subject, loadGraph('event-graph-ros-vehicle-control.yaml'));
    const positiveCtx = engine.computeContext(subject, loadGraph('event-graph-ros-positive-control.yaml'));
    const d = diffContexts(vehicleCtx, positiveCtx);

    expect(d.observed?.['ros-fluorescence']).toBeDefined();
    const from = d.observed!['ros-fluorescence']!.from;
    const to = d.observed!['ros-fluorescence']!.to;
    const fromValue = typeof from === 'number' ? from : (from as { value: number } | undefined)?.value;
    const toValue = typeof to === 'number' ? to : (to as { value: number }).value;
    expect(toValue).toBeGreaterThan(fromValue ?? 0);

    const h2o2Entry = d.contents.find(c => c.material_id === 'MAT-SPEC-H2O2');
    expect(h2o2Entry).toBeDefined();
    expect(h2o2Entry?.from).toBeUndefined();
    expect(h2o2Entry?.to).toBeDefined();
  });
});
