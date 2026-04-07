import { describe, expect, it } from 'vitest';
import { AdapterHealthService } from './AdapterHealthService.js';

describe('AdapterHealthService', () => {
  it('reports missing config by default', async () => {
    delete process.env['LABOS_OPENTRONS_BASE_URL'];
    delete process.env['LABOS_OPENTRONS_SUBMIT_URL'];
    delete process.env['LABOS_INTEGRA_ASSIST_SUBMIT_URL'];
    delete process.env['LABOS_SIDECAR_INTEGRA_ASSIST_CMD'];
    delete process.env['LABOS_GEMINI_READ_URL'];
    delete process.env['LABOS_SIDECAR_GEMINI_CMD'];
    const service = new AdapterHealthService();
    const health = await service.check();
    expect(health.total).toBeGreaterThan(0);
    expect(health.adapters.some((a) => a.adapterId === 'integra_assist')).toBe(true);
  });

  it('probes configured adapter URLs', async () => {
    process.env['LABOS_INTEGRA_ASSIST_SUBMIT_URL'] = 'http://assist.local/runs';
    const fakeFetch = async () => ({
      ok: true,
      status: 200,
      text: async () => 'ok',
    });
    const service = new AdapterHealthService(fakeFetch as never);
    const health = await service.check({ probe: true });
    const integra = health.adapters.find((a) => a.adapterId === 'integra_assist');
    expect(integra?.status).toBe('ready');
    delete process.env['LABOS_INTEGRA_ASSIST_SUBMIT_URL'];
  });
});

