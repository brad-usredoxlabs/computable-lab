// @vitest-environment node
/**
 * L2-JOURNEY-FALSIFY-1 (unit hidesjourney), RED-first: a capability that
 * declares two or more mutating effects is refused by catalogue admission
 * with the named diagnostic journey_capability_hides_journey. The mutating
 * set is declared in the descriptor schema's allOf and never in TS; the
 * planted handler resolves from the sibling registry, so the ONLY thing
 * wrong with the planted descriptor is that one capability does two steps.
 *
 * Non-refusal pins (the rule must refuse nothing that exists): one mutating
 * effect still admits; two non-mutating effects still admit; the REAL shipped
 * catalogue still admits, loaded with the agent-tool set exactly as
 * labwareDefinitionJourney.test.ts:37 loads it — no hardcoded id list here
 * (a second copy would be a second authority).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCapabilityCatalogueDir } from './capabilityCatalogue.js';
import { AGENT_ALLOWED_TOOLS } from '../../ai/ToolBridge.js';

const SCRATCH = '/home/brad/.falsify-hidesjourney-scratch/vitest';
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const CAPABILITIES_DIR = resolve(ROOT, 'config/journey/capabilities');
const KNOWN = new Set(['compiler.journey.align']);

const descriptorYaml = (id: string, handlerRef: string, handlerKind: string, effects: string): string => `
capability_id: ${id}
version: "1.0.0"
display_name: Capability ${id}
justification: Planted fixture for the journey-hiding gate; only the effects line varies.
ports:
  input:
  - version: "1.0.0"
    sequence_set_id: SS-1
  output: []
implementation:
  handler_kind: ${handlerKind}
  handler_ref: "${handlerRef}"
effects: ${effects}
permissions: [journey.read]
availability: {}
surfaces: []
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

const registryYaml = [
  'version: "1.0.0"',
  'writes:',
  '- id: records.create',
  '  route: POST /records',
  '  store: RecordStoreImpl',
  '',
].join('\n');

/** The production layout: capabilities/ dir + sibling governed-writes.yaml. */
async function dirWithSiblingRegistry(
  capabilityFiles: Record<string, string>,
  registryBody: string,
): Promise<string> {
  const parent = await mkdtemp(join(SCRATCH, 'jh-'));
  const dir = join(parent, 'capabilities');
  await mkdir(dir);
  for (const [name, body] of Object.entries(capabilityFiles)) await writeFile(join(dir, name), body, 'utf8');
  await writeFile(join(parent, 'governed-writes.yaml'), registryBody, 'utf8');
  return dir;
}

beforeAll(async () => { await mkdir(SCRATCH, { recursive: true }); });
afterAll(async () => { await rm(SCRATCH, { recursive: true, force: true }); });

describe('journey-hiding refusal (one capability must not carry two steps)', () => {
  it('refuses a descriptor declaring two mutating effects with the named diagnostic', async () => {
    const dir = await dirWithSiblingRegistry(
      { 'planted.yaml': descriptorYaml('journey.planted-two-steps', 'records.create', 'governed_write', '[domain_mutation, compute_submission]') },
      registryYaml,
    );
    const result = await loadCapabilityCatalogueDir(dir, KNOWN);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('planted descriptor was admitted');
    expect(result.capabilities).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toContain('planted.yaml');
    expect(result.diagnostics[0]).toContain('journey_capability_hides_journey');
  });

  it('still admits one mutating effect (no false refusal)', async () => {
    const dir = await dirWithSiblingRegistry(
      { 'single.yaml': descriptorYaml('journey.single-mutation', 'records.create', 'governed_write', '[domain_mutation]') },
      registryYaml,
    );
    const result = await loadCapabilityCatalogueDir(dir, KNOWN);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.capabilities.map((c) => c.capability_id)).toEqual(['journey.single-mutation']);
  });

  it('still admits two non-mutating effects ([read, external_disclosure])', async () => {
    const dir = await dirWithSiblingRegistry(
      { 'disclosure.yaml': descriptorYaml('journey.read-and-disclose', 'compiler.journey.align', 'query', '[read, external_disclosure]') },
      registryYaml,
    );
    const result = await loadCapabilityCatalogueDir(dir, KNOWN);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.capabilities.map((c) => c.capability_id)).toEqual(['journey.read-and-disclose']);
  });

  it('the real shipped catalogue still admits (loaded as labwareDefinitionJourney.test.ts loads it)', async () => {
    const result = await loadCapabilityCatalogueDir(CAPABILITIES_DIR, new Set(AGENT_ALLOWED_TOOLS));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.capabilities.length).toBeGreaterThan(0);
  });
});
