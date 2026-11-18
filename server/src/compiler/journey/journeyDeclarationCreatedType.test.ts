// @vitest-environment node
/**
 * journeyDeclarationCreatedType.test.ts — L2-NOUN-CREATION-JOURNEY-1
 * (unit u1journey cycle-3, advc c2 D2).
 *
 * The record type a door's create surface receives is DECLARED
 * (`steps[].human_task.output_port.record_type` in
 * config/journey/declarations/noun-create.yaml). The server projection must
 * carry it to the clarification; a declaration that names none must carry NO
 * type (the client then emits no route — fail closed).
 *
 * Every expectation here is compared against the SHIPPED document's own value,
 * never a literal, so a declaration edit moves the pin with it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import {
  journeyRefFromDocument,
  nounCreateJourneyForCandidate,
} from './journeyDeclarationDoors.js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const DECLARATION = resolve(ROOT, 'config/journey/declarations/noun-create.yaml');

function loadDeclaration(): Record<string, any> {
  return parse(readFileSync(DECLARATION, 'utf8')) as Record<string, any>;
}

/** The declared output type read straight from the document (the authority). */
function declaredCreatedType(doc: Record<string, any>): string {
  const step = (doc.steps as any[]).find((s) => s?.human_task?.output_port?.record_type !== undefined);
  return String(step.human_task.output_port.record_type);
}

describe('journey declaration — created record type is projected from the document (D2)', () => {
  it('projects human_task.output_port.record_type as `createdType`', () => {
    const doc = loadDeclaration();
    const expected = declaredCreatedType(doc);
    expect(expected.length).toBeGreaterThan(0);
    expect(journeyRefFromDocument(doc).createdType).toBe(expected);
  });

  it('follows a mutated declaration copy (no TypeScript default exists)', () => {
    const mutated = structuredClone(loadDeclaration());
    const humanStep = (mutated.steps as any[]).find((s) => s?.human_task?.output_port);
    humanStep.human_task.output_port.record_type = 'labware';
    expect(journeyRefFromDocument(mutated).createdType).toBe('labware');
  });

  it('carries NO createdType when the declaration names none (fail closed)', () => {
    const mutated = structuredClone(loadDeclaration());
    for (const step of mutated.steps as any[]) {
      if (step?.human_task?.output_port) delete step.human_task.output_port.record_type;
    }
    const ref = journeyRefFromDocument(mutated);
    expect('createdType' in ref).toBe(false);
  });

  it('the clarification journey carries the declared type to the wire projection', () => {
    const doc = loadDeclaration();
    const journey = nounCreateJourneyForCandidate('DMEM');
    expect(journey).toBeDefined();
    expect(journey!.createdType).toBe(declaredCreatedType(doc));
    expect(journey!.candidateLabel).toBe('DMEM');
  });
});
