/**
 * Standalone read-only evidence viewer.
 *
 * Contract (customer-handoff spec):
 *   - exports `apiVersion = 1`
 *   - `mount(element, { document, resolveArtifact })` returns `{ destroy() }`
 *   - `resolveArtifact(id)` returns an authorized same-origin URL for
 *     artifacts in the manifest ONLY; the viewer never invents URLs and
 *     never calls the lab API.
 *   - Read-only: no editor, no AI panel, no writes, no credentials.
 *   - Version mismatch fails closed; artifact downloads remain usable.
 *
 * This module is the library entry point for `vite.viewer.config.ts` and
 * must stay dependency-free apart from React itself (bundled in).
 */
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { Viewer } from './Viewer'
import type { MountOptions, ViewerHandle } from './types'

export const apiVersion = 1

export type { MountOptions, TyfEvidenceDocument, ViewerHandle } from './types'

/**
 * Mount the viewer into `element`. `destroy()` unmounts React and clears
 * the element; it is idempotent.
 */
export function mount(element: Element, opts: MountOptions): ViewerHandle {
  const root: Root = createRoot(element)
  // flushSync: `mount()` renders synchronously so the host sees a populated
  // element the moment the call returns (no concurrent-mode race).
  flushSync(() => {
    root.render(<Viewer document={opts.document} resolveArtifact={opts.resolveArtifact} />)
  })

  let destroyed = false
  return {
    destroy() {
      if (destroyed) return
      destroyed = true
      root.unmount()
      // Belt-and-braces: guarantee the host element is left empty even if
      // a pre-React node was inserted alongside our tree.
      element.replaceChildren()
    },
  }
}
