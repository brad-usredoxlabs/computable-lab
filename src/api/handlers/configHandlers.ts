/**
 * Config management handlers for GET /api/config and PATCH /api/config.
 *
 * Exposes repositories and ai sections of config.yaml with secrets redacted.
 * The server and schemas sections are omitted (require restart).
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppConfig, AIConfig, RepositoryConfig } from '../../config/types.js';
import { DEFAULT_REPO_CONFIG } from '../../config/types.js';
import { validateConfig, ConfigValidationError } from '../../config/loader.js';
import { writeFile, rename, mkdir } from 'node:fs/promises';
import { stringify as stringifyYaml } from 'yaml';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { testInferenceEndpoint, listInferenceModels } from '../../ai/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REDACTED = '***';

/** Property names whose string values are replaced with "***" in responses. */
const SECRET_KEYS = new Set(['token', 'apiKey', 'privateKeyPath', 'sshKeyPath']);

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Deep-clone an object and replace secret fields with the redaction placeholder. */
export function redactSecrets(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(redactSecrets);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SECRET_KEYS.has(key) && typeof value === 'string' && value.length > 0) {
        result[key] = REDACTED;
      } else {
        result[key] = redactSecrets(value);
      }
    }
    return result;
  }
  return obj;
}

/** Returns `true` when a value is the redaction placeholder. */
export function isRedacted(val: unknown): boolean {
  return val === REDACTED;
}

/**
 * Deep-merge `patch` into `existing`, skipping any value that is the
 * redaction placeholder so that existing secrets are preserved.
 */
export function mergeConfigPatch(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...existing };

  for (const [key, patchValue] of Object.entries(patch)) {
    if (isRedacted(patchValue)) continue;

    const existingValue = existing[key];

    if (
      patchValue !== null &&
      patchValue !== undefined &&
      typeof patchValue === 'object' &&
      !Array.isArray(patchValue) &&
      existingValue !== null &&
      existingValue !== undefined &&
      typeof existingValue === 'object' &&
      !Array.isArray(existingValue)
    ) {
      result[key] = mergeConfigPatch(
        existingValue as Record<string, unknown>,
        patchValue as Record<string, unknown>,
      );
    } else {
      result[key] = patchValue;
    }
  }

  return result;
}

/** Serialize config to YAML and write atomically (tmp-file + rename). */
export async function writeConfigYaml(
  configPath: string,
  config: AppConfig,
): Promise<void> {
  const yamlContent = stringifyYaml(config, { indent: 2 });
  const dir = dirname(configPath);
  await mkdir(dir, { recursive: true });
  const tmpPath = join(dir, `.config.yaml.${randomUUID()}.tmp`);
  await writeFile(tmpPath, yamlContent, 'utf-8');
  await rename(tmpPath, configPath);
}

/** Return `true` when git URL, branch, or auth changed for any repository. */
function checkRestartRequired(
  existing: AppConfig,
  updated: AppConfig,
): boolean {
  for (const updatedRepo of updated.repositories) {
    const existingRepo = existing.repositories.find(
      (r) => r.id === updatedRepo.id,
    );
    if (!existingRepo) return true; // new repo added

    if (existingRepo.git.url !== updatedRepo.git.url) return true;
    if (existingRepo.git.branch !== updatedRepo.git.branch) return true;
    if (
      JSON.stringify(existingRepo.git.auth) !==
      JSON.stringify(updatedRepo.git.auth)
    )
      return true;
  }
  return false;
}

/** Build the GET / PATCH response body (repositories + ai, secrets redacted). */
function buildConfigResponse(config: AppConfig) {
  return {
    repositories: redactSecrets(config.repositories),
    ai: config.ai ? redactSecrets(config.ai) : null,
  };
}

interface AiStatusSnapshot {
  available: boolean;
  inferenceUrl: string;
  model: string;
  provider?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Patch body shape
// ---------------------------------------------------------------------------

interface ConfigPatchBody {
  repositories?: Array<Record<string, unknown> & { id: string }>;
  ai?: Record<string, unknown>;
}

interface AiTestBody {
  provider?: unknown;
  baseUrl?: unknown;
  apiKey?: unknown;
  model?: unknown;
}

// ---------------------------------------------------------------------------
// Handler class
// ---------------------------------------------------------------------------

export class ConfigHandlers {
  constructor(
    private configPath: string,
    private appConfig: AppConfig,
    private onConfigUpdate?: (config: AppConfig) => Promise<void>,
    private getAiStatus?: () => AiStatusSnapshot | undefined,
  ) {}

  // ---- GET /api/config ----------------------------------------------------

  async getConfig(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      ...buildConfigResponse(this.appConfig),
      aiStatus: this.getAiStatus?.() ?? null,
    });
  }

  // ---- PATCH /api/config --------------------------------------------------

  async patchConfig(
    request: FastifyRequest<{ Body: ConfigPatchBody }>,
    reply: FastifyReply,
  ) {
    const patch = request.body;

    if (!patch || typeof patch !== 'object') {
      return reply.status(400).send({
        success: false,
        error: 'Request body must be an object',
      });
    }

    // Snapshot the current config so we can diff later
    const existing = structuredClone(this.appConfig);
    const updated = structuredClone(existing);

    // -- Merge repositories (matched by id) ---------------------------------
    if (patch.repositories && Array.isArray(patch.repositories)) {
      const updatedRepos = [...updated.repositories];

      for (const patchRepo of patch.repositories) {
        if (!patchRepo.id || typeof patchRepo.id !== 'string') {
          return reply.status(400).send({
            success: false,
            error: 'Validation failed',
            details: [
              {
                path: 'repositories[].id',
                message: 'id is required for each repository',
              },
            ],
          });
        }

        const idx = updatedRepos.findIndex((r) => r.id === patchRepo.id);
        if (idx === -1) {
          // New repository — merge patch onto defaults
          const newRepo = mergeConfigPatch(
            { id: patchRepo.id, ...DEFAULT_REPO_CONFIG } as unknown as Record<string, unknown>,
            patchRepo,
          ) as unknown as RepositoryConfig;
          // Mark first repo as default if none exist yet
          if (updatedRepos.length === 0) newRepo.default = true;
          updatedRepos.push(newRepo);
        } else {
          updatedRepos[idx] = mergeConfigPatch(
            updatedRepos[idx] as unknown as Record<string, unknown>,
            patchRepo,
          ) as unknown as RepositoryConfig;
        }
      }

      updated.repositories = updatedRepos;
    }

    // -- Merge AI config ----------------------------------------------------
    if (patch.ai !== undefined) {
      if (updated.ai) {
        updated.ai = mergeConfigPatch(
          updated.ai as unknown as Record<string, unknown>,
          patch.ai,
        ) as unknown as AIConfig;
      } else {
        updated.ai = patch.ai as unknown as AIConfig;
      }
    }

    // -- Validate the merged config -----------------------------------------
    try {
      validateConfig(updated);
    } catch (err) {
      if (err instanceof ConfigValidationError) {
        return reply.status(400).send({
          success: false,
          error: 'Validation failed',
          details: [{ path: err.path, message: err.message }],
        });
      }
      throw err;
    }

    // -- Determine if a restart is needed -----------------------------------
    const restartRequired = checkRestartRequired(existing, updated);

    // -- Atomic write to disk -----------------------------------------------
    try {
      await writeConfigYaml(this.configPath, updated);
    } catch (err) {
      return reply.status(500).send({
        success: false,
        error: `Failed to write config: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // -- Update in-memory config --------------------------------------------
    this.appConfig = updated;
    await this.onConfigUpdate?.(updated);

    return reply.send({
      success: true,
      message: 'Configuration updated.',
      restartRequired,
      config: {
        ...buildConfigResponse(updated),
        aiStatus: this.getAiStatus?.() ?? null,
      },
    });
  }

  // ---- POST /api/config/ai/test -------------------------------------------

  async testAiConfig(
    request: FastifyRequest<{ Body: AiTestBody }>,
    reply: FastifyReply,
  ) {
    const body = request.body;
    const baseUrl = typeof body?.baseUrl === 'string' ? body.baseUrl.trim() : '';
    const model = typeof body?.model === 'string' ? body.model.trim() : '';
    const postedApiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : undefined;
    const apiKey = postedApiKey && postedApiKey.length > 0
      ? postedApiKey
      : this.appConfig.ai?.inference?.apiKey;
    const provider = body?.provider === 'openai' || body?.provider === 'openai-compatible'
      ? body.provider
      : 'openai-compatible';

    if (!baseUrl) {
      return reply.status(400).send({ success: false, error: 'baseUrl is required' });
    }

    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    const probe = await testInferenceEndpoint(normalizedBaseUrl, apiKey);
    const modelsResult = await listInferenceModels(normalizedBaseUrl, apiKey);

    const modelKnown = model.length > 0 && modelsResult.models.includes(model);
    const modelWarning = model.length > 0 && modelsResult.models.length > 0 && !modelKnown
      ? `Model "${model}" not returned by provider /models list.`
      : undefined;

    return reply.send({
      success: probe.available,
      available: probe.available,
      provider,
      baseUrl: normalizedBaseUrl,
      model: model || probe.model || null,
      modelKnown,
      modelWarning,
      models: modelsResult.models,
      error: probe.error,
    });
  }
}
