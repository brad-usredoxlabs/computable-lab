// @vitest-environment node
/**
 * L2-JOURNEY-CAPABILITY-CATALOGUE-1 (unit u4seed): the seeded descriptors under
 * config/journey/capabilities/ are admitted by the EXISTING admission function
 * (capabilityCatalogue.ts, unit u2loader) against the SHIPPED handler registry.
 * No cap-id literals here: ids come from the files. The known-handler set is
 * derived from AGENT_ALLOWED_TOOLS plus the governed-write registry
 * (config/journey/governed-writes.yaml, L2-NOUN-FROM-DOC-1 d1gwrite) — never
 * restated, because a literal list would be the second authority the item
 * forbids. The only handler-id literal allowed is the NEGATIVE fixture's, and
 * it must be absent from every registry.
 */
import { describe, it, expect } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { AGENT_ALLOWED_TOOLS } from '../../ai/ToolBridge.js';
import {
  admitCapabilityCatalogue,
  type CapabilityDescriptor,
} from './capabilityCatalogue.js';

const CAPABILITIES_DIR = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../config/journey/capabilities',
);
const REGISTRY_FILE = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../config/journey/governed-writes.yaml',
);

/** The registry is DATA, not code: its write ids are read from the YAML. */
async function loadRegistryIds(): Promise<ReadonlySet<string>> {
  try {
    const doc = parseYaml(await readFile(REGISTRY_FILE, 'utf8')) as
      | { writes?: Array<{ id?: string }> }
      | null;
    const entries = doc?.writes ?? [];
    return new Set(entries.filter((entry) => typeof entry?.id === 'string').map((entry) => entry.id as string));
  } catch {
    return new Set(); // absent registry: agent tools alone, exactly as before.
  }
}

/** Empty directory (or absent one) is an empty catalogue, not a test error. */
async function loadSeeded(dir: string): Promise<Array<{ file: string; doc: unknown }>> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith('.yaml')).sort();
  } catch {
    return [];
  }
  return Promise.all(
    names.map(async (file) => ({ file, doc: parseYaml(await readFile(join(dir, file), 'utf8')) })),
  );
}

const registryIds: ReadonlySet<string> = await loadRegistryIds();
const knownHandlerIds: ReadonlySet<string> = new Set([...AGENT_ALLOWED_TOOLS, ...registryIds]);
const seeded = await loadSeeded(CAPABILITIES_DIR);
const ids = seeded
  .map(({ doc }) => (doc as CapabilityDescriptor).capability_id)
  .sort();

describe('seeded journey capability catalogue (real data, shipped registry)', () => {
  it('admits every seeded descriptor', async () => {
    const result = await admitCapabilityCatalogue(seeded, knownHandlerIds);
    console.log('admitted ids:', JSON.stringify(result.ok ? result.capabilities.map((c) => c.capability_id) : []));
    expect(result.ok ? [] : result.diagnostics).toEqual([]);
    expect(result.capabilities).toHaveLength(seeded.length);
    // Ids are unique and derived from the files, not from a list here.
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.capabilities.map((c) => c.capability_id)).toEqual(ids);
    for (const id of ids) expect(id).toMatch(/^journey\.[a-z][a-z0-9-]*$/);
  });

  it('binds agent_tool descriptors to shipped tools and governed_write to the registry', async () => {
    const result = await admitCapabilityCatalogue(seeded, knownHandlerIds);
    expect(result.ok).toBe(true);
    expect(result.capabilities).toHaveLength(seeded.length);
    let agentToolCount = 0;
    for (const capability of result.capabilities) {
      const { handler_kind, handler_ref } = capability.implementation;
      if (handler_kind === 'governed_write') {
        // A domain mutation admits only through a declared registry entry.
        expect(registryIds.has(handler_ref)).toBe(true);
        continue;
      }
      expect(handler_kind).toBe('agent_tool');
      expect(AGENT_ALLOWED_TOOLS).toContain(handler_ref);
      agentToolCount += 1;
    }
    // The four seeded read-only descriptors keep their agent-tool binding.
    expect(agentToolCount).toBeGreaterThanOrEqual(4);
    console.log(
      'handler refs:',
      JSON.stringify(result.capabilities.map((c) => c.implementation.handler_ref)),
    );
  });

  it('rejects a candidate whose handler_ref is absent from every registry, naming the dangling id', async () => {
    // Clone a READ-ONLY descriptor in memory on purpose: a fifth-plus-one
    // committed file would be data nobody wants.
    const base = seeded.find(
      ({ doc }) => (doc as CapabilityDescriptor).implementation.handler_kind !== 'governed_write',
    );
    if (!base) throw new Error('expected at least one read-only seeded descriptor');
    const candidate = structuredClone(base.doc) as CapabilityDescriptor;
    // u1nucsearch moved the set deliberately (8 -> 9): 'ncbi_nucleotide_search'
    // is now admitted by the allowlist, so the dangling fixture must be a
    // handler id absent from EVERY registry — ncbi_protein_search is the
    // sibling tool that is registered (ncbiTools.ts:154) but NOT agent-allowed.
    candidate.implementation.handler_ref = 'ncbi_protein_search';
    const result = await admitCapabilityCatalogue(
      [...seeded, { file: 'dangling-candidate.yaml', doc: candidate }],
      knownHandlerIds,
    );
    if (result.ok) throw new Error(`expected rejection, got ${result.capabilities.length} admitted`);
    expect(result.diagnostics.join('\n')).toContain('ncbi_protein_search');
    // The real ones survive; nothing from the candidate is admitted.
    expect(result.capabilities).toHaveLength(seeded.length);
    expect(result.capabilities.map((c) => c.capability_id)).toEqual(ids);
    console.log('negative diagnostic:', JSON.stringify(result.diagnostics));
  });
});
