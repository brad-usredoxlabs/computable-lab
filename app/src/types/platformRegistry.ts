export type PlatformSlotKind = 'standard' | 'trash' | 'module' | 'special'
export type SlotOrientationMode = 'flippable' | 'locked_portrait' | 'locked_landscape' | 'not_applicable'

export interface PlatformSlotManifest {
  id: string
  kind: PlatformSlotKind
  label?: string
  orientationMode?: SlotOrientationMode
  row?: number
  col?: number
  reachable?: boolean
  stagingOnly?: boolean
}

export interface PlatformVariantManifest {
  id: string
  title: string
  slots: PlatformSlotManifest[]
}

export interface PlatformModuleManifest {
  id: string
  label: string
}

export interface PlatformManifest {
  id: string
  label: string
  allowedVocabIds: string[]
  defaultVariant: string
  toolTypeIds: string[]
  compilerFamily?: string
  modules: PlatformModuleManifest[]
  variants: PlatformVariantManifest[]
}
