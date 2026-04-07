import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import YAML from 'yaml';
import { PlatformRegistry } from './PlatformRegistry.js';
import { DEFAULT_PLATFORM_MANIFESTS } from './defaultManifests.js';
import type { PlatformManifest } from './types.js';

type IndexFile = {
  platforms?: string[];
};

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function normalizeManifest(input: unknown): PlatformManifest {
  const obj = input as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id : '';
  const label = typeof obj.label === 'string' ? obj.label : id;
  const defaultVariant = typeof obj.defaultVariant === 'string' ? obj.defaultVariant : '';
  const allowedVocabIds = toStringArray(obj.allowedVocabIds);
  const toolTypeIds = toStringArray(obj.toolTypeIds);
  const modules = Array.isArray(obj.modules)
    ? obj.modules
        .map((module) => module as Record<string, unknown>)
        .filter((module) => typeof module.id === 'string' && typeof module.label === 'string')
        .map((module) => ({ id: String(module.id), label: String(module.label) }))
    : [];
  const variants = Array.isArray(obj.variants)
    ? obj.variants
        .map((variant) => variant as Record<string, unknown>)
        .filter((variant) => typeof variant.id === 'string' && typeof variant.title === 'string')
        .map((variant) => ({
          id: String(variant.id),
          title: String(variant.title),
          slots: Array.isArray(variant.slots)
            ? variant.slots
                .map((slot) => slot as Record<string, unknown>)
                .filter((slot) => typeof slot.id === 'string' && typeof slot.kind === 'string')
                .map((slot) => ({
                  id: String(slot.id),
                  kind: slot.kind as 'standard' | 'trash' | 'module' | 'special',
                  ...(typeof slot.label === 'string' ? { label: slot.label } : {}),
                  ...(typeof slot.orientationMode === 'string' ? { orientationMode: slot.orientationMode as 'flippable' | 'locked_portrait' | 'locked_landscape' | 'not_applicable' } : {}),
                  ...(typeof slot.row === 'number' ? { row: slot.row } : {}),
                  ...(typeof slot.col === 'number' ? { col: slot.col } : {}),
                  ...(typeof slot.reachable === 'boolean' ? { reachable: slot.reachable } : {}),
                  ...(typeof slot.stagingOnly === 'boolean' ? { stagingOnly: slot.stagingOnly } : {}),
                }))
            : [],
        }))
    : [];

  if (!id || !defaultVariant || variants.length === 0) {
    throw new Error(`Invalid platform manifest: ${id || '<missing id>'}`);
  }
  if (!variants.some((variant) => variant.id === defaultVariant)) {
    throw new Error(`Default variant "${defaultVariant}" not found for platform "${id}"`);
  }
  return {
    id,
    label,
    allowedVocabIds,
    defaultVariant,
    toolTypeIds,
    ...(typeof obj.compilerFamily === 'string' ? { compilerFamily: obj.compilerFamily } : {}),
    modules,
    variants,
  };
}

export async function loadPlatformRegistry(basePath: string): Promise<{ registry: PlatformRegistry; source: 'yaml' | 'fallback' }> {
  try {
    const indexPath = resolve(basePath, 'config/platforms/index.yaml');
    const indexText = await readFile(indexPath, 'utf8');
    const parsed = YAML.parse(indexText) as IndexFile;
    const platformFiles = toStringArray(parsed.platforms);
    if (platformFiles.length === 0) {
      throw new Error('Platform index did not contain any platform entries');
    }
    const manifests: PlatformManifest[] = [];
    for (const file of platformFiles) {
      const filePath = resolve(basePath, 'config/platforms', file);
      const text = await readFile(filePath, 'utf8');
      manifests.push(normalizeManifest(YAML.parse(text)));
    }
    return {
      registry: new PlatformRegistry(manifests),
      source: 'yaml',
    };
  } catch {
    return {
      registry: new PlatformRegistry(DEFAULT_PLATFORM_MANIFESTS),
      source: 'fallback',
    };
  }
}
