import { createContext, useContext, type ReactNode } from 'react'
import type {
  AiClient,
  ExtensionManifest,
  SlotComponentMap,
  SlotName,
} from '@cla-lab/ai-extension-api'
import { NULL_MANIFEST, NullAiClient } from '@cla-lab/ai-extension-api'
import { NullSlot } from './NullSlot'

interface ExtensionRegistry {
  slots: SlotComponentMap
  aiClient: AiClient
}

const DEFAULT_REGISTRY: ExtensionRegistry = {
  slots: NULL_MANIFEST.slots,
  aiClient: new NullAiClient(),
}

const ExtensionContext = createContext<ExtensionRegistry>(DEFAULT_REGISTRY)

export function ExtensionProvider({
  manifest,
  children,
}: {
  manifest: ExtensionManifest
  children: ReactNode
}) {
  const registry: ExtensionRegistry = {
    slots: manifest.slots,
    aiClient: manifest.aiClient ?? new NullAiClient(),
  }
  return (
    <ExtensionContext.Provider value={registry}>
      {children}
    </ExtensionContext.Provider>
  )
}

export function useAiClient(): AiClient {
  return useContext(ExtensionContext).aiClient
}

export function Slot<P extends Record<string, unknown>>({
  name,
  ...props
}: { name: SlotName } & P) {
  const Component = useContext(ExtensionContext).slots[name]
  if (!Component) return <NullSlot name={name} />
  return <Component {...(props as Record<string, unknown>)} />
}
