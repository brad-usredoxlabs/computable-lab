/**
 * FAME-3 GATE-FIX-1 D3 (gate-l1t1520, major — dead-chrome class) — the
 * ObjectWidget's EDIT mode must be STYLED: its `taptab-object-*` classes
 * carry declared layout rules in taptab.css.
 *
 * The defect (shots/14-E1-basis-ref-picker.png): the item entry editor
 * rendered with ZERO CSS for its classes — labels collided with values
 * ("Label*Methyl hexanoate…", "Assignment stateverified"), the nested
 * provenance help line ran past the panel edge, and the RT inputs were
 * pushed out of the visible column. An unstyled editor is the dead-chrome
 * defect class: the DOM is reachable but not legibly editable.
 *
 * This is a STYLE-CONTRACT test (the RED-first surface for a CSS-level
 * fix): taptab.css must declare rules for the object editor's layout
 * classes. It pins class NAMES (stable DOM vocabulary the component and
 * the stylesheet share), not field/vocabulary values.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CSS = readFileSync(resolve(process.cwd(), 'src/editor/taptab/taptab.css'), 'utf-8')

/** Does the stylesheet declare a rule for `selector` (any rule whose
 *  selector list contains it)? */
function hasRule(selector: string): boolean {
  const re = new RegExp(`(^|[^\\w-])${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(,|[{:]|$)`, 'm')
  return re.test(CSS)
}

describe('ObjectWidget edit mode — taptab.css declares the object editor layout (D3 style contract)', () => {
  it('every object editor layout class has a declared rule', () => {
    for (const cls of [
      '.taptab-object-editor',
      '.taptab-object-field',
      '.taptab-object-field-label',
      '.taptab-object-field-input',
      '.taptab-object-field-select',
      '.taptab-object-field-help',
      '.taptab-object-done',
    ]) {
      expect(hasRule(cls), `taptab.css must style ${cls} (the unstyled editor is the dead-chrome defect)`).toBe(true)
    }
  })

  it('the editor + field stack label above value (block/flex, not inline) and contain width inside the panel', () => {
    const editorBlock = CSS.slice(CSS.indexOf('.taptab-object-editor {'))
    const fieldBlock = CSS.slice(CSS.indexOf('.taptab-object-field {'))
    const editorRule = editorBlock.slice(0, editorBlock.indexOf('}'))
    const fieldRule = fieldBlock.slice(0, fieldBlock.indexOf('}'))
    // Label/value STACKING: the field is a vertical stack (label on its
    // own line above the value control), not an inline collision.
    expect(fieldRule).toMatch(/display\s*:\s*block/)
    expect(editorRule).toMatch(/display\s*:\s*(flex|block)/)
    // Width containment: controls fill the column without overflowing it
    // (box-sizing + width 100% on the input and the select).
    const inputBlock = CSS.slice(CSS.indexOf('.taptab-object-field-input'))
    const inputRule = inputBlock.slice(0, inputBlock.indexOf('}'))
    expect(inputRule).toMatch(/width\s*:\s*100%/)
    expect(inputRule).toMatch(/box-sizing\s*:\s*border-box/)
  })

  it('the help line is a contained block (wraps, full width of the field, never an inline run into the next field)', () => {
    const helpBlock = CSS.slice(CSS.indexOf('.taptab-object-field-help'))
    const helpRule = helpBlock.slice(0, helpBlock.indexOf('}'))
    expect(helpRule).toMatch(/display\s*:\s*block/)
    expect(helpRule).toMatch(/(max-width\s*:\s*100%|width\s*:\s*100%)/)
    expect(helpRule).toMatch(/(overflow-wrap\s*:\s*break-word|word-break\s*:\s*break-word|word-wrap\s*:\s*break-word)/)
  })
})
