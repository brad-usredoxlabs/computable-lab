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
  '.taptab-field-row:not(.readonly) .taptab-richtext, ' +
  '.taptab-field-row:not(.readonly) .taptab-protocol-mention-editor, ' +
  '.taptab-field-row:not(.readonly) .taptab-protocol-focusable';

/** Enter a field's edit mode: focus its sub-editor or trigger click-to-edit. */
function activateField(target: HTMLElement): void {
  // Prefer an already-mounted editable control: a rich-text contenteditable, or
  // a combobox/chips text input that's still open. Without this, tabbing into a
  // chips field whose add-combobox is already open (the persistent state after
  // committing a chip) falls through to target.click(), which is a no-op while
  // `adding` is already true — so focus never lands in the search input.
  const editable = target.querySelector<HTMLElement>(
    '[contenteditable="true"], input:not([type="hidden"]), textarea',
  );
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
  // `from` is either an element inside a field (inline input) or the field
  // row itself (the FieldRow wrapper passes its currentTarget because
  // portal-rendered widgets like comboboxes put the real event target
  // outside the editor DOM entirely). Match both containments.
  const current = fields.findIndex(
    (el) => el === from || el.contains(from) || from.contains(el),
  );
  if (current !== -1) {
    const next =
      fields[(current + (backwards ? -1 : 1) + fields.length) % fields.length];
    if (next) activateField(next);
    return;
  }
  // No containment match — a combobox/ref widget in edit mode replaces its
  // .taptab-widget-value wrapper entirely, so its row holds no field
  // element. Fall back to document order relative to the row.
  const row = from.closest('.taptab-field-row') ?? from;
  const firstAfter = fields.findIndex(
    (el) =>
      (row.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !==
      0,
  );
  let next: HTMLElement | undefined;
  if (backwards) {
    next =
      firstAfter === -1
        ? fields[fields.length - 1]
        : fields[(firstAfter - 1 + fields.length) % fields.length];
  } else {
    next = firstAfter === -1 ? fields[0] : fields[firstAfter];
  }
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

        // If focus is on an interactive button (Add button, etc.), let native
        // browser Tab navigation handle it — don't intercept. This allows
        // Tab to cycle between Add buttons and other focusable elements
        // naturally, instead of forcing focus back into the editor fields.
        const activeEl = view.dom.ownerDocument.activeElement;
        if (activeEl && activeEl.closest('.taptab-protocol-add-btn')) {
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

        const currentIndex = fieldRows.findIndex((el) => el.contains(activeEl));

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
