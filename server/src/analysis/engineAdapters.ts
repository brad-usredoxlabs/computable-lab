/**
 * engineAdapters — the shipped analysis-engine adapter registry (GC-5 §d).
 *
 * Dispatch is REGISTRY-DATA-DRIVEN: the analysis-engine record's
 * implementation.adapter (a CLOSED enum in analysis-engine.schema.yaml) selects
 * the shipped implementation from this table. The runner holds no engine-name
 * or adapter-name literal dispatch — it reads the record's data (bait #3). An
 * id not in the table is a NAMED declared failure (ENGINE_ADAPTER_UNREGISTERED),
 * never a fallback: the closed enum and this table agree, so an unshipped
 * adapter is refused declaratively (schema) AND at dispatch (this module).
 *
 * The two shipped adapters:
 *  - python-entry-script — wraps the EXISTING `python -m computable_lab_analysis
 *    run` behavior (the runner's runPython) unchanged;
 *  - stub-echo — the SECOND adapter, dispatched purely from registry data,
 *    EXPLICITLY A DECLARED STUB, NOT a scientific engine (the analysis sibling
 *    of the sequence lane's builtin virtual-pcr stub pattern): it emits exactly
 *    one metric artifact, zero views, and a manifest log line (level warning)
 *    naming itself as the pluggability probe. It must NOT produce
 *    peak/signal/calibration artifacts and must NOT name any analyte. Its
 *    record's title carries 'STUB' (schema data) so no test or UI can mistake
 *    it for science.
 */
import { spawn } from 'node:child_process';
import { AnalysisServiceError } from './analysisService.js';
import type { OutputManifest } from './analysisRunner.js';

/** A provisioned input spec (structural twin of the runner's InputSpec). */
export interface EngineInputSpec {
  dataKind: string;
  path: string;
  /** Inline data handed directly to the SDK (small inline artifact/table). */
  inline?: unknown;
}

/**
 * The analysis-engine record (the declared registry DATA this module reads).
 * Mirrors schema/knowledge/analysis-engine.schema.yaml; the closed enums
 * (adapter, capability, support, interpreter) are declared there.
 */
export interface EngineRecord {
  kind: 'analysis-engine';
  id: string;
  title?: string;
  engine_family?: string;
  engine_version?: string;
  implementation: { adapter: string; entry: string; module?: string };
  version_constraints: { python: string; packages: Array<{ name: string; constraint: string }> };
  capabilities: { declared: Array<{ capability: string; support: string }> };
  availability: { available: boolean; note?: string };
  runtime_requirements: { interpreter: string; min_timeout_seconds?: number; max_input_bytes?: number };
  state?: string;
}

/**
 * Machine-readable engine provenance (GC-5 §c) — the ACTUAL engine +
 * interpreter + package versions that ran, written ONCE at completion in the
 * run record (analysis-run.schema.yaml engineProvenance) and echoed into the
 * stored manifest as `engine`.
 */
export interface EngineProvenance {
  engineRef: { kind: 'record'; type: 'analysis-engine'; id: string; label?: string; revisionRef?: { kind: 'record'; type: 'record-revision'; id: string } };
  engineRecordId: string;
  engineVersion: string;
  adapter: string;
  interpreterPath: string;
  interpreterVersion: string;
  packages: Array<{ name: string; required: string; actual: string }>;
  probedAt: string;
  capabilitiesReported?: Array<{ capability: string; support: string }>;
}

/** Parameters for one adapter execution. */
export interface AdapterExecutionParams {
  /** The RESOLVED interpreter (config → env → declared last-resort). */
  interpreterPath: string;
  entryScriptPath: string;
  inputs: Record<string, EngineInputSpec>;
  inputDir: string;
  parameters: Record<string, unknown>;
  sdkDir: string;
  /** The run's parameter count (the stub-echo metric). */
  parameterCount: number;
  /**
   * python-entry-script only: the runner's spawn channel (runPython bound to
   * the instance), so the adapter wraps the EXISTING behavior unchanged with
   * the RESOLVED interpreter.
   */
  spawnPython?: (
    interpreterPath: string,
    entryScriptPath: string,
    inputs: Record<string, EngineInputSpec>,
    inputDir: string,
    parameters?: Record<string, unknown>,
  ) => Promise<OutputManifest>;
}

export interface EngineAdapter {
  readonly id: string;
  execute(params: AdapterExecutionParams): Promise<OutputManifest>;
}

/** The fixed stub literal (bait #8: the manifest grep target). */
export const STUB_ECHO_LITERAL = 'stub adapter — performs no scientific computation';

const pythonEntryScriptAdapter: EngineAdapter = {
  id: 'python-entry-script',
  async execute(params) {
    if (!params.spawnPython) {
      throw new AnalysisServiceError('ENGINE_ADAPTER_UNREGISTERED', 'python-entry-script adapter requires the runner spawn channel', 409);
    }
    return params.spawnPython(params.interpreterPath, params.entryScriptPath, params.inputs, params.inputDir, params.parameters);
  },
};

const stubEchoAdapter: EngineAdapter = {
  id: 'stub-echo',
  async execute(params) {
    return {
      version: 1,
      artifacts: [
        {
          name: 'stub_echo',
          dataKind: 'metric',
          value: { parameters: params.parameterCount, note: STUB_ECHO_LITERAL },
        },
      ],
      views: [],
      metrics: [],
      logs: [
        {
          message: `stub-echo adapter: declared pluggability probe — dispatched purely from the registry record's implementation.adapter. ${STUB_ECHO_LITERAL}; no peaks, no signals, no calibration, no analyte named.`,
          level: 'warning',
          code: 'STUB_ADAPTER',
        },
      ],
    };
  },
};

/**
 * The shipped-implementation table, keyed by the record's implementation.adapter
 * id. The keys ARE the closed schema enum — adding an adapter means adding a
 * schema enum value + a table entry together (data + code, reviewed as a pair).
 */
export const SHIPPED_ENGINE_ADAPTERS: Record<string, EngineAdapter> = {
  'python-entry-script': pythonEntryScriptAdapter,
  'stub-echo': stubEchoAdapter,
};

/**
 * Resolve the adapter for a resolvable engine record's declared adapter id.
 * Unknown/absent adapter id → ENGINE_ADAPTER_UNREGISTERED (the closed enum +
 * table agree; no TS engine-name literal dispatch — the branch reads data).
 */
export function resolveEngineAdapter(engine: Pick<EngineRecord, 'implementation'>): EngineAdapter {
  const adapter = SHIPPED_ENGINE_ADAPTERS[engine.implementation.adapter];
  if (!adapter) {
    throw new AnalysisServiceError(
      'ENGINE_ADAPTER_UNREGISTERED',
      `engine declares adapter '${engine.implementation.adapter}', which is not in the shipped adapter table — add the adapter implementation + schema enum value together; no fallback`,
      409,
    );
  }
  return adapter;
}

/** The probe's parsed payload (ACTUAL interpreter + package versions). */
export interface EngineProbe {
  python: string;
  packages: Record<string, string>;
}

/**
 * Probe the RESOLVED interpreter: one cheap `python -c` call through the SAME
 * interpreter that will run (OQ3). The declared package NAMES come from the
 * engine record — no package literal in TS (bait #3). A missing/absent package
 * reads 'absent' (a version mismatch at the check, not a probe crash); a dead
 * interpreter is an AnalysisServiceError the caller maps to ENGINE_UNAVAILABLE.
 */
export function probeEngine(interpreterPath: string, declaredPackages: string[]): Promise<EngineProbe> {
  const namesLiteral = JSON.stringify(declaredPackages);
  const code = [
    'import json, platform, importlib.metadata as m',
    'out = {}',
    `for n in ${namesLiteral}:`,
    '    try:',
    '        out[n] = m.version(n)',
    '    except Exception:',
    '        out[n] = "absent"',
    'print(json.dumps({"python": platform.python_version(), "packages": out}))',
  ].join('\n');
  return new Promise<EngineProbe>((resolvePromise, rejectPromise) => {
    const child = spawn(interpreterPath, ['-c', code], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', (err) => {
      rejectPromise(new AnalysisServiceError(
        'ENGINE_UNAVAILABLE',
        `engine interpreter ${interpreterPath} could not be started: ${err.message}`,
        409,
      ));
    });
    child.on('close', (codeNum) => {
      if (codeNum !== 0) {
        rejectPromise(new AnalysisServiceError(
          'ENGINE_UNAVAILABLE',
          `engine interpreter ${interpreterPath} probe failed (exit ${codeNum}): ${stderr.trim().slice(0, 300)}`,
          409,
        ));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as EngineProbe;
        if (typeof parsed.python !== 'string' || typeof parsed.packages !== 'object' || parsed.packages === null) {
          rejectPromise(new AnalysisServiceError(
            'ENGINE_UNAVAILABLE',
            `engine interpreter ${interpreterPath} probe returned no usable version payload: ${stdout.slice(0, 200)}`,
            409,
          ));
          return;
        }
        resolvePromise(parsed);
      } catch {
        rejectPromise(new AnalysisServiceError(
          'ENGINE_UNAVAILABLE',
          `engine interpreter ${interpreterPath} probe returned unparsable output: ${stdout.slice(0, 200)}`,
          409,
        ));
      }
    });
  });
}

/**
 * V1 constraint grammar (the declared checks — NOT a general semver engine):
 * comma-separated clauses, each `(== | >= | <= | > | <)` + a dotted numeric
 * version (e.g. '==2.5.4', '>=3.14,<3.15'). Anything else is unparseable →
 * ENGINE_VERSION_CHECK_UNSUPPORTED at probe time — a declared failure, never a
 * guess.
 */
const CONSTRAINT_CLAUSE = /^\s*(==|>=|<=|>|<)\s*(\d+(?:\.\d+)*)\s*$/;

function compareDotted(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number.parseInt(x, 10));
  const pb = b.split('.').map((x) => Number.parseInt(x, 10));
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export type ConstraintOutcome = 'ok' | 'mismatch' | 'unsupported';

/** Check an ACTUAL version against a declared constraint string. */
export function checkVersionConstraint(actual: string, constraint: string): ConstraintOutcome {
  const clauses = constraint.split(',').map((c) => c.trim());
  for (const clause of clauses) {
    const m = CONSTRAINT_CLAUSE.exec(clause);
    if (!m) return 'unsupported';
    const cmp = compareDotted(actual, m[2]!);
    const ok =
      m[1] === '==' ? cmp === 0
      : m[1] === '>=' ? cmp >= 0
      : m[1] === '<=' ? cmp <= 0
      : m[1] === '>' ? cmp > 0
      : cmp < 0;
    if (!ok) return 'mismatch';
  }
  return 'ok';
}
