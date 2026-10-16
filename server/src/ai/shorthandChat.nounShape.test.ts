/**
 * SH-QA-3 — the mint-local-term affordance refuses prose sentences (payload
 * level, never DOM), and the mint survivors keep their affordance.
 *
 * The refusal is DATA (config/drafting/shorthand-drafting.yaml `nounShape:` —
 * OQ1 ruling) shared by BOTH offer surfaces: the engine unknown-noun arm
 * (resolutionEngine mint filter) and the chat card map
 * (clarificationsFromUnresolvedFacts allowCreateLocal + the prompt clause).
 * A cue hit alone must NOT refuse mint (B3: the clofibrate/lysozyme/Triton
 * canon). The refusal never removes the QUESTION — only the mint affordance
 * (P4). Zero phrase literals in TypeScript: every shape test runs through the
 * DATA loader.
 */
import { describe, expect, it } from 'vitest';
import { clarificationsFromUnresolvedFacts } from './shorthandChat.js';
import { loadNounShape, isMintableLabel } from '../compiler/resolution/nounShape.js';
import { parseScientistIntent } from '../compiler/scientistIntent/parseScientistIntent.js';
import { compileScientistIntent } from '../compiler/scientistIntent/compileScientistIntent.js';
import { createResolveSpine } from '../resolve/ResolveSpine.js';
import type { ScientistIntentUnresolvedFact } from '../compiler/scientistIntent/types.js';

const SHAPE = loadNounShape();

function fact(label: string, reason = 'unknown-noun'): ScientistIntentUnresolvedFact {
  return {
    label,
    reason,
    actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' },
  };
}

/** The declared provider-less test seam (compileScientistIntent.ts:145-152 —
 *  legal only as an explicitly injected spine): nothing binds, so every noun
 *  lands on the unknown-noun arm. */
async function compileWithEmptySpine(yaml: string) {
  return compileScientistIntent(parseScientistIntent(yaml), {
    spine: createResolveSpine() as never,
  });
}

describe('SH-QA-3 P1 PAYLOAD BAR: no card offers a prose sentence as a mintable term', () => {
  it('P1: every allowCreateLocal-true request carries a DATA-mintable label; sentence cards refuse mint and drop the prompt clause', () => {
    const sentences = [
      '50/50 Trypsin-EDTA/DMEM + 10% FBS with HepG2 cells',
      '50:50 Trypsin-EDTA/DMEM',
      'the supernatant containing the cells with the debris',
    ];
    const requests = clarificationsFromUnresolvedFacts(sentences.map((s) => fact(s)));
    expect(requests).toHaveLength(sentences.length);
    for (const request of requests) {
      if (request.allowCreateLocal === true) {
        expect(isMintableLabel(request.unresolvedFact!.label, SHAPE), request.prompt).toBe(true);
      }
    }
    for (const sentence of sentences) {
      const card = requests.find((r) => r.query === sentence)!;
      expect(card.allowCreateLocal, `sentence card must refuse mint: ${sentence}`).toBe(false);
      expect(card.prompt, `prompt clause dropped: ${sentence}`).not.toContain('or create a local term');
      // The QUESTION survives — the card still names the label and its reason.
      expect(card.prompt).toContain(sentence);
      expect(card.unresolvedFact!.reason).toBe('unknown-noun');
    }
  });

  it('P1b: the mintable card keeps the full prompt arm (conditional spread, not a rewrite)', () => {
    const requests = clarificationsFromUnresolvedFacts([fact('Enigma Broth')]);
    expect(requests[0]!.allowCreateLocal).toBe(true);
    expect(requests[0]!.prompt).toContain('or create a local term');
  });
});

describe('SH-QA-3 P2 ENGINE ARM: unknown-noun survives, the mint candidate is absent', () => {
  it('P2: an unbound sentence label keeps reason unknown-noun with NO Create-local-term candidate', async () => {
    const compiled = await compileWithEmptySpine(`intentId: shqa3-p2
actions:
  - action: add_material
    material: "50:50 Trypsin-EDTA/DMEM"
    volumeUl: 50
    targetWells: [A1]
`);
    const nounFacts = compiled.clarifications.filter((c) => c.reason === 'unknown-noun');
    expect(nounFacts.map((c) => c.label)).toContain('50:50 Trypsin-EDTA/DMEM');
    const asked = nounFacts.find((c) => c.label === '50:50 Trypsin-EDTA/DMEM')!;
    expect((asked.candidates ?? []).some((c) => c.label.includes('Create local term')), 'mint refused').toBe(false);
  });

  it('P2b: a no-composition prose clause on transfer.source keeps its question with no mint offer', async () => {
    const compiled = await compileWithEmptySpine(`intentId: shqa3-p2b
actions:
  - action: transfer
    source: "the supernatant containing the cells with the debris"
    target: destination plate
    volumeUl: 10
`);
    const asked = compiled.clarifications.find((c) => c.label === 'the supernatant containing the cells with the debris');
    expect(asked, 'the question is never removed').toBeDefined();
    expect(asked!.reason).toBe('unknown-noun');
    expect((asked!.candidates ?? []).some((c) => c.label.includes('Create local term'))).toBe(false);
  });
});

describe('SH-QA-3 P3 SURVIVOR PINS: a cue hit alone never refuses mint (B3)', () => {
  const SURVIVORS = [
    'mystery flask',
    'Equine Serum',
    '1 mM Clofibrate in DMSO',
    '5 mg/mL lysozyme in PBS',
    '0.1% Triton X-100 in water',
    'DNase/RNase Free Water',
    'DMEM/F12',
  ];

  it('P3a: every survivor label stays DATA-mintable and its card keeps allowCreateLocal', () => {
    for (const label of SURVIVORS) {
      expect(isMintableLabel(label, SHAPE), label).toBe(true);
    }
    const requests = clarificationsFromUnresolvedFacts(SURVIVORS.map((s) => fact(s)));
    for (const request of requests) {
      expect(request.allowCreateLocal, request.query).toBe(true);
      expect(request.prompt).toContain('or create a local term');
    }
  });

  it('P3b: the engine still OFFERS the mint candidate for an unbound survivor noun', async () => {
    const compiled = await compileWithEmptySpine(`intentId: shqa3-p3b
actions:
  - action: add_material
    material: "Equine Serum"
    volumeUl: 50
    targetWells: [A1]
`);
    const asked = compiled.clarifications.find((c) => c.label === 'Equine Serum');
    expect(asked, JSON.stringify(compiled.clarifications)).toBeDefined();
    expect((asked!.candidates ?? []).some((c) => c.label.includes('Create local term')), 'mint survives').toBe(true);
  });
});

describe('SH-QA-3 P4 no-composition blob floor: the question survives, only the mint offer is withheld', () => {
  it('P4: the gated blob fact still fires AND the unknown-noun question still asks — with no mint affordance', async () => {
    const compiled = await compileWithEmptySpine(`intentId: shqa3-p4
actions:
  - action: add_material
    material: "50:50 Trypsin-EDTA/DMEM"
    volumeUl: 50
    targetWells: [A1]
`);
    const reasons = compiled.clarifications.map((c) => c.reason);
    expect(reasons).toContain('unrealized-mixture-blob-material');
    expect(reasons).toContain('unknown-noun');
    const blobFacts = compiled.clarifications.filter((c) => c.label === '50:50 Trypsin-EDTA/DMEM');
    expect(blobFacts.length).toBe(2);
    for (const f of blobFacts) {
      expect((f.candidates ?? []).some((c) => c.label.includes('Create local term')), f.reason).toBe(false);
    }
    // The card map: both cards still ask, both refuse mint.
    const requests = clarificationsFromUnresolvedFacts(compiled.clarifications);
    expect(requests.length).toBe(2);
    expect(requests.every((r) => r.allowCreateLocal === false)).toBe(true);
    expect(requests.every((r) => !r.prompt.includes('or create a local term'))).toBe(true);
  });
});
