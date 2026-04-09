/**
 * Tab navigation plugin for FieldRow focus cycling.
 * Enables Tab/Shift+Tab to move between editable FieldRow elements.
 */

import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

// Cache for editable field row elements - refreshed only when doc changes
let cachedFields: HTMLElement[] | null = null;
let lastDocSize: number = 0;

/**
 * Creates a ProseMirror plugin that handles Tab/Shift+Tab navigation
 * between non-readonly FieldRow elements.
 */
export function createTabNavPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey('tabNav'),
    props: {
      handleKeyDown: (view: EditorView, event: KeyboardEvent) => {
        // Only handle Tab key
        if (event.key !== 'Tab') {
          return false;
        }

        // Prevent default browser behavior
        event.preventDefault();

        // Check if cache needs invalidation (doc size changed)
        const currentDocSize = view.state.doc.content.size;
        if (cachedFields === null || currentDocSize !== lastDocSize) {
          // Refresh cache - query all editable field rows
          cachedFields = Array.from(
            view.dom.querySelectorAll('.taptab-field-row:not(.readonly) .taptab-field-value')
          ) as HTMLElement[];
          lastDocSize = currentDocSize;
        }

        const fieldRows = cachedFields;

        if (fieldRows.length === 0) {
          return true;
        }

        // Find the currently focused element using findIndex
        const activeElement = view.dom.ownerDocument.activeElement;
        const currentIndex = Array.from(fieldRows).findIndex(el => el.contains(activeElement));

        // Calculate next index with wrapping
        const shiftKey = event.shiftKey;
        let nextIndex: number;

        if (shiftKey) {
          // Shift+Tab: move to previous, wrap to last if at beginning
          nextIndex = currentIndex === -1 || currentIndex === 0 ? fieldRows.length - 1 : currentIndex - 1;
        } else {
          // Tab: move to next, wrap to first if at end
          nextIndex = currentIndex === -1 || currentIndex === fieldRows.length - 1 ? 0 : currentIndex + 1;
        }

        // Click the target field to trigger editing mode
        const targetElement = fieldRows[nextIndex];
        targetElement.click();

        return true;
      },
    },
  });
}
