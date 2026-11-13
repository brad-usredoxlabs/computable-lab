// @vitest-environment node
/**
 * L2-JOURNEY-LABWARE-DEF-1 (unit u2asurf) — admit the already-UI-declared
 * `record-create` work surface into the work-surface registry.
 *
 * The pin loads the SHIPPED registry through the loader (not a fixture) and
 * asserts: (a) a surface with id `record-create` exists; (b) its `path` and
 * bound `params` are exactly what the registry declares; (c)
 * validateHumanTaskContract returns ZERO diagnostics for a human_in_the_loop
 * step declaring { surface: 'record-create', selectable_kinds: [] }; (d) a
 * pattern-valid but absent surface id still yields
 * journey_human_task_surface_unknown — the registry stays the refuser, the
 * allow-list (enum) is gone, only the open pattern remains. It also guards the
 * eleven pre-existing surface ids so admission is an extension, not a rewrite.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadDefaultSurfacesRegistry } from './surfaces.js';
import {
  RULE_HUMAN_TASK_SURFACE_UNKNOWN,
  validateHumanTaskContract,
} from '../compiler/journey/humanTaskContract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = resolve(__dirname, '../../../schema');

// The eleven ids the registry declared on trunk (b5acc73d seq2 tabs onward).
// Admission must be an EXTENSION of this set, never a rewrite of it.
const PRE_EXISTING_IDS = [
  'find', 'run-plan', 'run-design', 'run-execute', 'results', 'analysis',
  'knowledge', 'project', 'ingestion', 'protocol-review', 'sequences',
];

describe('work-surface registry — record-create admission (u2asurf)', () => {
  const registry = loadDefaultSurfacesRegistry(SCHEMA_DIR);

  it('(a) declares a surface with id record-create', () => {
    const surface = registry.get('record-create');
    expect(surface, 'record-create must be declared in the work-surface registry').not.toBeNull();
    expect(surface!.id).toBe('record-create');
  });

  it('(b) declares path /record/new/:nodeType binding exactly the nodeType token', () => {
    const surface = registry.get('record-create')!;
    expect(surface.path).toBe('/record/new/:nodeType');
    // The loader binds EVERY :token in path; the optional :parentId? UI token
    // is deliberately NOT copied here (an unbound optional token throws at
    // load). So params is exactly the one required token.
    expect(surface.params).toEqual({ nodeType: 'record' });
  });

  it('admits record-create as an EXTENSION: the eleven pre-existing ids are untouched', () => {
    const ids = registry.list().map((s) => s.id);
    for (const id of PRE_EXISTING_IDS) {
      expect(ids, `pre-existing surface ${id} must still be declared`).toContain(id);
    }
    // record-create is the one new id on top of the eleven.
    expect(ids.filter((id) => !PRE_EXISTING_IDS.includes(id))).toEqual(['record-create']);
  });

  it('(c) a human_in_the_loop step on record-create lints with ZERO diagnostics', () => {
    const diagnostics = validateHumanTaskContract(
      {
        id: 'complete-definition',
        interaction_mode: 'human_in_the_loop',
        human_task: { surface: 'record-create', selectable_kinds: [] },
      },
      registry,
    );
    expect(diagnostics).toEqual([]);
  });

  it('(d) a pattern-valid but absent surface id is STILL refused (registry is the refuser)', () => {
    const diagnostics = validateHumanTaskContract(
      {
        id: 'ghost-step',
        interaction_mode: 'human_in_the_loop',
        human_task: { surface: 'not-a-real-surface', selectable_kinds: [] },
      },
      registry,
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.rule).toBe(RULE_HUMAN_TASK_SURFACE_UNKNOWN);
    expect(diagnostics[0]!.message).toContain('not-a-real-surface');
  });
});
