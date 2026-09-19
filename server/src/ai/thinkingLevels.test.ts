/**
 * Thinking levels are CONFIG, and an unknown level must fail loud.
 *
 * Real risk this guards: a reviewer picks "high effort" for a hard protocol;
 * if the level id does not resolve, a silent fallback to the default runs the
 * cheap path and the reviewer never learns their choice was ignored.
 */
import { describe, expect, it } from 'vitest'
import { resolveThinkingLevel, thinkingLevelOptions, type ThinkingLevels } from './thinkingLevels.js'

const LEVELS: ThinkingLevels = {
  off: { label: 'Off — direct JSON', enableThinking: false, chat_template_kwargs: { enable_thinking: false } },
  on: { label: 'Thinking', enableThinking: true, chat_template_kwargs: { enable_thinking: true } },
  high: { label: 'High effort', reasoning_effort: 'high' },
}

describe('resolveThinkingLevel', () => {
  it('resolves a named level to its request params (label is UI-only)', () => {
    const res = resolveThinkingLevel(LEVELS, 'on')
    expect(res.ok).toBe(true)
    expect(res.ok && res.resolved).toEqual({
      level: 'on',
      params: { enableThinking: true, chat_template_kwargs: { enable_thinking: true } },
    })
  })

  it('carries stack-specific params through untouched (reasoning_effort)', () => {
    const res = resolveThinkingLevel(LEVELS, 'high')
    expect(res.ok && res.resolved.params).toEqual({ reasoning_effort: 'high' })
  })

  it('uses the configured default when the request names no level', () => {
    const res = resolveThinkingLevel(LEVELS, undefined, 'off')
    expect(res.ok && res.resolved.level).toBe('off')
    expect(res.ok && res.resolved.params.enableThinking).toBe(false)
  })

  it('falls back to the FIRST configured level when there is no default', () => {
    const res = resolveThinkingLevel(LEVELS, undefined)
    expect(res.ok && res.resolved.level).toBe('off')
  })

  it('resolves to NO params when no levels are configured (let the endpoint decide)', () => {
    const res = resolveThinkingLevel(undefined, undefined)
    expect(res.ok && res.resolved).toEqual({ level: '', params: {} })
  })

  it('refuses an unknown level instead of silently using the default', () => {
    const res = resolveThinkingLevel(LEVELS, 'maximum')
    expect(res.ok).toBe(false)
    expect(!res.ok && res.error).toContain('unknown thinking level "maximum"')
    expect(!res.ok && res.available).toEqual(['off', 'on', 'high'])
  })

  it('refuses a named level when none are configured', () => {
    const res = resolveThinkingLevel(undefined, 'on')
    expect(res.ok).toBe(false)
    expect(!res.ok && res.error).toContain('no thinking levels are configured')
  })
})

describe('thinkingLevelOptions', () => {
  it('marks the default and keeps config order', () => {
    expect(thinkingLevelOptions(LEVELS, 'off')).toEqual([
      { id: 'off', label: 'Off — direct JSON' },
      { id: 'on', label: 'Thinking' },
      { id: 'high', label: 'High effort' },
    ])
    // an unlabelled default is marked so the picker explains itself
    expect(thinkingLevelOptions({ off: {}, on: {} }, 'off')[0]).toEqual({ id: 'off', label: 'off (default)' })
  })

  it('returns nothing when no levels are configured', () => {
    expect(thinkingLevelOptions(undefined)).toEqual([])
  })
})