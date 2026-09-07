import { describe, expect, it } from 'vitest';
import { loadPlatformRegistry } from './YamlPlatformRegistryLoader.js';
import { DEFAULT_PLATFORM_MANIFESTS } from './defaultManifests.js';

describe('default platform manifests', () => {
  it('defaults manual work to a single SBS plate while keeping advanced manual variants', () => {
    const manual = DEFAULT_PLATFORM_MANIFESTS.find((platform) => platform.id === 'manual');
    expect(manual).toBeDefined();
    expect(manual?.defaultVariant).toBe('manual_single_plate');

    const singlePlate = manual?.variants.find((variant) => variant.id === 'manual_single_plate');
    expect(singlePlate).toMatchObject({
      title: 'Single SBS Plate',
      slots: [
        {
          id: 'PLATE',
          kind: 'standard',
          label: 'Click to choose labware',
          orientationMode: 'locked_landscape',
          reachable: true,
        },
      ],
    });

    expect(manual?.variants.map((variant) => variant.id)).toEqual([
      'manual_single_plate',
      'manual_collapsed',
      'manual_freeform',
    ]);
  });

  it('manual_freeform exposes BOTH a primary bench surface and a side labware lawn (so tiles can be dragged between them)', async () => {
    // Assert on BOTH the YAML that the live server loads (config/platforms/manual.yaml)
    // and the DEFAULT_PLATFORM_MANIFESTS fallback so the two never drift.
    const manual = DEFAULT_PLATFORM_MANIFESTS.find((platform) => platform.id === 'manual');
    const freeform = manual?.variants.find((variant) => variant.id === 'manual_freeform');
    expect(freeform).toBeDefined();
    expect(freeform?.surface).toEqual({ kind: 'lawn', widthMm: 1200, heightMm: 800 });
    expect(freeform?.sideLawn).toEqual({ widthMm: 600, heightMm: 400, label: 'Labware lawn' });

    const { registry, source } = await loadPlatformRegistry('..');
    expect(source).toBe('yaml');
    const yamlManual = registry.getPlatform('manual');
    const yamlFreeform = yamlManual?.variants.find((variant) => variant.id === 'manual_freeform');
    expect(yamlFreeform).toBeDefined();
    expect(yamlFreeform?.surface).toEqual({ kind: 'lawn', widthMm: 1200, heightMm: 800 });
    expect(yamlFreeform?.sideLawn).toEqual({ widthMm: 600, heightMm: 400, label: 'Labware lawn' });
  });

  it('loads the YAML manual platform with single plate as the default variant', async () => {
    const { registry, source } = await loadPlatformRegistry('..');
    const manual = registry.getPlatform('manual');
    expect(source).toBe('yaml');
    expect(manual?.defaultVariant).toBe('manual_single_plate');
    expect(manual?.variants.map((variant) => variant.id)).toContain('manual_single_plate');
  });
});
