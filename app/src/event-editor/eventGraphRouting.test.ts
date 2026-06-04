import { describe, expect, it } from 'vitest'
import { eventEditorGraphPath, shortEventGraphId } from './eventGraphRouting'

describe('event editor graph routing', () => {
  it('builds a direct event-editor graph path without a run', () => {
    expect(eventEditorGraphPath('EVG-123', null)).toBe('/event-editor/EVG-123')
  })

  it('builds a run-scoped event-editor graph path with query id', () => {
    expect(eventEditorGraphPath('EVG-123', 'RUN-1')).toBe('/runs/RUN-1/event-editor?id=EVG-123')
  })

  it('encodes graph and run ids', () => {
    expect(eventEditorGraphPath('EVG 1/2', 'RUN 1/2')).toBe('/runs/RUN%201%2F2/event-editor?id=EVG%201%2F2')
  })

  it('shortens long graph ids for compact chrome', () => {
    expect(shortEventGraphId('EVG-1234567890ABC')).toBe('EVG-123456...')
    expect(shortEventGraphId('EVG-123')).toBe('EVG-123')
  })
})
