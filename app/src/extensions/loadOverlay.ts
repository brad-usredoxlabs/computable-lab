import type { ExtensionManifest } from '@cla-lab/ai-extension-api'
import { NULL_MANIFEST } from '@cla-lab/ai-extension-api'
import { defaultManifest } from './defaultRegistry'

const OVERLAY_URL = import.meta.env.VITE_AI_OVERLAY_URL as string | undefined

export async function loadManifest(): Promise<ExtensionManifest> {
  if (OVERLAY_URL && OVERLAY_URL.length > 0) {
    try {
      const mod = (await import(/* @vite-ignore */ OVERLAY_URL)) as {
        manifest?: ExtensionManifest
      }
      if (mod.manifest) return mod.manifest
      console.warn(
        `AI overlay at ${OVERLAY_URL} did not export a 'manifest' — falling back to in-host default`,
      )
    } catch (err) {
      console.warn(`Failed to load AI overlay from ${OVERLAY_URL}`, err)
    }
  }
  return defaultManifest
}

export const NULL_OVERLAY = NULL_MANIFEST
