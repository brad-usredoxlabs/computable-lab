/**
 * Tab navigation plugin for FieldRow focus cycling.
 * Enables Tab/Shift+Tab to move between editable FieldRow elements.
 */

import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/**
 * Widgets render `.taptab-widget-value` (`.taptab-field-value` kept for
 * older render paths); textarea/markdown widgets render a `.taptab-richtext`
 * sub-editor with no value wrapper — included so Tab doesn't skip
 * Description-style fields.
 */
const FIELD_SELECTOR =
  '.taptab-field-row:not(.readonly) .taptab-widget-value, ' +
  '.taptab-field-row:not(.readonly) .taptab-field-value, ' +
  '.taptab-field-row:not(.readonly) .taptab-richtext';

/** Enter a field's edit mode: focus its sub-editor or trigger click-to-edit. */
function activateField(target: HTMLElement): void {
  const editable = target.querySelector<HTMLElement>('[contenteditable="true"]');
  if (editable) {
    editable.focus();
  } else {
    target.click();
  }
}

/**
 * Move focus to the next/previous editable field relative to `from`
 * (an element inside the current field). Shared by the ProseMirror plugin
 * below (Tab pressed while the outer editor has focus) and the widgets'
 * inline inputs (Tab pressed mid-edit — those keydowns never reach
 * ProseMirror because the React NodeView stops events from its
 * interactive content, so without this the browser's native tab order
 * takes over and skips every click-to-edit field).
 */
export function focusAdjacentTapTabField(from: HTMLElement, backwards: boolean): void {
  const root = from.closest('.taptab-editor-prose') ?? from.ownerDocument;
  const fields = Array.from(root.querySelectorAll(FIELD_SELECTOR)) as HTMLElement[];
  if (fields.length === 0) return;
  const current = fields.findIndex((el) => el === from || el.contains(from));
  const next =
    current === -1
      ? fields[backwards ? fields.length - 1 : 0]
      : fields[(current + (backwards ? -1 : 1) + fields.length) % fields.length];
  if (next) activateField(next);
}

/**
 * Creates a ProseMirror plugin that handles Tab/Shift+Tab navigation
 * between non-readonly FieldRow elements.
 *
 * The field list is queried fresh on every Tab press. It used to be cached
 * at module level keyed on doc size — but React NodeViews re-render their
 * widgets on every value commit (same doc size, new DOM nodes), so the
 * cache went stale immediately and Tab clicked detached elements: fields
 * were skipped, focus jumped arbitrarily, and two editors on one page
 * cross-contaminated each other's cache. A dozen-element querySelectorAll
 * per keypress is far cheaper than that bug.
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

        const fieldRows = Array.from(
          view.dom.querySelectorAll(FIELD_SELECTOR)
        ) as HTMLElement[];

        if (fieldRows.length === 0) {
          return true;
        }

        const activeElement = view.dom.ownerDocument.activeElement;
        const currentIndex = fieldRows.findIndex((el) => el.contains(activeElement));

        const backwards = event.shiftKey;
        const target =
          currentIndex === -1
            ? fieldRows[backwards ? fieldRows.length - 1 : 0]
            : fieldRows[
                (currentIndex + (backwards ? -1 : 1) + fieldRows.length) %
                  fieldRows.length
              ];
        if (target) activateField(target);

        return true;
      },
    },
  });
}
