// @vitest-environment node
/**
 * L2-JOURNEY-CAPABILITY-CATALOGUE-1 (unit u4seed): the seeded descriptors under
 * config/journey/capabilities/ are admitted by the EXISTING admission function
 * (capabilityCatalogue.ts, unit u2loader) against the SHIPPED handler registry.
 * No cap-id literals here: ids come from the files. The known-handler set is
 * derived from AGENT_ALLOWED_TOOLS, never restated — a literal list would be the
 * second authority the item forbids. The only handler-id literal allowed is the
 * NEGATIVE fixture's, and it must be absent from the registry.
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

const SEED_DIR = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../config/journey/capabilities',
);

/** Empty directory (or absent one) is an empty catalogue, not a test error. */
async function loadSeeded(): Promise<Array<{ file: string; doc: unknown }>> {
  let names: string[];
  try {
    names = (await readdir(SEED_DIR)).filter((name) => name.endsWith('.yaml')).sort();
  } catch {
    return [];
  }
  return Promise.all(
    names.map(async (file) => ({ file, doc: parseYaml(await readFile(join(SEED_DIR, file), 'utf8')) })),
  );
}

const knownHandlerIds: ReadonlySet<string> = new Set(AGENT_ALLOWED_TOOLS);
const seeded = await loadSeeded();
const ids = seeded
  .map(({ doc }) => (doc as CapabilityDescriptor).capability_id)
  .sort();

describe('seeded journey capability catalogue (real data, shipped registry)', () => {
  it('admits all four seeded descriptors', async () => {
    const result = await admitCapabilityCatalogue(seeded, knownHandlerIds);
    console.log('admitted ids:', JSON.stringify(result.ok ? result.capabilities.map((c) => c.capability_id) : []));
    expect(result.ok ? [] : result.diagnostics).toEqual([]);
    expect(result.capabilities).toHaveLength(4);
    // Ids are unique and derived from the files, not from a list here.
    expect(new Set(ids).size).toBe(4);
    expect(result.capabilities.map((c) => c.capability_id)).toEqual(ids);
    for (const id of ids) expect(id).toMatch(/^journey\.[a-z][a-z0-9-]*$/);
  });

  it('binds every seeded descriptor to a shipped agent tool', async () => {
    const result = await admitCapabilityCatalogue(seeded, knownHandlerIds);
    expect(result.capabilities).toHaveLength(4);
    for (const capability of result.capabilities) {
      expect(AGENT_ALLOWED_TOOLS).toContain(capability.implementation.handler_ref);
      expect(capability.implementation.handler_kind).toBe('agent_tool');
    }
    console.log(
      'handler refs:',
      JSON.stringify(result.capabilities.map((c) => c.implementation.handler_ref)),
    );
  });

  it('rejects a fifth candidate whose handler_ref is absent, naming the dangling id', async () => {
    const base = seeded[0];
    expect(base).toBeDefined();
    // Cloned in memory on purpose: a fifth committed file would be data nobody wants.
    const candidate = structuredClone(base.doc) as CapabilityDescriptor;
    candidate.implementation.handler_ref = 'ncbi_nucleotide_search';
    const result = await admitCapabilityCatalogue(
      [...seeded, { file: 'dangling-candidate.yaml', doc: candidate }],
      knownHandlerIds,
    );
    expect(result.ok).toBe(false);
    expect(result.diagnostics.join('\n')).toContain('ncbi_nucleotide_search');
    // The four real ones survive; nothing from the candidate is admitted.
    expect(result.capabilities).toHaveLength(4);
    expect(result.capabilities.map((c) => c.capability_id)).toEqual(ids);
    console.log('negative diagnostic:', JSON.stringify(result.diagnostics));
  });
});
