import { describe, expect, it } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { PolicyBundleService } from './PolicyBundleService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// server/src/policy -> repo root -> schema/core/policy-bundles
const BUNDLE_DIR = resolve(__dirname, '..', '..', '..', 'schema', 'core', 'policy-bundles');

describe('PolicyBundleService enforceTransitionRoles', () => {
  const service = new PolicyBundleService();
  const count = service.loadFromDir(BUNDLE_DIR);

  it('loads the four real policy bundles', () => {
    expect(count).toBe(4);
  });

  it('enforceTransitionRoles is denied in tracked and regulated bundles', () => {
    expect(service.resolveSettings('POL-TRACKED').enforceTransitionRoles).toBe('deny');
    expect(service.resolveSettings('POL-REGULATED').enforceTransitionRoles).toBe('deny');
  });

  it('enforceTransitionRoles is allowed in sandbox and notebook bundles', () => {
    expect(service.resolveSettings('POL-SANDBOX').enforceTransitionRoles).toBe('allow');
    expect(service.resolveSettings('POL-NOTEBOOK').enforceTransitionRoles).toBe('allow');
  });

  it('falls back to the default (allow) for unknown bundles', () => {
    expect(service.resolveSettings('NOPE').enforceTransitionRoles).toBe('allow');
  });
});
