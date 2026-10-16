/**
 * SHORTHAND-COMP-1 fix2/N1 (adversarial re-review, D2 NOT-CLOSED sub-ask):
 * the e2e ghost leg's stub must be a payload the server ACTUALLY emits.
 *
 * This file extracts the e2e spec's OWN stub builders (blobClarificationResult
 * / fixedShorthandResult) from app/e2e/deck-ghost-shorthand.spec.ts and
 * deep-compares them against the REAL pipeline output
 * (parseScientistIntent -> compileShorthandDeterministically ->
 * shorthandResultFromCompile) for the same document + deck state. The stub can
 * never again claim a payload the server does not emit without failing here.
 *
 * RED (fix1 spec @58a696a9): the GHOST stub claims `details.labwareId:
 * 'ghost plate'` + `details.wells` + `labwareAdditions: [{recordId:'ghost
 * plate'}]` together — unreachable in ANY single deck state:
 *   - NO deck (the fix1 reset state): details = {well, material, volumeUl,
 *     volume} — NO details.labwareId, NO details.wells; the addition carries
 *     the symbolic label. The client's bucket reader (collectEventLabwareIds,
 *     details.* only) finds no bucket — the wells CANNOT ghost in that state.
 *   - deck with an exact name match: details.labwareId = the DECK id
 *     ('LBW-96-1'), details.wells = [well], and NO labwareAdditions.
 *   The CANONICAL stub omits the real unknown-noun(plate) bar (the unseeded
 *   'plate' noun bars too — three requests, not two) and carries the wrong
 *   legacy clarification head (material bar instead of the labware bar).
 *
 * GREEN (fix2 spec): the ghost leg models the intended scenario honestly — an
 * EXISTING deck plate named 'ghost plate' (seeded via the record PUT), so the
 * server genuinely emits details.labwareId + details.wells (option (b); the
 * no-deck characterization below pins WHY option (a) could not prove the
 * server->deck criterion).
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import { parseScientistIntent } from '../compiler/scientistIntent/parseScientistIntent.js';
import { loadNounShape, isMintableLabel } from '../compiler/resolution/nounShape.js';
import {
  compileShorthandDeterministically,
  composeLabwareHintLookupWithDeck,
  factRequestId,
  shorthandResultFromCompile,
} from './shorthandChat.js';

const NOTE = 'Draft compiled deterministically from the scientist-intent shorthand.';
const GHOST_DOC = `intentId: live-plain-dmem
actions:
  - action: add_material
    labwareHint: ghost plate
    targetWells: A1:H12
    volume: { value: 50, unit: uL }
    material: DMEM
`;
const CANONICAL_DOC = `intentId: live-canonical-blob
actions:
  - action: add_material
    labware: plate
    material: 50:50 Trypsin-EDTA/DMEM
    volume: { value: 50, unit: uL }
    targetWells: A1:H12
`;

// The deck the spec seeds via the honest record-PUT path (an existing plate
// the scientist already has; its NAME is what the server's deck binding
// matches, its id is what the bound events carry).
const SEEDED_DECK = [{ labwareId: 'LBW-96-1', labwareType: 'plate_96', name: 'ghost plate' }];

const SEED_RECORDS = [
  {
    recordId: 'MAT-dmem-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'DMEM', title: 'DMEM', synonyms: ['dmem'] },
  },
];

function mockStore() {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async (id: string) => SEED_RECORDS.find((r) => r.recordId === id) ?? null),
    list: vi.fn(async (filter?: { kind?: string }) =>
      SEED_RECORDS.filter((r) => !filter?.kind || r.payload.kind === filter.kind),
    ),
  };
}

async function realResult(doc: string, deck: typeof SEEDED_DECK | undefined) {
  const lookup = composeLabwareHintLookupWithDeck(deck, undefined);
  const compiled = await compileShorthandDeterministically(parseScientistIntent(doc), {
    store: mockStore() as never,
    ...(lookup ? { searchLabwareByHint: lookup } : {}),
  });
  expect(compiled).not.toBeNull();
  return shorthandResultFromCompile(compiled!, doc, NOTE, deck);
}

// ---------------------------------------------------------------------------
// Extract the spec's stub builders VERBATIM and run them. eventId and
// provenance.timestamp are per-compile random and excluded; every other field
// is compared.
// ---------------------------------------------------------------------------
const SPEC_PATH = new URL('../../../app/e2e/deck-ghost-shorthand.spec.ts', import.meta.url);

function specText(): string {
  return readFileSync(SPEC_PATH, 'utf8');
}

async function extractStubFn(spec: string, name: string): Promise<() => Record<string, unknown>> {
  const match = spec.match(new RegExp(`function ${name}\\(\\) \\{[\\s\\S]*?\\n\\}`));
  expect(match, `spec stub builder ${name}() not found in ${SPEC_PATH.pathname}`).not.toBeNull();
  // The builder is self-contained (no host imports) — transpile its TypeScript
  // annotations with esbuild and run the function VERBATIM as the spec wrote it.
  const ts = match![0];
  const js = (await transform(ts, { loader: 'ts', target: 'es2020' })).code;
  return new Function(`${js}; return ${name};`)() as () => Record<string, unknown>;
}

/**
 * SH-QA-1 (B3): the join id's STRING format changed (positional
 * `unresolved-<n>` -> content-keyed `unresolved-c-<hash>`); the app echoes it
 * verbatim and no consumer parses the format. This stub-vs-real pin proves the
 * payload SHAPE the server emits, so ids are compared by POSITIONAL RANK
 * (rank 1..n of clarificationRequests, and the legacy head's rank) — the id
 * FORMAT itself is pinned by its own leg below, never silently.
 */
function comparable(payload: Record<string, unknown> | undefined) {
  const events = ((payload?.events ?? []) as Array<Record<string, unknown>>).map((ev) => ({
    event_type: ev.event_type,
    verb: ev.verb,
    vocabPackId: ev.vocabPackId,
    labwareId: ev.labwareId,
    details: ev.details,
    provenance: {
      actor: (ev.provenance as Record<string, unknown>).actor,
      method: (ev.provenance as Record<string, unknown>).method,
      actionGroupId: (ev.provenance as Record<string, unknown>).actionGroupId,
    },
  }));
  const rankId = (items: unknown): unknown => {
    if (!Array.isArray(items)) return items ?? null;
    return items.map((item, i) => {
      if (!item || typeof item !== 'object') return item;
      const rec = { ...(item as Record<string, unknown>) };
      if ('id' in rec) rec.id = `unresolved-${i + 1}`;
      return rec;
    });
  };
  const head = payload?.clarification as Record<string, unknown> | undefined;
  return {
    success: payload?.success,
    events,
    labwareAdditions: payload?.labwareAdditions ?? null,
    clarificationRequests: rankId(payload?.clarificationRequests),
    clarification: head ? { ...head, ...( 'id' in head ? { id: 'unresolved-1' } : {} ) } : null,
    shorthand: payload?.shorthand,
    notes: payload?.notes ?? null,
  };
}

/**
 * SH-QA-3 (OQ3 ruling): apply the SHIPPED noun-shape DATA gate to the
 * extracted app/e2e stub — the same loader the server card map uses
 * (config/drafting/shorthand-drafting.yaml `nounShape:`). A card whose label
 * fails the shape flips `allowCreateLocal` true→false, drops the ", or create
 * a local term" prompt clause, and loses its `Create local term` candidates
 * (the engine withholds the mint candidate on a shape-refused label). Returns
 * the gated copy + the labels it flipped (the disclosed re-pin delta).
 */
function applyMintGate(stub: Record<string, unknown>): {
  stub: Record<string, unknown>;
  flipped: Array<{ label: string; reason: string }>;
} {
  const shape = loadNounShape();
  const flipped: Array<{ label: string; reason: string }> = [];
  const gateCard = (card: Record<string, unknown> | undefined): void => {
    if (!card) return;
    const fact = card.unresolvedFact as Record<string, unknown> | undefined;
    const label = String(fact?.label ?? card.query ?? '');
    if (isMintableLabel(label, shape)) return;
    flipped.push({ label, reason: String(fact?.reason ?? '') });
    card.allowCreateLocal = false;
    card.prompt = String(card.prompt).replace(', or create a local term', '');
    if (fact?.candidates !== undefined) {
      const kept = (fact.candidates as Array<Record<string, unknown>>)
        .filter((c) => !String(c.label).includes('Create local term'));
      if (kept.length === 0) delete fact.candidates;
      else fact.candidates = kept;
    }
  };
  const copy = structuredClone(stub);
  for (const card of (copy.clarificationRequests ?? []) as Array<Record<string, unknown>>) gateCard(card);
  gateCard(copy.clarification as Record<string, unknown> | undefined);
  return { stub: copy, flipped };
}

describe('fix2/N1: the e2e GHOST stub must equal the real pipeline output for its deck state', () => {
  it('deck-match state (fix2 option (b)): stub === shorthandResultFromCompile(ghost doc, deck[plate named ghost plate])', async () => {
    const stub = (await extractStubFn(specText(), 'fixedShorthandResult'))();
    const real = await realResult(GHOST_DOC, SEEDED_DECK);
    // RED against the fix1 stub: it claims details.labwareId 'ghost plate' +
    // details.wells + labwareAdditions — the real deck-matched payload carries
    // details.labwareId 'LBW-96-1' + details.wells and NO labwareAdditions.
    expect(comparable(stub)).toEqual(comparable(real as unknown as Record<string, unknown>));
  });

  it('the deck-matched payload carries the Part IV carriers on ALL 96 events (details.labwareId = deck id, details.wells = [well], volume + volumeUl)', async () => {
    const real = await realResult(GHOST_DOC, SEEDED_DECK);
    const events = (real.events ?? []) as unknown as Array<Record<string, unknown>>;
    expect(events.length).toBe(96);
    for (const ev of events) {
      const d = ev.details as Record<string, unknown>;
      expect(ev.labwareId).toBe('LBW-96-1');
      expect(d.labwareId).toBe('LBW-96-1');
      expect(Array.isArray(d.wells)).toBe(true);
      expect(d.volume).toEqual({ value: 50, unit: 'uL' });
      expect(d.volumeUl).toBe(50);
      expect(d.material).toBe('DMEM');
    }
    expect((events[0]!.details as Record<string, unknown>).wells).toEqual(['A1']);
    expect((events[95]!.details as Record<string, unknown>).wells).toEqual(['H12']);
    expect(Object.prototype.hasOwnProperty.call(real, 'labwareAdditions')).toBe(false);
    expect(real.shorthand).toBe(GHOST_DOC);
    expect(real.notes).toEqual([NOTE]);
  });
});

describe('fix2/N1: the e2e CANONICAL stub must equal the real needs-clarification payload (three bars, labware head)', () => {
  it('stub === shorthandResultFromCompile(canonical doc, no deck) — SH-QA-3 re-pin (OQ3): the stub predates the mint gate; the shipped noun-shape DATA reconciles it EXACTLY on the two blob cards', async () => {
    const stub = (await extractStubFn(specText(), 'blobClarificationResult'))();
    const real = await realResult(CANONICAL_DOC, undefined);
    // RED against the fix1 stub: it carries TWO requests (both material) and
    // the material bar as the legacy head. The real compile emits THREE:
    // unknown-noun(plate), unknown-noun(blob), unrealized-mixture-blob-material
    // (blob) — and the legacy head is the FIRST request (labware bar, '/l').
    // SH-QA-3 (OQ3 ruling ADOPTED): the server now REFUSES the mint affordance
    // on a blob-label card (nounShape DATA — allowCreateLocal false, prompt
    // clause dropped, mint candidates withheld). The app/e2e stub lives in
    // app/ (NOT this item's file ownership — "No app/ edits" is the task
    // block's hard line), so the honesty pin survives by applying the SAME
    // shipped DATA gate to the extracted stub and pinning that the delta is
    // EXACTLY the two blob cards' mint affordance — nothing else moved. The
    // app-side stub update is handed back to the orchestrator.
    const gated = applyMintGate(stub);
    expect(gated.flipped.map((f) => f.label).sort()).toEqual([
      '50:50 Trypsin-EDTA/DMEM',
      '50:50 Trypsin-EDTA/DMEM',
    ]);
    expect(comparable(gated.stub)).toEqual(comparable(real as unknown as Record<string, unknown>));
  });

  it('SH-QA-3 disclosed re-pin delta: the RAW app/e2e stub still claims the mint affordance on both blob cards (the defect being corrected — app-side stub update handed back, not papered over)', async () => {
    const stub = (await extractStubFn(specText(), 'blobClarificationResult'))();
    const requests = (stub.clarificationRequests as Array<Record<string, unknown>>);
    const blobCards = requests.filter(
      (r) => (r.unresolvedFact as Record<string, unknown>).label === '50:50 Trypsin-EDTA/DMEM',
    );
    expect(blobCards).toHaveLength(2);
    for (const card of blobCards) {
      expect(card.allowCreateLocal, 'the raw stub pre-dates the mint gate').toBe(true);
      expect(String(card.prompt)).toContain('or create a local term');
    }
    // The plate card is mintable and stays untouched by the gate.
    const plateCard = requests.find((r) => (r.unresolvedFact as Record<string, unknown>).label === 'plate')!;
    expect(plateCard.allowCreateLocal).toBe(true);
    expect(applyMintGate(stub).flipped.some((f) => f.label === 'plate')).toBe(false);
  });

  it('the real canonical compile bars the unseeded plate noun too: reasons [unknown-noun(plate), unknown-noun(blob), unrealized-mixture-blob-material(blob)], events []', async () => {
    const real = await realResult(CANONICAL_DOC, undefined);
    expect(real.success).toBe(true);
    expect(real.events).toEqual([]);
    const requests = real.clarificationRequests as unknown as Array<Record<string, unknown>>;
    expect(requests.length).toBe(3);
    expect(requests.map((r) => (r.unresolvedFact as Record<string, unknown>).reason)).toEqual([
      'unknown-noun',
      'unknown-noun',
      'unrealized-mixture-blob-material',
    ]);
    expect(requests.map((r) => (r.unresolvedFact as Record<string, unknown>).label)).toEqual([
      'plate',
      '50:50 Trypsin-EDTA/DMEM',
      '50:50 Trypsin-EDTA/DMEM',
    ]);
    // SH-QA-1: the head id is the CONTENT join id of the first bar fact
    // (the plate unknown-noun) — format pinned, order unchanged.
    expect(real.clarification).toEqual({
      id: factRequestId((real.clarificationRequests as unknown as Array<{ unresolvedFact: any }>)[0]!.unresolvedFact),
      prompt: 'The draft names "plate" and the lab spine could not bind it (unknown-noun). Choose what it is, or create a local term.',
      entityType: 'labware',
      options: [],
      menuProvider: '/l',
      query: 'plate',
      allowCreateLocal: true,
    });
    expect(real.shorthand).toBe(CANONICAL_DOC);
    expect(Object.prototype.hasOwnProperty.call(real, 'notes')).toBe(false);
  });
});

describe('fix2/N1: why option (b) — the no-deck state cannot prove the server->deck ghost criterion', () => {
  it('no-deck payload: details carries NO labwareId and NO wells, so collectEventLabwareIds buckets the 96 events under NOTHING (the wells cannot render)', async () => {
    const real = await realResult(GHOST_DOC, undefined);
    const events = (real.events ?? []) as unknown as Array<Record<string, unknown>>;
    expect(events.length).toBe(96);
    expect(events.every((ev) => !('labwareId' in (ev.details as object)))).toBe(true);
    expect(events.every((ev) => !('wells' in (ev.details as object)))).toBe(true);
    // The symbolic label rides the TOP level + the addition only:
    expect(events[0]!.labwareId).toBe('ghost plate');
    expect(real.labwareAdditions).toEqual([{ recordId: 'ghost plate', reason: 'ProtocolIntent labware resource ghost plate' }]);
    // collectEventLabwareIds (previewProjection.ts) reads details.* only —
    // an honest no-deck leg would prove the GAP, not the Part IV fix.
  });

  it('the spec must not re-introduce the unreachable combination (symbolic details.labwareId + labwareAdditions)', () => {
    const spec = specText();
    expect(spec).not.toMatch(/labwareId:\s*'ghost plate'/);
    expect(spec).not.toMatch(/labwareAdditions:\s*\[/);
  });
});
