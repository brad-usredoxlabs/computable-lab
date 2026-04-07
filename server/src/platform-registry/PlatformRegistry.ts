import type { PlatformManifest, PlatformVariantManifest } from './types.js';

export class PlatformRegistry {
  private readonly platformsById: Map<string, PlatformManifest>;

  constructor(platforms: PlatformManifest[]) {
    this.platformsById = new Map(platforms.map((platform) => [platform.id, platform]));
  }

  listPlatforms(): PlatformManifest[] {
    return Array.from(this.platformsById.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  getPlatform(id: string): PlatformManifest | null {
    return this.platformsById.get(id) ?? null;
  }

  hasPlatform(id: string): boolean {
    return this.platformsById.has(id);
  }

  getDefaultVariant(platformId: string): PlatformVariantManifest | null {
    const platform = this.getPlatform(platformId);
    if (!platform) return null;
    return platform.variants.find((variant) => variant.id === platform.defaultVariant) ?? null;
  }

  getVariant(platformId: string, variantId: string): PlatformVariantManifest | null {
    const platform = this.getPlatform(platformId);
    if (!platform) return null;
    return platform.variants.find((variant) => variant.id === variantId) ?? null;
  }

  isPlatformAllowedForVocab(platformId: string, vocabId: string): boolean {
    const platform = this.getPlatform(platformId);
    if (!platform) return false;
    return platform.allowedVocabIds.includes(vocabId);
  }
}
