/**
 * W211-MACH-1 golden fixture integrity test (vitest, no model calls, deterministic).
 *
 * WHAT THIS GATES (spec GATES/VERIFICATION): the fixture's own claims are
 * checked against PRODUCT BEHAVIOUR, not asserted in test code —
 *   1. self-pin: the fixture's sha256 matches the pinned value (drift refuses the gate);
 *   2. the obligation table exists with its four declared classes, and NO
 *      obligation is a labware-mint request (material-only mint posture);
 *   3. every id literal in the fixture is a SEED id from its own seedPlan —
 *      no fixture-pinned mint/accept ids (MAT-minted / LPR- / CAN-);
 *   4. the frozen macro is vocabulary-conformant: every verb is declared in
 *      schema/scientist-intent/scientist-intent-vocabulary.yaml, every argument
 *      it uses is a declared argument of that verb, and NO declared-required
 *      argument is omitted (so the compile cannot trip a missing-required sweep);
 *   5. each planted fact's ANSWER SURFACE is the product adapter's own verdict:
 *      the wire fact is fed through heldFactToClarificationRequest
 *      (ProtocolLocalizationThread.clarificationAdapter.ts) and the card/menu/
 *      options it produces must match the fixture's expectation.
 *
 * RED-FIRST PIN (W211-MACH-1 verified-by, verbatim: "RED first at the pre-fix
 * tip (fixture cards on '/m' / answered facts survive)"): pin 5b — the
 * labware-argument card routes '/l' — is the ANSWER-SURFACE-1 behaviour. At the
 * pre-fix tip 534f7e5f the adapter had no (reason, argument) table and routed
 * every noun fact to '/m', so this file is RED there and GREEN at the merged
 * tip (5cdfb8d0). Pin 5d (the gap fact gets NO card) holds at BOTH tips: it is
 * the class-(d) BLOCKED-ON-FIX record (named fix task W211-GAPCARD-1), not a
 * regression pin.
 *
 * EVIDENCE STATEMENT (the fixture's own words, restated here because this file
 * is part of the evidence chain): the golden harness is a WORKFLOW-INTEGRATION
 * test whose producer is REPLACED AT ITS WIRE BOUNDARY. This test proves the
 * fixture's data and the product's answer surfaces agree; it is NOT model proof.
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import {
  heldFactToClarificationRequest,
} from '../../../src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationAdapter'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../../../..')
const FIXTURE_PATH = join(HERE, 'zymo-intent.frozen.yaml')
const VOCABULARY_PATH = join(REPO_ROOT, 'schema', 'scientist-intent', 'scientist-intent-vocabulary.yaml')

/** Self-pin (PROVENANCE.md carries the same value; drift refuses the gate). */
const FIXTURE_SHA = '706838e9e6f719ce57b339e67f917d54135ddcbcab72ea205e795b483ed35640'

const fixtureBytes = readFileSync(FIXTURE_PATH)
const fixture = parseYaml(fixtureBytes.toString('utf8'))
const vocabulary = parseYaml(readFileSync(VOCABULARY_PATH, 'utf8'))

const declaredVerbs = new Map<string, { name: string; required: string[]; all: string[] }>()
for (const verb of vocabulary?.verbs ?? []) {
  const args = Array.isArray(verb?.args) ? verb.args : []
  declaredVerbs.set(String(verb.name), {
    name: String(verb.name),
    all: args.map((a: any) => String(a.name)),
    required: args.filter((a: any) => a.required === true).map((a: any) => String(a.name)),
  })
}

describe('W211-MACH-1 golden fixture integrity (zymo-intent.frozen.yaml v1)', () => {
  it('1. self-pin: fixture bytes match the pinned sha256 (drift refuses the gate)', () => {
    const sha = createHash('sha256').update(fixtureBytes).digest('hex')
    expect(sha, 'fixture drift — update PROVENANCE.md and re-review before running the gate').toBe(FIXTURE_SHA)
    expect(fixture.fixtureId).toBe('w211-golden-zymo-bench-prep')
    expect(fixture.version).toBe(1)
  })

  it('2. the obligation table carries the four declared classes, and no obligation is a labware-mint request', () => {
    const obligations = fixture.obligations ?? []
    expect(obligations.length, 'four obligation classes per the W211-MACH-1 block').toBe(4)
    const classes = obligations.map((o: any) => o.class)
    expect(classes).toContain('role-uniquely-resolvable-noun')
    expect(classes).toContain('genuine-ambiguity-on-labware-semantic-slot')
    expect(classes).toContain('unknown-noun-material')
    expect(classes).toContain('one-gap-fact-answered-through-its-real-surface')

    // Material-only mint posture (VocabHandlers MINTABLE is material-only; a
    // labware mint is a defect finding, never a workaround).
    const mintableRefKinds = obligations
      .filter((o: any) => /mint/i.test(String(o.expected ?? '') + String(o.status ?? '')))
      .map((o: any) => (String(o.expected).match(/refKind:\s*'([a-z]+)'/) ?? [])[1])
      .filter(Boolean)
    for (const kind of mintableRefKinds) expect(kind, 'mint is material-only').toBe('material')

    // The labware-slot obligation answers by PICK, never by mint: its declared
    // answer is the labware pick idiom, and the fixture never asks for a
    // labware-kind mint (MINTABLE is material-only — a labware mint is a defect).
    const labwareSlot = obligations.find((o: any) => o.class === 'genuine-ambiguity-on-labware-semantic-slot')
    expect(String(labwareSlot.expected), "the labware-slot answer is a '/l' PICK").toContain('PICKING')
    expect(String(labwareSlot.expected), 'the pick emits the labware idiom').toContain('[[labware:')
    expect(fixtureBytes.toString('utf8'), "no obligation may request a refKind:'labware' mint").not.toMatch(/refKind:\s*'labware'/)

    // Class-(d) is recorded BLOCKED-ON-FIX with the named fix task, not silently dropped.
    const gap = obligations.find((o: any) => o.class === 'one-gap-fact-answered-through-its-real-surface')
    expect(String(gap.status), 'class-(d) is BLOCKED-ON-FIX, not weakened').toContain('BLOCKED-ON-FIX')
    expect(String(gap.status)).toContain('W211-GAPCARD-1')
  })

  it('3. every id literal in the fixture is a seedPlan seed id — no fixture-pinned mint/accept ids', () => {
    const seedIds = new Set<string>([
      ...(fixture.seedPlan?.seededLabware ?? []).map((r: any) => String(r.recordId)),
      ...(fixture.seedPlan?.seededMaterials ?? []).map((r: any) => String(r.recordId)),
    ])
    // Scan the fixture's DATA (comments stripped: prose may cite seed ids and
    // line-wrapping would fake a truncated literal). Minted/accepted ids must
    // never be pinned anywhere in the fixture.
    const dataText = fixtureBytes.toString('utf8').replace(/#[^\n]*/g, '')
    const idLiterals = dataText.match(/\b(?:MAT|LAB)-[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9]/g) ?? []
    const offenders = [...new Set(idLiterals)].filter((id) => !seedIds.has(id))
    expect(offenders, 'fixture-pinned record ids (minted/accepted ids must be read dynamically)').toEqual([])
    expect(dataText, 'no pinned local-protocol id').not.toMatch(/\bLPR-/)
    expect(dataText, 'no pinned promoted-family id').not.toMatch(/\bCAN-protocol-/)
    // The zero-match noun must NOT be seeded anywhere (a seeded (c) noun vacuates the unknown-noun leg).
    const zeroMatch = (fixture.seedPlan?.zeroMatchNouns ?? []).map((z: any) => String(z.noun))
    expect(zeroMatch.length).toBeGreaterThan(0)
    const seededNames = [
      ...(fixture.seedPlan?.seededLabware ?? []).map((r: any) => String(r.name)),
      ...(fixture.seedPlan?.seededMaterials ?? []).map((r: any) => String(r.name)),
    ]
    for (const noun of zeroMatch) {
      expect(seededNames, `zero-match noun '${noun}' must stay unseeded`).not.toContain(noun)
    }
  })

  it('4. the frozen macro is vocabulary-conformant: declared verbs, declared args, no omitted required arg', () => {
    const actions = fixture.modelOutput?.actions ?? []
    expect(actions.length, 'the macro carries the fixture protocol steps').toBeGreaterThan(0)
    for (const action of actions) {
      const verb = declaredVerbs.get(String(action.action))
      expect(verb, `undeclared verb '${action.action}' (vocabulary is the closed set)`).toBeTruthy()
      const used = Object.keys(action).filter((k) => k !== 'action')
      for (const key of used) {
        expect(verb!.all, `undeclared argument '${key}' on verb '${action.action}'`).toContain(key)
      }
      for (const required of verb!.required) {
        expect(used, `omitted REQUIRED argument '${required}' on '${action.action}' would trip a missing-required sweep`).toContain(required)
      }
    }
  })

  it('5. each planted fact reaches the answer surface the fixture claims — the PRODUCT ADAPTER decides', () => {
    const planted = fixture.plantedFacts ?? []
    expect(planted.length, 'one planted entry per obligation class').toBe(4)

    for (const entry of planted) {
      const expected = entry.expected ?? {}
      const wire = entry.wire

      if (wire === null) {
        // Class-(a): a uniquely-resolvable in-band noun produces NO fact at all
        // (probeE: zero facts name it). Nothing to map; the obligation is proven
        // by the harness leg asserting no card ever names the noun.
        expect(expected.expectedCard, 'class-(a) must be a silent resolution').toBe(false)
        continue
      }

      const request = heldFactToClarificationRequest(wire, 0)

      if (expected.expectedCard === false) {
        expect(request, `fact '${wire.label}' must NOT get a card (adapter maps it to null)`).toBeNull()
        continue
      }

      expect(request, `fact '${wire.label}' must get an answerable card`).not.toBeNull()
      expect(request!.menuProvider, `obligation ${entry.obligation} menu surface`).toBe(expected.expectedMenu)
      expect(request!.prompt, 'the card names the fact itself').toBe(wire.label)
      expect(request!.query, 'the picker search seeds from the fact label').toBe(wire.label)
      expect(request!.options.map((o) => o.label), 'card option buttons').toEqual(expected.expectedOptionLabels)

      // ANSWER-SURFACE-1 pin (RED at the pre-fix tip 534f7e5f, GREEN at tip):
      // a fact whose actionLocation.argument is 'labware' routes '/l' — the
      // labware menu — and NOT '/m', which is where a mint floor would live.
      if (wire.actionLocation?.argument === 'labware') {
        expect(request!.menuProvider, "ANSWER-SURFACE-1: argument 'labware' routes '/l'").toBe('/l')
        expect(request!.options.length, 'the ambiguity stays non-vacuous (two in-band candidates)').toBe(2)
      }
      // MINT-FLOOR-UI-1: the server's tier-5 mint affordance for the fact's OWN
      // label is dropped as a dead-end option button; the picker's floor row is
      // the card's ONE mint act.
      if (expected.expectedMenu === '/m') {
        for (const option of request!.options) {
          expect(option.label, 'no dead-end mint option for this fact').not.toMatch(/^Create local term/)
        }
      }
      // The answer idiom the fixture declares must be the idiom the picker emits.
      if (expected.expectedAnswerIdiom) {
        expect(String(expected.expectedAnswerIdiom)).toMatch(/^\[\[(labware|material):<[^>]+>\|label\]\]$/)
      }
      if (expected.blockedOnFix) {
        expect(String(expected.blockedOnFix)).toBe('W211-GAPCARD-1')
      }
    }
  })

  it('6. the deck fidelity bar is label-correspondence (not boxCount>0) and links to the PICKED seed', () => {
    const deck = fixture.expectedDeck ?? {}
    expect(deck.exactCheckboxCount, 'the completing compile resolves exactly these labware (probeF2)').toBe(4)
    expect(deck.mustIncludeLabels).toContain(deck.pickedCheckboxLabel)
    // The picked label must be a REAL seeded record title, never a string-guess.
    const seededTitles = new Set((fixture.seedPlan?.seededLabware ?? []).map((r: any) => String(r.name)))
    for (const label of deck.mustIncludeLabels) {
      expect(seededTitles, `deck label '${label}' must be a seeded record's real title`).toContain(label)
    }
    expect(deck.mustIncludeLabels.length).toBe(deck.exactCheckboxCount)
  })

  it('7. the fixture states its own evidence label (workflow-integration, wire-boundary producer, NOT model proof)', () => {
    expect(fixture.evidenceStatement).toContain('workflow-integration')
    expect(fixture.evidenceStatement).toContain('wire boundary')
    expect(fixture.evidenceStatement).toContain('NOT model proof')
  })
})
