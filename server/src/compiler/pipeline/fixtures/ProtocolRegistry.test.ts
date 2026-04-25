import { describe, it, expect } from 'vitest';
import { getProtocolSpecRegistry } from '../../../registry/ProtocolSpecRegistry.js';

describe('Protocol registry', () => {
  it('loads zymo-magbead-minimal protocol', () => {
    const reg = getProtocolSpecRegistry();
    const list = reg.list();
    console.log('Protocol list:', list.map(p => p.id));
    const zymo = reg.get('zymo-magbead-minimal');
    console.log('zymo-magbead-minimal:', zymo);
    expect(zymo).toBeDefined();
    expect(zymo?.id).toBe('zymo-magbead-minimal');
    expect(zymo?.steps.length).toBeGreaterThan(0);
  });
});
