import { useCallback, useEffect, useMemo, useState } from 'react'
import { normalizeEditorMode, type EditorMode } from '../../types/editorMode'

const DEFAULT_DRAWER_TAB: Record<EditorMode, string> = {
  plan: 'assistant',
  biology: 'assign',
  readouts: 'contexts',
  results: 'queue',
}

interface UseEditorModeOptions {
  routeMode?: string | null
  searchMode?: string | null
  storageKey?: string
  defaultMode?: EditorMode
}

export interface UseEditorModeReturn {
  mode: EditorMode
  setMode: (mode: EditorMode) => void
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  drawerTab: string
  setDrawerTab: (tab: string) => void
}

export function useEditorMode({
  routeMode,
  searchMode,
  storageKey = 'semantic-eln.editor-mode',
  defaultMode = 'plan',
}: UseEditorModeOptions): UseEditorModeReturn {
  const initialMode = useMemo(() => {
    if (typeof window === 'undefined') return normalizeEditorMode(routeMode ?? searchMode, defaultMode)
    const stored = window.localStorage.getItem(storageKey)
    return normalizeEditorMode(routeMode ?? searchMode ?? stored, defaultMode)
  }, [defaultMode, routeMode, searchMode, storageKey])

  const [mode, setModeState] = useState<EditorMode>(initialMode)
  const [drawerOpen, setDrawerOpen] = useState<boolean>(initialMode !== 'plan')
  const [drawerTab, setDrawerTab] = useState<string>(DEFAULT_DRAWER_TAB[initialMode])

  useEffect(() => {
    const nextMode = normalizeEditorMode(routeMode ?? searchMode, mode)
    setModeState(nextMode)
  }, [mode, routeMode, searchMode])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, mode)
    }
  }, [mode, storageKey])

  useEffect(() => {
    if (mode === 'plan') return
    setDrawerOpen(true)
    setDrawerTab((current) => current || DEFAULT_DRAWER_TAB[mode])
  }, [mode])

  const setMode = useCallback((nextMode: EditorMode) => {
    setModeState(nextMode)
    if (nextMode === 'plan') {
      setDrawerOpen(false)
    } else {
      setDrawerOpen(true)
      setDrawerTab(DEFAULT_DRAWER_TAB[nextMode])
    }
  }, [])

  return {
    mode,
    setMode,
    drawerOpen,
    setDrawerOpen,
    drawerTab,
    setDrawerTab,
  }
}
