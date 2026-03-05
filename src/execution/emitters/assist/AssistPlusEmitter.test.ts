import { afterEach, describe, expect, it } from 'vitest';
import type { AppContext } from '../../../server.js';
import { createAssistPlusEmitter, type FetchLike } from './AssistPlusEmitter.js';

const originalAssistEmitter = process.env['ASSIST_EMITTER'];
const originalLabosAssistEmitter = process.env['LABOS_ASSIST_EMITTER'];
const originalPyalabEmitUrl = process.env['LABOS_PYALAB_EMIT_URL'];

function makeCtx(): AppContext {
  return {
    logger: {
      warn: () => {},
    },
  } as unknown as AppContext;
}

afterEach(() => {
  if (originalAssistEmitter === undefined) delete process.env['ASSIST_EMITTER'];
  else process.env['ASSIST_EMITTER'] = originalAssistEmitter;
  if (originalLabosAssistEmitter === undefined) delete process.env['LABOS_ASSIST_EMITTER'];
  else process.env['LABOS_ASSIST_EMITTER'] = originalLabosAssistEmitter;
  if (originalPyalabEmitUrl === undefined) delete process.env['LABOS_PYALAB_EMIT_URL'];
  else process.env['LABOS_PYALAB_EMIT_URL'] = originalPyalabEmitUrl;
});

describe('AssistPlusEmitter', () => {
  it('uses local emitter by default', async () => {
    delete process.env['ASSIST_EMITTER'];
    delete process.env['LABOS_ASSIST_EMITTER'];
    delete process.env['LABOS_PYALAB_EMIT_URL'];

    const emitter = createAssistPlusEmitter(makeCtx());
    const result = await emitter.emit({
      robotPlanId: 'RP-LOCAL-1',
      plannedRun: {
        recordId: 'PLR-1',
        title: 'Test',
        sourceRef: { id: 'PRO-1' },
      },
    });

    expect(result.emitter).toBe('local_ts');
    expect(result.vialabXml).toContain('<VialabProtocol');
  });

  it('uses pyalab http emitter when configured', async () => {
    process.env['ASSIST_EMITTER'] = 'pyalab';
    process.env['LABOS_PYALAB_EMIT_URL'] = 'http://pyalab.local/emit';
    const fetchFn: FetchLike = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        vialabXml: '<?xml version="1.0" encoding="UTF-8"?><VialabProtocol id="RP-REMOTE-1"></VialabProtocol>',
        emitterVersion: 'pyalab-test-v1',
      }),
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
    });

    const emitter = createAssistPlusEmitter(makeCtx(), fetchFn);
    const result = await emitter.emit({
      robotPlanId: 'RP-REMOTE-1',
      plannedRun: {
        recordId: 'PLR-1',
        title: 'Test',
        sourceRef: { id: 'PRO-1' },
      },
    });

    expect(result.emitter).toBe('pyalab_http');
    expect(result.emitterVersion).toBe('pyalab-test-v1');
    expect(result.vialabXml).toContain('<VialabProtocol id="RP-REMOTE-1">');
  });
});

