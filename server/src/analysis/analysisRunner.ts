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
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnalysisService, AnalysisServiceError } from './analysisService.js';
import type { AppContext } from '../server.js';

const DEFAULT_PYTHON = '/usr/bin/python3';

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
}

export interface RunInputs {
  [name: string]: { kind: 'record'; id: string; type: string; dataKind?: string };
}

export interface ManifestArtifact {
  name: string;
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

      if (ref.type === 'analysis-output-artifact') {
        // Resolve the artifact → its data-reference (or inline) for provisioning.
        const artEnv = await this.ctx.store.get(ref.id);
        if (!artEnv) {
          throw new AnalysisServiceError('BAD_INPUT', `input ${name} artifact not found: ${ref.id}`, 404);
        }
        const art = artEnv.payload as { dataReferenceRef?: { id?: string }; inlineValue?: unknown; dataKind?: string };
        dataKind = dataKind ?? art.dataKind;
        if (art.dataReferenceRef?.id) {
          const refId = art.dataReferenceRef.id;
          const drefEnv = await this.ctx.store.get(refId);
          if (!drefEnv) {
            throw new AnalysisServiceError('BAD_INPUT', `input ${name} artifact dref not found: ${refId}`, 404);
          }
          const dp = drefEnv.payload as { storageDeviceId?: string; path?: string; dataKind?: string };
          if (!dp.storageDeviceId || !dp.path) {
            throw new AnalysisServiceError('BAD_INPUT', `input ${name} artifact dref has no device/path`, 400);
          }
          deviceId = dp.storageDeviceId;
          path = dp.path;
          dataKind = dataKind ?? dp.dataKind;
        } else if (art.inlineValue !== undefined) {
          // inline artifact (small table/metric) → hand to the SDK as inline data
          specs[name] = { dataKind: dataKind ?? art.dataKind ?? 'table', path: `${inputDir}/${name}.inline`, inline: art.inlineValue };
          continue;
        } else {
          throw new AnalysisServiceError('BAD_INPUT', `input ${name} artifact has no dataReferenceRef or inlineValue`, 400);
        }
      } else if (ref.type === 'data-reference') {
        const env = await this.ctx.store.get(ref.id);
        if (!env) {
          throw new AnalysisServiceError('BAD_INPUT', `input ${name} data-reference not found: ${ref.id}`, 404);
        }
        const payload = env.payload as { storageDeviceId?: string; path?: string; dataKind?: string };
        if (!payload.storageDeviceId || !payload.path) {
          throw new AnalysisServiceError('BAD_INPUT', `input ${name} data-reference has no device/path`, 400);
        }
        deviceId = payload.storageDeviceId;
        path = payload.path;
        dataKind = dataKind ?? payload.dataKind;
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
      specs[name] = {
        dataKind: dataKind ?? 'table',
        path: outPath,
      };
    }
    return specs;
  }

  /** Spawn the python SDK run and capture stdout manifest JSON. */
  private async runPython(
    entryScriptPath: string,
    inputs: Record<string, InputSpec>,
    inputDir: string,
    parameters?: Record<string, unknown>,
  ): Promise<OutputManifest> {
    const sdkDir = this.sdkDir();
    const inputsJson = JSON.stringify(inputs);
    const parametersJson = JSON.stringify(parameters ?? {});
    return new Promise<OutputManifest>((resolvePromise, rejectPromise) => {
      const child = spawn(
        this.python,
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

  /** Execute a run (assumes queued). Transitions status + persists outputs. */
  async executeRun(runId: string): Promise<{
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
    };

    const revId = runPayload.revisionRef?.id;
    if (!revId) throw new AnalysisServiceError('BAD_RUN', `run ${runId} missing revisionRef`, 400);
    const revEnv = await service.getRevision(revId);
    if (!revEnv) throw new AnalysisServiceError('NOT_FOUND', `revision not found: ${revId}`, 404);
    const revPayload = revEnv.payload as { entryScript?: string; sdkVersion?: string };

    if (!revPayload.entryScript) throw new AnalysisServiceError('BAD_REVISION', `revision ${revId} missing entryScript`, 400);

    // Mark running
    await service.setRunStatus(runId, 'running');

    const inputDir = await mkdtemp(join(tmpdir(), 'cl-analysis-inputs-'));
    try {
      const inputs = await this.provisionInputs(runPayload.inputs, inputDir);
      const entryScriptPath = join(inputDir, 'entry.py');
      await writeFile(entryScriptPath, revPayload.entryScript);

      let manifest: OutputManifest;
      try {
        manifest = await this.runPython(entryScriptPath, inputs, inputDir, runPayload.parameters);
      } catch (err) {
        await service.setRunStatus(runId, 'failed');
        throw err;
      }

      // Persist each artifact + its views
      const artifactRefs: Record<string, { artifactRecordId: string; dataReferenceId?: string }> = {};
      for (const artifact of manifest.artifacts) {
        const ref = await this.persistArtifactRecord(runId, artifact, manifest.views);
        artifactRefs[artifact.name] = ref;
      }

      await service.setRunStatus(runId, 'succeeded');

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
    } finally {
      await rm(inputDir, { recursive: true, force: true });
    }
  }
}