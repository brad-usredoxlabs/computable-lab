/**
 * L2-CLARIFY-TARGET-1 (Change 5 / P7) — unit pins for the DECLARATIVE
 * row-fact formatter `proposalRowFact` and the record-id source
 * `recordIdsFromLastUserMessage`.
 *
 * Spec (re-pin, Change 5 :381-397, test 8 :447-449):
 *   - `A2 ← 100 uL DMEM (MAT-dmem-ykg0)` for `{well:'A2', material:'DMEM',
 *     volumeUl:100}` + a matching id;
 *   - id omitted when the map lacks the label (no invention);
 *   - `volume: {value:100, unit:'uL'}` renders identically (the two wire
 *     shapes the compile emits — the eventDetailLine unit-honour discipline);
 *   - an incubate event renders `null` (the caller keeps its own line).
 *
 * Bait #9 (spec :583-585): the `(MAT-dmem-ykg0)` must come from the
 * transcript's mention token. A row that prints an id it did not receive is
 * fabrication; an id must NOT appear when the label does not match.
 *
 * The W13 shape (receipts/CLARIFY-WEIRD-20261101/20261101_174042, MODAL FULL):
 * the four identical rows' details carry `well` (string), `material`
 * (string), `volumeUl` (number), `volume` ({value, unit}) and `wells`
 * (array) at once — the formatter reads `well` first, then `wells`; and a
 * multi-well `wells` array renders as `A2, A3, B2, B3`.
 */
import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../types/ai'
import { proposalRowFact, recordIdsFromLastUserMessage } from './proposalRowFacts'

const idMap = new Map<string, string>([
  ['DMEM', 'MAT-dmem-ykg0'],
  ['DMEM + FBS', 'MAT-dmem-fbs-x7'],
])

describe('proposalRowFact — the checkable row fact from the event OWN details', () => {
  it('renders `A2 ← 100 uL DMEM (MAT-dmem-ykg0)` for the W13 detail shape', () => {
    const event = {
      eventId: 'EVT-1',
      event_type: 'add_material',
      details: { well: 'A2', material: 'DMEM', volumeUl: 100 },
    }
    // fix run 4 / D1 CONFORM (ruling l2t0937 Q3): the result is { text,
    // carried } — carried is the ONE declaration of the detail fields the
    // fact text already shows (the caller excludes them from the residual).
    const fact = proposalRowFact(event, idMap)
    expect(fact?.text).toBe('A2 ← 100 uL DMEM (MAT-dmem-ykg0)')
    expect([...fact!.carried].sort()).toEqual(['material', 'volume', 'well'])
  })

  it('id is omitted when the map lacks the label (never invented)', () => {
    const event = {
      eventId: 'EVT-1',
      event_type: 'add_material',
      details: { well: 'A2', material: 'DMEM', volumeUl: 100 },
    }
    expect(proposalRowFact(event, new Map<string, string>())?.text).toBe('A2 ← 100 uL DMEM')
    // no map at all (no last user message) → same honest rendering.
    expect(proposalRowFact(event)?.text).toBe('A2 ← 100 uL DMEM')
    // the record id is TRANSCRIPT provenance, not a displayable detail
    // field — it is not in `carried`:
    expect(proposalRowFact(event, idMap)!.carried.has('volume')).toBe(true)
    expect(proposalRowFact(event, idMap)!.carried.size).toBe(3)
  })

  it('a label mismatch yields NO id (bait #9: the bound row is `DMEM + FBS`, the map has `DMEM`)', () => {
    const event = {
      eventId: 'EVT-1',
      event_type: 'add_material',
      details: { well: 'A3', material: 'DMEM + FBS', volumeUl: 100 },
    }
    // A map that has an id for `DMEM` — it must NOT leak onto `DMEM + FBS`
    // (the exact W13 reviewer check: the answer said `DMEM`, the row is
    // `DMEM + FBS` → no id, never a substring match):
    expect(proposalRowFact(event, new Map([['DMEM', 'MAT-dmem-ykg0']]))?.text).toBe(
      'A3 ← 100 uL DMEM + FBS',
    )
    // and the EXACT matching label DOES get its own id.
    expect(proposalRowFact(event, new Map([['DMEM + FBS', 'MAT-dmem-fbs-x7']]))?.text).toBe(
      'A3 ← 100 uL DMEM + FBS (MAT-dmem-fbs-x7)',
    )
  })

  it('volume: {value, unit} renders identically to the number arm (the two wire shapes)', () => {
    const byUl = { eventId: 'E1', details: { well: 'A2', material: 'DMEM', volumeUl: 100 } }
    const byObject = { eventId: 'E2', details: { well: 'A2', material: 'DMEM', volume: { value: 100, unit: 'uL' } } }
    expect(proposalRowFact(byUl)?.text).toBe('A2 ← 100 uL DMEM')
    expect(proposalRowFact(byObject)?.text).toBe('A2 ← 100 uL DMEM')
    // the record's own unit is kept verbatim (never re-labelled).
    const otherUnit = { eventId: 'E3', details: { well: 'A2', volume: { value: 75, unit: 'mL' } } }
    expect(proposalRowFact(otherUnit)?.text).toBe('A2 ← 75 mL')
    // carried names the field, not the wire shape: both volume arms carry
    // `volume` (what eventDetailLine's volume arm renders).
    expect(proposalRowFact(byUl)!.carried.has('volume')).toBe(true)
    expect(proposalRowFact(byObject)!.carried.has('volume')).toBe(true)
  })

  it('details.wells (array) renders the well list; details.well (string) wins when both are present', () => {
    const withArray = {
      eventId: 'E1',
      details: { wells: ['A2', 'A3', 'B2', 'B3'], material: 'DMEM', volumeUl: 100 },
    }
    expect(proposalRowFact(withArray)?.text).toBe('A2, A3, B2, B3 ← 100 uL DMEM')
    // the array arm carries `wells` (eventDetailLine's wells arm, not
    // the string `well` arm):
    expect(proposalRowFact(withArray)!.carried.has('wells')).toBe(true)
    expect(proposalRowFact(withArray)!.carried.has('well')).toBe(false)
    // the W13 shape carries BOTH (`well: "A2"`, `wells: ["A2"]`) — the
    // string wins; the row stays a single-well fact.
    const both = {
      eventId: 'E2',
      details: { well: 'A2', wells: ['A2', 'A3', 'B2', 'B3'], material: 'DMEM', volumeUl: 100 },
    }
    expect(proposalRowFact(both)?.text).toBe('A2 ← 100 uL DMEM')
    expect(proposalRowFact(both)!.carried.has('well')).toBe(true)
    expect(proposalRowFact(both)!.carried.has('wells')).toBe(false)
  })

  it('an incubate event renders null (the caller keeps its own eventDetailLine)', () => {
    const incubate = {
      eventId: 'E1',
      event_type: 'incubate',
      details: { duration: 'overnight', temperature: 37, labwareId: 'lbw-seed-plate-96-flat' },
    }
    expect(proposalRowFact(incubate)).toBeNull()
  })

  it('no recognised field at all ⇒ null (dead chrome is not added)', () => {
    expect(proposalRowFact({ eventId: 'E1', details: { labwareId: 'lbw-x' } })).toBeNull()
    expect(proposalRowFact({ eventId: 'E1' })).toBeNull()
    expect(proposalRowFact({ eventId: 'E1', details: null })).toBeNull()
    // empty / non-string values are not displayable fields.
    expect(
      proposalRowFact({ eventId: 'E1', details: { well: '', material: '  ', volumeUl: Number.NaN } }),
    ).toBeNull()
  })
})

describe('recordIdsFromLastUserMessage — the transcript mention token is the id home', () => {
  function userMessage(content: string, id = 'u1'): ChatMessage {
    return { id, role: 'user', content, timestamp: 0 }
  }

  it('builds the label → id map from the LAST user message material mentions', () => {
    const messages: ChatMessage[] = [
      userMessage('old answer [[material:MAT-old-1|DMEM]]', 'u0'),
      { id: 'a1', role: 'assistant', content: 'staged', timestamp: 1 },
      userMessage('Use [[material:MAT-dmem-ykg0|DMEM]] for material.', 'u1'),
    ]
    const map = recordIdsFromLastUserMessage(messages)
    expect(map).not.toBeNull()
    expect(map?.get('DMEM')).toBe('MAT-dmem-ykg0')
  })

  it('a mention WITHOUT an id contributes nothing', () => {
    const map = recordIdsFromLastUserMessage([
      userMessage('Use [[material:|DMEM]] for material.', 'u1'),
    ])
    expect(map).toBeNull()
  })

  it('no last user message (or none with mentions) ⇒ null (rows render without ids)', () => {
    expect(recordIdsFromLastUserMessage([])).toBeNull()
    expect(recordIdsFromLastUserMessage([{ id: 'a1', role: 'assistant', content: 'hi', timestamp: 0 }])).toBeNull()
    expect(recordIdsFromLastUserMessage([userMessage('no mentions here', 'u1')])).toBeNull()
  })

  it('material-spec and aliquot mentions also carry material ids (the parser shape)', () => {
    const map = recordIdsFromLastUserMessage([
      userMessage(
        'Use [[material-spec:MSP-x1|1 mM Clofibrate]] and [[aliquot:ALI-x2|DMSO stock]]',
        'u1',
      ),
    ])
    expect(map?.get('1 mM Clofibrate')).toBe('MSP-x1')
    expect(map?.get('DMSO stock')).toBe('ALI-x2')
  })
})
