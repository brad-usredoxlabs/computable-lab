/**
 * analysisRunner — execute an analysis-revision against frozen run inputs.
 *
 * Flow:
 * 1. Load the run + its revision + each input's data-reference record.
 * 2. Stream each input's bytes from its storage device into a temp input dir
 *    (never into git).
 * 3. Run the entry script headlessly via `python3 -m computable_lab_analysis`
 *    with an inputs JSON mapping name -> {dataKind, path}.
 * 4. Parse the output manifest; write small artifacts as analysis-output-artifact
 *    records (git) and large ones to the analysis output storage device (bytes
 *    never in git).
 * 5. Transition the run to succeeded/failed.
 */
import { RecordRevisionService, withRecordLock, contentHash } from '../revisions/RecordRevisionService.js';
import { executeSequenceMethod, sequenceConfig } from '../sequences/sequenceRuntime.js';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnalysisService, AnalysisServiceError, resolveEngineRef } from './analysisService.js';
import {
  checkVersionConstraint,
  probeEngine,
  resolveEngineAdapter,
  type EngineProvenance,
  type EngineRecord,
} from './engineAdapters.js';
import type { AppContext } from '../server.js';

const DEFAULT_PYTHON = '/usr/bin/python3';

/**
 * GC-5 — the interpreter resolution order (GC-1 F18, the "no /usr/bin
 * assumption" spine): 1) config-declared `analysis.python` (the provisioned
 * venv path lives in gitignored config DATA, not here — bait #3), 2) the
 * CLA_ANALYSIS_PYTHON env override (mirrors the F2 SDK-dir precedent),
 * 3) the constructor-injected interpreter (DEFAULT_PYTHON last-resort for
 * revisions with NO provisioned-venv engine requirement). The constructor
 * channel `python = DEFAULT_PYTHON` is intact (F20); the env+config layers
 * merely precede it.
 */
function resolveInterpreter(ctx: AppContext, injected: string): string {
  const fromConfig = ctx.appConfig?.analysis?.python;
  if (typeof fromConfig === 'string' && fromConfig.trim()) return fromConfig.trim();
  const fromEnv = process.env.CLA_ANALYSIS_PYTHON;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  return injected;
}

/** Resolve the computable_lab_analysis SDK package dir for PYTHONPATH.
 *  Preference: CLA_ANALYSIS_SDK_DIR env → module-relative (deterministic,
 *  works regardless of workspaceRoot/embedded-git worktree) → repo-root probes. */
export function analysisSdkDir(cwd: string = process.cwd()): string {
  if (process.env.CLA_ANALYSIS_SDK_DIR) return process.env.CLA_ANALYSIS_SDK_DIR;
  // This module lives at <root>/server/src/analysis/analysisRunner.ts → the SDK is
  // <root>/server/python-executor-service/src (deterministic, workspace-agnostic).
  const moduleRelative = resolvePath(
    dirname(fileURLToPath(import.meta.url)),
    '..', '..',
    'python-executor-service', 'src',
  );
  if (existsSync(resolvePath(moduleRelative, 'computable_lab_analysis', '__init__.py'))) {
    return moduleRelative;
  }
  // Fallbacks for other layouts (cwd may be repo root or server dir).
  for (const candidate of [
    resolvePath(cwd, 'server', 'python-executor-service', 'src'),
    resolvePath(cwd, 'python-executor-service', 'src'),
  ]) {
    const init = resolvePath(candidate, 'computable_lab_analysis', '__init__.py');
    if (existsSync(init)) return candidate;
  }
  return moduleRelative;
}

interface InputSpec {
  dataKind: string;
  path: string;
  /** Inline data handed directly to the SDK (small inline artifact/table). */
  inline?: unknown;
  /**
   * GC-6 (D5) — provenance pass-through from the source data-reference: the
   * DREF's OWN pinned values (sourcePath = the DREF payload.path, contentHash
   * when the DREF declares one). The reader rides these for channel identity +
   * hash provenance — no re-hash (GC-5's execute-time re-hash leg is
   * untouched). Conditional spread only — exactOptionalPropertyTypes (F20).
   *
   * FAME-7 fix run 2 (R1 / D11 leg b) — the bound REF identity + the LINKING
   * ARTIFACT's own provenance echo, additive on the same meta (same comment
   * discipline as the GC-6 block above):
   *  - recordRefId — the bound input ref's own record id (the DREF id on the
   *    data-reference branch; the artifact id on the artifact branch);
   *  - artifactRecordId — the linking artifact's record id (data-reference
   *    branch: the artifact whose one-way dataReferenceRef link points at the
   *    DREF — the same reverse lookup the declared-inputs name gate uses;
   *    artifact branch: the artifact itself). ABSENT when no artifact links
   *    the DREF (honestly — never invented);
   *  - producerRunId — the producer run id the linking artifact's OWN record
   *    declares (its runRef, runner-stamped at its production). ABSENT when
   *    the artifact declares no runRef.
   * Additive only: every arm provisions and hands to the SDK exactly what it
   * did before (same path, same inline value, same dataKind); the meta keys
   * are additive pass-through (exactOptionalPropertyTypes conditional
   * spreads — absent when unresolvable, never invented). The existing inline
   * CONSUMPTION path is unchanged (what a script reads via ctx.input().inline
   * / the provisioned file is byte-identical); the inline arm simply rides
   * the artifact's own provenance echo in meta where it surfaced NOTHING
   * before. No hardcoded policy values (record-type names only, R8).
   */
  meta?: {
    sourcePath: string;
    contentHash?: string;
    recordRefId?: string;
    artifactRecordId?: string;
    producerRunId?: string;
  };
}

export interface RunInputs {
  [name: string]: { kind: 'record'; id: string; type: string; dataKind?: string };
}

export interface ManifestArtifact {
  name: string;
  sourceRelations?: Array<{ kind: 'record'; id: string; type: string }>;
  dataKind: string;
  value: unknown;
  units?: Record<string, unknown>;
  schema?: Record<string, unknown>;
  /** File-emission: when present, stream blob.path to storage + record a dref. */
  blob?: { path: string; sha256?: string; sizeBytes?: number; format?: string };
}

export interface ManifestView {
  name: string;
  renderer: string;
  artifact: string;
  bindings?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface OutputManifest {
  version: number;
  artifacts: ManifestArtifact[];
  views: ManifestView[];
  metrics: Array<{ name: string; value: unknown; unit?: string; label?: string }>;
  logs: Array<{ message: string; level: string; code?: string }>;
  /**
   * GC-5: a compact copy of the run's engineProvenance (the ACTUAL engine +
   * interpreter + package versions), echoed into the stored manifest so the
   * UI/provenance story reads from the manifest too. Absent on legacy runs.
   */
  engine?: EngineProvenance;
}

export class AnalysisRunner {
  constructor(
    private readonly ctx: AppContext,
    private readonly python = DEFAULT_PYTHON,
    private readonly sdkDirOverride?: string,
  ) {}

  private sdkDir(): string {
    return this.sdkDirOverride ?? analysisSdkDir(this.ctx.workspaceRoot);
  }

  /** Provision a run's inputs into a temp dir (streaming from storage; never git).
 *  Inputs may reference a `data-reference` directly OR an `analysis-output-artifact`
 *  (chaining: a downstream run consumes a prior run's output). */
  private async provisionInputs(
    runInputs: RunInputs | undefined,
    inputDir: string,
  ): Promise<Record<string, InputSpec>> {
    const specs: Record<string, InputSpec> = {};
    if (!runInputs) return specs;

    for (const [name, ref] of Object.entries(runInputs)) {
      if (ref.kind !== 'record') {
        throw new AnalysisServiceError('BAD_INPUT', `input ${name} must be a record ref`, 400);
      }
      let deviceId: string;
      let path: string;
      let dataKind: string | undefined = ref.dataKind;
      // GC-5 (F3 / GC-4 fold): the data-reference's declared contentHash (the
      // sha256 of the bytes AT ACQUISITION). When present, the execute-time
      // provision re-hashes the streamed bytes and a drift is a NAMED declared
      // failure (DATA_HASH_MISMATCH 409) — closes the submit→execute window.
      let declaredContentHash: string | undefined;
      // FAME-7 fix run 2 (R1 / D11 leg b): the linking artifact's own provenance
      // echo, resolved PER INPUT (never a process cache, one list per input —
      // the same reverse lookup the declared-inputs name gate uses; record-type
      // name, not a domain literal, R8). Set in the data-reference branch
      // (the artifact whose one-way dataReferenceRef link points at the DREF);
      // the artifact branch surfaces the artifact itself.
      let linkingArtifactRecordId: string | undefined;
      let linkingProducerRunId: string | undefined;
      // GC-6 (D5): per-input provenance for the data-reference branch only —
      // the DREF's pinned values handed to the SDK (the reader's meta.source /
      // channel identity + hash provenance). Absent for the artifact branch.
      // FAME-7 fix run 2 (R1 / D11 leg b): additive bound-ref + linking-
      // artifact provenance echo (recordRefId / artifactRecordId /
      // producerRunId — the InputSpec.meta shape above).
      let inputMeta: InputSpec['meta'] | undefined;

      if (ref.type === 'analysis-output-artifact') {
        // Resolve the artifact → its data-reference (or inline) for provisioning.
        const artEnv = await this.ctx.store.get(ref.id);
        if (!artEnv) {
          throw new AnalysisServiceError('BAD_INPUT', `input ${name} artifact not found: ${ref.id}`, 404);
        }
        const art = artEnv.payload as { dataReferenceRef?: { id?: string }; inlineValue?: unknown; dataKind?: string; runRef?: { id?: string } };
        dataKind = dataKind ?? art.dataKind;
        // FAME-7 fix run 2 (R1 / D11 leg b) — the artifact-typed branch
        // surfaces the ARTIFACT'S OWN provenance echo instead of nothing: the
        // pre-fix artifact branch passed NO meta at all (the D11 defect's
        // artifact arm). artifactRecordId = the bound artifact itself;
        // producerRunId = the producer run the artifact's OWN record declares
        // (its runRef, runner-stamped at its production) — absent when the
        // record declares no runRef (honestly, never invented).
        linkingArtifactRecordId = ref.id;
        linkingProducerRunId = typeof art.runRef?.id === 'string' ? art.runRef.id : undefined;
        if (art.dataReferenceRef?.id) {
          const refId = art.dataReferenceRef.id;
          const drefEnv = await this.ctx.store.get(refId);
          if (!drefEnv) {
            throw new AnalysisServiceError('BAD_INPUT', `input ${name} artifact dref not found: ${refId}`, 404);
          }
          const dp = drefEnv.payload as { storageDeviceId?: string; path?: string; dataKind?: string; contentHash?: string };
          if (!dp.storageDeviceId || !dp.path) {
            throw new AnalysisServiceError('BAD_INPUT', `input ${name} artifact dref has no device/path`, 400);
          }
          deviceId = dp.storageDeviceId;
          path = dp.path;
          dataKind = dataKind ?? dp.dataKind;
          declaredContentHash = typeof dp.contentHash === 'string' ? dp.contentHash : undefined;
          // FAME-7 fix run 2 (R1 / D11 leg b): the artifact-typed DREF arm now
          // surfaces the artifact's OWN provenance echo (it previously passed
          // NO meta at all). recordRefId/artifactRecordId = the bound artifact
          // itself (the run bound the artifact, not the DREF); producerRunId =
          // the artifact's own runRef (absent when the record declares none).
          inputMeta = {
            sourcePath: dp.path,
            ...(declaredContentHash ? { contentHash: declaredContentHash } : {}),
            recordRefId: ref.id,
            artifactRecordId: ref.id,
            ...(linkingProducerRunId ? { producerRunId: linkingProducerRunId } : {}),
          };
        } else if (art.inlineValue !== undefined) {
          // inline artifact (small table/metric) → hand to the SDK as inline data
          const inlinePath = `${inputDir}/${name}.inline`;
          // FAME-7 fix run 2 (R1 / D11 leg b): the inline arm surfaces the
          // artifact's own provenance echo in meta (it previously surfaced
          // NOTHING). sourcePath = the inline provision path (honest — that is
          // where the SDK reads it); recordRefId/artifactRecordId = the bound
          // artifact; producerRunId = the artifact's own runRef.
          const inlineMeta: InputSpec['meta'] = {
            sourcePath: inlinePath,
            recordRefId: ref.id,
            artifactRecordId: ref.id,
            ...(linkingProducerRunId ? { producerRunId: linkingProducerRunId } : {}),
          };
          specs[name] = { dataKind: dataKind ?? art.dataKind ?? 'table', path: inlinePath, inline: art.inlineValue, meta: inlineMeta };
          continue;
        } else {
          throw new AnalysisServiceError('BAD_INPUT', `input ${name} artifact has no dataReferenceRef or inlineValue`, 400);
        }
      } else if (ref.type === 'data-reference') {
        const env = await this.ctx.store.get(ref.id);
        if (!env) {
          throw new AnalysisServiceError('BAD_INPUT', `input ${name} data-reference not found: ${ref.id}`, 404);
        }
        const payload = env.payload as { storageDeviceId?: string; path?: string; dataKind?: string; contentHash?: string };
        if (!payload.storageDeviceId || !payload.path) {
          throw new AnalysisServiceError('BAD_INPUT', `input ${name} data-reference has no device/path`, 400);
        }
        // GC-12 fix-cycle-3 (DIRFIX-2, architect ruling A-named-error): a
        // DIRECTORY-kind data-reference (the ACQP signal-collection manifest
        // DREF) is NOT a runner-consumable input. The runner streams EVERY
        // data-reference via provider.read(path) into <inputDir>/<name>.bin,
        // i.e. it can only handle files; reading a directory would throw EISDIR
        // (relabeled INTERNAL_ERROR). Refuse EARLY — after loading the DREF
        // payload and BEFORE provider.read — with a NAMED 400-class token.
        // The guard keys off the RECORD'S DECLARED dataKind (not a filename),
        // so it survives "remove every hardcoded value". No directory
        // expansion (deferred by ruling — no engine consumes collections
        // today).
        if (payload.dataKind === 'signal-collection') {
          throw new AnalysisServiceError(
            'INPUT_IS_DIRECTORY',
            `input ${name} (data-reference ${ref.id}) declares dataKind 'signal-collection' — a directory, not a file. The analysis runner provisions file-kind data-references only; it cannot stream a directory into a run input. Point the run's input at one of the package's member file DREFs (acquisition-package.files), not the signal-collection manifest.`,
            400,
          );
        }
        deviceId = payload.storageDeviceId;
        path = payload.path;
        dataKind = dataKind ?? payload.dataKind;
        declaredContentHash = typeof payload.contentHash === 'string' ? payload.contentHash : undefined;
        // FAME-7 fix run 2 (R1 / D11 leg b): the DREF CARRIES no producer
        // identity of its own — the linking artifact does (the one that
        // declares `dataReferenceRef: {id: <this DREF>}` — artifactPromotion's
        // additive link). Resolve it via the SAME reverse lookup the
        // declared-inputs name gate uses (one list per input, no cache): its
        // record id + its OWN runRef (the producer run, runner-stamped at its
        // production) become the bound input's provenance echo. Absent when no
        // artifact links the DREF — honestly, never invented (a DREF the name
        // gate cannot prove is a declared rejection there; here the runner
        // simply passes nothing it cannot prove).
        {
          try {
            const artifacts = await this.ctx.store.list({ kind: 'analysis-output-artifact', limit: 5000 });
            const linking = artifacts.find((e) => {
              const p = e.payload as { dataReferenceRef?: { id?: unknown } } | null | undefined;
              return p?.dataReferenceRef?.id === ref.id;
            });
            if (linking) {
              linkingArtifactRecordId = linking.recordId;
              const lr = (linking.payload as { runRef?: { id?: unknown } } | null)?.runRef;
              linkingProducerRunId = typeof lr?.id === 'string' ? lr.id : undefined;
            }
          } catch {
            // A list failure means the link cannot be proven — pass nothing
            // (the named rejection lives in the declared-inputs gate, not the
            // execute path; the runner never invents a producer id).
          }
        }
        // GC-6 (D5): pass the DREF's pinned provenance through to the SDK —
        // ~4 additive lines (OQ2 ruling: KEEP the touch). Conditional spread:
        // contentHash only when the DREF declares one (exactOptionalPropertyTypes).
        // FAME-7 fix2 (R1): + the bound ref id + the linking artifact's provenance
        // echo (recordRefId = the DREF id; artifactRecordId / producerRunId when
        // a linking artifact is resolvable — absent otherwise, never invented).
        inputMeta = {
          sourcePath: path,
          ...(declaredContentHash ? { contentHash: declaredContentHash } : {}),
          recordRefId: ref.id,
          ...(linkingArtifactRecordId ? { artifactRecordId: linkingArtifactRecordId } : {}),
          ...(linkingProducerRunId ? { producerRunId: linkingProducerRunId } : {}),
        };
      } else {
        throw new AnalysisServiceError('BAD_INPUT', `input ${name} must be a data-reference or analysis-output-artifact`, 400);
      }

      const provider = this.ctx.storageService.getProvider(deviceId);
      const stream = await provider.read(path);
      // write streamed bytes to a local temp file (provisioned, not persisted to git)
      const outPath = join(inputDir, `${name}.bin`);
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(chunk);
      await writeFile(outPath, Buffer.concat(chunks));
      // GC-5 execute-time re-hash (F3 / the GC-4 OQ1 fold): the bytes the run
      // will actually consume are hashed while they stream. If the source
      // data-reference declared a contentHash (sha256 at acquisition) and the
      // live bytes no longer match, that is a NAMED declared failure — the
      // submit→execute drift window GC-4 explicitly assigned here.
      if (declaredContentHash) {
        const actual = createHash('sha256').update(Buffer.concat(chunks)).digest('hex');
        if (actual !== declaredContentHash) {
          throw new AnalysisServiceError(
            'DATA_HASH_MISMATCH',
            `input ${name} bytes drifted between submit and execute: data-reference declares contentHash ${declaredContentHash.slice(0, 12)}… but the provisioned bytes hash ${actual.slice(0, 12)}… — create a new run against fresh data`,
            409,
          );
        }
      }
      specs[name] = {
        dataKind: dataKind ?? 'table',
        path: outPath,
        ...(inputMeta ? { meta: inputMeta } : {}),
      };
    }
    return specs;
  }

  /** Spawn the python SDK run and capture stdout manifest JSON.
   *  `interpreterPath` is the RESOLVED interpreter (GC-5 resolution order);
   *  it defaults to the constructor-injected `this.python` so the legacy
   *  call site (no pinned engine) keeps byte-identical behavior. */
  private async runPython(
    entryScriptPath: string,
    inputs: Record<string, InputSpec>,
    inputDir: string,
    parameters?: Record<string, unknown>,
    interpreterPath: string = this.python,
  ): Promise<OutputManifest> {
    const sdkDir = this.sdkDir();
    const inputsJson = JSON.stringify(inputs);
    const parametersJson = JSON.stringify(parameters ?? {});
    return new Promise<OutputManifest>((resolvePromise, rejectPromise) => {
      const child = spawn(
        interpreterPath,
        ['-m', 'computable_lab_analysis', 'run', entryScriptPath, '--inputs', inputsJson, '--parameters', parametersJson, '--input-dir', inputDir],
        {
          env: {
            ...process.env,
            PYTHONPATH: sdkDir,
            PYTHONUNBUFFERED: '1',
          },
        },
      );
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
      child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
      child.on('error', (err) => rejectPromise(err));
      child.on('close', (code) => {
        if (code !== 0) {
          rejectPromise(new AnalysisServiceError('RUN_FAILED', `analysis script exited ${code}: ${stderr.trim()}`, 500));
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          if (!parsed?.ok) {
            rejectPromise(new AnalysisServiceError('RUN_FAILED', `script returned non-ok: ${stdout.slice(0, 300)}`, 500));
            return;
          }
          resolvePromise(parsed.manifest as OutputManifest);
        } catch (err) {
          rejectPromise(new AnalysisServiceError('RUN_FAILED', `failed to parse manifest: ${(err as Error).message}`, 500));
        }
      });
    });
  }

  /**
   * Stream an emitted file (`page.blob.path`) OR large JSON bytes to the default
   * storage device, and mint a data-reference record. Returns the dref ref.
   * Bytes NEVER enter git.
   */
  private async persistToStorage(
    runId: string,
    page: ManifestArtifact,
  ): Promise<{ dataReferenceRef: { kind: 'record'; id: string; type: 'data-reference' }; storagePath: string }> {
    const deviceId = this.ctx.storageService.defaultDeviceId();
    const provider = this.ctx.storageService.getProvider(deviceId);
    const ext = page.blob?.format ? `.${page.blob.format}` : '';
    const storagePath = `analysis-artifacts/${runId}/${page.name}${ext}`;

    let bytes: Buffer;
    let sha256: string;
    let sizeBytes: number;
    if (page.blob?.path) {
      const { readFile } = await import('node:fs/promises');
      bytes = await readFile(page.blob.path);
    } else {
      bytes = Buffer.from(typeof page.value === 'string' ? page.value : JSON.stringify(page.value));
    }
    const { createHash } = await import('node:crypto');
    sha256 = createHash('sha256').update(bytes).digest('hex');
    sizeBytes = bytes.byteLength;

    // write to the device (root-relative path under a top-level bucket dir)
    const { Readable } = await import('node:stream');
    await provider.write(storagePath, Readable.from(bytes));

    // mint a data-reference record with the same payload shape as acquisition
    const drefId = await this.nextDataReferenceId();
    const payload: Record<string, unknown> = {
      kind: 'data-reference',
      id: drefId,
      title: page.name,
      storageDeviceId: deviceId,
      path: storagePath,
      contentHash: sha256,
      sizeBytes,
      dataKind: page.dataKind,
      ...(page.blob?.format ? { format: page.blob.format } : {}),
      acquiredAt: new Date().toISOString(),
    };
    const result = await this.ctx.store.create({
      envelope: {
        recordId: drefId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/data-reference.schema.yaml',
        payload,
      },
      message: `Persist analysis artifact ${page.name} → ${drefId}`,
    });
    if (!result.success) throw new AnalysisServiceError('ARTIFACT_PERSIST_FAILED', result.error ?? 'failed', 500);

    return { dataReferenceRef: { kind: 'record', id: drefId, type: 'data-reference' }, storagePath };
  }

  private async nextDataReferenceId(): Promise<string> {
    const existing = await this.ctx.store.list({ kind: 'data-reference', limit: 5000 });
    let max = 0;
    for (const e of existing) {
      const m = /^DREF-(\d+)$/.exec(e.recordId);
      if (m) {
        const n = Number.parseInt(m[1] ?? '0', 10);
        if (n > max) max = n;
      }
    }
    return `DREF-${String(max + 1).padStart(6, '0')}`;
  }

  /** Write a manifest artifact as an analysis-output-artifact record (idempotent). */
  private async persistArtifactRecord(
    runId: string,
    page: ManifestArtifact,
    viewSpecs: Array<{ name: string; renderer: string; artifact: string }>,
  ): Promise<{ artifactRecordId: string; dataReferenceId?: string }> {
    // Dedupe: if this run already produced this artifact (re-run), reuse it.
    const existingForRun = await this.ctx.store.list({ kind: 'analysis-output-artifact', limit: 5000 });
    const prior = existingForRun.find((e) => {
      const p = e.payload as { runRef?: { id?: string }; name?: string };
      return p.runRef?.id === runId && p.name === page.name;
    });
    const artifactId = prior
      ? prior.recordId
      : await this.nextArtifactId();

    // A `blob` (emitted file) ALWAYS goes to storage. Otherwise small JSON
    // values stay inline; large ones go to storage.
    const isLarge =
      typeof page.value === 'string'
        ? page.value.length >= 50_000
        : page.value !== null && page.value !== undefined && typeof page.value === 'object'
          ? JSON.stringify(page.value).length >= 50_000
          : false;

    let dataReferenceRef: { kind: 'record'; id: string; type: 'data-reference' } | undefined;
    if (page.blob || isLarge) {
      const persisted = await this.persistToStorage(runId, page);
      dataReferenceRef = persisted.dataReferenceRef;
    }

    const artifactPayload: Record<string, unknown> = {
      kind: 'analysis-output-artifact',
      id: artifactId,
      title: page.name,
      runRef: { kind: 'record', id: runId, type: 'analysis-run' },
      name: page.name,
      ...(page.sourceRelations ? { sourceRelations: page.sourceRelations } : {}),
      dataKind: page.dataKind,
      ...(page.units ? { units: page.units } : {}),
      ...(page.schema ? { schema: page.schema } : {}),
      // blob/large artifacts → data-reference pointer; small → inline
      ...(dataReferenceRef ? { dataReferenceRef } : isLarge ? {} : { inlineValue: page.value }),
      // log the emitted format for display when it's a file
      ...(page.blob?.format ? { format: page.blob.format } : {}),
    };
    if (!prior) {
      const result = await this.ctx.store.create({
        envelope: {
          recordId: artifactId,
          schemaId: 'https://computable-lab.com/schema/computable-lab/analysis-output-artifact.schema.yaml',
          payload: artifactPayload,
        },
        message: `Create analysis output artifact ${artifactId}`,
      });
      if (!result.success) throw new AnalysisServiceError('ARTIFACT_FAILED', result.error ?? 'failed', 400);
    }

    // persist view-spec records for each view that targets this artifact (dedupe by run+name)
    for (const v of viewSpecs.filter((v) => v.artifact === page.name)) {
      const existingViews = await this.ctx.store.list({ kind: 'view-spec', limit: 5000 });
      const priorView = existingViews.find((e) => {
        const p = e.payload as { artifactRef?: { id?: string }; title?: string };
        return p.artifactRef?.id === artifactId && p.title === v.name;
      });
      if (priorView) continue; // already have this view
      let vmax = 0;
      for (const e of existingViews) {
        const m = /^VSPEC-(\d+)$/.exec(e.recordId);
        if (m) {
          const n = Number.parseInt(m[1] ?? '0', 10);
          if (n > vmax) vmax = n;
        }
      }
      const viewId = `VSPEC-${String(vmax + 1).padStart(6, '0')}`;
      await this.ctx.store.create({
        envelope: {
          recordId: viewId,
          schemaId: 'https://computable-lab.com/schema/computable-lab/view-spec.schema.yaml',
          payload: {
            kind: 'view-spec',
            id: viewId,
            title: v.name,
            artifactRef: { kind: 'record', id: artifactId, type: 'analysis-output-artifact' },
            renderer: v.renderer,
          },
        },
        message: `Create view spec ${viewId}`,
      });
    }

    return {
      artifactRecordId: artifactId,
      ...(dataReferenceRef?.id ? { dataReferenceId: dataReferenceRef.id } : {}),
    };
  }

  private async nextArtifactId(): Promise<string> {
    const existing = await this.ctx.store.list({ kind: 'analysis-output-artifact', limit: 5000 });
    let max = 0;
    for (const e of existing) {
      const m = /^AOUT-(\d+)$/.exec(e.recordId);
      if (m) {
        const n = Number.parseInt(m[1] ?? '0', 10);
        if (n > max) max = n;
      }
    }
    return `AOUT-${String(max + 1).padStart(6, '0')}`;
  }

  /**
   * GC-5 — the execute-time engine gate (§c/§e). Runs BEFORE the status flips
   * to 'running': a failing gate leaves the run visibly failed with its NAMED
   * token, never a silent interpreter/engine/capability swap.
   *
   *  1. resolve the pinned engine (the SHARED resolver — one resolver with the
   *     createRevision gate: absent / wrong-kind / unresolvable →
   *     ENGINE_REF_UNRESOLVED; archived → ENGINE_REF_UNRESOLVED 409);
   *  2. availability (declared): available:false → ENGINE_UNAVAILABLE;
   *  3. resolve the interpreter (GC-1 F18 order); the provisioned-venv trap:
   *     a provisioned-venv engine with declared packages that lands on the
   *     last-resort interpreter → ENGINE_UNAVAILABLE (never a silent /usr/bin
   *     run);
   *  4. PROBE the resolved interpreter (one cheap -c call; package NAMES come
   *     from the record — bait #3: no package literal in TS); a dead
   *     interpreter → ENGINE_UNAVAILABLE (probeEngine's declared error);
   *  5. actual-vs-declared constraints (V1 grammar): unparseable →
   *     ENGINE_VERSION_CHECK_UNSUPPORTED; mismatch → ENGINE_VERSION_MISMATCH
   *     (observed-vs-required in the message, inspectEndpoint precedent);
   *  6. capability check: every revision.requiredCapabilities name must be
   *     declared 'supported' or 'approximate' → else
   *     ENGINE_CAPABILITY_UNSUPPORTED (naming the capability).
   *
   * Returns the resolved engine + the RESOLVED interpreter + the machine-
   * readable engineProvenance (the ACTUAL versions) the completion write
   * persists. approximate capabilities are surfaced (warning manifest logs),
   * never hidden.
   */
  private async engineGate(
    engineRef: { id: string; kind?: string; type?: string; revisionRef?: { id?: string } },
    requiredCapabilities: string[] | undefined,
  ): Promise<{ engine: EngineRecord; interpreterPath: string; provenance: EngineProvenance; approximate: Array<{ capability: string; support: string }> }> {
    // (1) resolve — the shared resolver (ENGINE_REF_UNRESOLVED on miss).
    const env = await resolveEngineRef(this.ctx.store, engineRef);
    const engine = env.payload as unknown as EngineRecord;

    // (2) declared availability.
    if (engine.availability?.available === false) {
      throw new AnalysisServiceError(
        'ENGINE_UNAVAILABLE',
        `engine ${engine.id} is declared unavailable (${engine.availability.note ?? 'no note'}) — no fallback engine is substituted`,
        409,
      );
    }

    // (3) interpreter resolution (config analysis.python → env
    //     CLA_ANALYSIS_PYTHON → the constructor-injected last-resort).
    const interpreterPath = resolveInterpreter(this.ctx, this.python);
    const declaredPackages = engine.version_constraints?.packages ?? [];
    // l1t2245 defect 3: `lastResort` is derived from the RESOLVED
    // interpreter, not from the raw config/env values. resolveInterpreter
    // TRIMS both layers, so a whitespace-only `analysis.python` /
    // CLA_ANALYSIS_PYTHON value counts as ABSENT there (resolution falls
    // through to the constructor-injected last-resort) — and the trap must
    // fire exactly when that fall-through happened. Raw truthiness of the
    // untrimmed values let a whitespace-only declaration bypass the trap
    // (a silent last-resort run of a provisioned-venv engine).
    const lastResort = interpreterPath === this.python;
    if (engine.runtime_requirements?.interpreter === 'provisioned-venv' && lastResort && declaredPackages.length > 0) {
      throw new AnalysisServiceError(
        'ENGINE_UNAVAILABLE',
        `engine ${engine.id} requires a provisioned-venv interpreter with declared packages, but resolution landed on the last-resort interpreter (${interpreterPath}) — declare analysis.python in config or set CLA_ANALYSIS_PYTHON; a silent system run is refused`,
        409,
      );
    }

    // (4) probe the RESOLVED interpreter (package names from the record).
    const probe = await probeEngine(interpreterPath, declaredPackages.map((p) => p.name));

    // (5) actual-vs-declared constraints.
    const pythonConstraint = engine.version_constraints?.python;
    if (pythonConstraint) {
      const outcome = checkVersionConstraint(probe.python, pythonConstraint);
      if (outcome === 'unsupported') {
        throw new AnalysisServiceError(
          'ENGINE_VERSION_CHECK_UNSUPPORTED',
          `engine ${engine.id} declares an unparseable python constraint '${pythonConstraint}' (V1 grammar: ==/>=/<=/>/< + dotted versions) — never a guess; fix the record`,
          409,
        );
      }
      if (outcome === 'mismatch') {
        throw new AnalysisServiceError(
          'ENGINE_VERSION_MISMATCH',
          `engine ${engine.id} requires python ${pythonConstraint} but the resolved interpreter ${interpreterPath} reports ${probe.python}`,
          409,
        );
      }
    }
    const packages = declaredPackages.map((p) => {
      const actual = probe.packages[p.name] ?? 'absent';
      if (actual === 'absent') {
        throw new AnalysisServiceError(
          'ENGINE_VERSION_MISMATCH',
          `engine ${engine.id} declares package ${p.name} ${p.constraint} but it is ABSENT from the resolved interpreter ${interpreterPath}`,
          409,
        );
      }
      const outcome = checkVersionConstraint(actual, p.constraint);
      if (outcome === 'unsupported') {
        throw new AnalysisServiceError(
          'ENGINE_VERSION_CHECK_UNSUPPORTED',
          `engine ${engine.id} declares an unparseable constraint '${p.constraint}' on package ${p.name} — never a guess; fix the record`,
          409,
        );
      }
      if (outcome === 'mismatch') {
        throw new AnalysisServiceError(
          'ENGINE_VERSION_MISMATCH',
          `engine ${engine.id} requires ${p.name} ${p.constraint} but the resolved interpreter ${interpreterPath} reports ${actual}`,
          409,
        );
      }
      return { name: p.name, required: p.constraint, actual };
    });

    // (6) capability check (requiredCapabilities ⊆ declared supported/
    //     approximate).
    const declaredCaps = new Map((engine.capabilities?.declared ?? []).map((c) => [c.capability, c.support]));
    for (const cap of requiredCapabilities ?? []) {
      const support = declaredCaps.get(cap);
      if (support !== 'supported' && support !== 'approximate') {
        throw new AnalysisServiceError(
          'ENGINE_CAPABILITY_UNSUPPORTED',
          `engine ${engine.id} does not support the required capability '${cap}' (declared support: ${support ?? 'absent'}) — no silent capability drop`,
          409,
        );
      }
    }
    const approximate = (engine.capabilities?.declared ?? []).filter((c) => c.support === 'approximate');

    const provenance: EngineProvenance = {
      engineRef: {
        kind: 'record',
        type: 'analysis-engine',
        id: engine.id,
        ...(engineRef.revisionRef?.id
          ? { revisionRef: { kind: 'record', type: 'record-revision', id: engineRef.revisionRef.id } }
          : {}),
      },
      engineRecordId: engine.id,
      engineVersion: engine.engine_version ?? 'unknown',
      adapter: engine.implementation.adapter,
      interpreterPath,
      interpreterVersion: probe.python,
      packages,
      probedAt: new Date().toISOString(),
      ...(engine.capabilities?.declared?.length
        ? { capabilitiesReported: engine.capabilities.declared.map((c) => ({ capability: c.capability, support: c.support })) }
        : {}),
    };

    return { engine, interpreterPath, provenance, approximate };
  }

  /** Execute a run (assumes queued). Transitions status + persists outputs. */
  async executeRun(runId: string): Promise<{ recordId: string; status: string; manifest: OutputManifest; artifactRefs: Record<string, { artifactRecordId: string; dataReferenceId?: string }> }> {
    return withRecordLock(this.ctx.store, `analysis:${runId}`, () => this.executeLocked(runId));
  }

  private async executeLocked(runId: string): Promise<{
    recordId: string;
    status: string;
    manifest: OutputManifest;
    artifactRefs: Record<string, { artifactRecordId: string; dataReferenceId?: string }>;
  }> {
    const service = new AnalysisService(this.ctx);
    const runEnv = await service.getRun(runId);
    if (!runEnv) throw new AnalysisServiceError('NOT_FOUND', `analysis-run not found: ${runId}`, 404);
    const runPayload = runEnv.payload as {
      revisionRef?: { id?: string };
      inputs?: RunInputs;
      status?: string;
      parameters?: Record<string, unknown>;
      frozenRevisionRef?: { id: string };
      frozenExecutionRef?: { id: string };
      outputManifest?: OutputManifest & { artifactRefs?: Record<string, { artifactRecordId: string; dataReferenceId?: string }> };
    };

    if(runPayload.frozenExecutionRef) {
      const frozen=(await new RecordRevisionService(this.ctx.store).read(runPayload.frozenExecutionRef,runId)).payload.snapshot;
      const fields=(await sequenceConfig('capabilities')).frozenRunFields as string[];
      for(const field of fields) if(contentHash(frozen[field]) !== contentHash((runPayload as Record<string,unknown>)[field])) throw new AnalysisServiceError('FROZEN_INPUT_CHANGED', `Frozen run field ${field} changed. Create a new run.`,409);
    }
    if (runPayload.status === 'succeeded' && runPayload.outputManifest) return { recordId: runId, status: 'succeeded', manifest: runPayload.outputManifest, artifactRefs: runPayload.outputManifest.artifactRefs ?? {} };
    if (runPayload.frozenRevisionRef && runPayload.status !== 'queued') throw new AnalysisServiceError('RUN_ALREADY_STARTED', 'This run has already started. Create a new run to try again.', 409);
    const revId = runPayload.revisionRef?.id;
    if (!revId) throw new AnalysisServiceError('BAD_RUN', `run ${runId} missing revisionRef`, 400);
    const revEnv = await service.getRevision(revId);
    if (!revEnv) throw new AnalysisServiceError('NOT_FOUND', `revision not found: ${revId}`, 404);
    const revPayload = (runPayload.frozenRevisionRef ? (await new RecordRevisionService(this.ctx.store).read(runPayload.frozenRevisionRef)).payload.snapshot : revEnv.payload) as {
      entryScript?: string;
      sdkVersion?: string;
      sequenceMethod?: Record<string, unknown>;
      engineRef?: { id: string; kind?: string; type?: string; revisionRef?: { id?: string } };
      requiredCapabilities?: string[];
    };

    if (!revPayload.entryScript) throw new AnalysisServiceError('BAD_REVISION', `revision ${revId} missing entryScript`, 400);

    // GC-5 engine gate (§c/§e): BEFORE the status flips to 'running' — a
    // failing gate marks the run 'failed' (visibly, with its NAMED token) and
    // re-throws, never a silent swap. Resolves the pinned engine (shared
    // resolver), probes the RESOLVED interpreter for ACTUAL versions, checks
    // capabilities, and builds the machine-readable engineProvenance written
    // at completion. Absent engineRef = the legacy path (gate skipped, no
    // provenance — byte-identical behavior).
    // l1t2245 defect 2: a revision carrying BOTH sequenceMethod and engineRef
    // dispatches to the SEQUENCE path (spec §d: "sequenceMethod → sequence
    // path untouched") — the pinned engine does NOT execute, so the gate is
    // skipped entirely: no resolve, no probe, no manifest engine echo, and NO
    // engineProvenance written for an engine that never ran (false
    // provenance is a knowledge-layer defect; a failing gate would also
    // block a valid sequence run for an unused engine).
    let engineGate: { engine: EngineRecord; interpreterPath: string; provenance: EngineProvenance; approximate: Array<{ capability: string; support: string }> } | null = null;
    if (revPayload.engineRef && !revPayload.sequenceMethod) {
      try {
        engineGate = await this.engineGate(revPayload.engineRef, revPayload.requiredCapabilities);
      } catch (err) {
        await service.setRunStatus(runId, 'failed');
        throw err;
      }
    }

    // Mark running
    await service.setRunStatus(runId, 'running');

    const inputDir = await mkdtemp(join(tmpdir(), 'cl-analysis-inputs-'));
    try {
      const inputs = revPayload.sequenceMethod ? {} : await this.provisionInputs(runPayload.inputs, inputDir);
      const entryScriptPath = join(inputDir, 'entry.py');
      await writeFile(entryScriptPath, revPayload.entryScript);

      let manifest: OutputManifest;
      try {
        manifest = revPayload.sequenceMethod
          ? await executeSequenceMethod(this.ctx, revPayload.sequenceMethod, runPayload.inputs ?? {}, runPayload.parameters ?? {}, inputDir)
          : engineGate
            // Registry-data-driven dispatch (§d): the record's
            // implementation.adapter selects the shipped adapter. The
            // python-entry-script adapter wraps the existing runPython with
            // the RESOLVED interpreter; stub-echo is the declared second
            // adapter (pluggability probe). No TS engine-name literal here.
            ? await resolveEngineAdapter(engineGate.engine).execute({
                interpreterPath: engineGate.interpreterPath,
                entryScriptPath,
                inputs,
                inputDir,
                parameters: runPayload.parameters ?? {},
                sdkDir: this.sdkDir(),
                parameterCount: Object.keys(runPayload.parameters ?? {}).length,
                spawnPython: (interpreterPath, p, i, d, params) =>
                  this.runPython(p, i, d, params, interpreterPath),
              })
            : await this.runPython(entryScriptPath, inputs, inputDir, runPayload.parameters);
      } catch (err) {
        await service.setRunStatus(runId, 'failed');
        throw err;
      }

      // GC-5: echo a compact provenance copy into the manifest (TS type
      // OutputManifest.engine) — absent on the legacy/sequence paths. Approximate
      // capability support is surfaced as a WARNING manifest log — reported,
      // never hidden (the S/A/U/NV legend's A leg).
      if (engineGate) {
        manifest = {
          ...manifest,
          engine: engineGate.provenance,
          ...(engineGate.approximate.length > 0
            ? {
                logs: [
                  ...manifest.logs,
                  ...engineGate.approximate.map((c) => ({
                    message: `engine ${engineGate.provenance.engineRecordId} reports capability '${c.capability}' as APPROXIMATE — approximation is declared, not hidden`,
                    level: 'warning',
                    code: 'ENGINE_CAPABILITY_APPROXIMATE',
                  })),
                ],
              }
            : {}),
        };
      }

      // Persist each artifact + its views
      const artifactRefs: Record<string, { artifactRecordId: string; dataReferenceId?: string }> = {};
      for (const artifact of manifest.artifacts) {
        artifact.sourceRelations = Object.values(runPayload.inputs ?? {});
        const ref = await this.persistArtifactRecord(runId, artifact, manifest.views);
        artifactRefs[artifact.name] = ref;
      }

      const current = (await service.getRun(runId))!;
      const storedArtifacts = await Promise.all(Object.values(artifactRefs).map(r => this.ctx.store.get(r.artifactRecordId)));
      const persistedManifest = { ...manifest, artifacts: storedArtifacts.map(e => {
        const p = e!.payload as Record<string, unknown>;
        return { name: p.name, dataKind: p.dataKind, ...(p.inlineValue !== undefined ? { value: p.inlineValue } : {}), ...(p.dataReferenceRef ? { dataReferenceRef: p.dataReferenceRef } : {}) } as Record<string, unknown>;
      }), artifactRefs };
      // GC-5: the machine-readable engineProvenance rides the SAME completion
      // write (F8 — no new framework). Written ONCE at completion; the
      // idempotent re-read path (F6) returns the stored record untouched, so
      // old runs keep byte-stable provenance. Absent on legacy runs (exact
      // optional spread — F20).
      const saved = await this.ctx.store.update({ envelope: { ...current, payload: { ...(current.payload as Record<string, unknown>), status: 'succeeded', completedAt: new Date().toISOString(), outputManifest: persistedManifest, ...(engineGate ? { engineProvenance: engineGate.provenance } : {}), outputArtifactRefs: Object.values(artifactRefs).map(r => ({ kind: 'record', id: r.artifactRecordId, type: 'analysis-output-artifact' })) } }, message: `Complete analysis ${runId}` });
      if (!saved.success) throw new AnalysisServiceError('SAVE_FAILED', saved.error ?? 'Could not persist analysis results', 500);

      // Capture a corpus training pair (surface:analysis → accepted manifest).
      // Opt-in via CLA_CORPUS_LOCAL_PATH; never throws.
      try {
        const { captureAnalysisCorpusPair } = await import('../corpus/analysisCorpus.js');
        captureAnalysisCorpusPair({
          runId,
          revisionId: revId,
          label: revPayload.sdkVersion ? `analysis ${revId}` : revId,
          manifest,
          asOf: new Date().toISOString(),
        });
      } catch {
        // corpus capture is best-effort; ignore failures here
      }

      return { recordId: runId, status: 'succeeded', manifest, artifactRefs };
    } catch (err) {
      await service.setRunStatus(runId, 'failed');
      throw err;
    } finally {
      await rm(inputDir, { recursive: true, force: true });
    }
  }
}