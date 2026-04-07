import { afterEach, describe, expect, it } from 'vitest';
import {
  LABOS_BRIDGE_CONTRACT_VERSION,
  parseAssistCancelResponse,
  parseAssistStatusResponse,
  parseAssistSubmitResponse,
  parseGeminiActiveReadResponse,
} from './BridgeContracts.js';

describe('BridgeContracts', () => {
  afterEach(() => {
    delete process.env['LABOS_SIDECAR_CONTRACT_STRICT'];
  });

  it('parses assist v1 submit/status/cancel responses', () => {
    const submit = parseAssistSubmitResponse(JSON.stringify({
      contractVersion: LABOS_BRIDGE_CONTRACT_VERSION,
      adapterId: 'integra_assist',
      operation: 'submit',
      result: { runId: 'assist-run-1', status: 'accepted' },
    }));
    expect(submit.runId).toBe('assist-run-1');
    expect(submit.contractVersion).toBe(LABOS_BRIDGE_CONTRACT_VERSION);
    expect(submit.legacy).toBe(false);

    const status = parseAssistStatusResponse(JSON.stringify({
      contractVersion: LABOS_BRIDGE_CONTRACT_VERSION,
      adapterId: 'integra_assist',
      operation: 'status',
      result: { runId: 'assist-run-1', status: 'running' },
    }));
    expect(status.status).toBe('running');

    const cancel = parseAssistCancelResponse(JSON.stringify({
      contractVersion: LABOS_BRIDGE_CONTRACT_VERSION,
      adapterId: 'integra_assist',
      operation: 'cancel',
      result: { runId: 'assist-run-1', status: 'stopped' },
    }));
    expect(cancel.status).toBe('stopped');
  });

  it('parses gemini active-read v1 response', () => {
    const parsed = parseGeminiActiveReadResponse(JSON.stringify({
      contractVersion: LABOS_BRIDGE_CONTRACT_VERSION,
      adapterId: 'molecular_devices_gemini',
      operation: 'active_read',
      result: { rawDataPath: 'records/inbox/gemini.csv', status: 'completed', parserId: 'gemini_csv' },
    }));
    expect(parsed.rawDataPath).toBe('records/inbox/gemini.csv');
    expect(parsed.contractVersion).toBe(LABOS_BRIDGE_CONTRACT_VERSION);
    expect(parsed.legacy).toBe(false);
  });

  it('rejects legacy payloads in strict mode and accepts them in compatibility mode', () => {
    process.env['LABOS_SIDECAR_CONTRACT_STRICT'] = '1';
    expect(() => parseAssistSubmitResponse('{"runId":"assist-run-1","status":"accepted"}')).toThrow(/Invalid INTEGRA submit response contract/);
    expect(() => parseGeminiActiveReadResponse('{"rawDataPath":"records/inbox/gemini.csv"}')).toThrow(/Invalid Gemini active_read response contract/);

    process.env['LABOS_SIDECAR_CONTRACT_STRICT'] = '0';
    const assistLegacy = parseAssistSubmitResponse('{"runId":"assist-run-1","status":"accepted"}');
    expect(assistLegacy.legacy).toBe(true);
    const geminiLegacy = parseGeminiActiveReadResponse('{"rawDataPath":"records/inbox/gemini.csv"}');
    expect(geminiLegacy.legacy).toBe(true);
  });
});
