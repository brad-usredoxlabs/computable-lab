import { describe, expect, it } from 'vitest'
import { getVerbsForDisplay } from './registry'

describe('liquid-handling vocab pack — tube verbs', () => {
  it('exposes place_tube / move_tube / remove_tube (so they reach availableVerbs → the AI)', () => {
    const verbs = getVerbsForDisplay('liquid-handling/v1').map((v) => v.verb)
    expect(verbs).toEqual(expect.arrayContaining(['place_tube', 'move_tube', 'remove_tube']))
  })
})
