// @vitest-environment node
/**
 * L2-JOURNEY-FALSIFY-1 (unit falsify-compose) — the abstraction falsification
 * gate: the minimal genomics journey (JOURNEY-GENOMICS-MIN-1) linted against
 * the REAL shipped capability catalogue (config/journey/capabilities) and the
 * REAL work-surface registry (loadDefaultSurfacesRegistry) — no fixtures.
 *
 * Terminal state pinned: REFUSED. The committed declaration carries only
 * catalogue-existing refs and lints clean; the planted variant reactivates the
 * unservable beats with the ids the report names and asserts
 * journey_capability_not_in_catalogue for exactly them. The catalogue id set
 * itself is pinned (8 ids, sorted): a future capability addition must update
 * PINNED_CATALOGUE_IDS deliberately.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { beforeAll, describe, expect, it } from 'vitest';
import { lintJourneyDocument, RULE_CAPABILITY_NOT_IN_CATALOGUE } from './journeyDocumentLint.js';
import { loadCapabilityCatalogueDir, type CapabilityDescriptor } from './capabilityCatalogue.js';
import { loadDefaultSurfacesRegistry } from '../../surfaces/surfaces.js';
import { AGENT_ALLOWED_TOOLS } from '../../ai/ToolBridge.js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const DECLARATION = resolve(ROOT, 'config/journey/declarations/journey-genomics-min.yaml');
const CAPABILITIES_DIR = resolve(ROOT, 'config/journey/capabilities');
const SCHEMA_DIR = resolve(ROOT, 'schema');

// The 8 shipped capability ids, sorted — the "capability set unchanged" pin.
const PINNED_CATALOGUE_IDS = [
  'journey.labware-definition-create',
  'journey.labware-instance-place',
  'journey.material-create',
  'journey.material-library-search',
  'journey.ncbi-gene-search',
  'journey.noun-create-from-document',
  'journey.ontology-lookup',
  'journey.vendor-web-search',
];
// Every capability the composition needs and the catalogue does not supply:
// the ids the report names (F1-F4). The planted document below is refused on
// exactly these — a journey-hiding or invented id must never lint green.
const MISSING: Array<{ step_id: string; capability_ref: string }> = [
  { step_id: 'nucleotide-search', capability_ref: 'journey.ncbi-nucleotide-search' },
  { step_id: 'retain-candidates', capability_ref: 'journey.sequence-candidate-record' },
  { step_id: 'select-candidates', capability_ref: 'journey.sequence-collection-create' },
  { step_id: 'run-mafft', capability_ref: 'journey.sequence-alignment-run' },
];

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

describe('genomics-min falsification gate (data, linted against real registries)', () => {
  it('pins the real catalogue id set (8 ids, sorted) — capability set unchanged', () => {
    expect(catalogue.map((c) => c.capability_id).sort()).toEqual(PINNED_CATALOGUE_IDS);
  });

  it('pins journey_id and revision', () => {
    const doc = loadDeclaration();
    expect(doc.journey_id).toBe('journey-genomics-min');
    expect(doc.revision).toBe(1);
  });

  it('consumes exactly one catalogue capability: journey.ontology-lookup', () => {
    const doc = loadDeclaration();
    expect((doc.steps as any[]).map((s) => s.capability_ref)).toEqual(['journey.ontology-lookup']);
  });

  it('lints clean against the real catalogue and the real work-surface registry', () => {
    const result = lintJourneyDocument(loadDeclaration(), catalogue, surfaces);
    expect(result.diagnostics).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // REFUSED terminal state: reactivating the unservable beats with the ids the
  // report names must yield journey_capability_not_in_catalogue for exactly them.
  it('refuses every unservable beat with exactly the named ids', () => {
    const doc = JSON.parse(JSON.stringify(loadDeclaration()));
    for (const { step_id, capability_ref } of MISSING) {
      doc.steps.push({ id: step_id, capability_ref, input_ports: [], output_ports: [], interaction_mode: 'automatic' });
    }
    // F3 is a human task; give it a registry-valid contract so ONLY the
    // capability refusals fire (surface 'sequences' permits kind 'sequence').
    const human = doc.steps.find((s: any) => s.id === 'select-candidates');
    human.interaction_mode = 'human_in_the_loop';
    human.human_task = {
      decision: 'select the candidate sequences to commit',
      surface: 'sequences',
      controls: ['sequence-candidate-list'],
      selectable_kinds: ['sequence'],
      completion: { kind: 'versioned_selection', receipt_required: true },
      output_port: { version: 'v1', record_id: 'COLLECTION-SELECTED', record_type: 'sequence-collection', receipt_id: 'RCPT-COLLECTION-SELECTED' },
      on_cancel: 'keep_journey_active',
      on_defer: 'keep_journey_active',
    };
    const result = lintJourneyDocument(doc, catalogue, surfaces);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.rule).sort()).toEqual([
      RULE_CAPABILITY_NOT_IN_CATALOGUE, RULE_CAPABILITY_NOT_IN_CATALOGUE,
      RULE_CAPABILITY_NOT_IN_CATALOGUE, RULE_CAPABILITY_NOT_IN_CATALOGUE,
    ]);
    expect(result.diagnostics.map((d) => d.step_id).sort()).toEqual(MISSING.map((m) => m.step_id).sort());
    for (const { capability_ref } of MISSING) {
      expect(result.diagnostics.some((d) => d.message.includes(`'${capability_ref}'`)), `refusal must name ${capability_ref}`).toBe(true);
    }
  });
});
