import { AdapterRegistry } from './adapters/AdapterRegistry.js';
import { ParserRegistry } from '../measurement/parsers/ParserRegistry.js';

export class ExecutionCapabilitiesService {
  private readonly adapters = new AdapterRegistry();
  private readonly parsers = new ParserRegistry();

  getCapabilities(): Record<string, unknown> {
    return {
      adapters: this.adapters.list(),
      parsers: this.parsers.list(),
      opentrons: {
        modes: ['direct_submit', 'two_step'],
        env: [
          'LABOS_OPENTRONS_API_MODE',
          'LABOS_OPENTRONS_SUBMIT_URL',
          'LABOS_OPENTRONS_BASE_URL',
          'LABOS_OPENTRONS_API_TOKEN',
          'LABOS_OPENTRONS_STATUS_URL_TEMPLATE',
        ],
      },
      integraAssist: {
        modes: ['http_bridge', 'sidecar_process'],
        env: [
          'LABOS_SIDECAR_CONTRACT_STRICT',
          'LABOS_INTEGRA_ASSIST_SUBMIT_URL',
          'LABOS_INTEGRA_ASSIST_BASE_URL',
          'LABOS_INTEGRA_ASSIST_STATUS_URL_TEMPLATE',
          'LABOS_INTEGRA_ASSIST_CANCEL_URL_TEMPLATE',
          'LABOS_INTEGRA_ASSIST_API_TOKEN',
        ],
      },
      poller: {
        env: [
          'LABOS_OPENTRONS_BASE_URL',
          'LABOS_OPENTRONS_STATUS_URL_TEMPLATE',
          'LABOS_EXECUTION_MAX_RUN_MS',
          'LABOS_EXECUTION_STALE_UNKNOWN_MS',
        ],
      },
      retryWorker: {
        env: ['LABOS_RETRY_MAX_ATTEMPTS'],
      },
      cancel: {
        env: [
          'LABOS_SIDECAR_INTEGRA_ASSIST_CANCEL_CMD',
          'LABOS_SIDECAR_INTEGRA_ASSIST_CANCEL_ARGS',
          'LABOS_SIDECAR_OPENTRONS_OT2_CANCEL_CMD',
          'LABOS_SIDECAR_OPENTRONS_OT2_CANCEL_ARGS',
          'LABOS_SIDECAR_OPENTRONS_FLEX_CANCEL_CMD',
          'LABOS_SIDECAR_OPENTRONS_FLEX_CANCEL_ARGS',
        ],
      },
      activeRead: {
        adapters: ['molecular_devices_gemini', 'abi_7500_qpcr', 'agilent_6890n_gc', 'metrohm_761_ic'],
        env: [
          'LABOS_SIDECAR_CONTRACT_STRICT',
          'LABOS_SIMULATE_GEMINI',
          'LABOS_GEMINI_READ_URL',
          'LABOS_GEMINI_API_TOKEN',
          'LABOS_SIDECAR_GEMINI_CMD',
          'LABOS_SIDECAR_GEMINI_ARGS',
          'LABOS_SIDECAR_ABI_7500_CMD',
          'LABOS_SIDECAR_ABI_7500_ARGS',
          'LABOS_SIDECAR_AGILENT_6890N_CMD',
          'LABOS_SIDECAR_AGILENT_6890N_ARGS',
          'LABOS_SIDECAR_METROHM_761_CMD',
          'LABOS_SIDECAR_METROHM_761_ARGS',
        ],
      },
      simulation: {
        env: ['LABOS_SIMULATE_ASSIST_PLUS', 'LABOS_SIMULATE_GEMINI'],
        fixtureRoots: ['records/simulator/assist-plus', 'records/inbox'],
      },
      parameterSchemas: {
        runExecute: {
          integra_assist: ['simulate', 'vialLayout', 'mixCycles'],
          opentrons_ot2: ['simulate', 'mountLeft', 'mountRight', 'maxTipReuse'],
          opentrons_flex: ['simulate', 'gripperEnabled', 'maxTipReuse'],
        },
        activeRead: {
          molecular_devices_gemini: ['simulate', 'mode', 'wavelengthNm', 'integrationMs'],
          abi_7500_qpcr: ['simulate', 'cycles', 'annealTempC'],
          agilent_6890n_gc: ['simulate', 'methodId', 'runTimeSec'],
          metrohm_761_ic: ['simulate', 'methodId', 'acquisitionSec'],
        },
      },
    };
  }
}
