import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { EditableProtocolText } from './EditableProtocolText'

afterEach(() => {
  cleanup()
})

function getEditor() {
  return document.querySelector('[contenteditable="true"]') as HTMLElement
}

describe('EditableProtocolText', () => {
  it('renders with initial content and placeholder', () => {
    const onChange = vi.fn()
    render(
      <EditableProtocolText
        initial="Read at Ex/Em 485/528."
        placeholder="Describe how to localize this step…"
        onChange={onChange}
      />,
    )
    const editor = getEditor()
    expect(editor).toBeDefined()
    expect(editor.textContent).toContain('Read at Ex/Em 485/528.')
  })

  it('renders with the correct data-testid', () => {
    const onChange = vi.fn()
    render(
      <EditableProtocolText
        initial="some text"
        placeholder="placeholder"
        onChange={onChange}
      />,
    )
    expect(screen.getByTestId('editable-protocol-text')).toBeDefined()
  })

  it('renders the placeholder attribute on the editor', () => {
    const onChange = vi.fn()
    render(
      <EditableProtocolText
        initial=""
        placeholder="Describe how to localize this step…"
        onChange={onChange}
      />,
    )
    const editor = getEditor()
    expect(editor.getAttribute('data-placeholder')).toBe('Describe how to localize this step…')
  })

  it('renders the empty-editor placeholder class when initial is empty', () => {
    const onChange = vi.fn()
    render(
      <EditableProtocolText
        initial=""
        placeholder="Type here…"
        onChange={onChange}
      />,
    )
    // TipTap Placeholder extension adds emptyEditorClass on the empty paragraph
    const emptyPara = document.querySelector('.is-empty-editor')
    expect(emptyPara).toBeDefined()
  })

  it('escapes HTML in initial content', () => {
    const onChange = vi.fn()
    render(
      <EditableProtocolText
        initial='<script>alert("xss")</script>'
        placeholder="Type here…"
        onChange={onChange}
      />,
    )
    const editor = getEditor()
    // The script tag should NOT exist as an element — it should be text
    const script = document.querySelector('script')
    expect(script).toBeNull()
    expect(editor.textContent).toContain('<script>')
  })

  it('renders with the correct editor class', () => {
    const onChange = vi.fn()
    render(
      <EditableProtocolText
        initial=""
        placeholder="Type here…"
        onChange={onChange}
      />,
    )
    const editor = getEditor()
    expect(editor.classList.contains('editable-protocol-text__editor')).toBe(true)
  })
})
