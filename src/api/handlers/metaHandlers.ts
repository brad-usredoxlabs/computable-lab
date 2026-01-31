/**
 * Meta handlers for server information and operations.
 * 
 * Provides endpoints:
 * - GET /meta - Server metadata and status
 * - POST /sync - Force sync with remote repository
 * - GET /health - Health check for Docker/k8s
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SchemaRegistry } from '../../schema/SchemaRegistry.js';
import type { SchemaOverlayLoader } from '../../schema/SchemaOverlayLoader.js';
import type { GitRepoAdapter } from '../../repo/GitRepoAdapter.js';
import type { RepositoryConfig, NamespaceConfig } from '../../config/types.js';

/**
 * Server version (loaded from package.json in real app).
 */
const SERVER_VERSION = '1.0.0';

/**
 * Server start time for uptime calculation.
 */
const startTime = Date.now();

/**
 * Format uptime in human-readable format.
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Context for meta handlers.
 */
export interface MetaContext {
  /** Schema registry */
  schemaRegistry: SchemaRegistry;
  /** Optional schema overlay loader (for source tracking) */
  schemaOverlayLoader?: SchemaOverlayLoader;
  /** Optional git repo adapter (for sync) */
  gitRepoAdapter?: GitRepoAdapter;
  /** Repository configuration */
  repoConfig?: RepositoryConfig;
  /** Namespace configuration */
  namespace?: NamespaceConfig;
  /** Lint engine rule count */
  getRuleCount: () => number;
}

/**
 * Meta response structure.
 */
export interface ServerMetaResponse {
  server: {
    version: string;
    uptime: string;
    uptimeMs: number;
  };
  repository?: {
    id: string;
    url: string;
    branch: string;
    lastSync?: string;
    status: string;
    ahead?: number;
    behind?: number;
  };
  namespace?: {
    baseUri: string;
    prefix: string;
  };
  schemas: {
    source: 'bundled' | 'bundled+overlay';
    count: number;
    bundledCount?: number;
    overlayCount?: number;
    overriddenCount?: number;
  };
  lint: {
    ruleCount: number;
  };
  jsonld: {
    context: string;
  };
}

/**
 * Sync response structure.
 */
export interface SyncResponse {
  success: boolean;
  pulledCommits?: number;
  pushedCommits?: number;
  error?: string;
  timestamp: string;
}

/**
 * Health response structure.
 */
export interface ServerHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: string;
  checks: {
    schemas: boolean;
    repository?: boolean;
  };
}

/**
 * Create meta handlers.
 */
export function createMetaHandlers(ctx: MetaContext) {
  /**
   * GET /meta - Server metadata and status.
   */
  async function getMeta(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<ServerMetaResponse> {
    const uptimeMs = Date.now() - startTime;
    
    // Base response
    const response: ServerMetaResponse = {
      server: {
        version: SERVER_VERSION,
        uptime: formatUptime(uptimeMs),
        uptimeMs,
      },
      schemas: {
        source: ctx.schemaOverlayLoader ? 'bundled+overlay' : 'bundled',
        count: ctx.schemaRegistry.size,
      },
      lint: {
        ruleCount: ctx.getRuleCount(),
      },
      jsonld: {
        context: 'https://computable-lab.org/context/v1.jsonld',
      },
    };
    
    // Add repository info if available
    if (ctx.repoConfig && ctx.gitRepoAdapter) {
      try {
        const status = await ctx.gitRepoAdapter.getStatus();
        response.repository = {
          id: ctx.repoConfig.id,
          url: redactUrl(ctx.repoConfig.git.url),
          branch: status.branch,
          status: status.isClean ? 'clean' : 'dirty',
          ahead: status.ahead,
          behind: status.behind,
        };
      } catch {
        response.repository = {
          id: ctx.repoConfig.id,
          url: redactUrl(ctx.repoConfig.git.url),
          branch: ctx.repoConfig.git.branch,
          status: 'unknown',
        };
      }
    }
    
    // Add namespace info if available
    if (ctx.namespace) {
      response.namespace = {
        baseUri: ctx.namespace.baseUri,
        prefix: ctx.namespace.prefix,
      };
    }
    
    // Add overlay stats if available
    if (ctx.schemaOverlayLoader) {
      const stats = ctx.schemaOverlayLoader.getStats();
      response.schemas.bundledCount = stats.bundledCount;
      response.schemas.overlayCount = stats.overlayCount;
      response.schemas.overriddenCount = stats.overriddenCount;
    }
    
    return reply.send(response);
  }
  
  /**
   * POST /sync - Force sync with remote repository.
   */
  async function postSync(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<SyncResponse> {
    if (!ctx.gitRepoAdapter) {
      return reply.status(503).send({
        success: false,
        error: 'Git sync not available (using local adapter)',
        timestamp: new Date().toISOString(),
      });
    }
    
    try {
      const result = await ctx.gitRepoAdapter.sync();
      
      return reply.send({
        success: result.success,
        pulledCommits: result.pulledCommits,
        error: result.error,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return reply.status(500).send({
        success: false,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    }
  }
  
  /**
   * GET /health - Health check for Docker/k8s.
   */
  async function getHealth(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<ServerHealthResponse> {
    const checks = {
      schemas: ctx.schemaRegistry.size > 0,
      repository: true,
    };
    
    // Check repository if available
    if (ctx.gitRepoAdapter) {
      try {
        await ctx.gitRepoAdapter.getStatus();
        checks.repository = true;
      } catch {
        checks.repository = false;
      }
    }
    
    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (!checks.schemas) {
      status = 'unhealthy';  // No schemas = critical failure
    } else if (!checks.repository) {
      status = 'degraded';   // Repo issues = degraded but functional
    } else {
      status = 'healthy';
    }
    
    const response: ServerHealthResponse = {
      status,
      uptime: formatUptime(Date.now() - startTime),
      checks,
    };
    
    // Return 200 for healthy/degraded, 503 for unhealthy
    const statusCode = status === 'unhealthy' ? 503 : 200;
    return reply.status(statusCode).send(response);
  }
  
  return {
    getMeta,
    postSync,
    getHealth,
  };
}

/**
 * Redact sensitive parts of a URL (tokens, passwords).
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

export type MetaHandlers = ReturnType<typeof createMetaHandlers>;
