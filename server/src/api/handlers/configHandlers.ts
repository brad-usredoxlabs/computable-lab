/**
 * Config management handlers for GET /api/config and PATCH /api/config.
 *
 * Exposes repositories and ai sections of config.yaml with secrets redacted.
 * The server and schemas sections are omitted (require restart).
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppConfig, AIConfig, RepositoryConfig, IntegrationsConfig, AIProfile } from '../../config/types.js';
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
      !Array.isArray(patchValue)
    ) {
      const baseValue = (
        existingValue !== null &&
        existingValue !== undefined &&
        typeof existingValue === 'object' &&
        !Array.isArray(existingValue)
      )
        ? existingValue as Record<string, unknown>
        : {};
      result[key] = mergeConfigPatch(
        baseValue,
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
  const ai = config.ai;
  const profileNames = ai?.profiles ? Object.keys(ai.profiles) : [];
  const activeProfile = ai?.activeProfile && ai.profiles?.[ai.activeProfile]
    ? ai.activeProfile
    : undefined;

  return {
    repositories: redactSecrets(config.repositories),
    ai: ai ? redactSecrets(ai) : null,
    aiProfiles: profileNames,
    aiActiveProfile: activeProfile ?? null,
    lab: config.lab ? redactSecrets(config.lab) : null,
    integrations: config.integrations ? redactSecrets(config.integrations) : null,
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
  lab?: Record<string, unknown>;
  integrations?: Record<string, unknown>;
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

    if (patch.lab !== undefined) {
      const mergedLab = (updated.lab
        ? mergeConfigPatch(
            updated.lab as unknown as Record<string, unknown>,
            patch.lab,
          )
        : patch.lab) as unknown as NonNullable<AppConfig['lab']>
      updated.lab = mergedLab
    }

    if (patch.integrations !== undefined) {
      const mergedIntegrations = (updated.integrations
        ? mergeConfigPatch(
            updated.integrations as unknown as Record<string, unknown>,
            patch.integrations,
          )
        : mergeConfigPatch({}, patch.integrations)) as unknown as IntegrationsConfig
      updated.integrations = mergedIntegrations
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

  // ---- GET /api/config/ai/profiles -----------------------------------------

  async listAiProfiles(_request: FastifyRequest, reply: FastifyReply) {
    const ai = this.appConfig.ai;
    const profiles = ai?.profiles ?? {};
    const profileNames = Object.keys(profiles);
    const activeProfile = ai?.activeProfile && profiles[ai.activeProfile]
      ? ai.activeProfile
      : undefined;

    return reply.send({
      profiles: profileNames.map(name => {
        const p = profiles[name]!;
        return {
          name,
          provider: p.inference.provider ?? 'openai-compatible',
          baseUrl: p.inference.baseUrl,
          model: p.inference.model,
          active: name === activeProfile,
        };
      }),
      activeProfile: activeProfile ?? null,
    });
  }

  // ---- PUT /api/config/ai/profiles/:name -----------------------------------

  async saveAiProfile(
    request: FastifyRequest<{ Params: { name: string }; Body: Record<string, unknown> }>,
    reply: FastifyReply,
  ) {
    const { name } = request.params;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return reply.status(400).send({ success: false, error: 'Profile name is required' });
    }

    const body = request.body as { inference?: Record<string, unknown>; agent?: Record<string, unknown> };
    if (!body?.inference?.baseUrl || !body?.inference?.model) {
      return reply.status(400).send({ success: false, error: 'inference.baseUrl and inference.model are required' });
    }

    const updated = structuredClone(this.appConfig);
    if (!updated.ai) {
      updated.ai = { inference: body.inference as unknown as AppConfig['ai'] extends infer T ? T extends { inference: infer I } ? I : never : never, agent: {} } as AIConfig;
    }
    if (!updated.ai.profiles) {
      updated.ai.profiles = {};
    }

    // If saving over an existing profile, preserve secrets that are redacted
    const existing = updated.ai.profiles[name.trim()];
    const newInference = { ...body.inference };
    if (existing && isRedacted(newInference.apiKey)) {
      newInference.apiKey = existing.inference.apiKey;
    }

    updated.ai.profiles[name.trim()] = {
      inference: newInference,
      agent: body.agent ?? existing?.agent ?? {},
    } as unknown as AIProfile;

    try {
      await writeConfigYaml(this.configPath, updated);
    } catch (err) {
      return reply.status(500).send({ success: false, error: `Failed to write config: ${err instanceof Error ? err.message : String(err)}` });
    }

    this.appConfig = updated;
    await this.onConfigUpdate?.(updated);

    return reply.send({ success: true, message: `Profile "${name.trim()}" saved.` });
  }

  // ---- POST /api/config/ai/profiles/:name/activate ------------------------

  async activateAiProfile(
    request: FastifyRequest<{ Params: { name: string } }>,
    reply: FastifyReply,
  ) {
    const { name } = request.params;
    const profiles = this.appConfig.ai?.profiles ?? {};

    if (!profiles[name]) {
      return reply.status(404).send({ success: false, error: `Profile "${name}" not found` });
    }

    const updated = structuredClone(this.appConfig);
    if (!updated.ai) return reply.status(400).send({ success: false, error: 'AI not configured' });

    // Copy the profile's settings into the top-level inference/agent fields
    const profile = updated.ai.profiles?.[name];
    if (!profile) return reply.status(404).send({ success: false, error: `Profile "${name}" not found` });
    updated.ai.inference = profile.inference;
    updated.ai.agent = profile.agent;
    updated.ai.activeProfile = name;

    try {
      await writeConfigYaml(this.configPath, updated);
    } catch (err) {
      return reply.status(500).send({ success: false, error: `Failed to write config: ${err instanceof Error ? err.message : String(err)}` });
    }

    this.appConfig = updated;
    await this.onConfigUpdate?.(updated);

    return reply.send({
      success: true,
      message: `Switched to profile "${name}".`,
      config: {
        ...buildConfigResponse(updated),
        aiStatus: this.getAiStatus?.() ?? null,
      },
    });
  }

  // ---- DELETE /api/config/ai/profiles/:name --------------------------------

  async deleteAiProfile(
    request: FastifyRequest<{ Params: { name: string } }>,
    reply: FastifyReply,
  ) {
    const { name } = request.params;
    const profiles = this.appConfig.ai?.profiles;

    if (!profiles?.[name]) {
      return reply.status(404).send({ success: false, error: `Profile "${name}" not found` });
    }

    const updated = structuredClone(this.appConfig);
    delete updated.ai!.profiles![name];
    if (updated.ai!.activeProfile === name) {
      delete updated.ai!.activeProfile;
    }

    try {
      await writeConfigYaml(this.configPath, updated);
    } catch (err) {
      return reply.status(500).send({ success: false, error: `Failed to write config: ${err instanceof Error ? err.message : String(err)}` });
    }

    this.appConfig = updated;
    return reply.send({ success: true, message: `Profile "${name}" deleted.` });
  }
}
