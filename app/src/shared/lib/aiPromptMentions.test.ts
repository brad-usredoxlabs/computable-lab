import { describe, it, expect } from 'vitest'
import { parsePromptMentionMatches, parsePromptMentions, formatProtocolMentionToken } from './aiPromptMentions'

describe('aiPromptMentions', () => {
  describe('formatProtocolMentionToken', () => {
    it('formats protocol mention token correctly', () => {
      const token = formatProtocolMentionToken('protocol', 'PRT-123', 'PBS Wash')
      expect(token).toBe('[[protocol:PRT-123|PBS Wash]]')
    })

    it('formats graph-component mention token correctly', () => {
      const token = formatProtocolMentionToken('graph-component', 'GC-456', 'Serial Dilution')
      expect(token).toBe('[[graph-component:GC-456|Serial Dilution]]')
    })
  })

  describe('parsePromptMentionMatches - protocol and graph-component', () => {
    it('parses protocol mention', () => {
      const result = parsePromptMentionMatches('foo [[protocol:PRT-123|PBS Wash]] bar')
      expect(result).toHaveLength(1)
      expect(result[0]?.mention).toEqual({
        type: 'protocol',
        entityKind: 'protocol',
        id: 'PRT-123',
        label: 'PBS Wash',
      })
      expect(result[0]?.raw).toBe('[[protocol:PRT-123|PBS Wash]]')
      expect(result[0]?.start).toBe(4)
      // end = start + raw.length = 4 + 29 = 33
      expect(result[0]?.end).toBe(33)
    })

    it('parses graph-component mention', () => {
      const result = parsePromptMentionMatches('foo [[graph-component:GC-456|Serial Dilution]] bar')
      expect(result).toHaveLength(1)
      expect(result[0]?.mention).toEqual({
        type: 'protocol',
        entityKind: 'graph-component',
        id: 'GC-456',
        label: 'Serial Dilution',
      })
      expect(result[0]?.raw).toBe('[[graph-component:GC-456|Serial Dilution]]')
    })

    it('parses both protocol and graph-component mentions together', () => {
      const result = parsePromptMentionMatches('[[protocol:PRT-123|PBS Wash]] and [[graph-component:GC-456|Serial Dilution]]')
      expect(result).toHaveLength(2)
      expect(result[0]?.mention).toEqual({
        type: 'protocol',
        entityKind: 'protocol',
        id: 'PRT-123',
        label: 'PBS Wash',
      })
      expect(result[1]?.mention).toEqual({
        type: 'protocol',
        entityKind: 'graph-component',
        id: 'GC-456',
        label: 'Serial Dilution',
      })
    })

    it('parses mixed mentions including protocol and graph-component', () => {
      const result = parsePromptMentionMatches(
        'Use [[material:MAT-001|Buffer A]] with [[protocol:PRT-123|PBS Wash]] and [[labware:LW-001|96-well plate]] then [[graph-component:GC-456|Serial Dilution]]'
      )
      expect(result).toHaveLength(4)
      
      expect(result[0]?.mention).toEqual({
        type: 'material',
        entityKind: 'material',
        id: 'MAT-001',
        label: 'Buffer A',
      })

      expect(result[1]?.mention).toEqual({
        type: 'protocol',
        entityKind: 'protocol',
        id: 'PRT-123',
        label: 'PBS Wash',
      })

      expect(result[2]?.mention).toEqual({
        type: 'labware',
        id: 'LW-001',
        label: '96-well plate',
      })

      expect(result[3]?.mention).toEqual({
        type: 'protocol',
        entityKind: 'graph-component',
        id: 'GC-456',
        label: 'Serial Dilution',
      })
    })

    it('parses protocol mention without label (uses id as label)', () => {
      const result = parsePromptMentionMatches('[[protocol:PRT-789]]')
      expect(result).toHaveLength(1)
      expect(result[0]?.mention).toEqual({
        type: 'protocol',
        entityKind: 'protocol',
        id: 'PRT-789',
        label: 'PRT-789',
      })
    })

    it('parses graph-component mention without label (uses id as label)', () => {
      const result = parsePromptMentionMatches('[[graph-component:GC-999]]')
      expect(result).toHaveLength(1)
      expect(result[0]?.mention).toEqual({
        type: 'protocol',
        entityKind: 'graph-component',
        id: 'GC-999',
        label: 'GC-999',
      })
    })
  })

  describe('parsePromptMentions', () => {
    it('returns just the mentions without position info', () => {
      const result = parsePromptMentions('[[protocol:PRT-123|PBS Wash]] and [[graph-component:GC-456|Serial Dilution]]')
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        type: 'protocol',
        entityKind: 'protocol',
        id: 'PRT-123',
        label: 'PBS Wash',
      })
      expect(result[1]).toEqual({
        type: 'protocol',
        entityKind: 'graph-component',
        id: 'GC-456',
        label: 'Serial Dilution',
      })
    })
  })
})
