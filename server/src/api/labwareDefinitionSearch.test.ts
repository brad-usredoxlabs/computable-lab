// @vitest-environment node
/**
 * Labware search + labwareType -> ontology-class binding (unit O4): shipped config
 * validates, CURIEs come from the ontology repo's data file, absent file fails by
 * name, and hits gain `lwoClass` only when the data maps the type to a CURIE.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { parse as parseYaml } from 'yaml';
import type { RecordStore } from '../store/types.js';
import { loadSchemasFromContent } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import {
  loadLabwareTypeBindings,
  lookupLabwareClass,
} from '../resolve/bindings/labwareTypeBinding.js';
import {
  searchLabwareDefinitions,
  type LabwareDefinitionSearchOptions,
} from './labwareDefinitionSearch.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '../../../config/ontology-bindings.yaml');
const SCHEMA_PATH = resolve(__dirname, '../../../schema/registry/ontology-bindings.schema.yaml');

function readConfig(): Record<string, unknown> {
  return parseYaml(readFileSync(CONFIG_PATH, 'utf8')) as Record<string, unknown>;
}

function buildValidator() {
  const contents = new Map<string, string>();
  contents.set('ontology-bindings.schema.yaml', readFileSync(SCHEMA_PATH, 'utf8'));
  const loaded = loadSchemasFromContent(contents);
  expect(loaded.errors, 'schema load errors').toEqual([]);
  const validator = createValidator({ strict: false });
  for (const entry of loaded.entries) validator.addSchema(entry.schema, entry.id);
  return { validator, schemaId: loaded.entries[0]!.id };
}

function storeWith(payloads: Array<Record<string, unknown>>) {
  return {
    list: async () => payloads.map((payload) => ({ payload })),
  } as unknown as LabwareDefinitionSearchOptions['store'];
}

function fixture(recordId: string, displayName: string, legacy?: string[]) {
  return {
    kind: 'labware-definition',
    recordId,
    type: 'labware_definition',
    id: `fixture/${recordId}@v1`,
    display_name: displayName,
    ...(legacy ? { legacy_labware_types: legacy } : {}),
  };
}

/**
 * Payloads mirroring the SHIPPED seed records (records/seed/labware-definition/):
 * lbw-def-generic-12-reservoir.yaml and
 * lbw-def-opentrons-nest-12-reservoir-22ml-v1.yaml. Mirrored, not read from
 * records/, so this test pins the READ PATH and the data repo stays untouched.
 */
const SEED_SHAPED_PAYLOADS: Array<Record<string, unknown>> = [
  {
    kind: 'labware-definition',
    recordId: 'lbw-def-generic-12-reservoir',
    type: 'labware_definition',
    id: 'generic/reservoir_12@v1',
    display_name: 'Generic 12-Channel Reservoir',
    source: 'generic',
    specificity: 'generic',
    legacy_labware_types: ['reservoir_12'],
    topology: { addressing: 'linear', linear_count: 12, linear_axis: 'x' },
    capacity: { max_well_volume_uL: 25000, min_working_volume_uL: 500 },
    render_hints: { profile: 'reservoir', linear_well_style: 'trough' },
  },
  {
    kind: 'labware-definition',
    recordId: 'lbw-def-opentrons-nest-12-reservoir-22ml-v1',
    type: 'labware_definition',
    id: 'opentrons/nest_12_reservoir_22ml@v1',
    display_name: '12-Channel Reservoir',
    vendor: 'Opentrons',
    read_only: true,
    legacy_labware_types: ['reservoir_12'],
    topology: { addressing: 'linear', linear_count: 12, linear_axis: 'x' },
    capacity: { max_well_volume_uL: 22000, min_working_volume_uL: 1000 },
    render_hints: { profile: 'reservoir', linear_well_style: 'trough' },
  },
];

/** ROUTE-level stub, copied from InventoryShelfHandlers.test.ts:67-81. */
function stubRouteOptions(store: RecordStore) {
  const noop = async () => ({});
  return {
    recordHandlers: {
      listRecords: noop, listDanglingReferences: noop, listRevisions: noop,
      draftCopy: noop, acceptGraph: noop,
      getRecord: noop, createRecord: noop, updateRecord: noop, deleteRecord: noop,
      listClaims: noop, checkClaimDuplicates: noop,
    } as never,
    schemaHandlers: { listSchemas: noop, getSchema: noop, getSchemaByPath: noop } as never,
    validationHandlers: { validate: noop, lint: noop, validateFull: noop } as never,
    schemaCount: () => 0,
    ruleCount: () => 0,
    recordStore: store,
  };
}

describe('labwareType -> ontology class bindings', () => {
  it('(a) shipped config validates against the closed schema', () => {
    const { validator, schemaId } = buildValidator();
    expect(validator.validate(readConfig(), schemaId).errors).toEqual([]);
  });

  it('(a) a path-less copy is rejected with the missing field named', () => {
    const { validator, schemaId } = buildValidator();
    const { path: _dropped, ...mutated } = readConfig();
    const result = validator.validate(mutated, schemaId);
    expect(result.valid).toBe(false);
    const missing = result.errors
      .filter((e) => e.keyword === 'required')
      .map((e) => (e.params as { missingProperty?: string } | undefined)?.missingProperty);
    expect(missing).toContain('path');
  });

  it('(b) real bindings map plate, reservoir and other to their data CURIEs', () => {
    expect(lookupLabwareClass('plate')?.lwoClass).toBe('LWO:0000121');
    expect(lookupLabwareClass('reservoir')?.lwoClass).toBe('LWO:0000117');
    expect(lookupLabwareClass('other')?.lwoClass).toBe('LWO:0000100');
  });

  it('(c) slide carries data null plus the data note — no substitute class', () => {
    const binding = lookupLabwareClass('slide');
    expect(binding).not.toBeNull();
    expect(binding?.lwoClass).toBeNull();
    expect(binding?.note).toContain('Microscope slide');
  });

  it('(d) an unknown type answers null without throwing or fuzzy-matching', () => {
    expect(lookupLabwareClass('microfluidic-chip')).toBeNull();
  });

  it('(e) an absent bindings path fails loudly by name; non-strict answers null', () => {
    const missing = resolve(__dirname, '../../../config/no-such-bindings-file.yaml');
    expect(() => loadLabwareTypeBindings({ bindingsPath: missing })).toThrowError(
      new RegExp(missing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
    expect(lookupLabwareClass('plate', { bindingsPath: missing, strict: false })).toBeNull();
    const report = loadLabwareTypeBindings({ bindingsPath: missing, strict: false });
    expect(report.failures.map((f) => f.path)).toContain(missing);
    expect(report.entries).toEqual([]);
  });

  it('(f) a plate-type definition comes back anchored with the data CURIE', async () => {
    const store = storeWith([fixture('lwd-fixture-plate-anchor', 'Fixture Plate Anchor', ['plate'])]);
    const { hits } = await searchLabwareDefinitions({ store, q: 'fixture plate anchor' });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.lwoClass).toBe('LWO:0000121');
  });

  it('(f) an untyped definition has no lwoClass key at all', async () => {
    const store = storeWith([fixture('lwd-fixture-unanchored', 'Fixture Unanchored Carrier')]);
    const { hits } = await searchLabwareDefinitions({ store, q: 'fixture unanchored carrier' });
    expect(hits).toHaveLength(1);
    expect('lwoClass' in hits[0]!).toBe(false);
  });

  it('(f) a null-mapped legacy type leaves the key absent (slide, not a lookalike)', async () => {
    const store = storeWith([fixture('lwd-fixture-slide', 'Fixture Slide Carrier', ['slide'])]);
    const { hits } = await searchLabwareDefinitions({ store, q: 'fixture slide carrier' });
    expect(hits).toHaveLength(1);
    expect('lwoClass' in hits[0]!).toBe(false);
  });
});

describe('labware-definition search: the record store is the second source', () => {
  // F2 (PROMPT1-GATE-20261114T034254Z): 41 labware-definition records existed
  // while POST /labware-definitions/search answered 0 hits, because the caller
  // never wired the store. These cases pin the read of that second source.
  it('returns the shipped 12-channel records by recordId, and says it searched the store', async () => {
    const store = storeWith(SEED_SHAPED_PAYLOADS);

    const byChannel = await searchLabwareDefinitions({ store, q: '12-channel' });
    expect(byChannel.storeTier).toEqual({ status: 'searched' });
    const channelIds = byChannel.hits.map((h) => h.recordId);
    expect(channelIds).toContain('lbw-def-generic-12-reservoir');
    expect(channelIds).toContain('lbw-def-opentrons-nest-12-reservoir-22ml-v1');
    expect(
      byChannel.hits.find((h) => h.recordId === 'lbw-def-opentrons-nest-12-reservoir-22ml-v1')?.label,
    ).toBe('12-Channel Reservoir');

    const byVendor = await searchLabwareDefinitions({ store, q: 'opentrons' });
    expect(byVendor.storeTier).toEqual({ status: 'searched' });
    expect(byVendor.hits.map((h) => h.recordId)).toContain(
      'lbw-def-opentrons-nest-12-reservoir-22ml-v1',
    );
  });

  it('route: POST /labware-definitions/search reaches the store through registerRoutes', async () => {
    const app = Fastify();
    const store = storeWith(SEED_SHAPED_PAYLOADS) as unknown as RecordStore;
    // routes.ts pulls the compiler graph, which resolves its vocabulary as
    // `join(process.cwd(), 'schema', ...)`. This suite is run from server/, so
    // point cwd at the repo root for the import; the search module itself
    // needs no cwd, and the stub is restored in the finally below.
    const realCwd = process.cwd;
    process.cwd = () => resolve(__dirname, '../../..');
    try {
      const { registerRoutes } = await import('./routes.js');
      registerRoutes(app, stubRouteOptions(store));

      const res = await app.inject({
        method: 'POST',
        url: '/labware-definitions/search',
        payload: { q: 'opentrons' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        hits: { recordId: string }[];
        storeTier: { status: string };
      };
      expect(body.storeTier.status).toBe('searched');
      expect(body.hits.map((h) => h.recordId)).toContain(
        'lbw-def-opentrons-nest-12-reservoir-22ml-v1',
      );
    } finally {
      process.cwd = realCwd;
    }
    await app.close();
  });

  it('AC2: no store is reported, not hidden, and the registry tier still renders', async () => {
    const { hits, storeTier } = await searchLabwareDefinitions({ q: '' });
    expect(storeTier).toEqual({ status: 'unavailable', reason: 'no-store' });
    expect(hits.length).toBeGreaterThan(0);
  });

  it('AC2: a store whose list() throws is reported, and the registry tier still renders', async () => {
    const store = {
      list: async () => {
        throw new Error('store offline');
      },
    } as unknown as LabwareDefinitionSearchOptions['store'];
    const { hits, storeTier } = await searchLabwareDefinitions({ store, q: '' });
    expect(storeTier.status).toBe('unavailable');
    expect(storeTier.status === 'unavailable' ? storeTier.reason : '').toBe('store offline');
    expect(hits.length).toBeGreaterThan(0);
  });

  // No unit harness can observe server.ts's inline routeOpts (built inside the
  // boot closure), so the caller wiring gets a textual pin: deleting
  // `recordStore: ctx.store,` from the routeOpts literal makes this go RED.
  // It proves presence, not runtime behaviour — the live probe proves that.
  it('wiring: server.ts routeOpts hands ctx.store to the search route', () => {
    const source = readFileSync(resolve(__dirname, '../server.ts'), 'utf8');
    const start = source.indexOf("const routeOpts: import('./api/routes.js').RouteOptions = {");
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start, source.indexOf('    };', start));
    expect(block).toMatch(/recordStore:\s*ctx\.store,/);
  });
});
