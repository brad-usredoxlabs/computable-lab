// @vitest-environment node
/** s2polauth: AC1 records a caller decision without mutating the input; AC2 an
 * unchanged decision stays valid; AC3 a changed disposition flips both ways;
 * AC4 a missing record is refused; AC5 the product stays pure. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { compileJourneyStructure } from './journeyCompiler.js';
import type { CapabilityDescriptor } from './capabilityCatalogue.js';
import type { PolicyActionDecision } from '../../policy/types.js';
import {
  compileJourneyEnvelope, recordEnvelopeAuthorization, checkEnvelopeAuthorization,
  RULE_ENVELOPE_AUTHORIZATION_FLIPPED, RULE_ENVELOPE_AUTHORIZATION_MISSING,
} from './journeyEnvelope.js';

const CATALOGUE: CapabilityDescriptor[] = [
  { capability_id: 'transfer', implementation: { handler_kind: 'builtin', handler_ref: 'transfer' }, version: '1.0.0' },
  { capability_id: 'measure', implementation: { handler_kind: 'builtin', handler_ref: 'measure' }, version: '1.0.0' },
];
const ALLOWED: PolicyActionDecision = {
  action: 'auto-create', target: 'journey-compiler-fixture/transfer',
  disposition: 'allowed', authority: 'project-owner', settingKey: 'allowAutoCreate',
  origin: { profileId: 'run-override', scope: 'run', scopeId: 'run-1', priority: 10 },
  rationale: 'run scope allows auto-create',
};
const BLOCKED: PolicyActionDecision = { ...ALLOWED, disposition: 'blocked' };
const CONFIRM: PolicyActionDecision = { ...ALLOWED, disposition: 'needs-confirmation' };
function compiledEnvelope() {
  const document = {
    journey_id: 'journey-compiler-fixture', revision: 1,
    authoring_actor: { actor_kind: 'person', actor_id: 'operator-1' },
    request_anchor: { message_id: 'msg-1', verbatim_text: 'transfer the samples' },
    objective: 'transfer the samples', completion_contract: ['the transfer record is committed'],
    parameters: [],
    steps: [{ id: 'transfer', capability_ref: 'transfer', input_ports: [], interaction_mode: 'automatic', output_ports: [] }],
    alternatives: { options: [{ alternative_id: 'alt-a', summary: 'a single declared option' }], selection_authority: 'user' },
    return_contract: { checkpoint_ref: 'cp-1', permitted_result_types: ['completed'], require_explicit_resume: true },
    assumptions: [], unresolved_questions: [],
  };
  const compiled = compileJourneyStructure(document, CATALOGUE);
  if (!compiled.ok) throw new Error('fixture refused at stage 1');
  const result = compileJourneyEnvelope(compiled.manifest, document, 'transfer', []);
  if (!result.ok) throw new Error('fixture refused at stage 2');
  return { manifest: compiled.manifest, envelope: result.envelope };
}
const flipOf = (recorded: ReturnType<typeof compiledEnvelope>['envelope'], decision: PolicyActionDecision) => {
  const checked = checkEnvelopeAuthorization(recorded, decision);
  if (checked.valid) throw new Error('expected the authorization to flip');
  expect(checked.diagnostics).toHaveLength(1);
  expect(checked.diagnostics[0]!.rule).toBe(RULE_ENVELOPE_AUTHORIZATION_FLIPPED);
  return checked.diagnostics[0]!.message;
};

describe('journey envelope authorization', () => {
  it('AC1: records a caller-supplied decision without mutating the input', () => {
    const { manifest, envelope } = compiledEnvelope();
    expect(manifest.not_ready).toEqual([]);
    expect(manifest.steps[0]!.status).toBe('READY');
    expect(envelope.step_id).toBe('transfer');
    expect(envelope.bindings).toEqual([]);
    const recorded = recordEnvelopeAuthorization(envelope, ALLOWED);
    expect(recorded).not.toBe(envelope);
    expect(envelope.authorization).toBeUndefined();
    expect(recorded.authorization).toMatchObject({
      disposition: 'allowed', setting_key: 'allowAutoCreate', origin_profile_id: 'run-override',
    });
    expect(recorded.bindings).toEqual(envelope.bindings);
    expect(recorded.bindings).toBe(envelope.bindings);
  });
  it('AC2: an unchanged decision leaves the recorded authorization valid', () => {
    const { envelope } = compiledEnvelope();
    expect(checkEnvelopeAuthorization(recordEnvelopeAuthorization(envelope, ALLOWED), ALLOWED)).toEqual({ valid: true });
  });
  it('AC3: allowed->blocked flips and names both dispositions and origins', () => {
    const { envelope } = compiledEnvelope();
    const message = flipOf(recordEnvelopeAuthorization(envelope, ALLOWED), BLOCKED);
    expect(message).toContain('allowed');
    expect(message).toContain('blocked');
    expect(message).toContain('run-override');
  });
  it('AC3: allowed->needs-confirmation also flips (a comparison, not deny-only)', () => {
    const { envelope } = compiledEnvelope();
    const message = flipOf(recordEnvelopeAuthorization(envelope, ALLOWED), CONFIRM);
    expect(message).toContain('allowed');
    expect(message).toContain('needs-confirmation');
  });
  it('AC4: an envelope with no recorded authorization is refused as missing', () => {
    const { envelope } = compiledEnvelope();
    expect(envelope.authorization).toBeUndefined();
    const checked = checkEnvelopeAuthorization(envelope, ALLOWED);
    expect(checked.valid).toBe(false);
    if (checked.valid) throw new Error('a missing authorization may not read as permission');
    expect(checked.diagnostics).toHaveLength(1);
    expect(checked.diagnostics[0]!.rule).toBe(RULE_ENVELOPE_AUTHORIZATION_MISSING);
    expect(checked.diagnostics[0]!.step_id).toBe('transfer');
  });
  it('AC5: the product module holds no second authority and no disposition table', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'journeyEnvelope.ts'), 'utf8');
    expect(source).not.toContain('PolicyProfileService');
    expect(source).not.toContain('evaluateActions');
    expect(source).not.toContain('resolveActiveProfile');
    expect(source).not.toContain('needs-confirmation');
    expect(source).not.toMatch(/switch\s*\(/);
  });
});
