// @vitest-environment node
/**
 * L2-JOURNEY-CAPABILITY-CATALOGUE-1 (u2loader), RED-first: admission owns both
 * Ajv shape validity and handler_ref referential validity. Every rejection names
 * the file, the JSON path and the dangling id. Fixtures are uncommitted strings.
 *
 * L2-NOUN-FROM-DOC-1 (d1gwrite): cases (g)-(k) — a governed_write descriptor is
 * admitted when, and only when, its handler_ref is declared in the sibling
 * registry config/journey/governed-writes.yaml. The registry is DATA (it names
 * the route/handler/store of an existing write path, never code); admission
 * unions its writes[].id values with the caller's known set. An absent registry
 * changes nothing; a broken one is named and admits nothing from itself; the
 * registry is never a wildcard — an id declared nowhere is still refused.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCapabilityCatalogueDir } from './capabilityCatalogue.js';

const SCRATCH = '/home/brad/.jcc-u2-scratch';
const descriptorYaml = (id: string, handlerRef: string, handlerKind = 'query'): string => `
capability_id: ${id}
version: "1.0.0"
display_name: Capability ${id}
justification: No existing capability consumes a sequence set and returns an alignment.
ports:
  input:
  - version: "1.0.0"
    sequence_set_id: SS-1
  output:
  - version: "1.0.0"
    alignment_id: AL-1
implementation:
  handler_kind: ${handlerKind}
  handler_ref: "${handlerRef}"
effects: [read]
permissions: [journey.read]
availability:
  requires_records: [sequence-set]
surfaces: [journey.workspace]
idempotency: pure
retry: automatic
reconciliation: not_required
evidence: [validation_report]
status:
  declared: true
  implemented: true
  available_now: false
  browser_certified: false
`;

const KNOWN = new Set(['compiler.journey.align']);
async function dirWith(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(SCRATCH, 'u2-'));
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, name), body, 'utf8');
  }
  return dir;
}
/** The production layout: config/journey/{capabilities/,governed-writes.yaml}.
 * Returns the capabilities dir; the registry (if given) sits in its PARENT. */
async function dirWithSiblingRegistry(
  capabilityFiles: Record<string, string>,
  registryBody: string | null,
): Promise<string> {
  const parent = await mkdtemp(join(SCRATCH, 'u2-reg-'));
  const dir = join(parent, 'capabilities');
  await mkdir(dir);
  for (const [name, body] of Object.entries(capabilityFiles)) {
    await writeFile(join(dir, name), body, 'utf8');
  }
  if (registryBody !== null) await writeFile(join(parent, 'governed-writes.yaml'), registryBody, 'utf8');
  return dir;
}

const registryYaml = [
  'version: "1.0.0"',
  'writes:',
  '- id: records.create',
  '  route: POST /records',
  '  handler: RecordHandlers.create',
  '  store: RecordStoreImpl',
  '  record_kinds: [material, vendor-product]',
  '  guards: [ajv-schema-validation, lint, ownership-acl]',
  '',
].join('\n');

function diagnosticsOf(result: Awaited<ReturnType<typeof loadCapabilityCatalogueDir>>): string[] {
  if (result.ok) throw new Error(`expected rejection, got ${result.capabilities.length} admitted`);
  return result.diagnostics;
}
beforeAll(async () => { await mkdir(SCRATCH, { recursive: true }); });
afterAll(async () => { await rm(SCRATCH, { recursive: true, force: true }); });

describe('capability catalogue admission', () => {
  it('(a) admits a schema-valid descriptor whose handler_ref is known', async () => {
    const dir = await dirWith({ 'align.yaml': descriptorYaml('journey.align-sequences', 'compiler.journey.align') });
    const result = await loadCapabilityCatalogueDir(dir, KNOWN);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.capabilities.map((c) => c.capability_id)).toEqual(['journey.align-sequences']);
  });

  it('(b) rejects a dangling handler_ref, naming the file and the id verbatim', async () => {
    const dir = await dirWith({ 'dangling.yaml': descriptorYaml('journey.align-sequences', 'compiler.journey.nonexistent') });
    const diagnostics = diagnosticsOf(await loadCapabilityCatalogueDir(dir, KNOWN));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toContain('dangling.yaml');
    expect(diagnostics[0]).toContain('compiler.journey.nonexistent');
  });

  it('(c) rejects a shape violation by Ajv, naming the JSON path', async () => {
    const dir = await dirWith({
      'invented.yaml': descriptorYaml('journey.align-sequences', 'compiler.journey.align', 'invented_kind'),
    });
    const diagnostics = diagnosticsOf(await loadCapabilityCatalogueDir(dir, KNOWN));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toContain('invented.yaml');
    expect(diagnostics[0]).toContain('/implementation/handler_kind');
  });

  it('(d) admits two descriptors in deterministic capability-id order', async () => {
    const dir = await dirWith({
      'beta.yaml': descriptorYaml('journey.beta', 'compiler.journey.align'),
      'alpha.yaml': descriptorYaml('journey.alpha', 'compiler.journey.align'),
    });
    const result = await loadCapabilityCatalogueDir(dir, KNOWN);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.capabilities.map((c) => c.capability_id)).toEqual(['journey.alpha', 'journey.beta']);
  });

  it('(e) rejects unparseable YAML by name without blanking its neighbours', async () => {
    const dir = await dirWith({
      'good.yaml': descriptorYaml('journey.align-sequences', 'compiler.journey.align'),
      'broken.yaml': 'ports: [unclosed\n',
    });
    const result = await loadCapabilityCatalogueDir(dir, KNOWN);
    expect(diagnosticsOf(result)).toHaveLength(1);
    expect(diagnosticsOf(result)[0]).toContain('broken.yaml');
    if (result.ok) throw new Error('expected rejection');
    expect(result.capabilities.map((c) => c.capability_id)).toEqual(['journey.align-sequences']);
  });

  it('(f) orders by capability_id even when filenames invert that order', async () => {
    const dir = await dirWith({
      'zzz.yaml': descriptorYaml('journey.aaa', 'compiler.journey.align'),
      'aaa.yaml': descriptorYaml('journey.zzz', 'compiler.journey.align'),
    });
    const result = await loadCapabilityCatalogueDir(dir, KNOWN);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.capabilities.map((c) => c.capability_id)).toEqual(['journey.aaa', 'journey.zzz']);
  });

  // --- L2-NOUN-FROM-DOC-1 (d1gwrite): the governed-write registry -------------

  it('(g) admits a governed_write descriptor whose handler_ref the sibling registry declares', async () => {
    // Production layout: the registry sits NEXT TO the capability dir, exactly
    // as config/journey/governed-writes.yaml sits to config/journey/capabilities/.
    const dir = await dirWithSiblingRegistry(
      { 'noun-create.yaml': descriptorYaml('journey.noun-create-from-document', 'records.create', 'governed_write') },
      registryYaml,
    );
    const result = await loadCapabilityCatalogueDir(dir, KNOWN);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.capabilities.map((c) => c.capability_id)).toEqual(['journey.noun-create-from-document']);
  });

  it('(h) still refuses a governed_write handler_ref that is in no registry and no agent tool', async () => {
    const dir = await dirWithSiblingRegistry(
      { 'noun-create.yaml': descriptorYaml('journey.noun-create-from-document', 'no.such.write', 'governed_write') },
      registryYaml,
    );
    const diagnostics = diagnosticsOf(await loadCapabilityCatalogueDir(dir, KNOWN));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toContain('noun-create.yaml');
    expect(diagnostics[0]).toContain("unknown handler id 'no.such.write'");
  });

  it('(i) an ABSENT registry changes nothing: an agent_tool descriptor keeps admitting as today', async () => {
    const dir = await dirWith({ 'align.yaml': descriptorYaml('journey.align-sequences', 'compiler.journey.align') });
    const result = await loadCapabilityCatalogueDir(dir, KNOWN);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.capabilities.map((c) => c.capability_id)).toEqual(['journey.align-sequences']);
  });

  it('(j) a registry that does not parse is named and admits nothing from itself', async () => {
    const dir = await dirWithSiblingRegistry(
      { 'noun-create.yaml': descriptorYaml('journey.noun-create-from-document', 'records.create', 'governed_write') },
      'writes: [unclosed\n',
    );
    const diagnostics = diagnosticsOf(await loadCapabilityCatalogueDir(dir, KNOWN));
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0].startsWith('governed-writes.yaml')).toBe(true);
    expect(diagnostics[0]).toContain('could not parse');
    expect(diagnostics[1]).toContain("unknown handler id 'records.create'");
  });

  it('(k) registry entries without an id are named and admit nothing from the registry', async () => {
    const dir = await dirWithSiblingRegistry(
      { 'noun-create.yaml': descriptorYaml('journey.noun-create-from-document', 'records.create', 'governed_write') },
      ['version: "1.0.0"', 'writes:', '- route: POST /records', ''].join('\n'),
    );
    const diagnostics = diagnosticsOf(await loadCapabilityCatalogueDir(dir, KNOWN));
    expect(diagnostics).toHaveLength(2);
    const registryLine = diagnostics.find((line) => line.startsWith('governed-writes.yaml'));
    expect(registryLine).toBeDefined();
    expect(registryLine).toContain('writes[0]/id');
    expect(diagnostics.some((line) => line.includes("unknown handler id 'records.create'"))).toBe(true);
  });
});
