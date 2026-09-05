/**
 * AnalysisAuthoringService — AI-authored analysis methods.
 *
 * Given a natural-language goal, a local model drafts a complete Python analysis
 * method (entry script + declared inputs + parameter schema + method notes),
 * validated against the computable_lab_analysis SDK contract. A BOUNDED repair
 * loop feeds syntax/structure errors back to the model (spec §10: bound repair
 * loops by attempt budget; surface unresolved errors when exhausted).
 *
 * No networking beyond one OpenAI-compatible inference call per attempt; the
 * inference client is injected so tests never touch a real model.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InferenceClient } from '../ai/types.js';
import type { InferenceConfig } from '../config/types.js';

export interface AnalysisDraft {
  title: string;
  entryScript: string;
  methodNotes?: string;
  inputs: Array<{ name: string; dataKind: string; description?: string; required?: boolean }>;
  parameterSchema: Record<string, unknown>;
}

export interface InputDescriptor {
  name: string;
  dataKind: string;
  label?: string;
}

export interface DraftMethodOptions {
  prompt: string;
  /** Authorized dataset descriptors the method may consume (ctx.input). */
  inputs?: InputDescriptor[];
  /** Max repair attempts (default 3). */
  maxAttempts?: number;
  /** Python executable used for the syntax check (default /usr/bin/python3). */
  python?: string;
}

export interface DraftMethodResult {
  ok: boolean;
  draft?: AnalysisDraft;
  attempts: number;
  errors?: string[];
}

export class AnalysisAuthoringError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = 'AnalysisAuthoringError';
  }
}

/** Pipeline budget: generous output for full-method generation (10x safe min). */
const DEFAULT_MAX_TOKENS = 8192;

export const SYSTEM_PROMPT = `You are computable-lab's analysis-method author.
Generate a COMPLETE Python analysis method that exports a function:
    def run(ctx):
        ...
The SDK (computable_lab_analysis) provides:
    trace = ctx.input("trace")          -> DatasetHandle (kind signal/table)
    trace.read_signal()                 -> {"axis": [...], "values": [...]}
    trace.read_rows()                   -> [ {col: val, ...} ]
    ctx.parameters                      -> dict (validated, e.g. {"window": [0.1, 0.5]}
    ctx.publish(name, data, kind=..., units=...) -> publish a dataset/artifact
    ctx.metric(name, value, unit=..., label=...)   -> publish a scalar
    ctx.view(name, renderer, artifact=... , bindings=...) -> append a view spec
    ctx.log(msg) / ctx.progress(msg)    -> bounded execution messages
Valid renderers: "table", "signal", "metric", "static-figure".

Rules:
- Sci calculations are ordinary Python; do NOT hardcode results from inputs.
- Use only ctx.* + pip-installed scientific libs. Never open arbitrary files.
- Values must be Python numerics/JSON-serializable. Do NOT import the SDK.
- Guard: raise useful ValueError on empty/mismatched inputs or impossible params.
- State method assumptions/exclusions in methodNotes.

Return a JSON object (no markdown fences) with EXACTLY:
{
  "title": str,
  "entryScript": "<full python source>",
  "methodNotes": str,
  "inputs": [{"name": "trace", "dataKind": "signal", "description": str, "required": bool}],
  "parameterSchema": { <JSON-Schema object describing run params> }
}`;

/** Check a method's Python source compiles (ast.parse), via a subprocess. */
async function checkPythonSyntax(source: string, python: string): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), 'cl-analysis-draft-'));
  try {
    const path = join(dir, 'entry.py');
    await writeFile(path, source, 'utf8');
    return await new Promise<string | null>((resolvePromise) => {
      const child = spawn(python, ['-c', 'import ast,sys; ast.parse(sys.stdin.read())'], {
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });
      let stderr = '';
      child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
      child.stdin?.write(source);
      child.stdin?.end();
      child.on('close', (code) => {
        resolvePromise(code === 0 ? null : (stderr.trim() || 'python syntax check failed'));
      });
      child.on('error', (err) => resolvePromise(`could not run ${python}: ${err.message}`));
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function parseDraftJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  let candidate = trimmed;
  // strip optional outer code fences
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fence) candidate = fence;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function normalizeDraft(raw: Record<string, unknown>): AnalysisDraft | null {
  const title = typeof raw['title'] === 'string' && raw['title'].trim() ? raw['title'].trim() : '';
  const entryScript = typeof raw['entryScript'] === 'string' && raw['entryScript'].trim() ? raw['entryScript'] : '';
  if (!title || !entryScript) return null;
  const inputsRaw = Array.isArray(raw['inputs']) ? raw['inputs'] : [];
  const inputs: AnalysisDraft['inputs'] = [];
  for (const item of inputsRaw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec['name'] === 'string' && rec['name'].trim() ? rec['name'].trim() : '';
    if (!name) continue;
    inputs.push({
      name,
      dataKind: typeof rec['dataKind'] === 'string' ? rec['dataKind'] : 'table',
      ...(typeof rec['description'] === 'string' && rec['description'].trim() ? { description: rec['description'].trim() } : {}),
      ...(typeof rec['required'] === 'boolean' ? { required: rec['required'] } : {}),
    });
  }
  // normalize parameterSchema to a JSON-Schema-shaped dict (any object allowed)
  const parameterSchema = (raw['parameterSchema'] && typeof raw['parameterSchema'] === 'object' && !Array.isArray(raw['parameterSchema']))
    ? raw['parameterSchema'] as Record<string, unknown>
    : {};
  const methodNotes = typeof raw['methodNotes'] === 'string' && raw['methodNotes'].trim()
    ? raw['methodNotes'].trim()
    : undefined;
  return {
    title,
    entryScript,
    ...(methodNotes ? { methodNotes } : {}),
    inputs,
    parameterSchema,
  };
}

function validateDraftForConstraints(draft: AnalysisDraft, declared: InputDescriptor[]): string[] {
  const errors: string[] = [];
  const declaredNames = new Set(declared.map((d) => d.name));
  // every declared input the model references must exist; if model declares an
  // input not provided, note it (may be optional / may need to add).
  for (const input of draft.inputs) {
    if (declaredNames.size > 0 && input.required !== false && !declaredNames.has(input.name)) {
      errors.push(`Method declares input "${input.name}" that was not among provided inputs.`);
    }
  }
  // the model must actually read from ctx.input or ctx.parameters (no hardcode)
  if (!/(ctx\.input|ctx\.parameters|read_signal|read_rows)/.test(draft.entryScript)) {
    errors.push('Entry script does not read from ctx.input/ctx.parameters (appears hardcoded).');
  }
  return errors;
}

export class AnalysisAuthoringService {
  constructor(
    private readonly options: { inferenceClient?: InferenceClient; inferenceConfig?: InferenceConfig } = {},
  ) {}

  /** Draft + validate (bounded repair) an analysis method from a prompt. */
  async draftMethod(opts: DraftMethodOptions): Promise<DraftMethodResult> {
    const client = this.options.inferenceClient;
    const model = this.options.inferenceConfig?.model;
    if (!client || !model) {
      throw new AnalysisAuthoringError('AI_UNCONFIGURED', 'No inference client/model configured for AI authoring.', 409);
    }

    const maxAttempts = opts.maxAttempts ?? 3;
    const python = opts.python ?? '/usr/bin/python3';
    const declared = opts.inputs ?? [];
    const attemptErrors: string[] = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const systemWithExamples = buildSystemPrompt(declared, attemptErrors[attemptErrors.length - 1]);
      const response = await client.complete({
        model,
        temperature: this.options.inferenceConfig?.temperature ?? 0,
        max_tokens: Math.max(this.options.inferenceConfig?.maxTokens ?? DEFAULT_MAX_TOKENS, 4096),
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemWithExamples },
          {
            role: 'user',
            content: [
              `Author an analysis method for: ${opts.prompt}`,
              declared.length > 0
                ? `\nAvailable datasets you may read via ctx.input:\n${declared.map((d) => `- ${d.name} (${d.dataKind})${d.label ? `: ${d.label}` : ''}`).join('\n')}`
                : '',
              attemptErrors.length > 0
                ? `\nYour previous attempt failed. Fix these:\n${attemptErrors[attemptErrors.length - 1]}`
                : '',
            ].join('\n').trim(),
          },
        ],
      });
      const content = response.choices?.[0]?.message?.content ?? '';
      const raw = parseDraftJson(content);
      if (!raw) {
        attemptErrors.push('Could not parse a JSON method draft from the model response.');
        continue;
      }
      const draft = normalizeDraft(raw);
      if (!draft) {
        attemptErrors.push('Model response was missing required fields (title, entryScript).');
        continue;
      }

      // syntax check
      const syntaxErr = await checkPythonSyntax(draft.entryScript, python);
      if (syntaxErr) {
        attemptErrors.push(`Python syntax error:\n${syntaxErr}`);
        continue;
      }

      const constraintErrors = validateDraftForConstraints(draft, declared);
      if (constraintErrors.length > 0) {
        attemptErrors.push(constraintErrors.join('\n'));
        continue;
      }

      return { ok: true, draft, attempts: attempt, errors: attemptErrors };
    }

    return { ok: false, attempts: maxAttempts, errors: attemptErrors };
  }
}

export function buildSystemPrompt(declared: InputDescriptor[], previousError?: string): string {
  const lines = [SYSTEM_PROMPT];
  if (declared.length > 0) {
    lines.push(
      `\nAUTHORIZED INPUT DATASETS (only these; call ctx.input with these exact names):\n` +
      declared.map((d) => `- ${d.name} (dataKind: ${d.dataKind})`).join('\n'),
    );
  }
  lines.push(`\nEXAMPLE (signal → integrate window → table + metric + view):\n\`${EXAMPLE_SCRIPT}\``);
  if (previousError) lines.push(`\nPREVIOUS ATTEMPT ERRORS — fix all, do not repeat:\n${previousError}`);
  return lines.join('\n');
}

const EXAMPLE_SCRIPT = `def run(ctx):
    trace = ctx.input('trace').read_signal()
    x = trace['axis']
    y = trace['values']
    low, high = ctx.parameters['window']
    chosen = [(xx, yy) for xx, yy in zip(x, y) if low <= xx <= high]
    area = sum(yy for _, yy in chosen)
    ctx.publish('peak_results', [{'start': low, 'end': high, 'area': area}], kind='table', units={'start':'min','end':'min','area':'a.u.*min'})
    ctx.metric('total_area', area, unit='a.u.*min', label='Area under window')
    ctx.view('results', 'table', artifact='peak_results')`;