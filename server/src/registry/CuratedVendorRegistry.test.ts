/**
 * Tests for CuratedVendorRegistry.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCuratedVendorRegistry,
  type CuratedVendor,
} from './CuratedVendorRegistry.js';

describe('CuratedVendorRegistry', () => {
  let registry: ReturnType<typeof getCuratedVendorRegistry>;

  beforeEach(() => {
    registry = getCuratedVendorRegistry();
    registry.reload();
  });

  it('loads all six vendor entries', () => {
    const vendors = registry.list();
    expect(vendors.length).toBe(6);
  });

  it('returns only enabled vendors from list()', () => {
    const vendors = registry.list();
    for (const v of vendors) {
      expect(v.enabled).toBe(true);
    }
  });

  it('get returns a vendor by id', () => {
    const fisher = registry.get('fisher');
    expect(fisher).toBeDefined();
    expect(fisher!.id).toBe('fisher');
    expect(fisher!.display_name).toBe('Fisher Scientific');
    expect(fisher!.landing_url).toBe('https://www.fishersci.com/');
    expect(fisher!.kind).toBe('curated-vendor');
  });

  it('get returns undefined for unknown id', () => {
    const unknown = registry.get('nonexistent');
    expect(unknown).toBeUndefined();
  });

  it('all six vendor ids are present', () => {
    const ids = registry.list().map(v => v.id);
    expect(ids).toContain('thermo');
    expect(ids).toContain('sigma');
    expect(ids).toContain('fisher');
    expect(ids).toContain('vwr');
    expect(ids).toContain('cayman');
    expect(ids).toContain('thomas');
  });

  it('display_name matches expected labels', () => {
    const expected: Record<string, string> = {
      fisher: 'Fisher Scientific',
      sigma: 'Sigma-Aldrich',
      thermo: 'Thermo Fisher',
      vwr: 'VWR',
      cayman: 'Cayman Chemical',
      thomas: 'Thomas Scientific',
    };
    for (const [id, label] of Object.entries(expected)) {
      const vendor = registry.get(id);
      expect(vendor).toBeDefined();
      expect(vendor!.display_name).toBe(label);
    }
  });

  it('document_search_paths is optional', () => {
    const fisher = registry.get('fisher');
    expect(fisher!.document_search_paths).toBeDefined();
    expect(fisher!.document_search_paths).toContain('/technical-resources/');
  });
});
