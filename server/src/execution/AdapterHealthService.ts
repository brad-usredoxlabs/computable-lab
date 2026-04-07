import { AdapterRegistry } from './adapters/AdapterRegistry.js';

type FetchLikeResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<FetchLikeResponse>;

type AdapterHealthStatus = 'ready' | 'degraded' | 'missing_config' | 'unreachable';

type AdapterHealth = {
  adapterId: string;
  status: AdapterHealthStatus;
  details: Record<string, unknown>;
};

function has(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0;
}

export class AdapterHealthService {
  private readonly registry = new AdapterRegistry();
  private readonly fetchFn: FetchLike;

  constructor(fetchFn?: FetchLike) {
    this.fetchFn = fetchFn ?? (globalThis.fetch as unknown as FetchLike);
  }

  private checkConfigured(adapterId: string): { status: AdapterHealthStatus; details: Record<string, unknown>; probeUrl?: string } {
    if (adapterId === 'opentrons_ot2' || adapterId === 'opentrons_flex') {
      const baseUrl = process.env['LABOS_OPENTRONS_BASE_URL'];
      const submitUrl = process.env['LABOS_OPENTRONS_SUBMIT_URL'];
      if (has(baseUrl) || has(submitUrl)) {
        return {
          status: 'ready',
          details: {
            mode: process.env['LABOS_OPENTRONS_API_MODE'] ?? 'direct_submit',
            baseUrlConfigured: has(baseUrl),
            submitUrlConfigured: has(submitUrl),
          },
          ...(baseUrl ? { probeUrl: baseUrl } : {}),
        };
      }
      return { status: 'missing_config', details: { expected: ['LABOS_OPENTRONS_BASE_URL or LABOS_OPENTRONS_SUBMIT_URL'] } };
    }

    if (adapterId === 'integra_assist') {
      const submitUrl = process.env['LABOS_INTEGRA_ASSIST_SUBMIT_URL'];
      const cmd = process.env['LABOS_SIDECAR_INTEGRA_ASSIST_CMD'];
      if (has(submitUrl) || has(cmd)) {
        return {
          status: 'ready',
          details: {
            submitUrlConfigured: has(submitUrl),
            sidecarCmdConfigured: has(cmd),
            simulatorEnabled: process.env['LABOS_SIMULATE_ASSIST_PLUS'] === '1',
          },
          ...(submitUrl ? { probeUrl: submitUrl } : {}),
        };
      }
      return {
        status: 'missing_config',
        details: { expected: ['LABOS_INTEGRA_ASSIST_SUBMIT_URL or LABOS_SIDECAR_INTEGRA_ASSIST_CMD'] },
      };
    }

    if (adapterId === 'molecular_devices_gemini') {
      const readUrl = process.env['LABOS_GEMINI_READ_URL'];
      const cmd = process.env['LABOS_SIDECAR_GEMINI_CMD'];
      if (has(readUrl) || has(cmd) || process.env['LABOS_SIMULATE_GEMINI'] === '1') {
        return {
          status: 'ready',
          details: {
            readUrlConfigured: has(readUrl),
            sidecarCmdConfigured: has(cmd),
            simulatorEnabled: process.env['LABOS_SIMULATE_GEMINI'] === '1',
          },
          ...(readUrl ? { probeUrl: readUrl } : {}),
        };
      }
      return { status: 'missing_config', details: { expected: ['LABOS_GEMINI_READ_URL or LABOS_SIDECAR_GEMINI_CMD'] } };
    }

    if (adapterId === 'abi_7500_qpcr' || adapterId === 'agilent_6890n_gc' || adapterId === 'metrohm_761_ic') {
      return {
        status: 'degraded',
        details: {
          mode: 'file-first/sidecar',
          note: 'Parser and ingest paths are available; active hardware bridge is optional/scaffolded.',
        },
      };
    }

    return {
      status: 'degraded',
      details: { note: 'No explicit health contract yet.' },
    };
  }

  async check(options?: { probe?: boolean }): Promise<{ adapters: AdapterHealth[]; total: number; summary: Record<string, number>; timestamp: string }> {
    const descriptors = this.registry.list();
    const adapters: AdapterHealth[] = [];
    for (const descriptor of descriptors) {
      const configured = this.checkConfigured(descriptor.adapterId);
      if (options?.probe === true && configured.probeUrl && configured.status === 'ready') {
        try {
          const resp = await this.fetchFn(configured.probeUrl, { method: 'GET' });
          adapters.push({
            adapterId: descriptor.adapterId,
            status: resp.ok ? 'ready' : 'unreachable',
            details: {
              ...configured.details,
              probeUrl: configured.probeUrl,
              probeHttpStatus: resp.status,
            },
          });
          continue;
        } catch (err) {
          adapters.push({
            adapterId: descriptor.adapterId,
            status: 'unreachable',
            details: {
              ...configured.details,
              probeUrl: configured.probeUrl,
              error: err instanceof Error ? err.message : String(err),
            },
          });
          continue;
        }
      }
      adapters.push({
        adapterId: descriptor.adapterId,
        status: configured.status,
        details: configured.details,
      });
    }

    const summary = adapters.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});
    return {
      adapters,
      total: adapters.length,
      summary,
      timestamp: new Date().toISOString(),
    };
  }
}

