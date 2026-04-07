/**
 * useEditorKeyboardShortcuts - Keyboard shortcuts for the labware event editor.
 * 
 * Shortcuts:
 * - Ctrl+Z: Undo
 * - Ctrl+Shift+Z / Ctrl+Y: Redo
 * - Ctrl+S: Save
 * - Delete/Backspace: Delete selected event
 * - Escape: Clear selection / cancel editing
 * - Ctrl+A: Select all wells in active labware
 */

import { useEffect, useCallback } from 'react'

export interface EditorShortcutHandlers {
  /** Undo last action */
  onUndo?: () => void
  /** Redo last undone action */
  onRedo?: () => void
  /** Save the event graph */
  onSave?: () => void
  /** Delete selected event */
  onDelete?: () => void
  /** Escape (clear selection, cancel editing) */
  onEscape?: () => void
  /** Select all wells */
  onSelectAll?: () => void
  /** Whether shortcuts should be disabled (e.g., when typing in input) */
  disabled?: boolean
}

/**
 * Hook to register editor keyboard shortcuts.
 */
export function useEditorKeyboardShortcuts({
  onUndo,
  onRedo,
  onSave,
  onDelete,
  onEscape,
  onSelectAll,
  disabled = false,
}: EditorShortcutHandlers) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (disabled) return

    // Don't intercept when typing in inputs/textareas
    const target = event.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.contentEditable === 'true'
    ) {
      // Allow Escape to work even in inputs
      if (event.key !== 'Escape') {
        return
      }
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const ctrlOrCmd = isMac ? event.metaKey : event.ctrlKey

    // Ctrl+Z: Undo
    if (ctrlOrCmd && !event.shiftKey && event.key === 'z') {
      event.preventDefault()
      onUndo?.()
      return
    }

    // Ctrl+Shift+Z or Ctrl+Y: Redo
    if (
      (ctrlOrCmd && event.shiftKey && event.key === 'z') ||
      (ctrlOrCmd && !event.shiftKey && event.key === 'y')
    ) {
      event.preventDefault()
      onRedo?.()
      return
    }

    // Ctrl+S: Save
    if (ctrlOrCmd && event.key === 's') {
      event.preventDefault()
      onSave?.()
      return
    }

    // Ctrl+A: Select all
    if (ctrlOrCmd && event.key === 'a') {
      event.preventDefault()
      onSelectAll?.()
      return
    }

    // Delete or Backspace: Delete
    if (event.key === 'Delete' || event.key === 'Backspace') {
      // Only if not in an input
      if (
        target.tagName !== 'INPUT' &&
        target.tagName !== 'TEXTAREA' &&
        target.contentEditable !== 'true'
      ) {
        event.preventDefault()
        onDelete?.()
        return
      }
    }

    // Escape: Cancel/clear
    if (event.key === 'Escape') {
      onEscape?.()
      return
    }
  }, [disabled, onUndo, onRedo, onSave, onDelete, onEscape, onSelectAll])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])
}

/**
 * Display-friendly shortcut labels for the UI.
 */
export const SHORTCUT_LABELS = {
  undo: isMac() ? '⌘Z' : 'Ctrl+Z',
  redo: isMac() ? '⌘⇧Z' : 'Ctrl+Y',
  save: isMac() ? '⌘S' : 'Ctrl+S',
  delete: 'Del',
  escape: 'Esc',
  selectAll: isMac() ? '⌘A' : 'Ctrl+A',
} as const

function isMac(): boolean {
  return typeof navigator !== 'undefined' && 
    navigator.platform.toUpperCase().indexOf('MAC') >= 0
}
