/**
 * Tests for event-graph semanticKey and semanticKeyComponents schema contract.
 *
 * Validates:
 *  - schema is registered in the registry
 *  - valid event-graph with semanticKey on every event
 *  - valid event-graph without semanticKey (back-compat)
 *  - invalid: semanticKey present without semanticKeyComponents → lint warning
 *  - invalid: malformed semanticKey pattern → schema rejection
 *  - uniqueness helper: findDuplicateSemanticKeys catches duplicates
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { createLintEngine } from '../lint/LintEngine.js';
import type { LintSpec } from '../lint/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Types ────────────────────────────────────────────────────────────────

interface EventGraph {
  id: string;
  events: EventItem[];
  labwares: LabwareItem[];
}

interface EventItem {
  eventId: string;
  event_type: string;
  details: Record<string, unknown>;
  semanticKey?: string;
  semanticKeyComponents?: {
    verb: string;
    identity: Record<string, string | string[]>;
    phaseId: string;
    ordinal: number;
  };
}

interface LabwareItem {
  labwareId: string;
  labwareType: string;
}

/**
 * Return a list of duplicate semanticKeys found across events.
 * Empty array means all keys are unique.
 */
function findDuplicateSemanticKeys(graph: EventGraph): string[] {
  const seen = new Map<string, number>();
  const duplicates: string[] = [];

  for (const event of graph.events) {
    if (event.semanticKey === undefined) continue;
    const count = seen.get(event.semanticKey) ?? 0;
    if (count === 1) {
      duplicates.push(event.semanticKey);
    }
    seen.set(event.semanticKey, count + 1);
  }

  return duplicates;
}

describe('EventGraphSemanticKeySchema', () => {
  let validator: ReturnType<typeof createValidator>;
  let registry: ReturnType<typeof createSchemaRegistry>;
  let lintEngine: ReturnType<typeof createLintEngine>;

  beforeEach(async () => {
    registry = createSchemaRegistry();
    validator = createValidator({ strict: false });
    lintEngine = createLintEngine();

    const schemaRoot = join(__dirname, '..', '..', '..', 'schema');
    const paths = [
      'core/common.schema.yaml',
      'core/datatypes/ref.schema.yaml',
      'workflow/event-graph.schema.yaml',
    ];

    const contents = new Map<string, string>();
    for (const path of paths) {
      contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
    }

    const result = loadSchemasFromContent(contents);
    expect(result.errors).toEqual([]);

    registry.addSchemas(result.entries);
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) {
        validator.addSchema(entry.schema, entry.id);
      }
    }

    // Load only the event-graph lint spec
    const lintContent = await readFile(
      join(schemaRoot, 'workflow', 'event-graph.lint.yaml'),
      'utf8'
    );
    const lintSpec = parseYaml(lintContent) as LintSpec;
    lintEngine.addSpec('event-graph', lintSpec);
  });

  // ── Registration ──────────────────────────────────────────────────────

  it('registers the event-graph schema in the registry', () => {
    const schemaId =
      'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';

    expect(registry.has(schemaId)).toBe(true);
  });

  // ── Valid payloads ────────────────────────────────────────────────────

  describe('valid event-graph with semantic keys', () => {
    it('accepts an event-graph with semanticKey on every event', () => {
      const valid: EventGraph = {
        id: 'EVG-test-001',
        events: [
          {
            eventId: 'EVT-001',
            event_type: 'transfer',
            details: {
              volume_ul: 100,
              source: 'reservoir-1',
              destination: 'plate-1',
            },
            semanticKey: 'EVT-transfer-clofibrate-reagents-reservoir-cell-plate-dose-administration-1',
            semanticKeyComponents: {
              verb: 'transfer',
              identity: {
                substance: ['clofibrate'],
                sourceRole: 'reagents-reservoir',
                destRole: 'cell-plate',
              },
              phaseId: 'dose-administration',
              ordinal: 1,
            },
          },
          {
            eventId: 'EVT-002',
            event_type: 'incubate',
            details: {
              duration_min: 30,
              temperature_c: 37,
            },
            semanticKey: 'EVT-incubate-37c-cell-plate-dose-administration-1',
            semanticKeyComponents: {
              verb: 'incubate',
              identity: {
                temperature: '37c',
                location: 'cell-plate',
              },
              phaseId: 'dose-administration',
              ordinal: 1,
            },
          },
          {
            eventId: 'EVT-003',
            event_type: 'read',
            details: {
              wavelength_nm: 450,
            },
            semanticKey: 'EVT-read-450nm-cell-plate-dose-administration-1',
            semanticKeyComponents: {
              verb: 'read',
              identity: {
                wavelength: '450nm',
                location: 'cell-plate',
              },
              phaseId: 'dose-administration',
              ordinal: 1,
            },
          },
        ],
        labwares: [
          {
            labwareId: 'reservoir-1',
            labwareType: 'reservoir_12',
          },
          {
            labwareId: 'plate-1',
            labwareType: 'plate_96',
          },
        ],
      };

      const result = validator.validate(
        valid,
        'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml'
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('valid event-graph without semantic keys (back-compat)', () => {
    it('accepts an event-graph without any semanticKey fields', () => {
      const valid: EventGraph = {
        id: 'EVG-test-002',
        events: [
          {
            eventId: 'EVT-001',
            event_type: 'transfer',
            details: {
              volume_ul: 100,
              source: 'reservoir-1',
              destination: 'plate-1',
            },
          },
          {
            eventId: 'EVT-002',
            event_type: 'incubate',
            details: {
              duration_min: 30,
              temperature_c: 37,
            },
          },
        ],
        labwares: [
          {
            labwareId: 'reservoir-1',
            labwareType: 'reservoir_12',
          },
          {
            labwareId: 'plate-1',
            labwareType: 'plate_96',
          },
        ],
      };

      const result = validator.validate(
        valid,
        'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml'
      );
      expect(result.valid).toBe(true);
    });
  });

  // ── Invalid payloads ──────────────────────────────────────────────────

  describe('invalid: semanticKey without components', () => {
    it('schema validates (both optional) but lint rule fires', () => {
      const payload: EventGraph = {
        id: 'EVG-test-003',
        events: [
          {
            eventId: 'EVT-001',
            event_type: 'transfer',
            details: {
              volume_ul: 100,
            },
            semanticKey: 'EVT-foo',
            // semanticKeyComponents intentionally missing
          },
        ],
        labwares: [],
      };

      // Schema should validate (both fields are optional)
      const schemaResult = validator.validate(
        payload,
        'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml'
      );
      expect(schemaResult.valid).toBe(true);

      // Lint rule should fire
      const lintResult = lintEngine.lint(payload);
      expect(lintResult.violations.some((v) => v.ruleId === 'semantic-key-requires-components')).toBe(
        true
      );
    });
  });

  describe('invalid: malformed semanticKey pattern', () => {
    it('rejects a semanticKey that does not match the pattern', () => {
      const invalid: EventGraph = {
        id: 'EVG-test-004',
        events: [
          {
            eventId: 'EVT-001',
            event_type: 'transfer',
            details: {
              volume_ul: 100,
            },
            semanticKey: 'invalid format with spaces',
            semanticKeyComponents: {
              verb: 'transfer',
              identity: { substance: ['test'] },
              phaseId: 'test-phase',
              ordinal: 1,
            },
          },
        ],
        labwares: [],
      };

      const result = validator.validate(
        invalid,
        'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml'
      );
      expect(result.valid).toBe(false);
    });
  });

  // ── Uniqueness helper ─────────────────────────────────────────────────

  describe('findDuplicateSemanticKeys', () => {
    it('returns empty array when all keys are unique', () => {
      const graph: EventGraph = {
        id: 'EVG-test-005',
        events: [
          {
            eventId: 'EVT-001',
            event_type: 'transfer',
            details: {},
            semanticKey: 'EVT-unique-key-1',
            semanticKeyComponents: {
              verb: 'transfer',
              identity: {},
              phaseId: 'phase-1',
              ordinal: 1,
            },
          },
          {
            eventId: 'EVT-002',
            event_type: 'incubate',
            details: {},
            semanticKey: 'EVT-unique-key-2',
            semanticKeyComponents: {
              verb: 'incubate',
              identity: {},
              phaseId: 'phase-1',
              ordinal: 1,
            },
          },
        ],
        labwares: [],
      };

      expect(findDuplicateSemanticKeys(graph)).toEqual([]);
    });

    it('returns duplicate keys when events share the same semanticKey', () => {
      const graph: EventGraph = {
        id: 'EVG-test-006',
        events: [
          {
            eventId: 'EVT-001',
            event_type: 'transfer',
            details: {},
            semanticKey: 'EVT-x',
            semanticKeyComponents: {
              verb: 'transfer',
              identity: {},
              phaseId: 'phase-1',
              ordinal: 1,
            },
          },
          {
            eventId: 'EVT-002',
            event_type: 'incubate',
            details: {},
            semanticKey: 'EVT-x', // duplicate
            semanticKeyComponents: {
              verb: 'incubate',
              identity: {},
              phaseId: 'phase-1',
              ordinal: 1,
            },
          },
        ],
        labwares: [],
      };

      const duplicates = findDuplicateSemanticKeys(graph);
      expect(duplicates).toContain('EVT-x');
      expect(duplicates.length).toBeGreaterThan(0);
    });

    it('ignores events without semanticKey', () => {
      const graph: EventGraph = {
        id: 'EVG-test-007',
        events: [
          {
            eventId: 'EVT-001',
            event_type: 'transfer',
            details: {},
            semanticKey: 'EVT-a',
            semanticKeyComponents: {
              verb: 'transfer',
              identity: {},
              phaseId: 'phase-1',
              ordinal: 1,
            },
          },
          {
            eventId: 'EVT-002',
            event_type: 'incubate',
            details: {},
            // no semanticKey
          },
          {
            eventId: 'EVT-003',
            event_type: 'read',
            details: {},
            semanticKey: 'EVT-b',
            semanticKeyComponents: {
              verb: 'read',
              identity: {},
              phaseId: 'phase-1',
              ordinal: 1,
            },
          },
        ],
        labwares: [],
      };

      expect(findDuplicateSemanticKeys(graph)).toEqual([]);
    });
  });
});
