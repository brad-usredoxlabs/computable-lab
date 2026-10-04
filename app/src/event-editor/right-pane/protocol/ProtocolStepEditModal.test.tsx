import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProtocolStepEditModal } from './ProtocolStepEditModal'
import { apiClient } from '../../../shared/api/client'

const richDocument = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mix gently.', marks: [{ type: 'bold' }] }] }] }
const editor = vi.hoisted(() => ({
  commands: { setContent: vi.fn() }, setEditable: vi.fn(),
  getText: vi.fn(), getJSON: vi.fn(),
}))
vi.mock('@tiptap/react', () => ({
  useEditor: () => editor,
  EditorContent: () => <div>Rich editor</div>,
}))
vi.mock('../../../editor/taptab/RichTextToolbar', () => ({ RichTextToolbar: () => <div>Formatting toolbar</div> }))
vi.mock('../../../shared/api/client', () => ({ apiClient: { getRecord: vi.fn(), updateRecord: vi.fn() } }))

const payload = {
  kind: 'protocol', title: 'Zymo Opentrons', state: 'draft', version: '0.1.1',
  steps: [
    { stepId: 's1', ordinal: 1, kind: 'other', label: 'Mix', description: 'Mix gently.',
      subGraphRef: { kind: 'record', type: 'event-graph', id: 'EVG-1' },
      descriptionRichText: { plainText: 'Mix gently.', document: richDocument } },
    { stepId: 's2', ordinal: 2, kind: 'other', label: 'Wash' },
  ],
}
const record = { recordId: 'PRT-1', schemaId: 'protocol', meta: { contentSha: 'token-at-open' }, payload }

beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
  editor.getText.mockReturnValue('Mix gently.')
  editor.getJSON.mockReturnValue(richDocument)
  vi.mocked(apiClient.getRecord).mockResolvedValue(structuredClone(record))
  vi.mocked(apiClient.updateRecord).mockResolvedValue({ record } as never)
})
afterEach(cleanup)

function showEditor(mode: 'edit' | 'before' | 'after' = 'edit') {
  const onSaved = vi.fn(), onClose = vi.fn()
  render(<ProtocolStepEditModal protocolId="PRT-1" step={{ stepId: 's1', label: 'Mix', ordinal: 1 }} mode={mode} onSaved={onSaved} onClose={onClose} />)
  return { onSaved, onClose }
}

describe('ProtocolStepEditModal', () => {
  it.each(['before', 'after'] as const)('adds a new step %s the selected step without replacing it', async mode => {
    const { onSaved } = showEditor(mode)
    const input = await screen.findByLabelText('Step name')
    expect(input).toHaveValue('')
    fireEvent.change(input, { target: { value: 'New preparation' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    const saved = vi.mocked(apiClient.updateRecord).mock.calls[0]![1].steps as Array<Record<string, unknown>>
    const insertedIndex = mode === 'before' ? 0 : 1
    expect(saved[insertedIndex]).toMatchObject({ label: 'New preparation', kind: 'other', ordinal: insertedIndex + 1, descriptionRichText: { document: richDocument } })
    expect(saved[insertedIndex]!.stepId).toMatch(/^step-[a-f0-9]+$/)
    expect(saved.map(s => s.ordinal)).toEqual([1, 2, 3])
    expect(saved.find(s => s.stepId === 's1')!.subGraphRef).toEqual(payload.steps[0]!.subGraphRef)
    expect(saved[insertedIndex]!.subGraphRef).toBeUndefined()
  })

  it('saves rich formatting and AI-readable text to the owning protocol with optimistic concurrency', async () => {
    const { onSaved, onClose } = showEditor()
    const input = await screen.findByLabelText('Step name')
    expect(editor.commands.setContent).toHaveBeenCalledWith(richDocument)
    fireEvent.change(input, { target: { value: 'Mix on Opentrons' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ stepId: 's1', ordinal: 1, label: 'Mix on Opentrons', description: 'Mix gently.' }, expect.any(Array)))
    expect(apiClient.updateRecord).toHaveBeenCalledWith('PRT-1', {
      ...payload, steps: [{ ...payload.steps[0], label: 'Mix on Opentrons' }, payload.steps[1]],
    }, { expectedSha: 'token-at-open' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps edits open when a concurrent save is rejected', async () => {
    vi.mocked(apiClient.updateRecord).mockRejectedValue(new Error('Conflict: protocol changed'))
    const { onSaved, onClose } = showEditor()
    fireEvent.change(await screen.findByLabelText('Step name'), { target: { value: 'My edited name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('protocol changed')
    expect(screen.getByLabelText('Step name')).toHaveValue('My edited name')
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancel never saves edits', async () => {
    const { onClose } = showEditor()
    await screen.findByLabelText('Step name')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(apiClient.updateRecord).not.toHaveBeenCalled()
  })

  it('uses the newer plain description when another editor invalidates the formatted copy', async () => {
    const changed = structuredClone(record)
    changed.payload.steps[0]!.description = 'Newer instructions'
    vi.mocked(apiClient.getRecord).mockResolvedValue(changed)
    showEditor()
    await screen.findByLabelText('Step name')
    expect(JSON.stringify(editor.commands.setContent.mock.calls[0])).toContain('Newer instructions')
    expect(JSON.stringify(editor.commands.setContent.mock.calls[0])).not.toContain('Mix gently.')
  })

  it('does not offer editing of locked controlled content', async () => {
    vi.mocked(apiClient.getRecord).mockResolvedValue({ ...record, payload: { ...payload, lifecycleId: 'document-controlled-signing', state: 'effective' } })
    showEditor()
    expect(await screen.findByRole('alert')).toHaveTextContent('controlled protocol is locked')
    expect(screen.getByRole('button', { name: 'Save step' })).toBeDisabled()
    expect(apiClient.updateRecord).not.toHaveBeenCalled()
  })
})
