import type { AppContext } from '../../server.js';
import type { ExecutionProvider } from './ExecutionProvider.js';
import { LocalExecutionProvider } from './LocalExecutionProvider.js';
import { RemoteExecutionProvider } from './RemoteExecutionProvider.js';

export type ExecutionMode = 'local' | 'remote' | 'hybrid';
export type AdapterExecutionMode = 'local' | 'remote';

function toMode(value: string | undefined): ExecutionMode | undefined {
  if (value === 'local' || value === 'remote' || value === 'hybrid') return value;
  return undefined;
}

function toAdapterMode(value: string | undefined): AdapterExecutionMode | undefined {
  if (value === 'local' || value === 'remote') return value;
  return undefined;
}

function normalizeAdapterKey(adapterId: string): string {
  return adapterId.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

export function resolveExecutionMode(ctx: AppContext, adapterId?: string): { mode: ExecutionMode; adapterMode: AdapterExecutionMode } {
  const configuredMode = toMode(ctx.appConfig?.execution?.mode);
  const envMode = toMode(process.env['CL_EXECUTION_MODE']);
  const mode = envMode ?? configuredMode ?? 'local';

  const adapterFromConfig = adapterId ? ctx.appConfig?.execution?.adapters?.[adapterId] : undefined;
  const adapterFromEnv = adapterId ? toAdapterMode(process.env[`CL_EXECUTION_ADAPTER_MODE_${normalizeAdapterKey(adapterId)}`]) : undefined;

  if (mode === 'local') {
    return { mode, adapterMode: 'local' };
  }
  if (mode === 'remote') {
    return { mode, adapterMode: 'remote' };
  }

  const adapterMode = adapterFromEnv ?? adapterFromConfig ?? 'local';
  return { mode, adapterMode };
}

export function createExecutionProvider(ctx: AppContext, adapterId?: string): ExecutionProvider {
  const resolved = resolveExecutionMode(ctx, adapterId);
  if (resolved.adapterMode === 'remote') {
    return new RemoteExecutionProvider(ctx);
  }
  return new LocalExecutionProvider(ctx);
}
