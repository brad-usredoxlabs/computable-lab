/**
 * Schema contracts for the explicit `phase: 'soluble' | 'adsorbed'` field on
 * plate events.
 *
 * Uses the loadAllSchemas registry-level structural check (the canonical test
 * for a single additive schema field) — full Ajv payload validation is not
 * viable here because the datatypes/plate-event schema's per-kind detail
 * `$ref`s have a pre-existing namespace mismatch (see schema-authoring skill).
 *
 * Asserts the field is declared, optional, and enum-constrained on:
 *  - schema/workflow/events/plate-event.schema.yaml  (canonical semantic event)
 *  - schema/workflow/event-graph.schema.yaml $defs/PlateEvent (persisted graph)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { loadAllSchemas } from './SchemaLoader.js';

interface SchemaEntry {
  id: string;
  schema: Record<string, unknown>;
}

describe('PlateEvent explicit phase contract', () => {
  let entries: SchemaEntry[] = [];

  beforeAll(async () => {
    const schemaDir = join(process.cwd(), 'schema');
    const result = await loadAllSchemas({ basePath: schemaDir });
    expect(result.errors).toEqual([]);
    entries = result.entries as SchemaEntry[];
  });

  function plateEventSchema(): Record<string, unknown> {
    const entry = entries.find((e) => e.id.endsWith('/datatypes/plate-event.schema.yaml'));
    expect(entry).toBeDefined();
    return entry!.schema;
  }

  function eventGraphDefs(): Record<string, unknown> {
    const entry = entries.find((e) => e.id.endsWith('/event-graph.schema.yaml'));
    expect(entry).toBeDefined();
    const defs = entry!.schema.$defs as Record<string, unknown>;
    return defs.PlateEvent as Record<string, unknown>;
  }

  function phaseProps(schema: Record<string, unknown>): Record<string, unknown> {
    const props = schema.properties as Record<string, unknown>;
    return props.phase as Record<string, unknown>;
  }

  it('declares an optional phase field on the datatypes/plate-event schema', () => {
    const phase = phaseProps(plateEventSchema());
    expect(phase).toBeDefined();
    expect(phase.type).toBe('string');
    expect(phase.enum).toEqual(['soluble', 'adsorbed']);
  });

  it('declares an optional phase field on event-graph $defs/PlateEvent', () => {
    const phase = phaseProps(eventGraphDefs());
    expect(phase).toBeDefined();
    expect(phase.type).toBe('string');
    expect(phase.enum).toEqual(['soluble', 'adsorbed']);
  });

  it('does not require phase (back-compat)', () => {
    const baseReq = plateEventSchema().required as unknown[] | undefined;
    const graphReq = eventGraphDefs().required as unknown[] | undefined;
    expect(baseReq).not.toContain('phase');
    expect(graphReq).not.toContain('phase');
  });

  it('declares an optional phase field on ProtocolStep (protocol schema)', () => {
    const entry = entries.find((e) => e.id.endsWith('/protocol.schema.yaml'));
    expect(entry).toBeDefined();
    const defs = entry!.schema.$defs as Record<string, unknown>;
    const step = defs.ProtocolStep as Record<string, unknown>;
    const props = (step.properties ?? {}) as Record<string, unknown>;
    const phase = props.phase as Record<string, unknown> | undefined;
    expect(phase).toBeDefined();
    expect(phase!.type).toBe('string');
    expect(phase!.enum).toEqual(['soluble', 'adsorbed']);
    expect((step.required as unknown[] | undefined) ?? []).not.toContain('phase');
  });

  it('declares an optional phase field on CompiledProtocolStep (planned-run schema)', () => {
    const entry = entries.find((e) => e.id.endsWith('/planned-run.schema.yaml'));
    expect(entry).toBeDefined();
    const defs = entry!.schema.$defs as Record<string, unknown>;
    const step = defs.CompiledProtocolStep as Record<string, unknown>;
    const props = (step.properties ?? {}) as Record<string, unknown>;
    const phase = props.phase as Record<string, unknown> | undefined;
    expect(phase).toBeDefined();
    expect(phase!.type).toBe('string');
    expect(phase!.enum).toEqual(['soluble', 'adsorbed']);
  });
});
