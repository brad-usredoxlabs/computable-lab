import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// jsdom doesn't implement elementFromPoint/caretRangeFromPoint, but the
// TipTap @ProseMirror viewport-tracking plugin (used by the Placeholder
// extension under @tiptap/extensions 3.x) calls them during mount. The
// no-op stubs let editor-bearing components mount in tests without
// affecting any real layout behaviour we care about asserting.
if (typeof document !== 'undefined') {
  if (typeof document.elementFromPoint !== 'function') {
    document.elementFromPoint = () => null
  }
  if (typeof (document as Document & { caretRangeFromPoint?: unknown }).caretRangeFromPoint !== 'function') {
    (document as Document & { caretRangeFromPoint: () => null }).caretRangeFromPoint = () => null
  }
}
