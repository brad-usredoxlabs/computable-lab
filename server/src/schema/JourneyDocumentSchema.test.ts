// @vitest-environment node
/**
 * L2-JOURNEY-DOC-1 (unit u1schema): the journey intent document, as data.
 * Real pipeline as JourneyPortSchema.test.ts. Fixtures come FROM the loaded
 * document (required lists, keys, enums, port $refs), so no second copy of the
 * journey vocabulary lives in TS; only $ids and fixture-locating field names
 * are literals. Capability EXISTENCE belongs to the lint unit, not here.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
const CL = 'https://computable-lab.com/schema/computable-lab/';
const SCHEMA_ID = `${CL}journey-document.schema.yaml`;
const PORT_SCHEMA_ID = `${CL}journey-port.schema.yaml`;
const CAPABILITY_SCHEMA_ID = `${CL}capability-descriptor.schema.yaml`;
const SCHEMA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '../../../schema');
const PORT_REF_PREFIX = './journey-port.schema.yaml#/$defs/';
interface Node {
  type?: string; enum?: unknown[]; const?: unknown; $ref?: string; oneOf?: Node[];
  items?: Node; required?: string[]; properties?: Record<string, Node>;
  $defs?: Record<string, Node>; additionalProperties?: boolean | Node;
  minItems?: number; pattern?: string;
}
interface Issue { path: string; keyword: string; params?: Record<string, unknown> }
describe('journey intent document schema', () => {
  let validator: ReturnType<typeof createValidator>;
  let registry: ReturnType<typeof createSchemaRegistry>;
  beforeAll(async () => {
    const loaded = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true });
    registry = createSchemaRegistry();
    registry.addSchemas(loaded.entries);
    validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema as never, id);
    }
  });
  const doc = (): Node => registry.getById(SCHEMA_ID)!.schema as Node;
  const portDoc = (): Node => registry.getById(PORT_SCHEMA_ID)!.schema as Node;
  const prop = (name: string): Node => doc().properties![name]!;
  /** Resolve a $ref (local or vocabulary) and a oneOf, recursively. */
  function resolve(node: Node): Node {
    const target = node.$ref?.startsWith(PORT_REF_PREFIX)
      ? portDoc().$defs![node.$ref.slice(PORT_REF_PREFIX.length)]!
      : node.$ref?.startsWith('#/$defs/')
        ? doc().$defs![node.$ref.slice('#/$defs/'.length)]!
        : node.oneOf ? node.oneOf[0]! : node;
    return target === node ? node : resolve(target);
  }
  function sample(node: Node, all: boolean): unknown {
    const n = resolve(node);
    if (n.const !== undefined) return n.const;
    if (Array.isArray(n.enum)) return n.enum[0];
    if (n.type === 'object') {
      const keys = all ? Object.keys(n.properties ?? {}) : (n.required ?? []);
      return Object.fromEntries(keys.map((k) => [k, sample(n.properties![k]!, all)]));
    }
    if (n.type === 'array') return Array.from({ length: Math.max(n.minItems ?? 1, 1) }, () => sample(n.items!, all));
    if (n.type === 'integer') return 1;
    if (n.type === 'boolean') return true;
    return 'fixture-value';
  }
  const plan = (): any => JSON.parse(JSON.stringify(sample(doc(), true)));
  function issues(input: unknown): Issue[] {
    const result = validator.validate(input, SCHEMA_ID);
    expect(result.valid, 'fixture should be refused').toBe(false);
    return (result.errors ?? []) as Issue[];
  }
  function refusal(input: unknown, keyword: string, key: string, value: string): Issue {
    const found = issues(input).find((i) => i.keyword === keyword && i.params?.[key] === value);
    expect(found, `expected ${keyword}/${value}`).toBeDefined();
    return found!;
  }
  function objectNodes(node: Node, acc: Node[] = []): Node[] {
    if (node.type === 'object') acc.push(node);
    for (const child of Object.values(node.properties ?? {})) objectNodes(child, acc);
    if (node.items) objectNodes(node.items, acc);
    for (const def of Object.values(node.$defs ?? {})) objectNodes(def, acc);
    return acc;
  }
  it('resolves under its declared $id, closed at every object node', () => {
    expect(registry.getById(SCHEMA_ID)).toBeDefined();
    const objects = objectNodes(doc());
    expect(objects.length, 'object shapes declared').toBeGreaterThan(5);
    for (const node of objects) expect(node.additionalProperties, 'closed object').toBe(false);
  });
  it('accepts a fully-populated plan built from the document itself', () => {
    expect(validator.validate(plan(), SCHEMA_ID).errors ?? []).toEqual([]);
  });
  it('refuses a plan that grants itself a policy tier', () => {
    const p = { ...plan(), policy_tier: 'autonomous' };
    expect(refusal(p, 'additionalProperties', 'additionalProperty', 'policy_tier').path).toBe('/');
  });
  it('refuses a step without a stable id', () => {
    const p = plan();
    delete p.steps[0].id;
    expect(refusal(p, 'required', 'missingProperty', 'id').path).toBe('/steps/0');
  });
  it('binds step ports by $ref into the six shipped ports, and nowhere else', () => {
    const refs = (doc().$defs!.PortBinding!.oneOf ?? []).map((n) => n.$ref ?? '');
    expect(refs.every((r) => r.startsWith(PORT_REF_PREFIX)), 'ref is vocabulary').toBe(true);
    expect(refs, 'port refs are unique').toEqual([...new Set(refs)]);
    expect(refs.map((r) => r.slice(PORT_REF_PREFIX.length)).sort())
      .toEqual(Object.keys(portDoc().$defs ?? {}).sort());
    // A $defs name outside the vocabulary must not resolve: the probe keeps the
    // document's $id and gains one bogus branch, so compilation fails.
    const broken = JSON.parse(JSON.stringify(doc()));
    broken.$defs.PortBinding.oneOf.push({ $ref: `${PORT_REF_PREFIX}NotAShippedReference` });
    const probe = createValidator();
    expect(() => {
      probe.addSchema(portDoc() as never, PORT_SCHEMA_ID);
      probe.addSchema(broken as never);
      probe.getSchema(SCHEMA_ID);
    }).toThrow();
  });
  it('validates capability_ref against the catalogue id pattern (one authority)', () => {
    const stepProps = prop('steps').items!.properties!;
    const catalogue = registry.getById(CAPABILITY_SCHEMA_ID)!.schema as any;
    expect(stepProps.capability_ref!.pattern).toBe(catalogue.properties.capability_id.pattern);
    const p = plan();
    p.steps[0].capability_ref = 'Not A Capability';
    expect(refusal(p, 'pattern', 'pattern', stepProps.capability_ref!.pattern!).path)
      .toBe('/steps/0/capability_ref');
  });
  it('refuses a parameter provenance outside the declared enum', () => {
    const provenance = prop('parameters').items!.properties!.provenance!;
    const p = plan();
    p.parameters[0].provenance = 'NOT-A-PROVENANCE';
    const found = issues(p).find((i) => i.keyword === 'enum' && i.path === '/parameters/0/provenance');
    expect(found, 'expected enum refusal at /parameters/0/provenance').toBeDefined();
    const allowed = found!.params?.['allowedValues'] as unknown[];
    expect(allowed).not.toContain('NOT-A-PROVENANCE');
    expect(allowed).toContain(provenance.enum![0]);
    expect(allowed.length).toBe((provenance.enum ?? []).length);
  });
  it('keeps assumptions and unresolved_questions as two distinct arrays', () => {
    for (const key of ['assumptions', 'unresolved_questions']) {
      expect(prop(key).type, `${key} is an array`).toBe('array');
      expect(prop(key).items!.type, `${key} items`).toBe('string');
    }
    const p = plan();
    p.open_items = [...p.assumptions, ...p.unresolved_questions];
    delete p.assumptions; delete p.unresolved_questions;
    refusal(p, 'additionalProperties', 'additionalProperty', 'open_items');
    refusal(p, 'required', 'missingProperty', 'assumptions');
    refusal(p, 'required', 'missingProperty', 'unresolved_questions');
  });
});
