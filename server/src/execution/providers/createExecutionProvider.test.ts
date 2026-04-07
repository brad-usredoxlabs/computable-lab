import { describe, it, expect } from 'vitest';
import type { AppContext } from '../../server.js';
import { resolveExecutionMode } from './createExecutionProvider.js';

function makeCtx(execution?: { mode?: 'local' | 'remote' | 'hybrid'; adapters?: Record<string, 'local' | 'remote'> }): AppContext {
  return {
    appConfig: execution ? ({ execution } as AppContext['appConfig']) : undefined,
  } as AppContext;
}

describe('resolveExecutionMode', () => {
  it('defaults to local mode', () => {
    const resolved = resolveExecutionMode(makeCtx());
    expect(resolved).toEqual({ mode: 'local', adapterMode: 'local' });
  });

  it('resolves hybrid adapter overrides from config', () => {
    const resolved = resolveExecutionMode(makeCtx({ mode: 'hybrid', adapters: { integra_assist: 'remote' } }), 'integra_assist');
    expect(resolved).toEqual({ mode: 'hybrid', adapterMode: 'remote' });
  });

  it('prefers env override for global mode', () => {
    process.env['CL_EXECUTION_MODE'] = 'remote';
    const resolved = resolveExecutionMode(makeCtx({ mode: 'local' }));
    expect(resolved).toEqual({ mode: 'remote', adapterMode: 'remote' });
    delete process.env['CL_EXECUTION_MODE'];
  });
});
