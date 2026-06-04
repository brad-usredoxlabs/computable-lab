/**
 * DocumentEditorContext + DocumentStateProvider.
 *
 * Owns the per-tab TipTap editor instance for `kind: 'document'` workspace
 * tabs. Lives ABOVE AppShell so the toolbar (rendered into AppShell's
 * `viewerToolbar` slot) and the editor body (rendered into `leftPane`)
 * share one `Editor` — same pattern as PdfStateProvider in Phase 5.
 *
 * Lifecycle:
 *   1. Fetch the artifact record via apiClient.getRecord.
 *   2. Reject non-document artifactKinds early (the dispatcher only mounts
 *      this for kind=document tabs, but defend in depth).
 *   3. Create the TipTap editor with StarterKit + Link + Underline. Seed
 *      the editor with the artifact's `body` (TipTap JSON) when present.
 *   4. On every editor update, schedule a 500ms-debounced PUT to the
 *      artifact's payload, replacing `body` with `editor.getJSON()`. JSON
 *      (not HTML) is the format on disk so slash-menu mentions and
 *      ontology nodes round-trip without re-parsing.
 *
 * The slash menu and ontology copilot extensions are NOT wired yet — they
 * have their own resolver/render setup that the document editor will pick
 * up in a follow-up. The toolbar marks here don't depend on either, so
 * skipping them doesn't block Phase 6.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useEditor, type Editor } from '@tiptap/react'
// StarterKit 3.x already bundles Link + Underline (along with all the
// standard marks/nodes the toolbar drives). Importing them separately
// triggers a "Duplicate extension names" warning at editor init.
import StarterKit from '@tiptap/starter-kit'
import type { JSONContent } from '@tiptap/core'
import { apiClient } from '../../../shared/api/client'
import type { Artifact } from '../../../types/artifact'

export type DocumentLoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; artifact: Artifact }
  | { kind: 'error'; message: string }

export interface DocumentEditorCtxValue {
  artifactId: string | null
  title: string
  loadState: DocumentLoadState
  editor: Editor | null
  /** Whether the most recent edit has been flushed to the server. */
  saving: boolean
  /** Last save error if any (cleared on next successful save). */
  saveError: string | null
}

const DEFAULT_VALUE: DocumentEditorCtxValue = {
  artifactId: null,
  title: '',
  loadState: { kind: 'idle' },
  editor: null,
  saving: false,
  saveError: null,
}

const DocumentEditorCtx = createContext<DocumentEditorCtxValue>(DEFAULT_VALUE)

export interface DocumentStateProviderProps {
  artifactId: string
  title: string
  /** Debounce window for the body PUT. 0 = synchronous (test seam). */
  saveDebounceMs?: number
  /** Test seam: override the artifact loader. */
  loadFn?: (artifactId: string) => Promise<Artifact>
  /** Test seam: override the artifact saver. */
  saveFn?: (artifactId: string, payload: Artifact) => Promise<void>
  children: ReactNode
}

export function DocumentStateProvider({
  artifactId,
  title,
  saveDebounceMs = 500,
  loadFn,
  saveFn,
  children,
}: DocumentStateProviderProps) {
  const [loadState, setLoadState] = useState<DocumentLoadState>({ kind: 'idle' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Hold the latest loaded artifact in a ref so the save function can
  // splice in the new body without re-creating itself on every fetch.
  const artifactRef = useRef<Artifact | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadFnRef = useRef(loadFn)
  const saveFnRef = useRef(saveFn)
  loadFnRef.current = loadFn
  saveFnRef.current = saveFn

  // Default save: PUT /records/:id with the artifact payload + new body.
  const persistBody = useCallback(
    async (next: JSONContent) => {
      const current = artifactRef.current
      if (!current) return
      const merged: Artifact = { ...current, body: next }
      setSaving(true)
      setSaveError(null)
      try {
        if (saveFnRef.current) {
          await saveFnRef.current(artifactId, merged)
        } else {
          // The generic /records PUT takes the whole payload; the server
          // replaces the file contents. RecordStore re-validates against
          // schema/studies/artifact.schema.yaml.
          await apiClient.updateRecord(
            artifactId,
            merged as unknown as Record<string, unknown>,
          )
        }
        // Update the in-memory artifact so the next debounce delta is
        // applied on top of the freshly-saved body.
        artifactRef.current = merged
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err))
      } finally {
        setSaving(false)
      }
    },
    [artifactId],
  )

  // The editor instance — created once per `artifactId` change. `content`
  // is `null` initially; we set it from the artifact body once the load
  // resolves (see effect below). Using `null` rather than the artifact
  // body in the dep array avoids a recreate-on-every-load loop.
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          // The toolbar's link button does its own setLink/unsetLink via
          // chains, so we don't want StarterKit's Link to auto-link on
          // click — that would compete with the toolbar UX.
          link: {
            openOnClick: false,
            autolink: true,
            linkOnPaste: true,
          },
        }),
      ],
      content: undefined,
      editorProps: {
        attributes: {
          class: 'document-editor__prose',
        },
      },
      onUpdate: ({ editor }) => {
        const json = editor.getJSON()
        if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current)
        if (saveDebounceMs <= 0) {
          void persistBody(json)
          return
        }
        saveTimerRef.current = setTimeout(() => {
          saveTimerRef.current = null
          void persistBody(json)
        }, saveDebounceMs)
      },
    },
    // Recreate the editor when the active artifact changes — different
    // documents shouldn't share a single ProseMirror state object.
    [artifactId],
  )

  // Cancel any pending save when the artifact changes or we unmount.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [artifactId])

  // Load the artifact and seed the editor when it arrives.
  useEffect(() => {
    let cancelled = false
    setLoadState({ kind: 'loading' })
    setSaveError(null)
    artifactRef.current = null

    const fn = loadFnRef.current ?? defaultLoadArtifact
    void fn(artifactId)
      .then((artifact) => {
        if (cancelled) return
        // Defend in depth — the dispatcher should only mount this for
        // document-kinds, but a stale workspace.yaml could point at a
        // PDF artifact.
        const documentKinds = new Set([
          'protocol',
          'writeup',
          'training',
          'conclusion',
        ])
        if (!documentKinds.has(artifact.artifactKind)) {
          setLoadState({
            kind: 'error',
            message: `Artifact ${artifactId} has artifactKind=${artifact.artifactKind}; expected a document kind.`,
          })
          return
        }
        artifactRef.current = artifact
        setLoadState({ kind: 'ready', artifact })
      })
      .catch((err) => {
        if (cancelled) return
        setLoadState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      })
    return () => {
      cancelled = true
    }
  }, [artifactId])

  // Seed the editor with the artifact body once both are ready. Skip if
  // the editor's current content already matches (re-render on tab focus
  // shouldn't blow away unsaved edits).
  useEffect(() => {
    if (!editor) return
    if (loadState.kind !== 'ready') return
    const incoming = loadState.artifact.body ?? emptyDoc()
    // setContent with `false` suppresses the onUpdate hook — we don't
    // want the seed to trigger a save round-trip.
    editor.commands.setContent(incoming, { emitUpdate: false })
  }, [editor, loadState])

  const value = useMemo<DocumentEditorCtxValue>(
    () => ({
      artifactId,
      title,
      loadState,
      editor,
      saving,
      saveError,
    }),
    [artifactId, title, loadState, editor, saving, saveError],
  )

  return (
    <DocumentEditorCtx.Provider value={value}>{children}</DocumentEditorCtx.Provider>
  )
}

export function useDocumentEditor(): DocumentEditorCtxValue {
  return useContext(DocumentEditorCtx)
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

async function defaultLoadArtifact(artifactId: string): Promise<Artifact> {
  const env = await apiClient.getRecord(artifactId)
  return env.payload as unknown as Artifact
}

function emptyDoc(): JSONContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  }
}
