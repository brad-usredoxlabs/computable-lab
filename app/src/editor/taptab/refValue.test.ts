/**
 * QMS-6E D3b — the ref value-emission contract (RED-first).
 *
 * Ref-typed fields (ref/combobox/reflist) carry structured objects or are ABSENT.
 * A display placeholder must never exist as a field VALUE. The emission layer
 * (ref widget / fieldRow / projection document builder) owns this rule:
 * an empty-or-placeholder ref value normalizes to `null` ("unset"), which the
 * serializer then OMITS from the write payload.
 */

import { describe, it, expect } from 'vitest'
import {
  isRefWidget,
  isDisplayOnlyRefValue,
  normalizeRefFieldValue,
} from './refValue'

describe('refValue — ref field value-emission contract (QMS-6E D3b)', () => {
  it('identifies ref-family widgets (the widget whose stored value is a ref object)', () => {
    expect(isRefWidget('ref')).toBe(true)
    // combobox stores a vocab STRING; reflist stores an ARRAY of entries —
    // neither is the `type: object` ref slot the contract guards.
    expect(isRefWidget('combobox')).toBe(false)
    expect(isRefWidget('reflist')).toBe(false)
    expect(isRefWidget('text')).toBe(false)
    expect(isRefWidget('markdown')).toBe(false)
  })

  it('recognizes display-only placeholder strings as NOT values', () => {
    expect(isDisplayOnlyRefValue('—')).toBe(true) // em dash
    expect(isDisplayOnlyRefValue('–')).toBe(true) // en dash
    expect(isDisplayOnlyRefValue('-')).toBe(true) // hyphen
    expect(isDisplayOnlyRefValue('')).toBe(true)
    expect(isDisplayOnlyRefValue('  ')).toBe(true)
    expect(isDisplayOnlyRefValue('— Reviewer —')).toBe(false) // real content survives
    expect(isDisplayOnlyRefValue('USR-BRAD')).toBe(false)
  })

  it('treats null/undefined/objects as non-placeholder (structured refs pass through)', () => {
    expect(isDisplayOnlyRefValue(null)).toBe(false)
    expect(isDisplayOnlyRefValue(undefined)).toBe(false)
    const ref = { kind: 'record', type: 'user', id: 'USR-X' }
    expect(normalizeRefFieldValue(ref, 'ref')).toBe(ref)
  })

  it('normalizeRefFieldValue maps placeholder/empty ref values to null (the true empty)', () => {
    expect(normalizeRefFieldValue('—', 'ref')).toBeNull()
    expect(normalizeRefFieldValue('', 'ref')).toBeNull()
    expect(normalizeRefFieldValue('  ', 'ref')).toBeNull()
  })

  it('normalizeRefFieldValue leaves real values and non-ref widgets untouched', () => {
    const ref = { kind: 'record', type: 'user', id: 'USR-X' }
    expect(normalizeRefFieldValue(ref, 'ref')).toBe(ref)
    expect(normalizeRefFieldValue('USR-BRAD', 'ref')).toBe('USR-BRAD')
    // Non-ref widgets keep their values as-is (empty strings are their business).
    expect(normalizeRefFieldValue('', 'text')).toBe('')
    expect(normalizeRefFieldValue('—', 'text')).toBe('—')
  })
})
