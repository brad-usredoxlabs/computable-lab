import { describe, it, expect } from 'vitest';
import { getProtocolSpecRegistry } from './ProtocolSpecRegistry.js';

describe('ProtocolSpecRegistry', () => {
  it('list() returns >= 1 entry', () => {
    const registry = getProtocolSpecRegistry();
    const entries = registry.list();
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it('get("test-wash-protocol") returns the seed with 3 steps', () => {
    const registry = getProtocolSpecRegistry();
    const entry = registry.get('test-wash-protocol');
    expect(entry).toBeDefined();
    expect(entry!.id).toBe('test-wash-protocol');
    expect(entry!.name).toBe('Test Wash Protocol (minimal)');
    expect(entry!.steps).toHaveLength(3);
  });

  it('step 1 verb is add_material and volumeUl is 200', () => {
    const registry = getProtocolSpecRegistry();
    const entry = registry.get('test-wash-protocol');
    expect(entry).toBeDefined();
    const step1 = entry!.steps[0];
    expect(step1.verb).toBe('add_material');
    expect(step1.params.volumeUl).toBe(200);
  });
});
