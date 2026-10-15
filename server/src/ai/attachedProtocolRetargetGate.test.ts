/**
 * W2-9 g2d FINAL CYCLE (ruling l2t1040) — the attached-protocol retarget gate
 * loader contract (the targetIdRules precedent, reviewWriteWall.test.ts
 * 'ops wall' + 'present-but-malformed' pins, mirrored for the new section).
 *
 * The gate is DATA: `opsWall.attachedMismatchRule` in
 * config/drafting/review-write-wall.yaml. Absent => OFF (never a TypeScript
 * default). Present-but-malformed throws honestly at LOAD. The interpreter
 * compares ids only — it carries no policy of its own.
 */
import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadAttachedMismatchPolicy,
  attachedMismatchGateFor,
} from './attachedProtocolRetargetGate.js';

const ATTACHED = 'PRT-attached-0001';
const FOREIGN = 'PRT-foreign-9999';

describe('attached-protocol retarget gate loader (W2-9 g2d final cycle)', () => {
  it('the REAL policy file declares the gate rule with its code + pattern', () => {
    const policy = loadAttachedMismatchPolicy();
    expect(policy).not.toBeNull();
    expect(policy!.surfaces).toContain('protocol-review');
    expect(policy!.attachedMismatchRule).toBeDefined();
    expect(policy!.attachedMismatchRule!.code).toBe('ATTACHED_PROTOCOL_MISMATCH');
    expect(policy!.attachedMismatchRule!.protocolIdPattern).toBe('^PRT-');
    expect(policy!.attachedMismatchRule!.message).toContain('attached protocol');
    expect(policy!.attachedMismatchRule!.message).toContain('nothing was written');
  });

  it('gate predicate: foreign PRT-shaped id refused; equal id, non-matching id, undefined side pass', () => {
    const refusal = attachedMismatchGateFor('protocol-review', ATTACHED, FOREIGN);
    expect(refusal).not.toBeNull();
    expect(refusal!.code).toBe('ATTACHED_PROTOCOL_MISMATCH');
    expect(attachedMismatchGateFor('protocol-review', ATTACHED, ATTACHED)).toBeNull();
    expect(attachedMismatchGateFor('protocol-review', ATTACHED, 'DRAFT-lyse-a')).toBeNull();
    expect(attachedMismatchGateFor('protocol-review', ATTACHED, 'MAT-000001')).toBeNull();
    expect(attachedMismatchGateFor('protocol-review', ATTACHED, undefined)).toBeNull();
    expect(attachedMismatchGateFor('protocol-review', undefined, FOREIGN)).toBeNull();
    expect(attachedMismatchGateFor('event-editor', ATTACHED, FOREIGN)).toBeNull();
    expect(attachedMismatchGateFor(undefined, ATTACHED, FOREIGN)).toBeNull();
  });

  it('absent `attachedMismatchRule` => gate OFF (absent = OFF, the standing contract)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-off-'));
    const file = join(dir, 'gate.yaml');
    writeFileSync(file, [
      'surfaces: [protocol-review]',
      'opsWall:',
      '  code: C',
      '  message: m',
      '  forbiddenFields: [provenance]',
      '  targetIdRules:',
      '    - pattern: "^CAN-"',
      '      code: SAID_IMMUTABLE',
      '      message: said',
    ].join('\n') + '\n');
    const policy = loadAttachedMismatchPolicy(file);
    expect(policy).not.toBeNull();
    expect(policy!.attachedMismatchRule).toBeUndefined();
    expect(attachedMismatchGateFor('protocol-review', ATTACHED, FOREIGN, file)).toBeNull();
  });

  it('absent policy file => gate OFF, never a TypeScript default', () => {
    const missing = join(mkdtempSync(join(tmpdir(), 'gate-missing-')), 'nope.yaml');
    expect(loadAttachedMismatchPolicy(missing)).toBeNull();
    expect(attachedMismatchGateFor('protocol-review', ATTACHED, FOREIGN, missing)).toBeNull();
  });

  it('present-but-malformed gate rule throws honestly at LOAD', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-bad-'));
    const file = join(dir, 'bad.yaml');
    const base = [
      'surfaces: [protocol-review]',
      'opsWall:',
      '  code: C',
      '  message: m',
      '  forbiddenFields: [provenance]',
    ].join('\n');
    writeFileSync(file, `${base}\n  attachedMismatchRule: []\n`);
    expect(() => loadAttachedMismatchPolicy(file)).toThrow(/attachedMismatchRule/);
    writeFileSync(file, `${base}\n  attachedMismatchRule:\n    code: C\n    protocolIdPattern: "("\n    message: m\n`);
    expect(() => loadAttachedMismatchPolicy(file)).toThrow(/invalid protocolIdPattern/);
    writeFileSync(file, `${base}\n  attachedMismatchRule:\n    protocolIdPattern: "^PRT-"\n    message: m\n`);
    expect(() => loadAttachedMismatchPolicy(file)).toThrow(/code/);
  });
});
