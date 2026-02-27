/**
 * Configuration loader for computable-lab server.
 * 
 * Loads config from YAML file with support for:
 * - Environment variable substitution (${VAR_NAME})
 * - Default values
 * - Validation
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type {
  AppConfig,
  ServerConfig,
  RepositoryConfig,
  GitConfig,
  GitAuthConfig,
  NamespaceConfig,
  AIConfig,
  ExecutionConfig,
} from './types.js';
import { DEFAULT_CONFIG, DEFAULT_REPO_CONFIG } from './types.js';

/**
 * Config loading options.
 */
export interface LoadConfigOptions {
  /** Path to config file (default: process.env.CONFIG_PATH or './config.yaml') */
  configPath?: string;
  /** Whether to validate config (default: true) */
  validate?: boolean;
}

/**
 * Config validation error.
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly value: unknown
  ) {
    super(`Config validation error at '${path}': ${message}`);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Environment variable substitution pattern.
 * Matches ${VAR_NAME} and ${VAR_NAME:-default}
 */
const ENV_VAR_PATTERN = /\$\{([A-Z_][A-Z0-9_]*)(?::-([^}]*))?\}/gi;

/**
 * Substitute environment variables in a string.
 * 
 * Supports:
 * - ${VAR_NAME} - Replace with env var value
 * - ${VAR_NAME:-default} - Replace with env var or default
 */
function substituteEnvVars(value: string): string {
  return value.replace(ENV_VAR_PATTERN, (_match, varName, defaultValue) => {
    const envValue = process.env[varName];
    if (envValue !== undefined) {
      return envValue;
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    // Return empty string if no value and no default
    console.warn(`Environment variable ${varName} is not set and has no default`);
    return '';
  });
}

/**
 * Recursively substitute environment variables in an object.
 */
function substituteEnvVarsRecursive(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return substituteEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(substituteEnvVarsRecursive);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVarsRecursive(value);
    }
    return result;
  }
  return obj;
}

/**
 * Deep merge two objects (source overrides target).
 */
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key];
    const targetValue = target[key];
    
    if (
      sourceValue !== undefined &&
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== undefined &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue, sourceValue as Partial<typeof targetValue>);
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }
  
  return result;
}

/**
 * Validate server configuration.
 */
function validateServerConfig(config: unknown, path = 'server'): asserts config is ServerConfig {
  if (!config || typeof config !== 'object') {
    throw new ConfigValidationError('must be an object', path, config);
  }
  
  const c = config as Record<string, unknown>;
  
  if (c.port !== undefined && (typeof c.port !== 'number' || c.port < 1 || c.port > 65535)) {
    throw new ConfigValidationError('port must be a number between 1 and 65535', `${path}.port`, c.port);
  }
  
  if (c.host !== undefined && typeof c.host !== 'string') {
    throw new ConfigValidationError('host must be a string', `${path}.host`, c.host);
  }
  
  if (c.logLevel !== undefined && !['debug', 'info', 'warn', 'error'].includes(c.logLevel as string)) {
    throw new ConfigValidationError('logLevel must be one of: debug, info, warn, error', `${path}.logLevel`, c.logLevel);
  }
}

/**
 * Validate git auth configuration.
 */
function validateGitAuthConfig(config: unknown, path: string): asserts config is GitAuthConfig {
  if (!config || typeof config !== 'object') {
    throw new ConfigValidationError('must be an object', path, config);
  }
  
  const c = config as Record<string, unknown>;
  
  if (!['token', 'github-app', 'ssh-key', 'none'].includes(c.type as string)) {
    throw new ConfigValidationError('type must be one of: token, github-app, ssh-key, none', `${path}.type`, c.type);
  }
  
  if (c.type === 'token' && (!c.token || typeof c.token !== 'string')) {
    throw new ConfigValidationError('token is required when type is "token"', `${path}.token`, c.token);
  }
}

/**
 * Validate git configuration.
 */
function validateGitConfig(config: unknown, path: string): asserts config is GitConfig {
  if (!config || typeof config !== 'object') {
    throw new ConfigValidationError('must be an object', path, config);
  }
  
  const c = config as Record<string, unknown>;
  
  if (!c.url || typeof c.url !== 'string') {
    throw new ConfigValidationError('url is required', `${path}.url`, c.url);
  }
  
  if (c.auth) {
    validateGitAuthConfig(c.auth, `${path}.auth`);
  }
}

/**
 * Validate namespace configuration.
 */
function validateNamespaceConfig(config: unknown, path: string): asserts config is NamespaceConfig {
  if (!config || typeof config !== 'object') {
    throw new ConfigValidationError('must be an object', path, config);
  }
  
  const c = config as Record<string, unknown>;
  
  if (!c.baseUri || typeof c.baseUri !== 'string') {
    throw new ConfigValidationError('baseUri is required', `${path}.baseUri`, c.baseUri);
  }
  
  if (!c.prefix || typeof c.prefix !== 'string') {
    throw new ConfigValidationError('prefix is required', `${path}.prefix`, c.prefix);
  }
}

/**
 * Validate repository configuration.
 */
function validateRepositoryConfig(config: unknown, path: string): asserts config is RepositoryConfig {
  if (!config || typeof config !== 'object') {
    throw new ConfigValidationError('must be an object', path, config);
  }
  
  const c = config as Record<string, unknown>;
  
  if (!c.id || typeof c.id !== 'string') {
    throw new ConfigValidationError('id is required', `${path}.id`, c.id);
  }
  
  if (!c.git) {
    throw new ConfigValidationError('git configuration is required', `${path}.git`, c.git);
  }
  validateGitConfig(c.git, `${path}.git`);
  
  if (c.namespace) {
    validateNamespaceConfig(c.namespace, `${path}.namespace`);
  }
}

/**
 * Validate AI configuration.
 */
function validateAIConfig(config: unknown, path = 'ai'): asserts config is AIConfig {
  if (!config || typeof config !== 'object') {
    throw new ConfigValidationError('must be an object', path, config);
  }

  const c = config as Record<string, unknown>;
  const inference = c.inference as Record<string, unknown> | undefined;

  if (!inference || typeof inference !== 'object') {
    throw new ConfigValidationError('inference is required', `${path}.inference`, inference);
  }

  if (!inference.baseUrl || typeof inference.baseUrl !== 'string') {
    throw new ConfigValidationError('baseUrl is required', `${path}.inference.baseUrl`, inference.baseUrl);
  }
  if (!inference.model || typeof inference.model !== 'string') {
    throw new ConfigValidationError('model is required', `${path}.inference.model`, inference.model);
  }

  if (
    inference.provider !== undefined &&
    inference.provider !== 'openai' &&
    inference.provider !== 'openai-compatible'
  ) {
    throw new ConfigValidationError(
      'provider must be one of: openai, openai-compatible',
      `${path}.inference.provider`,
      inference.provider,
    );
  }
}

function validateExecutionConfig(config: unknown, path = 'execution'): asserts config is ExecutionConfig {
  if (!config || typeof config !== 'object') {
    throw new ConfigValidationError('must be an object', path, config);
  }
  const c = config as Record<string, unknown>;
  if (c.mode !== undefined && c.mode !== 'local' && c.mode !== 'remote' && c.mode !== 'hybrid') {
    throw new ConfigValidationError('mode must be one of: local, remote, hybrid', `${path}.mode`, c.mode);
  }
  if (c.adapters !== undefined) {
    if (!c.adapters || typeof c.adapters !== 'object' || Array.isArray(c.adapters)) {
      throw new ConfigValidationError('adapters must be an object map', `${path}.adapters`, c.adapters);
    }
    for (const [adapterId, value] of Object.entries(c.adapters as Record<string, unknown>)) {
      if (value !== 'local' && value !== 'remote') {
        throw new ConfigValidationError('adapter mode must be local or remote', `${path}.adapters.${adapterId}`, value);
      }
    }
  }
}

/**
 * Validate the entire configuration.
 */
export function validateConfig(config: unknown): asserts config is Partial<AppConfig> {
  if (!config || typeof config !== 'object') {
    throw new ConfigValidationError('must be an object', '', config);
  }
  
  const c = config as Record<string, unknown>;
  
  if (c.server) {
    validateServerConfig(c.server);
  }
  
  if (c.repositories) {
    if (!Array.isArray(c.repositories)) {
      throw new ConfigValidationError('must be an array', 'repositories', c.repositories);
    }
    
    c.repositories.forEach((repo, index) => {
      validateRepositoryConfig(repo, `repositories[${index}]`);
    });
    
    // Check for duplicate IDs
    const ids = (c.repositories as RepositoryConfig[]).map(r => r.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (duplicates.length > 0) {
      throw new ConfigValidationError(`duplicate repository IDs: ${duplicates.join(', ')}`, 'repositories', null);
    }
    
    // Check for multiple defaults
    const defaults = (c.repositories as RepositoryConfig[]).filter(r => r.default);
    if (defaults.length > 1) {
      throw new ConfigValidationError('only one repository can be marked as default', 'repositories', null);
    }
  }

  if (c.ai !== undefined) {
    validateAIConfig(c.ai, 'ai');
  }

  if (c.execution !== undefined) {
    validateExecutionConfig(c.execution, 'execution');
  }
}

/**
 * Apply defaults to a repository config.
 */
function applyRepoDefaults(repo: Partial<RepositoryConfig>): RepositoryConfig {
  const result = deepMerge(DEFAULT_REPO_CONFIG as RepositoryConfig, repo as RepositoryConfig);
  
  // Ensure git.branch has default
  if (!result.git.branch) {
    result.git.branch = 'main';
  }
  
  // Ensure git.auth has default
  if (!result.git.auth) {
    result.git.auth = { type: 'none' };
  }
  
  return result;
}

/**
 * Load configuration from a YAML file.
 * 
 * @param options - Loading options
 * @returns Loaded and validated configuration
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<AppConfig> {
  const configPath = options.configPath 
    ?? process.env.CONFIG_PATH 
    ?? './config.yaml';
  
  const absolutePath = resolve(configPath);
  
  // If config file doesn't exist, return defaults
  if (!existsSync(absolutePath)) {
    console.warn(`Config file not found at ${absolutePath}, using defaults`);
    return { ...DEFAULT_CONFIG };
  }
  
  // Read and parse YAML
  const content = await readFile(absolutePath, 'utf-8');
  let parsed: unknown;
  
  try {
    parsed = parseYaml(content);
  } catch (err) {
    throw new Error(`Failed to parse config file: ${err instanceof Error ? err.message : String(err)}`);
  }
  
  // Substitute environment variables
  const substituted = substituteEnvVarsRecursive(parsed);
  
  // Validate if requested
  if (options.validate !== false) {
    validateConfig(substituted);
  }
  
  // Merge with defaults
  const partialConfig = substituted as Partial<AppConfig>;
  const config: AppConfig = {
    server: deepMerge(DEFAULT_CONFIG.server, partialConfig.server ?? {}),
    schemas: deepMerge(DEFAULT_CONFIG.schemas, partialConfig.schemas ?? {}),
    repositories: (partialConfig.repositories ?? []).map(applyRepoDefaults),
    execution: deepMerge(DEFAULT_CONFIG.execution ?? { mode: 'local', adapters: {} }, partialConfig.execution ?? {}),
  };

  // Pass through AI config if present
  if (partialConfig.ai !== undefined) {
    config.ai = partialConfig.ai;
  }

  return config;
}

/**
 * Get the default repository from config.
 * 
 * @param config - Application config
 * @returns Default repository config or first repository
 */
export function getDefaultRepository(config: AppConfig): RepositoryConfig | null {
  if (config.repositories.length === 0) {
    return null;
  }
  
  const defaultRepo = config.repositories.find(r => r.default);
  if (defaultRepo !== undefined) {
    return defaultRepo;
  }
  const firstRepo = config.repositories[0];
  return firstRepo !== undefined ? firstRepo : null;
}

/**
 * Get a repository by ID.
 * 
 * @param config - Application config
 * @param id - Repository ID
 * @returns Repository config or null
 */
export function getRepositoryById(config: AppConfig, id: string): RepositoryConfig | null {
  const repo = config.repositories.find(r => r.id === id);
  if (repo === undefined) {
    return null;
  }
  return repo;
}

/**
 * Create a configuration for local development (no external git).
 * 
 * This creates a config that uses LocalRepoAdapter instead of GitRepoAdapter.
 */
export function createLocalDevConfig(basePath: string): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    server: {
      ...DEFAULT_CONFIG.server,
      workspaceDir: basePath,
    },
    repositories: [{
      id: 'local',
      default: true,
      git: {
        url: '', // Empty URL signals local mode
        branch: 'main',
        auth: { type: 'none' },
      },
      namespace: {
        baseUri: 'http://localhost:3001/records/',
        prefix: 'local',
      },
      jsonld: { context: 'default' },
      sync: {
        mode: 'manual',
        autoCommit: false,
        autoPush: false,
      },
      records: { directory: 'records' },
    }],
  };
}
