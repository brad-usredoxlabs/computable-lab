// @vitest-environment node
/**
 * L2-JOURNEY-CAPABILITY-CATALOGUE-1 (unit u1schema), RED-first.
 *
 * The deliverable is the contract, so Ajv alone must decide valid vs invalid:
 * there is no TypeScript descriptor type and no test-only branch. The
 * capability schema and the shipped journey-port vocabulary are both added to
 * one Ajv instance, so the descriptor's RELATIVE
 * `./journey-port.schema.yaml#/$defs/<Name>` refs have to resolve at compile
 * time. A broken ref throws there; deliberately no try/catch around compile,
 * because a caught compile error would hide exactly the failure this pins.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';

const SCHEMA_DIR = join(
  fileURLToPath(new URL('.', import.meta.url)), '../../../../schema/workflow');
const load = async (name: string): Promise<Record<string, any>> =>
  parseYaml(await readFile(join(SCHEMA_DIR, name), 'utf8')) as Record<string, any>;

const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(await load('journey-port.schema.yaml'));
const capabilitySchema = await load('capability-descriptor.schema.yaml');
ajv.addSchema(capabilitySchema);
const validate = ajv.compile(capabilitySchema);

/** Fresh sample each call: a capability that reads a committed sequence set. */
const descriptor = (): Record<string, any> => ({
  capability_id: 'journey.align-sequences',
  version: '1.0.0',
  display_name: 'Align sequences',
  justification: 'No existing capability consumes a sequence set and returns an alignment.',
  ports: {
    input: [{ version: '1.0.0', sequence_set_id: 'SS-1' }],
    output: [{ version: '1.0.0', alignment_id: 'AL-1' }],
  },
  implementation: { handler_kind: 'query', handler_ref: 'compiler.journey.align' },
  effects: ['read'],
  permissions: ['journey.read'],
  availability: { requires_records: ['sequence-set'] },
  surfaces: ['journey.workspace'],
  idempotency: 'pure',
  retry: 'automatic',
  reconciliation: 'not_required',
  evidence: ['validation_report'],
  status: { declared: true, implemented: true, available_now: false, browser_certified: false },
});

const errorsFor = (doc: unknown) => {
  void validate(doc);
  return validate.errors ?? [];
};

describe('capability descriptor schema (Ajv is the sole authority)', () => {
  it('accepts a fully populated descriptor', () => {
    expect(validate(descriptor()), JSON.stringify(validate.errors)).toBe(true);
  });

  it('resolves the relative $ref into the journey-port vocabulary, and the port stays closed', () => {
    const material = descriptor();
    material.ports.input = [
      { version: '1.0.0', material_id: 'MAT-1', provenance_layer: 'aliquot' },
    ];
    expect(validate(material), JSON.stringify(validate.errors)).toBe(true);

    // Vocabulary shape actually applies: MaterialReference requires provenance_layer.
    const unrestated = descriptor();
    unrestated.ports.input = [{ version: '1.0.0', material_id: 'MAT-1' }];
    expect(validate(unrestated)).toBe(false);
    expect(errorsFor(unrestated).some((e) => e.instancePath === '/ports/input/0')).toBe(true);
  });

  it('rejects an unknown top-level field (unevaluatedProperties bites)', () => {
    const doc = { ...descriptor(), tab_order: 'new-prefill' };
    expect(validate(doc)).toBe(false);
    const err = errorsFor(doc).find((e) => e.keyword === 'unevaluatedProperties');
    expect(err?.params).toMatchObject({ unevaluatedProperty: 'tab_order' });
  });

  it('rejects an invented handler_kind', () => {
    const doc = descriptor();
    doc.implementation.handler_kind = 'invented_tool';
    expect(validate(doc)).toBe(false);
    expect(errorsFor(doc).some((e) => e.instancePath === '/implementation/handler_kind')).toBe(true);
  });

  it('requires a governed write path for a domain_mutation capability', () => {
    const agent = descriptor();
    agent.effects = ['domain_mutation'];
    agent.implementation = { handler_kind: 'agent_tool', handler_ref: 'tools.commit_record' };
    expect(validate(agent)).toBe(false);
    expect(errorsFor(agent).some((e) => e.instancePath === '/implementation/handler_kind')).toBe(true);

    const governed = descriptor();
    governed.effects = ['domain_mutation'];
    governed.implementation = { handler_kind: 'governed_write', handler_ref: 'records.commit' };
    expect(validate(governed), JSON.stringify(validate.errors)).toBe(true);
  });

  it('cannot collapse the four status fields into one string', () => {
    const collapsed = { ...descriptor(), status: 'available' };
    expect(validate(collapsed)).toBe(false);
    const err = errorsFor(collapsed).find((e) => e.instancePath === '/status');
    expect(err).toBeDefined();
    expect(String(err?.message)).toContain('object');
  });

  it('requires all four status keys and rejects a fifth', () => {
    const missing = descriptor();
    missing.status = { declared: true, implemented: true, available_now: true };
    expect(validate(missing)).toBe(false);
    expect(errorsFor(missing).some((e) => e.instancePath === '/status' && e.keyword === 'required'))
      .toBe(true);

    const extra = descriptor();
    extra.status.shipped = true;
    expect(validate(extra)).toBe(false);
    expect(errorsFor(extra).some((e) => e.keyword === 'additionalProperties')).toBe(true);
  });
});
