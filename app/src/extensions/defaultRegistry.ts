import type { ExtensionManifest } from '@cla-lab/ai-extension-api'

/**
 * Bare-host default manifest: every slot empty.
 *
 * When the host runs with no `VITE_AI_OVERLAY_URL` set, every <Slot>
 * resolves to <NullSlot> ("AI feature unavailable — install an AI
 * overlay"). The deterministic compiler and non-AI surfaces work
 * unchanged; the kiosk just doesn't get AI features.
 *
 * The host's tree-shaker drops any AI component code that isn't
 * referenced by an overlay or a test, so the bare-CL bundle no longer
 * carries the AI surface. To restore the AI features in this host
 * (without buying the appliance), write an overlay that implements
 * `@cla-lab/ai-extension-api`'s ExtensionManifest and load it via
 * VITE_AI_OVERLAY_URL.
 */
export const defaultManifest: ExtensionManifest = {
  slots: {},
  aiClient: null,
}
