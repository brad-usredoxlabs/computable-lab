import type { AppContext } from '../server.js';
import {
  LABOS_BRIDGE_CONTRACT_VERSION,
  parseAssistCancelResponse,
  parseAssistStatusResponse,
  parseAssistSubmitResponse,
  parseGeminiActiveReadResponse,
} from './sidecar/BridgeContracts.js';

type ContractCase = {
  contractId: string;
  schemaId: string;
  sample: unknown;
  type: 'request' | 'response';
};

const SIDECAR_CONTRACT_REPORT_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/sidecar-contract-report.schema.yaml';

const CONTRACT_CASES: ContractCase[] = [
  {
    contractId: 'integra_assist.submit.request',
    schemaId: 'https://computable-lab.com/schema/computable-lab/sidecar/integra-assist-submit-request.schema.yaml',
    type: 'request',
    sample: {
      robotPlanId: 'RP-000001',
      targetPlatform: 'integra_assist',
      artifactUri: 'records/robot-artifact/integra_assist/RP-000001.xml',
      vialabXml: '<VialabProtocol id="RP-000001" />',
      parameters: { mixCycles: 3 },
    },
  },
  {
    contractId: 'integra_assist.submit.response',
    schemaId: 'https://computable-lab.com/schema/computable-lab/sidecar/integra-assist-submit-response.schema.yaml',
    type: 'response',
    sample: {
      contractVersion: LABOS_BRIDGE_CONTRACT_VERSION,
      adapterId: 'integra_assist',
      operation: 'submit',
      result: { runId: 'assist-run-1', status: 'accepted' },
    },
  },
  {
    contractId: 'integra_assist.status.response',
    schemaId: 'https://computable-lab.com/schema/computable-lab/sidecar/integra-assist-status-response.schema.yaml',
    type: 'response',
    sample: {
      contractVersion: LABOS_BRIDGE_CONTRACT_VERSION,
      adapterId: 'integra_assist',
      operation: 'status',
      result: { runId: 'assist-run-1', status: 'running' },
    },
  },
  {
    contractId: 'integra_assist.cancel.request',
    schemaId: 'https://computable-lab.com/schema/computable-lab/sidecar/integra-assist-cancel-request.schema.yaml',
    type: 'request',
    sample: { actionType: 'stop' },
  },
  {
    contractId: 'integra_assist.cancel.response',
    schemaId: 'https://computable-lab.com/schema/computable-lab/sidecar/integra-assist-cancel-response.schema.yaml',
    type: 'response',
    sample: {
      contractVersion: LABOS_BRIDGE_CONTRACT_VERSION,
      adapterId: 'integra_assist',
      operation: 'cancel',
      result: { runId: 'assist-run-1', status: 'stopped' },
    },
  },
  {
    contractId: 'molecular_devices_gemini.active_read.request',
    schemaId: 'https://computable-lab.com/schema/computable-lab/sidecar/gemini-active-read-request.schema.yaml',
    type: 'request',
    sample: {
      adapterId: 'molecular_devices_gemini',
      outputPath: 'records/inbox/gemini.csv',
      parameters: { mode: 'fluorescence', wavelengthNm: 520 },
    },
  },
  {
    contractId: 'molecular_devices_gemini.active_read.response',
    schemaId: 'https://computable-lab.com/schema/computable-lab/sidecar/gemini-active-read-response.schema.yaml',
    type: 'response',
    sample: {
      contractVersion: LABOS_BRIDGE_CONTRACT_VERSION,
      adapterId: 'molecular_devices_gemini',
      operation: 'active_read',
      result: { rawDataPath: 'records/inbox/gemini.csv', parserId: 'gemini_csv', status: 'completed' },
    },
  },
];

export class SidecarContractConformanceService {
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  manifest(): { contractVersion: string; contracts: Array<Record<string, unknown>>; total: number } {
    return {
      contractVersion: LABOS_BRIDGE_CONTRACT_VERSION,
      contracts: CONTRACT_CASES.map((c) => ({
        contractId: c.contractId,
        schemaId: c.schemaId,
        type: c.type,
      })),
      total: CONTRACT_CASES.length,
    };
  }

  examples(options?: { contractId?: string }): { contractVersion: string; contracts: Array<Record<string, unknown>>; total: number } {
    const selected = options?.contractId
      ? CONTRACT_CASES.filter((c) => c.contractId === options.contractId)
      : CONTRACT_CASES;
    return {
      contractVersion: LABOS_BRIDGE_CONTRACT_VERSION,
      contracts: selected.map((c) => ({
        contractId: c.contractId,
        schemaId: c.schemaId,
        type: c.type,
        sample: c.sample,
      })),
      total: selected.length,
    };
  }

  getSchemaId(contractId: string): string | null {
    const contract = CONTRACT_CASES.find((c) => c.contractId === contractId);
    return contract ? contract.schemaId : null;
  }

  validatePayload(contractId: string, payload: unknown): Record<string, unknown> {
    const contract = CONTRACT_CASES.find((c) => c.contractId === contractId);
    if (!contract) {
      return {
        contractId,
        valid: false,
        error: `Unknown contractId: ${contractId}`,
      };
    }
    const result = this.ctx.validator.validate(payload, contract.schemaId);
    return {
      contractId,
      schemaId: contract.schemaId,
      valid: result.valid,
      ...(result.valid ? {} : { errors: result.errors }),
    };
  }

  validateBatch(items: Array<{ contractId: string; payload: unknown }>): Record<string, unknown> {
    const results: Array<Record<string, unknown>> = items.map((item, index) => ({
      index,
      ...this.validatePayload(item.contractId, item.payload),
    }));
    const passed = results.filter((r) => r['valid'] === true).length;
    return {
      total: results.length,
      passed,
      failed: results.length - passed,
      results,
      timestamp: new Date().toISOString(),
    };
  }

  diagnostics(): Record<string, unknown> {
    const strict = (() => {
      const value = process.env['LABOS_SIDECAR_CONTRACT_STRICT'];
      if (value === undefined) return true;
      const normalized = value.trim().toLowerCase();
      return !(normalized === '0' || normalized === 'false' || normalized === 'no');
    })();

    const contracts = CONTRACT_CASES.map((c) => {
      const loaded = this.ctx.schemaRegistry.getById(c.schemaId) !== undefined;
      return {
        contractId: c.contractId,
        schemaId: c.schemaId,
        type: c.type,
        schemaLoaded: loaded,
      };
    });
    const loadedCount = contracts.filter((c) => c.schemaLoaded).length;
    return {
      contractVersion: LABOS_BRIDGE_CONTRACT_VERSION,
      strictMode: strict,
      totalContracts: contracts.length,
      loadedContracts: loadedCount,
      missingContracts: contracts.length - loadedCount,
      contracts,
      timestamp: new Date().toISOString(),
    };
  }

  validatePayloadIfSchemaAvailable(contractId: string, payload: unknown): { checked: boolean; valid: boolean; errors?: unknown } {
    const schemaId = this.getSchemaId(contractId);
    if (!schemaId) {
      return {
        checked: false,
        valid: false,
        errors: [{ message: `Unknown contractId: ${contractId}` }],
      };
    }
    if (!this.ctx.schemaRegistry.getById(schemaId)) {
      return { checked: false, valid: true };
    }
    const result = this.ctx.validator.validate(payload, schemaId);
    return {
      checked: true,
      valid: result.valid,
      ...(result.valid ? {} : { errors: result.errors }),
    };
  }

  async selfTest(): Promise<Record<string, unknown>> {
    const checks: Array<Record<string, unknown>> = [];

    for (const contract of CONTRACT_CASES) {
      const result = this.ctx.validator.validate(contract.sample, contract.schemaId);
      checks.push({
        checkId: `schema:${contract.contractId}`,
        passed: result.valid,
        schemaId: contract.schemaId,
        ...(result.valid ? {} : { errors: result.errors }),
      });
    }

    try {
      parseAssistSubmitResponse(JSON.stringify(CONTRACT_CASES.find((c) => c.contractId === 'integra_assist.submit.response')!.sample));
      checks.push({ checkId: 'parser:integra.submit.v1', passed: true });
    } catch (err) {
      checks.push({ checkId: 'parser:integra.submit.v1', passed: false, error: err instanceof Error ? err.message : String(err) });
    }
    try {
      parseAssistStatusResponse(JSON.stringify(CONTRACT_CASES.find((c) => c.contractId === 'integra_assist.status.response')!.sample));
      checks.push({ checkId: 'parser:integra.status.v1', passed: true });
    } catch (err) {
      checks.push({ checkId: 'parser:integra.status.v1', passed: false, error: err instanceof Error ? err.message : String(err) });
    }
    try {
      parseAssistCancelResponse(JSON.stringify(CONTRACT_CASES.find((c) => c.contractId === 'integra_assist.cancel.response')!.sample));
      checks.push({ checkId: 'parser:integra.cancel.v1', passed: true });
    } catch (err) {
      checks.push({ checkId: 'parser:integra.cancel.v1', passed: false, error: err instanceof Error ? err.message : String(err) });
    }
    try {
      parseGeminiActiveReadResponse(
        JSON.stringify(CONTRACT_CASES.find((c) => c.contractId === 'molecular_devices_gemini.active_read.response')!.sample),
      );
      checks.push({ checkId: 'parser:gemini.active_read.v1', passed: true });
    } catch (err) {
      checks.push({
        checkId: 'parser:gemini.active_read.v1',
        passed: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const previousStrict = process.env['LABOS_SIDECAR_CONTRACT_STRICT'];
    process.env['LABOS_SIDECAR_CONTRACT_STRICT'] = '1';
    try {
      parseAssistSubmitResponse('{"runId":"legacy-run","status":"accepted"}');
      checks.push({ checkId: 'parser:legacy.strict_reject', passed: false, error: 'Expected strict reject but parser accepted legacy payload' });
    } catch {
      checks.push({ checkId: 'parser:legacy.strict_reject', passed: true });
    } finally {
      if (previousStrict === undefined) {
        delete process.env['LABOS_SIDECAR_CONTRACT_STRICT'];
      } else {
        process.env['LABOS_SIDECAR_CONTRACT_STRICT'] = previousStrict;
      }
    }

    const passed = checks.filter((c) => c['passed'] === true).length;
    return {
      contractVersion: LABOS_BRIDGE_CONTRACT_VERSION,
      totalChecks: checks.length,
      passedChecks: passed,
      failedChecks: checks.length - passed,
      ok: passed === checks.length,
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  private async nextReportId(): Promise<string> {
    const records = await this.ctx.store.list({ kind: 'sidecar-contract-report', limit: 5000 });
    let max = 0;
    for (const env of records) {
      const id = env.recordId;
      if (!id.startsWith('SCR-')) continue;
      const suffix = id.slice('SCR-'.length);
      if (!/^\d+$/.test(suffix)) continue;
      const n = Number.parseInt(suffix, 10);
      if (n > max) max = n;
    }
    return `SCR-${String(max + 1).padStart(6, '0')}`;
  }

  async selfTestAndPersist(input?: { profile?: string; notes?: string }): Promise<Record<string, unknown>> {
    const report = await this.selfTest();
    const recordId = await this.nextReportId();
    await this.ctx.store.create({
      envelope: {
        recordId,
        schemaId: SIDECAR_CONTRACT_REPORT_SCHEMA_ID,
        payload: {
          kind: 'sidecar-contract-report',
          recordId,
          contractVersion: report['contractVersion'],
          ok: report['ok'],
          totalChecks: report['totalChecks'],
          passedChecks: report['passedChecks'],
          failedChecks: report['failedChecks'],
          checks: report['checks'],
          diagnostics: this.diagnostics(),
          generatedAt: new Date().toISOString(),
          ...(input?.profile ? { profile: input.profile } : {}),
          ...(input?.notes ? { notes: input.notes } : {}),
        },
      },
      message: `Create sidecar contract report ${recordId}`,
      skipValidation: true,
      skipLint: true,
    });
    return {
      ...report,
      reportId: recordId,
    };
  }

  async gate(input?: {
    requireStrict?: boolean;
    requireAllSchemasLoaded?: boolean;
    requireSelfTestPass?: boolean;
  }): Promise<Record<string, unknown>> {
    const diagnostics = this.diagnostics();
    const strictMode = diagnostics['strictMode'] === true;
    const missingContracts = Number(diagnostics['missingContracts'] ?? 0);
    const selfTest = await this.selfTest();
    const checks: Array<{ name: string; passed: boolean; details?: string }> = [];
    if (input?.requireStrict === true) {
      checks.push({
        name: 'requireStrict',
        passed: strictMode,
        ...(strictMode ? {} : { details: 'LABOS_SIDECAR_CONTRACT_STRICT is disabled' }),
      });
    }
    if (input?.requireAllSchemasLoaded === true) {
      checks.push({
        name: 'requireAllSchemasLoaded',
        passed: missingContracts === 0,
        ...(missingContracts === 0 ? {} : { details: `${missingContracts} contract schema(s) missing` }),
      });
    }
    if (input?.requireSelfTestPass !== false) {
      checks.push({
        name: 'requireSelfTestPass',
        passed: selfTest['ok'] === true,
        ...(selfTest['ok'] === true ? {} : { details: `${String(selfTest['failedChecks'])} self-test check(s) failed` }),
      });
    }
    const ready = checks.every((c) => c.passed);
    return {
      ready,
      checks,
      diagnostics,
      selfTest,
      timestamp: new Date().toISOString(),
    };
  }
}
