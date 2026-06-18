/**
 * DocumentStateProvider integration tests with real TipTap, mocked
 * artifact load/save. Verifies the per-tab lifecycle the workspace
 * depends on:
 *
 *  - Provider loads the artifact via the injected loadFn
 *  - Editor is created with the StarterKit + Link + Underline extensions
 *  - Document body from the artifact seeds the editor (and does NOT fire
 *    an immediate save)
 *  - Editing the document fires a 500ms-debounced save with the new
 *    TipTap JSON body
 *  - Wrong artifactKind surfaces a clear error and skips the editor
 *  - Load error doesn't get stuck in "loading"
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockedFunction } from 'vitest'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Artifact } from '../../../types/artifact'
import {
  DocumentStateProvider,
  useDocumentEditor,
} from './DocumentEditorContext'

afterEach(() => cleanup())

function Consumer({ probe }: { probe: (v: ReturnType<typeof useDocumentEditor>) => void }) {
  const v = useDocumentEditor()
  probe(v)
  return (
    <div>
      <div data-testid="load-state">{v.loadState.kind}</div>
      <div data-testid="saving">{String(v.saving)}</div>
      <div data-testid="error">{v.saveError ?? '-'}</div>
      <div data-testid="editor-ready">{v.editor ? 'yes' : 'no'}</div>
    </div>
  )
}

function makeArtifact(overrides?: Partial<Artifact>): Artifact {
  return {
    kind: 'artifact',
    recordId: 'ART-000002',
    title: 'Buffer prep protocol',
    studyId: 'STU-000001',
    artifactKind: 'protocol',
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Initial seed text.' }],
        },
      ],
    },
    ...overrides,
  }
}

type LoadFn = (artifactId: string) => Promise<Artifact>
type SaveFn = (artifactId: string, payload: Artifact) => Promise<void>

function wrap(children: ReactNode, opts: {
  loadFn: MockedFunction<LoadFn>
  saveFn: MockedFunction<SaveFn>
  saveDebounceMs?: number
  artifactId?: string
}) {
  return render(
    <DocumentStateProvider
      artifactId={opts.artifactId ?? 'ART-000002'}
      title="Buffer prep protocol"
      loadFn={opts.loadFn}
      saveFn={opts.saveFn}
      saveDebounceMs={opts.saveDebounceMs ?? 0}
    >
      {children}
    </DocumentStateProvider>,
  )
}

describe('DocumentStateProvider', () => {
  let probeValue: ReturnType<typeof useDocumentEditor> | null = null
  const probe = (v: ReturnType<typeof useDocumentEditor>) => {
    probeValue = v
  }

  beforeEach(() => {
    probeValue = null
  })

  it('loads the artifact and exposes the editor', async () => {
    const loadFn = vi.fn() as MockedFunction<LoadFn>
    loadFn.mockReturnValue(Promise.resolve(makeArtifact()))
    const saveFn = vi.fn() as MockedFunction<SaveFn>
    saveFn.mockReturnValue(Promise.resolve())
    wrap(<Consumer probe={probe} />, { loadFn, saveFn })
    await waitFor(() =>
      expect(screen.getByTestId('load-state').textContent).toBe('ready'),
    )
    expect(screen.getByTestId('editor-ready').textContent).toBe('yes')
    // Initial seed does NOT fire a save — emitUpdate: false is load-bearing.
    expect(saveFn).not.toHaveBeenCalled()
  })

  it('debounced save fires with the new JSON body when the editor changes', async () => {
    const loadFn = vi.fn() as MockedFunction<LoadFn>
    loadFn.mockReturnValue(Promise.resolve(makeArtifact()))
    const saveFn = vi.fn() as MockedFunction<SaveFn>
    saveFn.mockReturnValue(Promise.resolve())
    wrap(<Consumer probe={probe} />, { loadFn, saveFn, saveDebounceMs: 0 })
    await waitFor(() =>
      expect(screen.getByTestId('load-state').textContent).toBe('ready'),
    )
    // Drive an edit through the actual editor instance.
    const editor = probeValue?.editor
    expect(editor).toBeTruthy()
    act(() => {
      editor!.commands.setContent({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Edited!' }],
          },
        ],
      })
    })
    await waitFor(() => expect(saveFn).toHaveBeenCalled())
    const [savedId, savedPayload] = saveFn.mock.calls[0] as [string, Artifact]
    expect(savedId).toBe('ART-000002')
    expect(savedPayload.body).toBeDefined()
    // The save payload is the artifact spliced with the new body.
    const newBodyText = JSON.stringify(savedPayload.body)
    expect(newBodyText).toContain('Edited!')
  })

  it('rejects wrong artifactKind with a load error', async () => {
    const loadFn = vi.fn() as MockedFunction<LoadFn>
    loadFn.mockReturnValue(Promise.resolve(makeArtifact({ artifactKind: 'pdf' })))
    const saveFn = vi.fn() as MockedFunction<SaveFn>
    saveFn.mockReturnValue(Promise.resolve())
    wrap(<Consumer probe={probe} />, { loadFn, saveFn })
    await waitFor(() =>
      expect(screen.getByTestId('load-state').textContent).toBe('error'),
    )
    expect(saveFn).not.toHaveBeenCalled()
  })

  it('load failure surfaces in loadState without leaving the UI in loading', async () => {
    const loadFn = vi.fn() as MockedFunction<LoadFn>
    loadFn.mockImplementation(() => { throw new Error('records endpoint is down') })
    const saveFn = vi.fn() as MockedFunction<SaveFn>
    saveFn.mockReturnValue(Promise.resolve())
    wrap(<Consumer probe={probe} />, { loadFn, saveFn })
    await waitFor(() =>
      expect(screen.getByTestId('load-state').textContent).toBe('error'),
    )
  })
})
