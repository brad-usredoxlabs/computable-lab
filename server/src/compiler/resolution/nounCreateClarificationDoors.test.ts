// @vitest-environment node
/**
 * L2-NOUN-CREATION-JOURNEY-1 (unit u1journey) — RED-first pin for the
 * unresolved-material-noun clarification's CREATION DOORS.
 *
 * Scenario canon: test-prompts/creation-journey.md (prompt-1b). The origin
 * sentence "Add 100uL of DMEM to each well." names a material that is NOT a
 * local term; the clarification the compiler emits for that noun must carry
 * the three door ids DECLARED in config/journey/declarations/noun-create.yaml
 * (human_task.controls + alternatives.options[]) — never a list coined in
 * TypeScript, never a second authority.
 *
 * Ruling: .hermes/plans/decisions/NOUN-CREATION-JOURNEY-EXECUTION-l2-20261115.md
 *   "doors are declared journey data, never requirements-engine derivations".
 *
 * The mutation leg below deletes an alternative_id from a COPY of the
 * declaration and requires the emitted door set to follow: that is what makes
 * "read FROM the declaration" a measured fact rather than a claim.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { loadScientistIntentVocabulary } from '../scientistIntent/vocabulary.js';
import { createResolveSpine } from '../../resolve/ResolveSpine.js';
import type { ProviderHit, ResolveProvider } from '../../resolve/types.js';
import {
  createFailureTrackingProvider,
  createSpineAdapter,
  createLabwareHintAdapter,
  createRegistryAdapter,
  createRoleAddressAdapter,
} from './adapters.js';
import { buildStrategyRegistry } from './strategies.js';
import { resolveScientistIntentNouns, UNKNOWN_NOUN_REASON, type EngineDeps } from './resolutionEngine.js';
import { doorsFromJourneyDocument, loadJourneyDeclarationDoors } from '../journey/journeyDeclarationDoors.js';
import type { ScientistIntent } from '../scientistIntent/types.js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const DECLARATION = resolve(ROOT, 'config/journey/declarations/noun-create.yaml');
const CARD = resolve(ROOT, 'app/src/agent/ChatClarificationCard.tsx');

function declaration(): Record<string, any> {
  return parse(readFileSync(DECLARATION, 'utf8')) as Record<string, any>;
}

function declaredIds(doc: Record<string, any>): string[] {
  return ((doc.alternatives as any).options as any[]).map((o) => o.alternative_id);
}

function emptyProvider(): ResolveProvider {
  return async () => [] as ProviderHit[];
}

function deps(): EngineDeps {
  const tracker = { failed: false };
  const spine = createResolveSpine({
    termProvider: createFailureTrackingProvider(emptyProvider(), tracker),
    recordProvider: createFailureTrackingProvider(emptyProvider(), tracker),
    localTimeoutMs: 500,
    remoteTimeoutMs: 500,
  });
  return {
    adapters: [
      createSpineAdapter(spine, tracker),
      createLabwareHintAdapter(async () => []),
      createRegistryAdapter({
        labwareDefinitionRegistry: { findByName: () => undefined },
        compoundClassRegistry: { findByName: () => undefined },
      }),
      createRoleAddressAdapter(),
    ],
    strategies: buildStrategyRegistry(),
  };
}

const ORIGIN: ScientistIntent = {
  intentId: 'creation-journey-prompt-1b',
  actions: [{ action: 'add_material', material: 'DMEM' }],
} as unknown as ScientistIntent;

describe('unresolved material noun -> declared noun-create doors', () => {
  it('emits exactly the three door ids declared in noun-create.yaml', async () => {
    const doc = declaration();
    const outcome = await resolveScientistIntentNouns(ORIGIN, loadScientistIntentVocabulary(), deps());
    const clar = outcome.clarifications.find((c) => c.reason === UNKNOWN_NOUN_REASON);
    expect(clar, 'the unbound material noun must enter the unknown-noun channel').toBeDefined();
    expect(clar!.label).toBe('DMEM');

    const journey = (clar as any).journey as
      | { journeyId: string; checkpointRef: string; doors: Array<{ id: string; surface: string }> }
      | undefined;
    expect(journey, 'the clarification must carry the declared journey doors').toBeDefined();
    expect(journey!.journeyId).toBe('journey-noun-create');
    expect(journey!.checkpointRef).toBe('cp-journey-noun-create');
    expect(journey!.doors.map((d) => d.id)).toEqual(declaredIds(doc));
    expect(journey!.doors.map((d) => d.surface)).toEqual(
      ((doc.alternatives as any).options as any[]).map((o) => o.surface),
    );
    // the noun stays the person's words — a candidate, never a fabricated identity
    expect(journey!.doors.every((d: any) => d.candidateLabel === 'DMEM')).toBe(true);
  });

  it('the door set follows a mutated declaration copy (no TS list exists)', () => {
    const mutated = structuredClone(declaration());
    const options = (mutated.alternatives as any).options as any[];
    options.splice(1, 1); // delete 'local-formulation'
    options[0]!.alternative_id = 'renamed-door';
    // the declaration's own consistency rule: the card's controls name the
    // doors, so a renamed/deleted door is renamed/deleted there too (a
    // document whose controls and alternatives disagree is malformed and is
    // refused — see journeyDeclarationDoors.ts).
    const controls = (mutated.steps as any[])[0].human_task.controls as string[];
    controls.splice(1, 1);
    controls[0] = 'renamed-door';
    const doors = doorsFromJourneyDocument(mutated);
    expect(doors.map((d) => d.id)).toEqual(['renamed-door', 'local-product-or-sample']);
  });

  it('loadJourneyDeclarationDoors reads the shipped declaration, not a literal', () => {
    const doors = loadJourneyDeclarationDoors('journey-noun-create');
    expect(doors.map((d) => d.id)).toEqual(declaredIds(declaration()));
  });

  it('no door-string list exists in the clarification card TSX', () => {
    const tsx = readFileSync(CARD, 'utf8');
    for (const id of declaredIds(declaration())) {
      expect(tsx, `door id "${id}" must not be hardcoded in TSX`).not.toContain(id);
    }
  });
});
