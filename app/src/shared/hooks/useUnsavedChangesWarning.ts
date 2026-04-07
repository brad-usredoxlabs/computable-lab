/**
 * useUnsavedChangesWarning - Hook to warn users about unsaved changes.
 * Shows browser beforeunload warning and can integrate with React Router.
 */

import { useEffect, useCallback } from 'react'

/**
 * Hook to show browser warning when user has unsaved changes.
 * 
 * @param isDirty - Whether there are unsaved changes
 * @param message - Optional custom message (browser may ignore this)
 */
export function useUnsavedChangesWarning(
  isDirty: boolean,
  message = 'You have unsaved changes. Are you sure you want to leave?'
) {
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault()
        // Modern browsers ignore custom messages, but we set it anyway
        event.returnValue = message
        return message
      }
    }

    if (isDirty) {
      window.addEventListener('beforeunload', handleBeforeUnload)
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [isDirty, message])

  /**
   * Prompt user for confirmation before proceeding with an action.
   * Returns true if user confirms or there are no unsaved changes.
   */
  const confirmNavigation = useCallback((): boolean => {
    if (!isDirty) return true
    return window.confirm(message)
  }, [isDirty, message])

  return { confirmNavigation }
}

/**
 * Hook to handle keyboard shortcuts for editor actions.
 * 
 * @param handlers - Object mapping keyboard shortcuts to handlers
 */
export function useEditorKeyboardShortcuts(handlers: {
  onUndo?: () => void
  onRedo?: () => void
  onSave?: () => void
  onDelete?: () => void
  onEscape?: () => void
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for modifier key (Ctrl on Windows/Linux, Cmd on Mac)
      const isMod = event.ctrlKey || event.metaKey

      // Ctrl/Cmd + Z = Undo
      if (isMod && event.key === 'z' && !event.shiftKey) {
        event.preventDefault()
        handlers.onUndo?.()
        return
      }

      // Ctrl/Cmd + Shift + Z = Redo (or Ctrl/Cmd + Y)
      if (isMod && ((event.key === 'z' && event.shiftKey) || event.key === 'y')) {
        event.preventDefault()
        handlers.onRedo?.()
        return
      }

      // Ctrl/Cmd + S = Save
      if (isMod && event.key === 's') {
        event.preventDefault()
        handlers.onSave?.()
        return
      }

      // Delete or Backspace (without modifiers, when not in input)
      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        !isMod &&
        !isEditableElement(event.target as Element)
      ) {
        event.preventDefault()
        handlers.onDelete?.()
        return
      }

      // Escape = Cancel/Close
      if (event.key === 'Escape') {
        event.preventDefault()
        handlers.onEscape?.()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handlers])
}

/**
 * Check if an element is an editable form element
 */
function isEditableElement(element: Element | null): boolean {
  if (!element) return false
  const tagName = element.tagName.toLowerCase()
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true
  }
  if ((element as HTMLElement).contentEditable === 'true') {
    return true
  }
  return false
}
