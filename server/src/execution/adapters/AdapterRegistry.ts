export type AdapterId =
  | 'integra_assist'
  | 'opentrons_ot2'
  | 'opentrons_flex'
  | 'agilent_6890n_gc'
  | 'metrohm_761_ic'
  | 'molecular_devices_gemini'
  | 'abi_7500_qpcr'
  | 'pycromanager_imaging';

export type AdapterCapability =
  | 'plan_compile'
  | 'run_execute'
  | 'measurement_ingest'
  | 'measurement_active_control'
  | 'imaging';

export type AdapterDescriptor = {
  adapterId: AdapterId;
  displayName: string;
  sidecarType: 'local_process' | 'tcp_ip' | 'rs232' | 'python_bridge';
  capabilities: AdapterCapability[];
  maturity: 'scaffold' | 'alpha' | 'beta';
  notes: string;
};

const ADAPTERS: AdapterDescriptor[] = [
  {
    adapterId: 'integra_assist',
    displayName: 'INTEGRA Assist Plus',
    sidecarType: 'python_bridge',
    capabilities: ['plan_compile', 'run_execute'],
    maturity: 'alpha',
    notes: 'Compiler scaffold emits Vialab XML; execution uses sidecar command contract.',
  },
  {
    adapterId: 'opentrons_ot2',
    displayName: 'Opentrons OT-2',
    sidecarType: 'tcp_ip',
    capabilities: ['plan_compile', 'run_execute'],
    maturity: 'alpha',
    notes: 'Compiler scaffold emits Python; execution supports env-configured Opentrons HTTP submission.',
  },
  {
    adapterId: 'opentrons_flex',
    displayName: 'Opentrons Flex',
    sidecarType: 'tcp_ip',
    capabilities: ['plan_compile', 'run_execute'],
    maturity: 'alpha',
    notes: 'Compiler scaffold emits Python; execution supports env-configured Opentrons HTTP submission.',
  },
  {
    adapterId: 'molecular_devices_gemini',
    displayName: 'Molecular Devices Gemini',
    sidecarType: 'python_bridge',
    capabilities: ['measurement_ingest', 'measurement_active_control'],
    maturity: 'scaffold',
    notes: 'CSV ingest enabled; active control intended via pylabrobot-style bridge.',
  },
  {
    adapterId: 'abi_7500_qpcr',
    displayName: 'Applied Biosystems 7500 qPCR',
    sidecarType: 'python_bridge',
    capabilities: ['measurement_ingest'],
    maturity: 'scaffold',
    notes: 'File-first ingest path enabled for exported CSV tables.',
  },
  {
    adapterId: 'agilent_6890n_gc',
    displayName: 'Agilent 6890N GC',
    sidecarType: 'rs232',
    capabilities: ['measurement_ingest'],
    maturity: 'scaffold',
    notes: 'Awaiting sample raw files for parser implementation.',
  },
  {
    adapterId: 'metrohm_761_ic',
    displayName: 'Metrohm 761 IC',
    sidecarType: 'rs232',
    capabilities: ['measurement_ingest'],
    maturity: 'scaffold',
    notes: 'Awaiting sample raw files for parser implementation.',
  },
  {
    adapterId: 'pycromanager_imaging',
    displayName: 'pycro-manager Imaging',
    sidecarType: 'python_bridge',
    capabilities: ['measurement_ingest', 'imaging'],
    maturity: 'scaffold',
    notes: 'Planned integration point for pycro-manager + napari stack.',
  },
];

export class AdapterRegistry {
  list(): AdapterDescriptor[] {
    return ADAPTERS;
  }
}
