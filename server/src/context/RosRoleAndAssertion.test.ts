import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ContextEngine } from './ContextEngine.js';
import { ContextRoleVerifier, type ContextRole } from './ContextRoleVerifier.js';
import { diffContexts } from './ContextDiff.js';
import type { EventGraph } from './types.js';

const REPO_ROOT = path.resolve(process.cwd(), '..');
const EXAMPLES = path.join(REPO_ROOT, 'records', 'examples');

function loadYaml<T = unknown>(file: string): T {
  return parseYaml(fs.readFileSync(path.join(EXAMPLES, file), 'utf8')) as T;
}

describe('ROS — role verification + comparison assertion', () => {
  const engine = new ContextEngine();
  const verifier = new ContextRoleVerifier();

  const subject = { kind: 'record' as const, id: 'LI-PLATE-ROS-1:A1', type: 'well' };
  const graphPos = loadYaml<EventGraph>('event-graph-ros-positive-control.yaml');
  const graphVeh = loadYaml<EventGraph>('event-graph-ros-vehicle-control.yaml');
  const ctxPos = engine.computeContext(subject, graphPos);
  const ctxVeh = engine.computeContext(subject, graphVeh);

  // Inject material_class onto each content from the fixture material-specs,
  // since the context engine does not yet resolve material_refs to specs.
  for (const ctx of [ctxPos, ctxVeh]) {
    for (const c of ctx.contents ?? []) {
      const id = (c.material_ref as { id?: string } | undefined)?.id;
      (c as unknown as Record<string, unknown>).material_class =
        id === 'MAT-SPEC-H2O2' ? 'ros-inducer' :
        id === 'MAT-SPEC-DMSO' ? 'solvent-vehicle' :
        'unknown';
    }
  }

  const crPos = loadYaml<ContextRole>('context-role-positive-control-for-ros.yaml');
  const crVeh = loadYaml<ContextRole>('context-role-vehicle-control-for-ros.yaml');

  it('positive CR verifies against positive context', () => {
    const v = verifier.verify(crPos, ctxPos);
    expect(v.passed).toBe(true);
  });

  it('vehicle CR verifies against vehicle context', () => {
    const v = verifier.verify(crVeh, ctxVeh);
    expect(v.passed).toBe(true);
  });

  it('positive CR fails against vehicle context (no ros-inducer present)', () => {
    const v = verifier.verify(crPos, ctxVeh);
    expect(v.passed).toBe(false);
  });

  it('comparison assertion shape mirrors diffContexts outcome direction', () => {
    const d = diffContexts(ctxVeh, ctxPos);
    const rosEntry = d.observed?.['ros-fluorescence'];
    expect(rosEntry).toBeDefined();
    const from = typeof rosEntry!.from === 'number' ? rosEntry!.from : (rosEntry!.from as { value?: number } | undefined)?.value;
    const to = typeof rosEntry!.to === 'number' ? rosEntry!.to : (rosEntry!.to as { value: number }).value;
    expect(to).toBeGreaterThan(from ?? 0);

    const assertion = {
      kind: 'assertion',
      id: 'ASN-ROS-H2O2-UP',
      scope: 'comparison',
      statement: 'H2O2 (100uM, 30min, 37C) increases ros-fluorescence vs DMSO vehicle control',
      context_refs: [
        { kind: 'record', id: ctxVeh.id, type: 'context' },
        { kind: 'record', id: ctxPos.id, type: 'context' },
      ],
      roles: [
        { role_ref: { kind: 'record', id: crVeh.id, type: 'context-role' }, context_ref: { kind: 'record', id: ctxVeh.id, type: 'context' } },
        { role_ref: { kind: 'record', id: crPos.id, type: 'context-role' }, context_ref: { kind: 'record', id: ctxPos.id, type: 'context' } },
      ],
      outcome: {
        direction: 'increased' as const,
        measure: 'ros-fluorescence',
        layer: 'observed' as const,
      },
      confidence: 4 as const,
    };

    expect(assertion.scope).toBe('comparison');
    expect(assertion.roles).toHaveLength(2);
    expect(assertion.context_refs).toHaveLength(2);
    expect(assertion.outcome.direction).toBe('increased');
    expect(assertion.outcome.layer).toBe('observed');
  });
});
