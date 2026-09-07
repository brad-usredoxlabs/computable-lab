import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// Mock the heavy TipTap deps + mention editor so the role-list widget renders
// in isolation.
vi.mock('../../../shared/taptab/slashMenu', () => ({
  MentionNode: () => null,
  buildSlashMenuExtension: () => null,
}))
vi.mock('@tiptap/react', () => ({
  EditorContent: () => <div data-testid="tip" />,
  useEditor: () => ({}),
  Editor: class {},
}))
vi.mock('../../shared/ref/RefBadge', () => ({ RefBadge: () => null }))

import { ProtocolMaterialRolesWidget } from './ProtocolAuthoringWidgets'

afterEach(() => cleanup())

interface WidgetPropsLike {
  value: unknown
  readOnly: boolean
  onCommit: (v: unknown) => void
  onRecordPatch?: (p: Record<string, unknown>) => void
  getRecordValue?: (path: string) => unknown
}

function spyProps(value: unknown[]) {
  const commits: unknown[][] = []
  const props: WidgetPropsLike = {
    value,
    readOnly: false,
    onCommit: (v: unknown) => commits.push([v]),
    onRecordPatch: () => {},
    getRecordValue: () => undefined,
  }
  return { props, commits }
}

function renderWidget(props: WidgetPropsLike) {
  return render(<ProtocolMaterialRolesWidget {...props} />)
}

describe('ProtocolRoleListWidget — rich-text list with X + Add', () => {
  it('renders a numbered <ol> (not chips) with the role label', () => {
    const value = [
      { roleId: 'detection-reagent', description: 'CellROX Detection Reagent', allowedMaterialIds: ['CL:CellROX'] },
    ]
    const { props } = spyProps(value)
    renderWidget(props)
    expect(document.querySelector('.taptab-protocol-numbered-list')).toBeDefined()
    expect(document.querySelector('.taptab-chips-list')).toBeNull()
    expect(document.querySelectorAll('.taptab-protocol-step-item').length).toBe(1)
  })

  it('renders an X remove per row that commits the list without that row', () => {
    const value = [
      { roleId: 'a', description: 'Reagent A' },
      { roleId: 'b', description: 'Reagent B' },
    ]
    const { props, commits } = spyProps(value)
    renderWidget(props)
    const removeBtns = document.querySelectorAll('button[aria-label*="Remove role"]')
    expect(removeBtns.length).toBe(2)
    fireEvent.click(removeBtns[0])
    const lastCommit = commits[commits.length - 1][0] as Array<Record<string, unknown>>
    expect(lastCommit.map((r) => r.roleId)).toEqual(['b'])
  })

  it('renders an Add control', () => {
    const { props } = spyProps([])
    renderWidget(props)
    expect(screen.getByText('Add')).toBeDefined()
  })
})