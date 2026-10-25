/**
 * MIXROLE-1 (Brad ruling 2026-10-22, spec §5b + §7 plane 2): the composition
 * role-gap affordance. RED-first.
 *
 * The affordance fires on the STRUCTURAL FINGERPRINT of an honest gap — an entry
 * whose role equals the config's gapRole in a composition carrying the declared
 * firesOn sibling — and asks the SCIENTIST for the intended use in their own
 * words (the annotation rides the existing clarification-answers channel as free
 * text). It never judges biology, never infers intent from a name/synonym/word
 * pattern, never enumerates enum roles in the question (bait 12), never ranks by
 * confidence (bait 9), and SUPPRESSES re-fire for answered gaps (bait 11 —
 * without it the bar loops forever, since the honest role stays the fallback role
 * after any answer).
 *
 * Harness shape: compositionFractions.test.ts (evaluator unit legs + normalize
 * integration legs through the REAL parse -> normalize chain).
 */
import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseScientistIntent } from './parseScientistIntent.js';
import { normalizeScientistIntent, COMPOSITION_ROLE_GAP_REASON } from './normalizeScientistIntent.js';
import {
  COMPOSITION_ROLE_GUIDANCE_PATH,
  evaluateCompositionRoleGaps,
  loadCompositionRoleGuidance,
} from './compositionRoles.js';

const GAP_REASON = COMPOSITION_ROLE_GAP_REASON;

/** The shipped guidance DATA (config/drafting/composition-role-guidance.yaml). */
const shipped = loadCompositionRoleGuidance()!;

// ---------------------------------------------------------------------------
// Fixture documents. Generic component names only — no reagent nouns in TS
// (bait 4); the canonical reagent utterances live in the goldens, not here.
// ---------------------------------------------------------------------------

/** `other`-role entry + a cells sibling: the structural fingerprint of a gap. */
const GAP_DOC = `
intentId: mixrole-gap-basic
actions:
  - action: add_material
    labware: plate
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Reagent Alpha", role: other, fraction: "50%" }
        - { material: "Base Fluid", role: buffer_component, fraction: "50%" }
        - { material: "Cell Suspension", role: cells, count: 10000 }
`;

/** An `other` entry with NO cells sibling (bait 8): must stay silent. */
const NO_CELLS_DOC = GAP_DOC.replace('        - { material: "Cell Suspension", role: cells, count: 10000 }\n', '');

/** A cells-carrying composition where every entry has a declared fitting role:
 *  a correct cell-culture medium must stay silent (the §5b lint-verdict trap:
 *  a solvent beside a cells entry is the shape of virtually every correct
 *  medium — the affordance fires on the FALLBACK role, never on biology). */
const CLEAN_MEDIUM_DOC = GAP_DOC
  .replace('role: other, fraction: "50%"', 'role: solvent, fraction: "50%"');

describe('MIXROLE-1 affordance plane: the role-gap clarification (evaluator unit legs)', () => {
  it('an `other`-role entry beside a cells sibling yields exactly ONE gap fact: label = the component\u2019s own name, message = the DATA question', () => {
    const gaps = evaluateCompositionRoleGaps(
      [
        { material: 'Reagent Alpha', role: 'other', fraction: '50%' },
        { material: 'Base Fluid', role: 'buffer_component', fraction: '50%' },
        { material: 'Cell Suspension', role: 'cells', count: 10000 },
      ],
      shipped,
      new Set<string>(),
    );
    expect(gaps).toHaveLength(1);
    const gap = gaps[0]!;
    expect(gap.reason).toBe(GAP_REASON);
    expect(gap.label).toBe('Reagent Alpha');
    // The message is the config question with {component} filled by the entry's
    // OWN label — not a role pick-list (bait 12).
    expect(gap.message).toBe('What is Reagent Alpha used for in this composition? State your intended use in your own words.');
    // exactOptionalPropertyTypes: the fact carries no extra keys (no readings,
    // no confidence — bait 9).
    expect(Object.keys(gap).sort()).toEqual(['label', 'message', 'reason']);
  });

  it('firesOn data scopes the bar: no cells sibling => silence; a fitting-role medium stays silent; the cells entry itself never clarifies', () => {
    const silent = evaluateCompositionRoleGaps(
      [
        { material: 'Reagent Alpha', role: 'other', fraction: '50%' },
        { material: 'Base Fluid', role: 'buffer_component', fraction: '50%' },
      ],
      shipped,
      new Set<string>(),
    );
    expect(silent, 'bait 8: an `other` entry with no cells sibling must NOT clarify').toHaveLength(0);

    const cleanMedium = evaluateCompositionRoleGaps(
      [
        { material: 'Base Fluid', role: 'solvent', fraction: '90%' },
        { material: 'Supplement', role: 'additive', fraction: '10%' },
        { material: 'Cell Suspension', role: 'cells', count: 10000 },
      ],
      shipped,
      new Set<string>(),
    );
    expect(cleanMedium, 'a correct medium (no fallback-role entry) stays silent').toHaveLength(0);
  });

  it('ONE clarification per gap entry (never per word of a label, never one per composition)', () => {
    const gaps = evaluateCompositionRoleGaps(
      [
        { material: 'Reagent Alpha Beta Gamma', role: 'other', fraction: '40%' },
        { material: 'Reagent Delta', role: 'other', fraction: '10%' },
        { material: 'Base Fluid', role: 'buffer_component', fraction: '50%' },
        { material: 'Cell Suspension', role: 'cells', count: 10000 },
      ],
      shipped,
      new Set<string>(),
    );
    expect(gaps).toHaveLength(2);
    expect(gaps.map((g) => g.label)).toEqual(['Reagent Alpha Beta Gamma', 'Reagent Delta']);
  });

  it('SUPPRESSION (bait 11): an answered gap does not re-fire; the answer VALUE is never read (nonsense value suppresses identically)', () => {
    const entries = [
      { material: 'Reagent Alpha', role: 'other', fraction: '50%' },
      { material: 'Base Fluid', role: 'buffer_component', fraction: '50%' },
      { material: 'Cell Suspension', role: 'cells', count: 10000 },
    ];
    // Fire once (no answers).
    expect(evaluateCompositionRoleGaps(entries, shipped, new Set<string>())).toHaveLength(1);
    // Answered recompile: same entry, same fallback role, answer present => the
    // gap bar passes. Suppression keys on the answered LABEL SET only.
    expect(evaluateCompositionRoleGaps(entries, shipped, new Set(['Reagent Alpha']))).toHaveLength(0);
    // A nonsense answer value changes nothing (the value never reaches the
    // evaluator — membership over labels is the whole contract).
    expect(evaluateCompositionRoleGaps(entries, shipped, new Set(['Reagent Alpha']))).toHaveLength(0);
    // An answer to a DIFFERENT label does not suppress this gap.
    expect(evaluateCompositionRoleGaps(entries, shipped, new Set(['Base Fluid']))).toHaveLength(1);
  });

  it('the shipped question text names NO enum member (bait 12: enumerating roles re-invites the force-fit the ruling forbids)', () => {
    const enumMembers = ['solute', 'solvent', 'buffer_component', 'additive', 'activity_source', 'cells', 'other'];
    const question = shipped.question.toLowerCase();
    for (const member of enumMembers) {
      expect(question, `the question must not enumerate \`${member}\``).not.toContain(member);
    }
  });
});

describe('MIXROLE-1 affordance plane: the guidance DATA discipline (cues-file precedent)', () => {
  it('absent config file => feature LOUD-off: one console.warn naming the path, entries pass through unchanged', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const missingPath = join(mkdtempSync(join(tmpdir(), 'mixrole-off-')), 'absent-role-guidance.yaml');
      expect(existsSync(missingPath)).toBe(false);
      const normalized = normalizeScientistIntent(parseScientistIntent(GAP_DOC), {
        compositionRoleGuidancePath: missingPath,
      });
      const gapFacts = (normalized.clarifications ?? []).filter((c) => c.reason === GAP_REASON);
      expect(gapFacts, 'absent file => the affordance is OFF').toHaveLength(0);
      const warns = warn.mock.calls.map((call) => String(call[0]));
      expect(warns.some((w) => w.includes(missingPath)), 'the off-state names the path').toBe(true);
      expect(warns.some((w) => w.includes('composition-role-gap-check-off'))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('malformed config => throws naming the path (a PRESENT-but-broken section; an ABSENT section is the LOUD-off state above, not a throw)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mixrole-malformed-'));
    const badPath = join(dir, 'malformed-role-guidance.yaml');
    // `firesOn` is present but not a list of arm objects — malformed, not absent.
    writeFileSync(badPath, 'gapRole: other\nfiresOn: not-a-list\nquestion: "x"\n', 'utf8');
    expect(() => loadCompositionRoleGuidance(badPath)).toThrow(badPath);
  });

  it('unknown firing arm => throws naming the path + the arm (loud, never silent)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mixrole-arm-'));
    const badPath = join(dir, 'bad-arm-guidance.yaml');
    writeFileSync(badPath, 'gapRole: other\nquestion: "x"\nfiresOn:\n  - arm: notAnArm\n', 'utf8');
    expect(() => loadCompositionRoleGuidance(badPath)).toThrow(badPath);
  });

  it('the shipped guidance file loads with the ruled shape: gapRole fallback + cellsSibling firing + a question', () => {
    expect(shipped.gapRole).toBe('other');
    expect(shipped.firesOn).toEqual([{ arm: 'siblingRole', role: 'cells' }]);
    expect(shipped.question.length).toBeGreaterThan(0);
    // The DATA home is the shipped config path (loaded per call, never cached).
    expect(readFileSync(COMPOSITION_ROLE_GUIDANCE_PATH, 'utf8')).toContain('gapRole:');
  });
});

describe('MIXROLE-1 affordance plane: normalize integration (the bar rides the producer channel)', () => {
  const gapFactsOf = (doc: string, options?: Parameters<typeof normalizeScientistIntent>[1]) =>
    (normalizeScientistIntent(parseScientistIntent(doc), options).clarifications ?? [])
      .filter((c) => c.reason === GAP_REASON);

  it('the gap bars through normalize: ONE fact, label = the component name, actionLocation on the composition argument', () => {
    const facts = gapFactsOf(GAP_DOC);
    expect(facts).toHaveLength(1);
    const fact = facts[0]!;
    expect(fact.label).toBe('Reagent Alpha');
    expect(fact.actionLocation).toEqual({ actionIndex: 0, action: 'add_material', argument: 'composition' });
    expect(fact.message).toContain('Reagent Alpha');
    expect(Object.keys(fact).sort()).toEqual(['actionLocation', 'label', 'message', 'reason']);
  });

  it('trypsin-less / cells-less scoping (bait 8): the no-cells composition stays silent; the clean medium stays silent', () => {
    expect(gapFactsOf(NO_CELLS_DOC)).toHaveLength(0);
    expect(gapFactsOf(CLEAN_MEDIUM_DOC)).toHaveLength(0);
  });

  it('the reason joins the union WITHOUT breaking the existing codes: the 110% canonical shape carries BOTH the fraction-sum fact and the role-gap fact (the role clarification does not steal the fraction channel)', () => {
    const doc = `
intentId: mixrole-both-bars
actions:
  - action: add_material
    labware: plate
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Reagent Alpha", role: other, fraction: "50%" }
        - { material: "Base Fluid", role: buffer_component, fraction: "50%" }
        - { material: "Supplement", role: additive, fraction: "10%" }
        - { material: "Cell Suspension", role: cells, count: 10000 }
`;
    const normalized = normalizeScientistIntent(parseScientistIntent(doc));
    const reasons = (normalized.clarifications ?? []).map((c) => c.reason);
    expect(reasons).toContain('composition-fraction-sum');
    expect(reasons).toContain(GAP_REASON);
    const fractionFacts = (normalized.clarifications ?? []).filter((c) => c.reason === 'composition-fraction-sum');
    expect(fractionFacts, 'the fraction bar keeps its own single fact').toHaveLength(1);
    expect(fractionFacts[0]!.readings, 'the fraction readings ride untouched').toHaveLength(3);
    const gapFacts = (normalized.clarifications ?? []).filter((c) => c.reason === GAP_REASON);
    expect(gapFacts).toHaveLength(1);
    // Producer-append order: the fraction bar (called first, beside the cue bar)
    // keeps its position; the gap fact appends after it.
    expect(reasons.indexOf('composition-fraction-sum')).toBeLessThan(reasons.indexOf(GAP_REASON));
  });

  it('SUPPRESSION through the real chain (bait 11): answeredClarificationLabels carries the gap label => the answered recompile passes the gap bar; a nonsense answer value suppresses identically', () => {
    // Fire once.
    expect(gapFactsOf(GAP_DOC)).toHaveLength(1);
    // Answered recompile: the handler threads Object.keys(answers) — the label
    // set only. Same entry, same fallback role: the bar passes.
    const answered = gapFactsOf(GAP_DOC, {
      answeredClarificationLabels: ['Reagent Alpha'],
      scientistAnswers: { 'Reagent Alpha': 'it detaches the cells so they can be counted' },
    });
    expect(answered, 'the answered recompile must not re-ask the same gap').toHaveLength(0);
    // Nonsense value: suppression is unchanged (the value is never read).
    const nonsense = gapFactsOf(GAP_DOC, {
      answeredClarificationLabels: ['Reagent Alpha'],
      scientistAnswers: { 'Reagent Alpha': 'aksdjalksjd not-a-real-answer' },
    });
    expect(nonsense).toHaveLength(0);
    // An answer keyed to a different label does not suppress.
    expect(gapFactsOf(GAP_DOC, { answeredClarificationLabels: ['Cell Suspension'] })).toHaveLength(1);
  });

  it('the gap fact never carries readings or confidence (it is a question, not a candidate menu)', () => {
    const fact = gapFactsOf(GAP_DOC)[0]!;
    expect(Object.keys(fact)).not.toContain('readings');
    expect(Object.keys(fact)).not.toContain('candidates');
    expect(JSON.stringify(fact)).not.toContain('confidence');
  });
});
