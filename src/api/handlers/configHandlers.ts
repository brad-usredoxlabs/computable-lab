/**
 * Configuration handlers for reading/updating server settings.
 * 
 * Provides endpoints:
 * - GET /config/repository - Get non-sensitive repo config
 * - PUT /config/repository - Update repo config (requires admin key)
 * - POST /config/repository/test - Test connection without saving
 * - GET /config/auth/status - Get auth status (not the actual token)
 * - PUT /config/auth - Update auth credentials (requires admin key)
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { 
  RepositoryConfig, 
  GitAuthConfig,
  SyncConfig,
  NamespaceConfig 
} from '../../config/types.js';

/**
 * Admin key for protected endpoints.
 * In production, this should come from environment variable or config.
 */
const ADMIN_KEY = process.env.COMPUTABLE_LAB_ADMIN_KEY || '';

/**
 * Check if admin key is required and valid.
 */
function validateAdminKey(request: FastifyRequest): boolean {
  // If no admin key is configured, allow all (dev mode)
  if (!ADMIN_KEY) {
    return true;
  }
  const providedKey = request.headers['x-admin-key'] as string;
  return providedKey === ADMIN_KEY;
}

/**
 * Repository config response (non-sensitive).
 */
export interface RepoConfigResponse {
  id: string;
  git: {
    url: string;
    branch: string;
  };
  namespace: NamespaceConfig;
  sync: SyncConfig;
  records: {
    directory: string;
  };
}

/**
 * Auth status response (write-only pattern).
 */
export interface AuthStatusResponse {
  type: 'token' | 'github-app' | 'ssh-key' | 'none';
  configured: boolean;
  lastValidated?: string;
  valid?: boolean;
}

/**
 * Connection test result.
 */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: {
    canConnect: boolean;
    canAuth: boolean;
    branchExists: boolean;
  };
}

/**
 * Context for config handlers.
 */
export interface ConfigContext {
  /** Get current repository config */
  getRepoConfig: () => RepositoryConfig | undefined;
  /** Update repository config */
  updateRepoConfig?: (config: Partial<RepositoryConfig>) => Promise<void>;
  /** Test repository connection */
  testConnection?: (url: string, branch: string, auth?: GitAuthConfig) => Promise<ConnectionTestResult>;
  /** Validate current auth */
  validateAuth?: () => Promise<boolean>;
  /** Last auth validation time */
  lastAuthValidation?: Date;
}

/**
 * Create config handlers.
 */
export function createConfigHandlers(ctx: ConfigContext) {
  /**
   * GET /config/repository - Get repository configuration.
   */
  async function getRepoConfig(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<RepoConfigResponse | { error: string }> {
    const config = ctx.getRepoConfig();
    
    if (!config) {
      return reply.status(404).send({ error: 'No repository configured' });
    }
    
    // Return non-sensitive config only
    const response: RepoConfigResponse = {
      id: config.id,
      git: {
        url: redactUrl(config.git.url),
        branch: config.git.branch,
      },
      namespace: config.namespace,
      sync: config.sync,
      records: config.records,
    };
    
    return reply.send(response);
  }

  /**
   * PUT /config/repository - Update repository configuration.
   */
  async function updateRepoConfigHandler(
    request: FastifyRequest<{
      Body: {
        git?: { url?: string; branch?: string };
        namespace?: Partial<NamespaceConfig>;
        sync?: Partial<SyncConfig>;
        records?: { directory?: string };
      };
    }>,
    reply: FastifyReply
  ) {
    // Check admin authorization
    if (!validateAdminKey(request)) {
      return reply.status(401).send({ error: 'Admin key required' });
    }

    if (!ctx.updateRepoConfig) {
      return reply.status(501).send({ error: 'Config update not supported' });
    }

    const body = request.body;
    const currentConfig = ctx.getRepoConfig();

    if (!currentConfig) {
      return reply.status(404).send({ error: 'No repository configured' });
    }

    try {
      // Build update object
      const updates: Partial<RepositoryConfig> = {};

      if (body.git) {
        updates.git = {
          ...currentConfig.git,
          ...(body.git.url && { url: body.git.url }),
          ...(body.git.branch && { branch: body.git.branch }),
        };
      }

      if (body.namespace) {
        updates.namespace = {
          ...currentConfig.namespace,
          ...body.namespace,
        };
      }

      if (body.sync) {
        updates.sync = {
          ...currentConfig.sync,
          ...body.sync,
        };
      }

      if (body.records) {
        updates.records = {
          ...currentConfig.records,
          ...body.records,
        };
      }

      await ctx.updateRepoConfig(updates);

      return reply.send({ 
        success: true, 
        message: 'Configuration updated',
        requiresRestart: false, // Config hot-reloaded
      });
    } catch (err) {
      return reply.status(500).send({ 
        error: err instanceof Error ? err.message : 'Update failed' 
      });
    }
  }

  /**
   * POST /config/repository/test - Test repository connection.
   */
  async function testRepoConnection(
    request: FastifyRequest<{
      Body: {
        url: string;
        branch: string;
        auth?: GitAuthConfig;
      };
    }>,
    reply: FastifyReply
  ) {
    // Check admin authorization
    if (!validateAdminKey(request)) {
      return reply.status(401).send({ error: 'Admin key required' });
    }

    if (!ctx.testConnection) {
      return reply.status(501).send({ error: 'Connection test not supported' });
    }

    const { url, branch, auth } = request.body;

    if (!url) {
      return reply.status(400).send({ error: 'URL is required' });
    }

    try {
      const result = await ctx.testConnection(url, branch || 'main', auth);
      return reply.send(result);
    } catch (err) {
      return reply.send({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed',
      });
    }
  }

  /**
   * GET /config/auth/status - Get authentication status.
   */
  async function getAuthStatus(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<AuthStatusResponse> {
    const config = ctx.getRepoConfig();

    if (!config) {
      return reply.send({
        type: 'none',
        configured: false,
      });
    }

    const auth = config.git.auth;
    const response: AuthStatusResponse = {
      type: auth.type,
      configured: isAuthConfigured(auth),
    };

    // Add validation info if available
    if (ctx.lastAuthValidation) {
      response.lastValidated = ctx.lastAuthValidation.toISOString();
    }

    // Optionally validate current auth
    if (ctx.validateAuth && response.configured) {
      try {
        response.valid = await ctx.validateAuth();
      } catch {
        response.valid = false;
      }
    }

    return reply.send(response);
  }

  /**
   * PUT /config/auth - Update authentication credentials.
   */
  async function updateAuth(
    request: FastifyRequest<{
      Body: {
        type: 'token' | 'github-app' | 'ssh-key' | 'none';
        token?: string;
        appId?: string;
        privateKeyPath?: string;
        installationId?: string;
        sshKeyPath?: string;
      };
    }>,
    reply: FastifyReply
  ) {
    // Check admin authorization
    if (!validateAdminKey(request)) {
      return reply.status(401).send({ error: 'Admin key required' });
    }

    if (!ctx.updateRepoConfig) {
      return reply.status(501).send({ error: 'Config update not supported' });
    }

    const currentConfig = ctx.getRepoConfig();
    if (!currentConfig) {
      return reply.status(404).send({ error: 'No repository configured' });
    }

    const body = request.body;
    
    try {
      // Build new auth config
      const newAuth: GitAuthConfig = { type: body.type };

      switch (body.type) {
        case 'token':
          if (!body.token) {
            return reply.status(400).send({ error: 'Token is required' });
          }
          newAuth.token = body.token;
          break;

        case 'github-app':
          if (!body.appId || !body.privateKeyPath || !body.installationId) {
            return reply.status(400).send({ 
              error: 'appId, privateKeyPath, and installationId are required' 
            });
          }
          newAuth.appId = body.appId;
          newAuth.privateKeyPath = body.privateKeyPath;
          newAuth.installationId = body.installationId;
          break;

        case 'ssh-key':
          if (!body.sshKeyPath) {
            return reply.status(400).send({ error: 'sshKeyPath is required' });
          }
          newAuth.sshKeyPath = body.sshKeyPath;
          break;

        case 'none':
          // No additional config needed
          break;
      }

      // Update config with new auth
      await ctx.updateRepoConfig({
        git: {
          ...currentConfig.git,
          auth: newAuth,
        },
      });

      return reply.send({
        success: true,
        message: 'Authentication updated',
        type: body.type,
        configured: body.type !== 'none',
      });
    } catch (err) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'Update failed',
      });
    }
  }

  return {
    getRepoConfig,
    updateRepoConfig: updateRepoConfigHandler,
    testRepoConnection,
    getAuthStatus,
    updateAuth,
  };
}

/**
 * Check if auth is configured.
 */
function isAuthConfigured(auth: GitAuthConfig): boolean {
  switch (auth.type) {
    case 'token':
      return Boolean(auth.token);
    case 'github-app':
      return Boolean(auth.appId && auth.privateKeyPath && auth.installationId);
    case 'ssh-key':
      return Boolean(auth.sshKeyPath);
    case 'none':
      return false;
    default:
      return false;
  }
}

/**
 * Redact sensitive parts of a URL.
 */
function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username) {
      parsed.username = '***';
    }
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export type ConfigHandlers = ReturnType<typeof createConfigHandlers>;
