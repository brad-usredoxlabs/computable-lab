// @vitest-environment node
/**
 * L2-JOURNEY-NOUN-CREATE-1 (unit nounjourney) — pins the noun-creation journey,
 * AUTHORED AS DATA (config/journey/declarations/noun-create.yaml).
 *
 * The declaration is linted against the REAL shipped capability catalogue
 * (config/journey/capabilities) and the REAL work-surface registry
 * (schema/registry/surfaces/surfaces.yaml via loadDefaultSurfacesRegistry) —
 * no fixtures. A later change to the declaration, the catalogue, or the
 * registry fails loudly here.
 *
 * Scenario canon: /mnt/vast/home/brad/git/computable-lab/test-prompts/creation-journey.md
 * (the creation half of scenario 1's entry; it has no corpus-manifest id, so the
 * message_id names creation-journey rather than inventing an id).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { beforeAll, describe, expect, it } from 'vitest';
import { lintJourneyDocument } from './journeyDocumentLint.js';
import { loadCapabilityCatalogueDir, type CapabilityDescriptor } from './capabilityCatalogue.js';
import { loadDefaultSurfacesRegistry } from '../../surfaces/surfaces.js';
import { AGENT_ALLOWED_TOOLS } from '../../ai/ToolBridge.js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const DECLARATION = resolve(ROOT, 'config/journey/declarations/noun-create.yaml');
const CAPABILITIES_DIR = resolve(ROOT, 'config/journey/capabilities');
const SCHEMA_DIR = resolve(ROOT, 'schema');

// Real registries — no fixtures. The work-surface registry is the lint's authority.
const surfaces = loadDefaultSurfacesRegistry(SCHEMA_DIR);
let catalogue!: CapabilityDescriptor[];

function loadDeclaration(): Record<string, any> {
  return parse(readFileSync(DECLARATION, 'utf8')) as Record<string, any>;
}

beforeAll(async () => {
  const result = await loadCapabilityCatalogueDir(CAPABILITIES_DIR, new Set(AGENT_ALLOWED_TOOLS));
  if (!result.ok) throw new Error(`real capability catalogue not ok: ${result.diagnostics.join('; ')}`);
  catalogue = result.capabilities;
});

describe('noun-create journey declaration (data, linted against real registries)', () => {
  it('pins journey_id and revision', () => {
    const doc = loadDeclaration();
    expect(doc.journey_id).toBe('journey-noun-create');
    expect(doc.revision).toBe(1);
  });

  it('pins exactly ONE human_in_the_loop step whose human_task declares the alternatives', () => {
    const doc = loadDeclaration();
    const humanSteps = (doc.steps as any[]).filter((s) => s.interaction_mode === 'human_in_the_loop');
    expect(humanSteps, 'exactly one human_in_the_loop step must be declared').toHaveLength(1);
    const task = humanSteps[0].human_task;
    expect(task, 'the human step must declare a human_task contract').toBeDefined();
    expect(task.surface, 'the human task must declare a work surface').toBeTruthy();
    expect(task.decision, 'the human task must declare the decision').toBeTruthy();
  });

  it('pins the three canon alternatives on the card: vendor/ontology, local formulation, local product or sample', () => {
    const doc = loadDeclaration();
    const options = (doc.alternatives as any).options as any[];
    expect(options, 'alternatives.options must be declared').toHaveLength(3);
    const ids = options.map((o) => o.alternative_id);
    expect(ids).toEqual([
      'add-from-vendor-or-ontology', // canon Button 1
      'local-formulation', // canon Button 2
      'local-product-or-sample', // canon Button 3
    ]);
    for (const option of options) expect(option.summary, 'every alternative must carry a summary').toBeTruthy();
  });

  it('lints clean against the real catalogue and the real work-surface registry', () => {
    const doc = loadDeclaration();
    const result = lintJourneyDocument(doc, catalogue, surfaces);
    expect(result.diagnostics).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('preserves the canon sentence verbatim in the request anchor', () => {
    const doc = loadDeclaration();
    expect(doc.request_anchor.message_id).toContain('creation-journey');
    // /mnt/vast/home/brad/git/computable-lab/test-prompts/creation-journey.md:6,
    // after the "User prompt:" label — the double space before the parenthetical
    // is part of the canon sentence and must survive verbatim.
    expect(doc.request_anchor.verbatim_text).toBe(
      'Add 100uL of DMEM to each well.  (DMEM is not yet a locally saved term in this scenario)',
    );
  });

  it('pins the unresolved noun as a declared unresolved parameter', () => {
    const doc = loadDeclaration();
    const noun = (doc.parameters as any[]).find((p) => p.name === 'material-noun');
    expect(noun, 'the noun must be a declared parameter').toBeDefined();
    expect(noun.provenance).toBe('user-supplied');
    expect(noun.status).toBe('unresolved');
    expect(noun.value, 'an unresolved parameter carries no value').toBeUndefined();
  });
});
