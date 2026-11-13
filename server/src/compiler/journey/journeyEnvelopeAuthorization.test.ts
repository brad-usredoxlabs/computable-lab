// @vitest-environment node
/**
 * L2-JOURNEY-COMPILER-1 (unit s2polauth): RED-first pins for the recorded
 * policy authorization on the stage-2 journey envelope. AC1 records a
 * caller-supplied PolicyActionDecision without mutating the input envelope.
 * AC2 an unchanged decision stays valid. AC3 a changed disposition flips the
 * authorization in both directions under journey_envelope_authorization_flipped.
 * AC4 an envelope that never recorded an authorization is refused under
 * journey_envelope_authorization_missing. AC5 the product module stays pure:
 * no policy service, no evaluator, no disposition-to-decision table.
 */
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
const DRAFT_PORT = { version: 'v1', draft_id: 'DRAFT-1' };
const ALLOWED: PolicyActionDecision = {
  action: 'auto-create', target: 'journey-compiler-fixture/transfer',
  disposition: 'allowed', authority: 'project-owner',
  settingKey: 'allowAutoCreate',
  origin: { profileId: 'run-override', scope: 'run', scopeId: 'run-1', priority: 10 },
  rationale: 'run scope allows auto-create',
};
const BLOCKED: PolicyActionDecision = { ...ALLOWED, disposition: 'blocked' };
const CONFIRM: PolicyActionDecision = { ...ALLOWED, disposition: 'needs-confirmation' };
function compiledEnvelope() {
  const document = {
    journey_id: 'journey-compiler-fixture', revision: 1,
    authoring_actor: { actor_kind: 'person', actor_id: 'operator-1' },
    request_anchor: { message_id: 'msg-1', verbatim_text: 'move and verify the samples' },
    objective: 'transfer the samples and verify the result',
    completion_contract: ['the transfer record is committed', 'the verification record is committed'],
    parameters: [],
    steps: [
      { id: 'transfer', capability_ref: 'transfer', input_ports: [], interaction_mode: 'automatic', output_ports: [DRAFT_PORT] },
      { id: 'measure', capability_ref: 'measure', input_ports: [DRAFT_PORT], interaction_mode: 'automatic', output_ports: [] },
    ],
    alternatives: { options: [{ alternative_id: 'alt-a', summary: 'a single declared option' }], selection_authority: 'user' },
    return_contract: { checkpoint_ref: 'cp-1', permitted_result_types: ['completed'], require_explicit_resume: true },
    assumptions: [], unresolved_questions: [],
  };
  const compiled = compileJourneyStructure(document, CATALOGUE);
  if (!compiled.ok) throw new Error('fixture unexpectedly refused at stage 1');
  const result = compileJourneyEnvelope(compiled.manifest, document, 'measure', [{ port_index: 0, version: 'v1' }]);
  if (!result.ok) throw new Error('fixture unexpectedly refused at stage 2');
  return { manifest: compiled.manifest, envelope: result.envelope };
}

describe('journey envelope authorization', () => {
  it('AC1: records a caller-supplied decision in a new envelope without mutating the input', () => {
    const { manifest, envelope } = compiledEnvelope();
    expect(manifest.not_ready).toEqual([]);
    expect(envelope.step_id).toBe('measure');
    expect(envelope.bindings).toEqual([{ port_index: 0, declared_version: 'v1', resolved_version: 'v1' }]);
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
    const recorded = recordEnvelopeAuthorization(envelope, ALLOWED);
    expect(checkEnvelopeAuthorization(recorded, ALLOWED)).toEqual({ valid: true });
  });
  it('AC3: a re-evaluated allowed->blocked decision flips the authorization', () => {
    const { envelope } = compiledEnvelope();
    const recorded = recordEnvelopeAuthorization(envelope, ALLOWED);
    const flipped = checkEnvelopeAuthorization(recorded, BLOCKED);
    expect(flipped.valid).toBe(false);
    if (flipped.valid) throw new Error('expected the authorization to flip');
    expect(flipped.diagnostics).toHaveLength(1);
    expect(flipped.diagnostics[0]!.rule).toBe(RULE_ENVELOPE_AUTHORIZATION_FLIPPED);
    expect(flipped.diagnostics[0]!.message).toContain('allowed');
    expect(flipped.diagnostics[0]!.message).toContain('blocked');
    expect(flipped.diagnostics[0]!.message).toContain('run-override');
  });
  it('AC3: a re-evaluated allowed->needs-confirmation decision also flips', () => {
    const { envelope } = compiledEnvelope();
    const recorded = recordEnvelopeAuthorization(envelope, ALLOWED);
    const flipped = checkEnvelopeAuthorization(recorded, CONFIRM);
    expect(flipped.valid).toBe(false);
    if (flipped.valid) throw new Error('expected the authorization to flip');
    expect(flipped.diagnostics).toHaveLength(1);
    expect(flipped.diagnostics[0]!.rule).toBe(RULE_ENVELOPE_AUTHORIZATION_FLIPPED);
    expect(flipped.diagnostics[0]!.message).toContain('allowed');
    expect(flipped.diagnostics[0]!.message).toContain('needs-confirmation');
  });
  it('AC4: an envelope with no recorded authorization is refused as missing', () => {
    const { envelope } = compiledEnvelope();
    expect(envelope.authorization).toBeUndefined();
    const checked = checkEnvelopeAuthorization(envelope, ALLOWED);
    expect(checked.valid).toBe(false);
    if (checked.valid) throw new Error('a missing authorization may not read as permission');
    expect(checked.diagnostics).toHaveLength(1);
    expect(checked.diagnostics[0]!.rule).toBe(RULE_ENVELOPE_AUTHORIZATION_MISSING);
    expect(checked.diagnostics[0]!.step_id).toBe('measure');
  });
  it('AC5: the product module holds no second authority and no disposition-to-decision table', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'journeyEnvelope.ts'), 'utf8');
    expect(source).not.toContain('PolicyProfileService');
    expect(source).not.toContain('evaluateActions');
    expect(source).not.toContain('resolveActiveProfile');
    expect(source).not.toContain('needs-confirmation');
    expect(source).not.toMatch(/switch\s*\(/);
  });
});
