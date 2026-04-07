import type { PlatformManifest, PlatformSlotManifest, PlatformVariantManifest } from '../../types/platformRegistry'

export type MethodVocabId = 'liquid-handling/v1' | 'animal-handling/v1'

export function platformLabel(platforms: PlatformManifest[], platformId: string): string {
  return platforms.find((platform) => platform.id === platformId)?.label || platformId
}

export function allowedPlatformsForVocab(platforms: PlatformManifest[], vocabId: MethodVocabId): PlatformManifest[] {
  return platforms.filter((platform) => platform.allowedVocabIds.includes(vocabId))
}

export function defaultVariantForPlatform(platforms: PlatformManifest[], platformId: string): string {
  return platforms.find((platform) => platform.id === platformId)?.defaultVariant || 'manual_collapsed'
}

export function getPlatformManifest(platforms: PlatformManifest[], platformId: string): PlatformManifest | null {
  return platforms.find((platform) => platform.id === platformId) || null
}

export function getVariantManifest(platforms: PlatformManifest[], platformId: string, variantId: string): PlatformVariantManifest | null {
  return getPlatformManifest(platforms, platformId)?.variants.find((variant) => variant.id === variantId) || null
}

export function compilerFamilyForPlatform(platforms: PlatformManifest[], platformId: string): string | null {
  return getPlatformManifest(platforms, platformId)?.compilerFamily || null
}

export function artifactRoleForPlatform(platforms: PlatformManifest[], platformId: string): string | null {
  const compilerFamily = compilerFamilyForPlatform(platforms, platformId)
  if (compilerFamily === 'assist_plus') return 'integra_vialab_xml'
  if (compilerFamily === 'opentrons') return 'opentrons_python'
  return null
}

export function getDeckSlotLockedOrientation(slot: PlatformSlotManifest): 'portrait' | 'landscape' | null {
  if (slot.orientationMode === 'locked_portrait') return 'portrait'
  if (slot.orientationMode === 'locked_landscape') return 'landscape'
  return null
}

export function isRobotExecutionPlatform(platformId: string): platformId is 'opentrons_ot2' | 'opentrons_flex' | 'integra_assist' {
  return platformId === 'opentrons_ot2' || platformId === 'opentrons_flex' || platformId === 'integra_assist'
}
