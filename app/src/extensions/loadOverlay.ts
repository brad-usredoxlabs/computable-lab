import type { ExtensionManifest } from '@cla-lab/ai-extension-api'
import { NULL_MANIFEST } from '@cla-lab/ai-extension-api'
import { defaultManifest } from './defaultRegistry'

/**
 * Resolve the AI extension manifest at boot.
 *
 * When the build sets VITE_AI_OVERLAY (the appliance sets it to
 * `@cla-lab/ai-overlay-appliance`), the `virtual:cla-ai-overlay` module —
 * supplied by the aiOverlayPlugin in vite.config — re-exports the overlay
 * package's manifest. The dynamic import emits the overlay as a separate
 * async chunk that shares this build's React/TipTap singletons. Bare CL
 * leaves VITE_AI_OVERLAY unset, so the virtual module yields an empty
 * manifest and we fall back to the in-host defaultManifest (also empty
 * after Phase 3 — every <Slot> renders <NullSlot>).
 */
const OVERLAY_ENABLED = Boolean(import.meta.env.VITE_AI_OVERLAY)

export async function loadManifest(): Promise<ExtensionManifest> {
  if (!OVERLAY_ENABLED) return defaultManifest
  try {
    const mod = (await import('virtual:cla-ai-overlay')) as {
      manifest?: ExtensionManifest
    }
    if (mod.manifest) return mod.manifest
    console.warn("AI overlay did not export a 'manifest' — using in-host default")
  } catch (err) {
    console.warn('Failed to load AI overlay', err)
  }
  return defaultManifest
}

export const NULL_OVERLAY = NULL_MANIFEST
