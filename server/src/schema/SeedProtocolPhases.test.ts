/**
 * Tests for seed protocol phase backfill (spec-004).
 *
 * Validates:
 *  - all 5 seed protocols have a non-empty phases array
 *  - every step in every protocol has a phaseId
 *  - every step's phaseId matches one of the declared phase ids
 *  - templateRef on each phase points at the correct PHASE-* record
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..', '..');
const protocolDir = resolve(repoRoot, 'records', 'seed', 'protocols');

// ── Protocol definitions with expected phase assignments ──────────────

interface ProtocolDef {
  file: string;
  phases: Array<{ id: string; label: string; ordinal: number; templateRef: string }>;
  stepPhaseIds: Record<string, string>; // stepId -> expected phaseId
}

const PROTOCOL_DEFS: ProtocolDef[] = [
  {
    file: 'prt-seed-buffer-prep-50ml.yaml',
    phases: [
      { id: 'prep', label: 'Buffer Preparation', ordinal: 1, templateRef: 'PHASE-PREPARATION' },
    ],
    stepPhaseIds: {
      'step-1': 'prep',
      'step-2': 'prep',
      'step-3': 'prep',
    },
  },
  {
    file: 'prt-seed-incubate-plate.yaml',
    phases: [
      { id: 'incubate', label: 'Plate Incubation', ordinal: 1, templateRef: 'PHASE-TREATMENT-INCUBATE' },
    ],
    stepPhaseIds: {
      'step-1': 'incubate',
    },
  },
  {
    file: 'prt-seed-pbs-wash.yaml',
    phases: [
      { id: 'wash', label: 'PBS Wash', ordinal: 1, templateRef: 'PHASE-WASH' },
    ],
    stepPhaseIds: {
      'step-1': 'wash',
      'step-2': 'wash',
      'step-3': 'wash',
    },
  },
  {
    file: 'prt-seed-serial-dilution-96.yaml',
    phases: [
      { id: 'prep', label: 'Dilution Preparation', ordinal: 1, templateRef: 'PHASE-PREPARATION' },
    ],
    stepPhaseIds: {
      'step-1': 'prep',
      'step-2': 'prep',
      'step-3': 'prep',
      'step-4': 'prep',
      'step-5': 'prep',
      'step-6': 'prep',
      'step-7': 'prep',
      'step-8': 'prep',
      'step-9': 'prep',
      'step-10': 'prep',
      'step-11': 'prep',
    },
  },
  {
    file: 'prt-seed-standard-curve-tubes.yaml',
    phases: [
      { id: 'prep', label: 'Standard Curve Preparation', ordinal: 1, templateRef: 'PHASE-PREPARATION' },
    ],
    stepPhaseIds: {
      'step-1': 'prep',
      'step-2': 'prep',
      'step-3': 'prep',
      'step-4': 'prep',
      'step-5': 'prep',
    },
  },
];

describe('seed protocol phases (spec-004)', () => {
  for (const def of PROTOCOL_DEFS) {
    describe(def.file, () => {
      let parsed: Record<string, unknown>;

      beforeAll(() => {
        const raw = readFileSync(join(protocolDir, def.file), 'utf8');
        parsed = load(raw) as Record<string, unknown>;
      });

      it('has a non-empty phases array', () => {
        const phases = parsed.phases as unknown[] | undefined;
        expect(phases).toBeDefined();
        expect(Array.isArray(phases)).toBe(true);
        expect((phases as unknown[]).length).toBeGreaterThan(0);
      });

      it('phases match expected definitions', () => {
        const phases = parsed.phases as Array<Record<string, unknown>>;
        expect(phases).toHaveLength(def.phases.length);

        for (let i = 0; i < def.phases.length; i++) {
          const expected = def.phases[i];
          const actual = phases[i];
          expect(actual.id).toBe(expected.id);
          expect(actual.label).toBe(expected.label);
          expect(actual.ordinal).toBe(expected.ordinal);
          expect(actual.templateRef).toBe(expected.templateRef);
        }
      });

      it('every step has a phaseId', () => {
        const steps = parsed.steps as Array<Record<string, unknown>>;
        expect(steps).toBeDefined();
        for (const step of steps) {
          expect(step.phaseId).toBeDefined();
        }
      });

      it('every step phaseId matches a declared phase id', () => {
        const phases = parsed.phases as Array<Record<string, unknown>>;
        const declaredIds = new Set(phases.map((p) => p.id));
        const steps = parsed.steps as Array<Record<string, unknown>>;

        for (const step of steps) {
          expect(declaredIds.has(step.phaseId as string)).toBe(true);
        }
      });

      it('step phaseIds match expected assignments', () => {
        const steps = parsed.steps as Array<Record<string, unknown>>;

        for (const step of steps) {
          const stepId = step.stepId as string;
          const expectedPhaseId = def.stepPhaseIds[stepId];
          expect(expectedPhaseId).toBeDefined(`step ${stepId} has no expected phaseId in test definition`);
          expect(step.phaseId).toBe(expectedPhaseId);
        }
      });
    });
  }
});
