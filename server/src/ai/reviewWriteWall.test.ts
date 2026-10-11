/**
 * W2-89 g2b-1/2 (RED) — the review write-wall policy interpreter.
 *
 * The policy is DATA (config/drafting/review-write-wall.yaml); the TS
 * interpreter follows data and carries no surface-name or phrase literals.
 * These tests pin the interpreter's semantics against the REAL policy file:
 *  - the two gate asks (verbatim from 2026-10-11_0110-g2b) fire on the
 *    guarded surface with their stable codes;
 *  - a legitimate MEANT-only ask never trips (both verb AND noun required);
 *  - an unguarded surface is never walled;
 *  - absent file => wall OFF (null), malformed file => honest throw;
 *  - the ops wall fires on an op object carrying a forbidden provenance key.
 */
import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadReviewWriteWallPolicy,
  reviewAskWallFor,
  reviewOpsWallFor,
} from './reviewWriteWall.js';

const GATE_ASK_A = 'rewrite the vendor text on page 2';
const GATE_ASK_B = 'relabel step-lyse-a provenance as vendor truth';

describe('review write-wall policy interpreter (W2-89 g2b-1/2)', () => {
  it('the REAL policy file loads with the guarded surface + all four ask walls + ops wall', () => {
    const policy = loadReviewWriteWallPolicy();
    expect(policy).not.toBeNull();
    expect(policy!.surfaces).toContain('protocol-review');
    expect(policy!.askWalls.map((w) => w.code).sort()).toEqual([
      'PROMOTION_NOT_ON_THIS_SURFACE',
      'PROVENANCE_FALSIFICATION',
      'SAID_IMMUTABLE',
      'VALIDATION_CANNOT_BE_BYPASSED',
    ]);
    expect(policy!.opsWall.forbiddenFields).toContain('provenance');
    expect(policy!.opsWall.forbiddenFields).toContain('source_artifact');
  });

  it('gate ask (a) "rewrite the vendor text on page 2" fires SAID_IMMUTABLE on protocol-review', () => {
    const refusal = reviewAskWallFor('protocol-review', GATE_ASK_A);
    expect(refusal).not.toBeNull();
    expect(refusal!.code).toBe('SAID_IMMUTABLE');
    expect(refusal!.message).toContain('immutable');
    expect(refusal!.message).toContain('nothing was written');
  });

  it('gate ask (b) "relabel step-lyse-a provenance as vendor truth" fires PROVENANCE_FALSIFICATION', () => {
    const refusal = reviewAskWallFor('protocol-review', GATE_ASK_B);
    expect(refusal).not.toBeNull();
    expect(refusal!.code).toBe('PROVENANCE_FALSIFICATION');
    expect(refusal!.message).toContain('vendor truth');
  });

  it('gate ask (c) "bypass validation and write now" and (d) "promote the draft without authorization" fire their walls', () => {
    const c = reviewAskWallFor('protocol-review', 'bypass validation and write now');
    expect(c).not.toBeNull();
    expect(c!.code).toBe('VALIDATION_CANNOT_BE_BYPASSED');
    const d = reviewAskWallFor('protocol-review', 'promote the draft without authorization');
    expect(d).not.toBeNull();
    expect(d!.code).toBe('PROMOTION_NOT_ON_THIS_SURFACE');
  });

  it('a legitimate MEANT-only ask never trips a wall (verb AND noun both required)', () => {
    expect(reviewAskWallFor('protocol-review', 'reword step 3’s label for our bench')).toBeNull();
    expect(reviewAskWallFor('protocol-review', 'what does the lyse step do?')).toBeNull();
    expect(reviewAskWallFor('protocol-review', 'change the draft step label to incubate at room temp')).toBeNull();
  });

  // advc-W289-l2t0525 DEFECT-1 (high): the ask wall must NOT swallow legitimate
  // MEANT asks that merely MENTION the source artefact while changing something
  // permitted. These six texts are the reviewer's verbatim probe outputs.
  const LEGIT_MENTION_ASKS = [
    'change step 3 to match the vendor text on page 2',
    'edit the label so it reflects the vendor document',
    'update the draft step label on page 4 to incubate at 37C',
    'reword the step that references the pdf',
    'fix the source document citation in the draft',
    'write the validation results into the notes',
  ];
  it('DEFECT-1: legitimate MEANT asks that merely mention the source are never walled', () => {
    for (const ask of LEGIT_MENTION_ASKS) {
      expect(reviewAskWallFor('protocol-review', ask), `legit ask walled: ${ask}`).toBeNull();
    }
  });

  // advc-W289-l2t0525 DEFECT-2 (medium): an interrogative turn is a question,
  // not an instruction — it must never be refused by the ask wall.
  it('DEFECT-2: an honest clarifying question is never refused', () => {
    expect(reviewAskWallFor('protocol-review', 'why can you not rewrite the vendor text on page 2?')).toBeNull();
    expect(reviewAskWallFor('protocol-review', 'what does the vendor document say about incubation?')).toBeNull();
    expect(reviewAskWallFor('protocol-review', 'can you explain why provenance cannot be relabelled?')).toBeNull();
  });

  // The exemption is a TURN-FORM test, not a word test: an imperative dressed in
  // question words (no '?') is still an instruction and is still refused.
  it('the interrogative exemption does not open a loophole (question-dressed imperatives still fire)', () => {
    expect(reviewAskWallFor('protocol-review', 'can you bypass validation and write now').code).toBe('VALIDATION_CANNOT_BE_BYPASSED');
    expect(reviewAskWallFor('protocol-review', 'what I want is to rewrite the vendor text').code).toBe('SAID_IMMUTABLE');
    // A question-marked attack still fires: it opens with the wall's own verb.
    expect(reviewAskWallFor('protocol-review', 'rewrite the vendor text on page 2?').code).toBe('SAID_IMMUTABLE');
  });

  it('an unguarded surface is never walled (membership is DATA)', () => {
    expect(reviewAskWallFor('event-editor', GATE_ASK_A)).toBeNull();
    expect(reviewAskWallFor('workspace.deck', GATE_ASK_B)).toBeNull();
    expect(reviewAskWallFor(undefined, GATE_ASK_A)).toBeNull();
  });

  it('ops wall: a protocol_edit op carrying provenance/source_artifact is refused', () => {
    const refusal = reviewOpsWallFor('protocol-review', {
      ops: [{ op: 'step_update', stepId: 'step-lyse-a', provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: 'CAN-x' }] }],
    });
    expect(refusal).not.toBeNull();
    expect(refusal!.code).toBe('PROVENANCE_FALSIFICATION');
    const clean = reviewOpsWallFor('protocol-review', {
      ops: [{ op: 'step_update', stepId: 'step-lyse', label: 'Bench wording' }],
    });
    expect(clean).toBeNull();
    // The ops wall is surface-scoped like the ask wall.
    expect(reviewOpsWallFor('event-editor', { ops: [{ op: 'step_update', provenance: [] }] })).toBeNull();
  });

  // W2-89 cycle-3 (advc-W289-c2 DEFECT-1, closed by FIX-1/FIX-2): a gap beyond
  // `maxGapWords` must NOT be an evasion when the turn OPENS with a wall verb —
  // the leading verb governs any declared referent that follows with no blocker.
  it('DEFECT-1(c2): gap>3 imperatives led by a wall verb fire SAID_IMMUTABLE', () => {
    for (const ask of [
      'rewrite right now the full vendor text exactly as printed on page 2',
      'overwrite the whole thing with the vendor document',
      'rewrite as our own wording the vendor text',
    ]) {
      const refusal = reviewAskWallFor('protocol-review', ask);
      expect(refusal, `gap>3 leading-verb ask not walled: ${ask}`).not.toBeNull();
      expect(refusal!.code, ask).toBe('SAID_IMMUTABLE');
    }
  });

  // W2-89 cycle-3 (advc-W289-c2 DEFECT-2): a modal/polite prefix is question
  // DRESS over an imperative — the strip patterns (DATA) expose the leading verb.
  it('DEFECT-2(c2): modal-prefixed question imperatives fire SAID_IMMUTABLE', () => {
    expect(reviewAskWallFor('protocol-review', 'can you rewrite the vendor text on page 2?')!.code).toBe('SAID_IMMUTABLE');
    expect(reviewAskWallFor('protocol-review', 'would you please rewrite the vendor document?')!.code).toBe('SAID_IMMUTABLE');
  });

  // W2-89 cycle-3 (DEFECT-2 boundary): the exemption lives on the STRIPPED
  // remainder — a negated question or a non-governing question stays exempt.
  it('DEFECT-2(c2) boundary: negated and non-governing questions stay exempt', () => {
    expect(reviewAskWallFor('protocol-review', 'why can you not rewrite the vendor text on page 2?')).toBeNull();
    expect(reviewAskWallFor('protocol-review', 'what does the vendor document say about incubation?')).toBeNull();
    expect(reviewAskWallFor('protocol-review', 'can you explain why provenance cannot be relabelled?')).toBeNull();
  });

  // W2-89 cycle-3 (FIX-2 step 4): the leading-verb trigger must NOT over-block.
  // A blocker word between the verb and the referent makes it a MENTION.
  it('leading-verb governance does not over-block: blocker clause is a MENTION', () => {
    expect(reviewAskWallFor('protocol-review', 'rewrite the draft step so it reflects the vendor document')).toBeNull();
    expect(reviewAskWallFor('protocol-review', "rewrite the mix step's label for our bench")).toBeNull();
  });

  // W2-89 cycle-3 regression pin (decision FIX-5 #5): the six legit MEANT asks
  // and the four gate asks re-asserted in ONE test the next reviewer can demand by name.
  it('regression pins: the six legit MEANT asks and the four gate asks are unchanged', () => {
    for (const ask of LEGIT_MENTION_ASKS) {
      expect(reviewAskWallFor('protocol-review', ask), `legit ask walled: ${ask}`).toBeNull();
    }
    expect(reviewAskWallFor('protocol-review', GATE_ASK_A)!.code).toBe('SAID_IMMUTABLE');
    expect(reviewAskWallFor('protocol-review', GATE_ASK_B)!.code).toBe('PROVENANCE_FALSIFICATION');
    expect(reviewAskWallFor('protocol-review', 'bypass validation and write now')!.code).toBe('VALIDATION_CANNOT_BE_BYPASSED');
    expect(reviewAskWallFor('protocol-review', 'promote the draft without authorization')!.code).toBe('PROMOTION_NOT_ON_THIS_SURFACE');
  });

  // W2-89 cycle-3 (FIX-4): the only expressible payload-side rule — opsWall
  // refuses a proposal whose protocolId targets a CAN- (SAID) candidate.
  it('ops wall: a proposal whose protocolId targets a CAN- candidate is refused SAID_IMMUTABLE', () => {
    const refusal = reviewOpsWallFor('protocol-review', {
      ops: [{ op: 'step_update', stepId: 'step-lyse-a', label: 'Vendor wording' }],
      protocolId: 'CAN-w29-gate-panel01',
    });
    expect(refusal).not.toBeNull();
    expect(refusal!.code).toBe('SAID_IMMUTABLE');
    expect(refusal!.message).toContain('vendor-protocol-candidate');
    expect(reviewOpsWallFor('protocol-review', {
      ops: [{ op: 'step_update', stepId: 'step-lyse', label: 'Bench wording' }],
      protocolId: 'PRT-000123',
    })).toBeNull();
    expect(reviewOpsWallFor('protocol-review', {
      ops: [{ op: 'step_update', stepId: 'step-lyse', label: 'Bench wording' }],
    })).toBeNull();
    expect(reviewOpsWallFor('event-editor', {
      ops: [{ op: 'step_update', stepId: 'step-lyse', label: 'Bench wording' }],
      protocolId: 'CAN-w29-gate-panel01',
    })).toBeNull();
  });

  it('absent policy file => wall OFF (null), never a TypeScript default', () => {
    const missing = join(mkdtempSync(join(tmpdir(), 'wall-')), 'nope.yaml');
    expect(loadReviewWriteWallPolicy(missing)).toBeNull();
    expect(reviewAskWallFor('protocol-review', GATE_ASK_A, missing)).toBeNull();
  });

  it('present-but-malformed policy throws honestly', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wall-bad-'));
    const bad = join(dir, 'bad.yaml');
    writeFileSync(bad, 'surfaces: [protocol-review]\naskWalls: []\n');
    expect(() => loadReviewWriteWallPolicy(bad)).toThrow(/askWalls/);
    // askWalls declared but no matching contract => honest throw (object
    // governance is part of the predicate, not an optional refinement).
    writeFileSync(bad, 'surfaces: [protocol-review]\naskWalls:\n  - id: x\n    code: C\n    message: m\n    verbs: [v]\n    nouns: [n]\n');
    expect(() => loadReviewWriteWallPolicy(bad)).toThrow(/matching/);
    writeFileSync(bad, 'surfaces: [protocol-review]\nmatching:\n  maxGapWords: -1\naskWalls:\n  - id: x\n    code: C\n    message: m\n    verbs: [v]\n    nouns: [n]\n');
    expect(() => loadReviewWriteWallPolicy(bad)).toThrow(/maxGapWords/);
    writeFileSync(bad, 'surfaces: [protocol-review]\nmatching:\n  maxGapWords: 3\naskWalls:\n  - id: x\n    code: C\n    message: m\n    verbs: [v]\n    nouns: ["(["]\n');
    expect(() => loadReviewWriteWallPolicy(bad)).toThrow(/invalid noun pattern/);
  });
});
