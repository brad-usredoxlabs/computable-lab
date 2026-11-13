// @vitest-environment node
/**
 * L2-JOURNEY-LABWARE-DEF-1 (unit u2a/u2adecl) — pins the Pilot-A
 * labware-definition journey, AUTHORED AS DATA
 * (config/journey/declarations/labware-definition.yaml).
 *
 * The declaration is linted against the REAL shipped capability catalogue
 * (config/journey/capabilities) and the REAL work-surface registry
 * (schema/registry/surfaces/surfaces.yaml via loadDefaultSurfacesRegistry) —
 * no fixtures. A later change to the declaration, the catalogue, or the
 * registry fails loudly here.
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
const DECLARATION = resolve(ROOT, 'config/journey/declarations/labware-definition.yaml');
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

describe('labware-definition journey declaration (data, linted against real registries)', () => {
  it('pins journey_id and revision', () => {
    const doc = loadDeclaration();
    expect(doc.journey_id).toBe('journey-labware-definition');
    expect(doc.revision).toBe(1);
  });

  it('pins a human_in_the_loop step whose human_task.surface is record-create', () => {
    const doc = loadDeclaration();
    const step = doc.steps.find((s: any) => s.interaction_mode === 'human_in_the_loop');
    expect(step, 'a human_in_the_loop step must be declared').toBeDefined();
    expect(step.human_task?.surface).toBe('record-create');
  });

  it('pins an unresolved_questions entry naming placement', () => {
    const doc = loadDeclaration();
    const placement = (doc.unresolved_questions as string[]).find((q) => /place[- ]?instance|placement/i.test(q));
    expect(placement, 'an unresolved_questions entry must name placement').toBeDefined();
  });

  it('uses only capability_refs admitted by the real catalogue', () => {
    const doc = loadDeclaration();
    const admitted = new Set(catalogue.map((c) => c.capability_id));
    for (const step of doc.steps as any[]) {
      expect(admitted.has(step.capability_ref), `capability_ref '${step.capability_ref}' must be in the real catalogue`).toBe(true);
    }
  });

  it('lints clean against the real catalogue and the real work-surface registry', () => {
    const doc = loadDeclaration();
    const result = lintJourneyDocument(doc, catalogue, surfaces);
    // Fails today with journey_human_task_surface_unknown: 'record-create' is
    // declared in config/ui/surfaces.yaml but not in the work-surface registry.
    expect(result.diagnostics).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // u2adefwire pins: the declaration is wired to the admitted governed writes.
  it('pins the u2adefwire capability_refs: complete-definition is the governed write and place-instance is its consumer', () => {
    const doc = loadDeclaration();
    const byId = new Map((doc.steps as any[]).map((s) => [s.id, s]));
    const complete = byId.get('complete-definition');
    expect(complete, 'a complete-definition step must be declared').toBeDefined();
    expect(complete.capability_ref).toBe('journey.labware-definition-create');
    const place = byId.get('place-instance');
    expect(place, 'a place-instance step must be declared').toBeDefined();
    expect(place.capability_ref).toBe('journey.labware-instance-place');
  });

  it('pins the definition-id seam: complete-definition output_ports[0] is the same LabwareDefinitionReference as place-instance input_ports[0]', () => {
    const doc = loadDeclaration();
    const byId = new Map((doc.steps as any[]).map((s) => [s.id, s]));
    const producerPort = (byId.get('complete-definition') as any).output_ports?.[0];
    const consumerPort = (byId.get('place-instance') as any).input_ports?.[0];
    expect(producerPort, 'complete-definition must declare an output port at index 0').toBeDefined();
    expect(consumerPort, 'place-instance must declare an input port at index 0').toBeDefined();
    expect(producerPort.labware_definition_id).toBeTruthy();
    expect(consumerPort.labware_definition_id).toBeTruthy();
    // The same definition id at both ends of the seam — identity is the seam.
    expect(consumerPort.labware_definition_id).toBe(producerPort.labware_definition_id);
  });

  it('lints clean against the catalogue alone (no surfaces registry, so the human-task rules do not run)', () => {
    const doc = loadDeclaration();
    const result = lintJourneyDocument(doc, catalogue);
    expect(result.diagnostics).toEqual([]);
  });
});
