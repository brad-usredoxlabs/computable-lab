/**
 * Server entry point for computable-lab API.
 * 
 * This module:
 * - Initializes all components (schemas, validator, lint engine, store)
 * - Creates Fastify server with routes
 * - Provides both programmatic API and CLI usage
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { resolve, join } from 'node:path';

import { SchemaRegistry, createSchemaRegistry } from './schema/SchemaRegistry.js';
import { loadAllSchemas } from './schema/SchemaLoader.js';
import { AjvValidator, createValidator } from './validation/AjvValidator.js';
import { LintEngine, createLintEngine } from './lint/LintEngine.js';
import { createRepoAdapter } from './repo/createRepoAdapter.js';
import { createLocalRepoAdapter } from './repo/LocalRepoAdapter.js';
import type { RepoAdapter } from './repo/types.js';
import { RecordStoreImpl, createRecordStore } from './store/RecordStoreImpl.js';
import { loadConfig, getDefaultRepository } from './config/loader.js';
import type { AppConfig, RepositoryConfig } from './config/types.js';
import {
  createRecordHandlers,
  createSchemaHandlers,
  createValidationHandlers,
  createGitHandlers,
  createTreeHandlers,
  createLibraryHandlers,
  createOntologyHandlers,
} from './api/handlers/index.js';
import { IndexManager, createIndexManager } from './index/index.js';
import { registerRoutes } from './api/routes.js';
import type { ServerConfig } from './api/types.js';

/**
 * Default server configuration.
 */
const DEFAULT_CONFIG: Required<ServerConfig> = {
  port: 3000,
  host: '0.0.0.0',
  recordsDir: 'records',
  schemaDir: 'schema',
  cors: true,
  logLevel: 'info',
};

/**
 * Application context holding all initialized components.
 */
export interface AppContext {
  schemaRegistry: SchemaRegistry;
  validator: AjvValidator;
  lintEngine: LintEngine;
  repoAdapter: RepoAdapter;
  store: RecordStoreImpl;
  indexManager: IndexManager;
  appConfig?: AppConfig | undefined;
}

/**
 * Initialize all application components.
 */
export async function initializeApp(
  basePath: string,
  config: ServerConfig = {}
): Promise<AppContext> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  
  console.log(`Initializing app with base path: ${basePath}`);
  
  // Try to load configuration from config.yaml
  let appConfig: AppConfig | undefined;
  let repoConfig: RepositoryConfig | undefined;
  
  try {
    appConfig = await loadConfig({
      configPath: process.env.CONFIG_PATH || resolve(basePath, 'config.yaml'),
    });
    repoConfig = getDefaultRepository(appConfig) ?? undefined;
    
    if (repoConfig) {
      console.log(`Loaded repository configuration: ${repoConfig.id}`);
      if (repoConfig.git?.url) {
        console.log(`  Git URL: ${repoConfig.git.url}`);
        console.log(`  Branch: ${repoConfig.git.branch}`);
        console.log(`  Auto-commit: ${repoConfig.sync?.autoCommit ?? false}`);
        console.log(`  Auto-push: ${repoConfig.sync?.autoPush ?? false}`);
      }
    }
  } catch (err) {
    console.log('No config.yaml found or error loading config, using local mode');
  }
  
  // Initialize schema registry
  const schemaRegistry = createSchemaRegistry();
  
  // Load all schemas from schema directory
  const schemaDir = resolve(basePath, opts.schemaDir);
  console.log(`Loading schemas from: ${schemaDir}`);
  
  const loadResult = await loadAllSchemas({
    basePath: schemaDir,
    recursive: true,
  });
  
  if (loadResult.errors.length > 0) {
    console.warn(`Schema loading warnings:`);
    for (const err of loadResult.errors) {
      console.warn(`  - ${err.path}: ${err.error}`);
    }
  }
  
  console.log(`Loaded ${loadResult.entries.length} schemas`);
  
  // Add schemas to registry
  schemaRegistry.addSchemas(loadResult.entries);
  
  // Initialize validator and add schemas
  const validator = createValidator();
  
  // Get topological order for adding schemas (dependencies first)
  const orderedIds = schemaRegistry.getTopologicalOrder();
  for (const id of orderedIds) {
    const entry = schemaRegistry.getById(id);
    if (entry) {
      validator.addSchema(entry.schema, entry.id);
    }
  }
  
  console.log(`Added ${orderedIds.length} schemas to validator`);
  
  // Initialize lint engine
  const lintEngine = createLintEngine();
  
  // Load lint specs (*.lint.yaml files from schema directory)
  // For now, lint specs would be loaded separately if they exist
  // TODO: Load lint specs from schema directory
  
  // Initialize repo adapter based on configuration
  let repoAdapter: RepoAdapter;
  
  if (repoConfig && repoConfig.git?.url) {
    // Use GitRepoAdapter when git URL is configured
    const workspaceDir = appConfig?.server?.workspaceDir || '/tmp/cl-workspaces';
    const workspacePath = join(workspaceDir, repoConfig.id);
    
    repoAdapter = await createRepoAdapter({
      repoConfig,
      workspacePath,
    });
  } else {
    // Fallback to local adapter
    console.log('Using LocalRepoAdapter (no git URL configured)');
    repoAdapter = createLocalRepoAdapter({
      basePath,
    });
  }
  
  // Get records directory from config or use default
  const recordsDir = repoConfig?.records?.directory || opts.recordsDir;
  
  // Initialize record store
  const store = createRecordStore(repoAdapter, validator, lintEngine, {
    baseDir: recordsDir,
  });
  
  // Initialize index manager
  const indexManager = createIndexManager(repoAdapter, {
    baseDir: recordsDir,
  });
  
  // Build initial index
  try {
    await indexManager.rebuild();
    console.log(`Index built with ${indexManager.size()} records`);
  } catch (err) {
    console.warn('Failed to build initial index:', err);
  }
  
  console.log(`App initialized`);
  
  return {
    schemaRegistry,
    validator,
    lintEngine,
    repoAdapter,
    store,
    indexManager,
    appConfig,
  };
}

/**
 * Create and configure a Fastify server.
 */
export async function createServer(
  ctx: AppContext,
  config: ServerConfig = {}
): Promise<ReturnType<typeof Fastify>> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  
  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      level: opts.logLevel,
    },
  });
  
  // Register CORS if enabled
  if (opts.cors) {
    await fastify.register(cors, {
      origin: true,
    });
  }
  
  // Create handlers
  const recordHandlers = createRecordHandlers(ctx.store, ctx.indexManager);
  const schemaHandlers = createSchemaHandlers(ctx.schemaRegistry);
  const validationHandlers = createValidationHandlers(ctx.validator, ctx.lintEngine);
  const gitHandlers = createGitHandlers(ctx.repoAdapter);
  const treeHandlers = createTreeHandlers(ctx.indexManager, ctx.store);
  const libraryHandlers = createLibraryHandlers(ctx.store);
  const ontologyHandlers = createOntologyHandlers();

  // Register API routes with /api prefix
  await fastify.register(async (instance) => {
    registerRoutes(instance, {
      recordHandlers,
      schemaHandlers,
      validationHandlers,
      gitHandlers,
      treeHandlers,
      libraryHandlers,
      ontologyHandlers,
      schemaCount: () => ctx.schemaRegistry.size,
      ruleCount: () => ctx.lintEngine.ruleCount,
    });
  }, { prefix: '/api' });

  // Rebuild library index on startup
  try {
    await libraryHandlers.rebuildIndex();
    console.log('Library index built');
  } catch (err) {
    console.warn('Failed to build library index:', err);
  }
  
  return fastify;
}

/**
 * Start the server.
 */
export async function startServer(
  basePath: string,
  config: ServerConfig = {}
): Promise<void> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  
  try {
    // Initialize app
    const ctx = await initializeApp(basePath, config);
    
    // Create server
    const fastify = await createServer(ctx, config);
    
    // Start listening
    await fastify.listen({
      port: opts.port,
      host: opts.host,
    });
    
    console.log(`Server listening on http://${opts.host}:${opts.port}`);
    console.log(`Schemas loaded: ${ctx.schemaRegistry.size}`);
    console.log(`Lint rules loaded: ${ctx.lintEngine.ruleCount}`);
    
    // Handle shutdown
    const shutdown = async () => {
      console.log('\nShutting down...');
      await fastify.close();
      process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

/**
 * CLI entry point.
 */
async function main() {
  const basePath = process.env.APP_BASE_PATH || process.cwd();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const host = process.env.HOST || '0.0.0.0';
  
  await startServer(basePath, {
    port,
    host,
  });
}

// Run if executed directly
// Note: ESM doesn't have require.main, use import.meta instead
const isMain = process.argv[1]?.endsWith('server.js') || 
               process.argv[1]?.endsWith('server.ts');

if (isMain) {
  main().catch(console.error);
}
