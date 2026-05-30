/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set by the appliance build to the overlay package specifier
   *  (`@cla-lab/ai-overlay-appliance`). Unset on bare CL. */
  readonly VITE_AI_OVERLAY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'virtual:cla-ai-overlay' {
  import type { ExtensionManifest } from '@cla-lab/ai-extension-api'
  export const manifest: ExtensionManifest
}
