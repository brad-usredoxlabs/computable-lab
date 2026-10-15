/**
 * HARNESS-SEQ-2 — the sequences-side agent-action executor (RED-first suite).
 *
 * Contract under test (the item's acceptance criteria):
 *  - a `sequence-tab` target whose tab the page DECLARES -> the setTab effect;
 *  - a `sequence-tab` target whose tab is NOT declared -> NAMED refusal,
 *    ZERO effects (an invalid action changes nothing and says why);
 *  - a `sequence-record` / resolved `record` target whose id the page's
 *    library shows -> the selectRecord effect;
 *  - the mount adapter calls the page's OWN selectRecord — the canLeave()
 *    guard is INHERITED, never reimplemented — and the agent path SPEAKS
 *    (returns the honest line) when the guard blocked the navigation, where
 *    the human path stays silent;
 *  - `canLeave()` strictness: only `=== false` blocks (an unmounted editor
 *    returning undefined is NOT a block);
 *  - an unroutable target kind -> NAMED diagnostic, ZERO effects (never a
 *    guess);
 *  - the handler branches on TARGET KIND only — never on surface names, tab
 *    names, or labels (zero-policy-in-code law);
 *  - exactOptionalPropertyTypes: absent keys are OMITTED, never `undefined`,
 *    and "nothing to say" is `undefined`, never `''`.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  applyAgentAction,
  createSequencesAgentActionHandler,
  type SequencesAgentActionState,
} from './applyAgentAction'
import type { AiAgentActionEnvelope } from '../types/ai'

const TABS = ['Editor', 'Assay', 'Analysis', 'Setup', 'Import', 'Knowledge'] as const

function state(overrides: Partial<SequencesAgentActionState> = {}): SequencesAgentActionState {
  return {
    tabs: TABS,
    selected: '',
    visible: [{ recordId: 'SEQ-PUC19' }, { recordId: 'SEQ-LAMBDA' }],
    ...overrides,
  }
}

describe('applyAgentAction — the pure decision (it decides, it never navigates)', () => {
  it('a declared sequence-tab target yields the setTab effect and nothing else', () => {
    const action = {
      action: 'open-surface',
      surface: 'sequences',
      target: { kind: 'sequence-tab', tab: 'Analysis' },
    } as unknown as AiAgentActionEnvelope
    const result = applyAgentAction(action, state())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.effects).toEqual({ setTab: 'Analysis' })
    // exactOptionalPropertyTypes: nothing to say means the key is ABSENT.
    expect('message' in result).toBe(false)
  })

  it('an undeclared tab is a NAMED refusal with ZERO effects', () => {
    const action = {
      action: 'open-surface',
      surface: 'sequences',
      target: { kind: 'sequence-tab', tab: 'Settings' },
    } as unknown as AiAgentActionEnvelope
    const result = applyAgentAction(action, state())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.effects).toEqual({})
    expect(result.reason.length).toBeGreaterThan(0)
    expect(result.reason).toContain('Settings')
  })

  it('a sequence-record target the library shows yields the selectRecord effect', () => {
    const action = {
      action: 'focus',
      surface: 'sequences',
      target: { kind: 'sequence-record', recordId: 'SEQ-PUC19', label: 'pUC19' },
    } as unknown as AiAgentActionEnvelope
    const result = applyAgentAction(action, state())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.effects).toEqual({ selectRecordId: 'SEQ-PUC19' })
  })

  it('a resolved record ref (the Ref arm) routes the same way — kind-driven, not name-driven', () => {
    const action: AiAgentActionEnvelope = {
      action: 'focus',
      target: { kind: 'record', id: 'SEQ-LAMBDA', type: 'sequence', label: 'Lambda control' },
    }
    const result = applyAgentAction(action, state())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.effects).toEqual({ selectRecordId: 'SEQ-LAMBDA' })
  })

  it('a record id the page does not list is a NAMED refusal, never a blind select', () => {
    const action = {
      action: 'focus',
      surface: 'sequences',
      target: { kind: 'sequence-record', recordId: 'SEQ-NOPE' },
    } as unknown as AiAgentActionEnvelope
    const result = applyAgentAction(action, state())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.effects).toEqual({})
    expect(result.reason).toContain('SEQ-NOPE')
  })

  it('selecting the already-selected record changes nothing (idempotent, with an honest note)', () => {
    const action: AiAgentActionEnvelope = {
      action: 'focus',
      target: { kind: 'record', id: 'SEQ-PUC19', type: 'sequence' },
    }
    const result = applyAgentAction(action, state({ selected: 'SEQ-PUC19' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.effects).toEqual({})
  })

  it('an unroutable target kind is a NAMED diagnostic with ZERO effects (never a guess)', () => {
    const action: AiAgentActionEnvelope = {
      action: 'focus',
      target: { kind: 'protocol-step', protocolId: 'PRT-1', stepId: 'step-1' },
    }
    const result = applyAgentAction(action, state())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.effects).toEqual({})
    expect(result.reason.length).toBeGreaterThan(0)
  })

  it('a target-less action is a NAMED refusal, not a silent no-op', () => {
    const result = applyAgentAction({ action: 'open-surface', surface: 'sequences' }, state())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.effects).toEqual({})
  })

  it('idempotence: the same tab frame applied twice decides identically', () => {
    const action = {
      action: 'open-surface',
      surface: 'sequences',
      target: { kind: 'sequence-tab', tab: 'Knowledge' },
    } as unknown as AiAgentActionEnvelope
    const first = applyAgentAction(action, state())
    const second = applyAgentAction(action, state())
    expect(second).toEqual(first)
  })
})

describe('createSequencesAgentActionHandler — the mount adapter (guard INHERITED)', () => {
  function mount(overrides: { canLeave?: boolean | undefined } = {}) {
    const setTab = vi.fn()
    const selectRecord = vi.fn()
    const editorCanLeave = vi.fn(() => overrides.canLeave as boolean | undefined)
    const handler = createSequencesAgentActionHandler({
      tabs: TABS,
      records: () => [{ recordId: 'SEQ-PUC19' }],
      selected: () => '',
      editorCanLeave,
      setTab,
      selectRecord,
    })
    return { handler, setTab, selectRecord, editorCanLeave }
  }

  it('a valid tab frame calls the page setTab and returns NO diagnostic (undefined, never "")', () => {
    const { handler, setTab } = mount({ canLeave: true })
    const diagnostic = handler({
      action: 'open-surface',
      surface: 'sequences',
      target: { kind: 'sequence-tab', tab: 'Analysis' },
    } as unknown as AiAgentActionEnvelope)
    expect(setTab).toHaveBeenCalledWith('Analysis')
    expect(diagnostic).toBeUndefined()
  })

  it('a blocked record switch calls selectRecord anyway (guard INHERITED) and returns the honest line', () => {
    const { handler, selectRecord } = mount({ canLeave: false })
    const diagnostic = handler({
      action: 'focus',
      surface: 'sequences',
      target: { kind: 'sequence-record', recordId: 'SEQ-PUC19' },
    } as unknown as AiAgentActionEnvelope)
    // The page's own selectRecord is the navigator — the handler never
    // reimplements the canLeave guard, it only READS the same handle to know
    // whether to speak.
    expect(selectRecord).toHaveBeenCalledWith('SEQ-PUC19')
    expect(typeof diagnostic).toBe('string')
    expect(diagnostic).toMatch(/draft/i)
    expect(diagnostic).toMatch(/nothing was changed/i)
  })

  it('an unmounted editor (canLeave undefined) is NOT a block (=== false strictness)', () => {
    const { handler, selectRecord } = mount({ canLeave: undefined })
    const diagnostic = handler({
      action: 'focus',
      surface: 'sequences',
      target: { kind: 'sequence-record', recordId: 'SEQ-PUC19' },
    } as unknown as AiAgentActionEnvelope)
    expect(selectRecord).toHaveBeenCalledWith('SEQ-PUC19')
    expect(diagnostic).toBeUndefined()
  })

  it('a TAB switch is NOT draft-guarded (human tab clicks are not) — neither stricter nor looser', () => {
    const { handler, setTab } = mount({ canLeave: false })
    const diagnostic = handler({
      action: 'open-surface',
      surface: 'sequences',
      target: { kind: 'sequence-tab', tab: 'Assay' },
    } as unknown as AiAgentActionEnvelope)
    expect(setTab).toHaveBeenCalledWith('Assay')
    expect(diagnostic).toBeUndefined()
  })

  it('an invalid frame changes NOTHING on the page and returns the named reason', () => {
    const { handler, setTab, selectRecord } = mount({ canLeave: true })
    const diagnostic = handler({
      action: 'open-surface',
      surface: 'sequences',
      target: { kind: 'sequence-tab', tab: 'Settings' },
    } as unknown as AiAgentActionEnvelope)
    expect(setTab).not.toHaveBeenCalled()
    expect(selectRecord).not.toHaveBeenCalled()
    expect(typeof diagnostic).toBe('string')
    expect(diagnostic).toContain('Settings')
  })
})
