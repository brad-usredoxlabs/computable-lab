import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'ai-panel-open'

function loadPersistedOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function useAiPanelOpen(): [boolean, (next: boolean) => void, () => void] {
  const [open, setOpenState] = useState(loadPersistedOpen)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(open))
    } catch { /* ignore */ }
  }, [open])

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
  }, [])

  const toggle = useCallback(() => {
    setOpenState((prev) => !prev)
  }, [])

  return [open, setOpen, toggle]
}
