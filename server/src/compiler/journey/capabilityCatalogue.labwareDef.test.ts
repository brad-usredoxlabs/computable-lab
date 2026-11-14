// @vitest-environment node
/**
 * L2-JOURNEY-LABWARE-DEF-1 (u2acap2): the two governed-write capability
 * descriptors the pilot labware-definition journey names —
 * journey.labware-definition-create and journey.labware-instance-place — are
 * declared under config/journey/capabilities/, and their admission is pinned
 * against the merged governed-write registry (config/journey/governed-writes.yaml,
 * L2-NOUN-FROM-DOC-1 d1gwrite).
 *
 * Every value this test checks — write ids, record kinds, port shapes — is
 * read from the shipped YAML, never retyped from the brief: leg (b) goes RED
 * if the registry and a descriptor ever drift apart.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { AGENT_ALLOWED_TOOLS } from '../../ai/ToolBridge.js';
import {
  admitCapabilityCatalogue,
  loadCapabilityCatalogueDir,
} from './capabilityCatalogue.js';

const CAPABILITIES_DIR = fileURLToPath(
  new URL('../../../../config/journey/capabilities/', import.meta.url),
);
const REGISTRY_FILE = fileURLToPath(
  new URL('../../../../config/journey/governed-writes.yaml', import.meta.url),
);

type Port = Record<string, unknown>;
interface DescriptorDoc {
  capability_id: string;
  ports: { input: Port[]; output: Port[] };
  implementation: { handler_kind: string; handler_ref: string };
}

/** Read a shipped descriptor; a missing file is exactly the RED condition. */
async function readDescriptor(name: string): Promise<DescriptorDoc> {
  return parseYaml(await readFile(join(CAPABILITIES_DIR, name), 'utf8')) as DescriptorDoc;
}

/** The registry is DATA, not code: ids and record kinds are read from the YAML. */
const registryDoc = parseYaml(await readFile(REGISTRY_FILE, 'utf8')) as
  | { writes?: Array<Record<string, unknown>> | null }
  | null;
const writes: Array<Record<string, unknown>> = Array.isArray(registryDoc?.writes)
  ? registryDoc!.writes
  : [];
const registryIds = new Set(
  writes.map((entry) => entry.id).filter((id): id is string => typeof id === 'string'),
);
const createEntry = writes.find((entry) => entry.id === 'records.create');
const createRecordKinds = new Set(
  Array.isArray(createEntry?.record_kinds) ? (createEntry!.record_kinds as string[]) : [],
);

describe('labware-definition journey capability declarations (u2acap2)', () => {
  it('(a) admits the real shipped directory: eight descriptors, empty diagnostics', async () => {
    const result = await loadCapabilityCatalogueDir(CAPABILITIES_DIR, new Set(AGENT_ALLOWED_TOOLS));
    // ok:true carries no diagnostics; name them if the catalogue refused.
    expect(result.ok ? [] : result.diagnostics).toEqual([]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.capabilities.map((c) => c.capability_id)).toEqual([
      'journey.labware-definition-create',
      'journey.labware-instance-place',
      'journey.material-create',
      'journey.material-library-search',
      'journey.ncbi-gene-search',
      'journey.noun-create-from-document',
      'journey.ontology-lookup',
      'journey.vendor-web-search',
    ]);
  });

  it('(b) cross-checks the registry with no loader: both handler_refs and output record kinds are covered', async () => {
    expect(createEntry, 'governed-writes.yaml must still declare the records.create entry').toBeDefined();
    const definitionCreate = await readDescriptor('labware-definition-create.yaml');
    const instancePlace = await readDescriptor('labware-instance-place.yaml');
    expect(registryIds.size).toBeGreaterThan(0);
    for (const doc of [definitionCreate, instancePlace]) {
      expect(
        registryIds.has(doc.implementation.handler_ref),
        `registry ids ${JSON.stringify([...registryIds])} must cover handler_ref '${doc.implementation.handler_ref}' of ${doc.capability_id}`,
      ).toBe(true);
      expect(doc.ports.output).toHaveLength(1);
      const recordType = String(doc.ports.output[0]!.record_type);
      expect(
        createRecordKinds.has(recordType),
        `record_kinds of records.create ${JSON.stringify([...createRecordKinds])} must cover output record_type '${recordType}' of ${doc.capability_id}`,
      ).toBe(true);
    }
  });

  it('(c) port shapes: place consumes a DEFINITION reference (no record_id, no receipt_id) and commits a labware-instance; create takes no input and commits a labware', async () => {
    const definitionCreate = await readDescriptor('labware-definition-create.yaml');
    expect(definitionCreate.ports.input).toEqual([]);
    const createOut = definitionCreate.ports.output;
    expect(createOut).toHaveLength(1);
    expect(createOut[0]!.record_type).toBe('labware');
    expect(String(createOut[0]!.receipt_id).trim().length).toBeGreaterThan(0);

    const instancePlace = await readDescriptor('labware-instance-place.yaml');
    expect(instancePlace.ports.input).toHaveLength(1);
    const input = instancePlace.ports.input[0]!;
    // Exactly the LabwareDefinitionReference keys: a placed instance can never
    // be smuggled in as its own source.
    expect(Object.keys(input).sort()).toEqual(['labware_definition_id', 'version']);
    expect('record_id' in input).toBe(false);
    expect('receipt_id' in input).toBe(false);
    const placeOut = instancePlace.ports.output;
    expect(placeOut).toHaveLength(1);
    expect(placeOut[0]!.record_type).toBe('labware-instance');
    expect(String(placeOut[0]!.receipt_id).trim().length).toBeGreaterThan(0);
  });

  it('(d) a handler_ref one character short of the registry id is refused, admitting nothing', async () => {
    const definitionCreate = await readDescriptor('labware-definition-create.yaml');
    const candidate = structuredClone(definitionCreate);
    candidate.implementation.handler_ref = 'records.creat';
    const known = new Set([...AGENT_ALLOWED_TOOLS, ...registryIds]);
    const result = await admitCapabilityCatalogue(
      [{ file: 'labware-definition-create.yaml', doc: candidate }],
      known,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error(`expected rejection, got ${result.capabilities.length} admitted`);
    expect(result.diagnostics.join('\n')).toContain("unknown handler id 'records.creat'");
    expect(result.capabilities).toHaveLength(0);
  });

  it('(e) material-create: admitted handler, two committed outputs sharing ONE receipt, one staged draft input', async () => {
    // L2-LAB-MATERIAL-CREATE-1 (capdesc): the shipped two-record material write
    // (material concept + its vendor-product under one receipt) is DECLARED
    // here. Everything below is read from the shipped files, never retyped.
    const doc = (await readDescriptor('material-create.yaml')) as DescriptorDoc & {
      status?: Record<string, unknown>;
    };
    expect(doc.capability_id).toBe('journey.material-create');
    expect(
      registryIds.has(doc.implementation.handler_ref),
      `registry ids ${JSON.stringify([...registryIds])} must cover handler_ref '${doc.implementation.handler_ref}'`,
    ).toBe(true);

    // Input: exactly one staged draft — keys version/draft_id only, so a
    // staged proposal can never satisfy a committed-record port.
    expect(doc.ports.input).toHaveLength(1);
    const input = doc.ports.input[0]!;
    expect(Object.keys(input).sort()).toEqual(['draft_id', 'version']);
    expect('record_id' in input).toBe(false);
    expect('receipt_id' in input).toBe(false);

    // Output: exactly two committed-record ports, closed shape, one receipt.
    const out = doc.ports.output;
    expect(out).toHaveLength(2);
    for (const port of out) {
      expect(Object.keys(port).sort()).toEqual(['receipt_id', 'record_id', 'record_type', 'version']);
      expect(String(port.receipt_id).trim().length).toBeGreaterThan(0);
    }
    expect(out.map((port) => port.record_type).sort()).toEqual(['material', 'vendor-product']);
    const receiptIds = new Set(out.map((port) => port.receipt_id));
    expect(receiptIds.size, 'both records commit under ONE receipt').toBe(1);

    // And the record kinds the ports name are ones the registered write may write.
    for (const port of out) {
      expect(
        createRecordKinds.has(String(port.record_type)),
        `record_kinds of records.create must cover '${String(port.record_type)}'`,
      ).toBe(true);
    }
  });
});
