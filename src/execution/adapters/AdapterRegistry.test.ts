import { describe, expect, it } from 'vitest';
import { AdapterRegistry } from './AdapterRegistry.js';

describe('AdapterRegistry', () => {
  it('lists known adapters including assist plus and gemini', () => {
    const registry = new AdapterRegistry();
    const adapters = registry.list();
    expect(adapters.length).toBeGreaterThan(0);
    expect(adapters.some((a) => a.adapterId === 'integra_assist')).toBe(true);
    expect(adapters.some((a) => a.adapterId === 'molecular_devices_gemini')).toBe(true);
  });
});
