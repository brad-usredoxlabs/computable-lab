/**
 * Tab navigation plugin for FieldRow focus cycling.
 * Enables Tab/Shift+Tab to move between editable FieldRow elements.
 */

import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

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

        // Find all editable FieldRow value elements
        const fieldRows = Array.from(
          view.dom.querySelectorAll('.taptab-field-row:not(.readonly) .taptab-field-value')
        ) as HTMLElement[];

        if (fieldRows.length === 0) {
          return true;
        }

        // Find the currently focused element
        const activeElement = view.dom.ownerDocument.activeElement;

        // Determine current index by checking which field value contains the active element
        let currentIndex = -1;
        for (let i = 0; i < fieldRows.length; i++) {
          if (fieldRows[i].contains(activeElement) || fieldRows[i] === activeElement) {
            currentIndex = i;
            break;
          }
        }

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
