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
import multipart from '@fastify/multipart';
import { resolve, join } from 'node:path';

import { SchemaRegistry, createSchemaRegistry } from './schema/SchemaRegistry.js';
import { loadAllSchemas } from './schema/SchemaLoader.js';
import { AjvValidator, createValidator } from './validation/AjvValidator.js';
import { LintEngine, createLintEngine } from './lint/LintEngine.js';
import { loadAllLintSpecs } from './lint/LintSpecLoader.js';
import { PredicateRegistry, loadPredicateRegistry } from './registry/PredicateRegistry.js';
import { createRepoAdapter, isGitRepoAdapter } from './repo/createRepoAdapter.js';
import { createLocalRepoAdapter } from './repo/LocalRepoAdapter.js';
import type { RepoAdapter } from './repo/types.js';
import { RecordStoreImpl, createRecordStore } from './store/RecordStoreImpl.js';
import { resolveSeedRecordsDir } from './index/seedRecordsDir.js';
import { loadConfig, getDefaultRepository } from './config/loader.js';
import { DEFAULT_CONFIG as DEFAULT_APP_CONFIG, type AppConfig, type RepositoryConfig, resolveAiProfile } from './config/types.js';
import {
  createRecordHandlers,
  createSchemaHandlers,
  createValidationHandlers,
  createGitHandlers,
  createTreeHandlers,
  createLibraryHandlers,
  createOntologyHandlers,
  createAIHandlers,
  createMetaHandlers,
  ConfigHandlers,
  createProtocolHandlers,
  createComponentHandlers,
  createExecutionHandlers,
  createMeasurementHandlers,
  createBiosourceHandlers,
  createKnowledgeAIHandlers,
  createTagHandlers,
  createMaterialPrepHandlers,
  createMaterialLifecycleHandlers,
  createSemanticsHandlers,
  createPlatformHandlers,
  createLabSettingsHandlers,
  createVendorSearchHandlers,
  createVendorDocumentHandlers,
  createChemistryHandlers,
  createIngestionHandlers,
  createRunWorkspaceHandlers,
  createRecordSearchHandlers,
} from './api/handlers/index.js';
import { createIngestionAIHandlers } from './api/handlers/IngestionAIHandlers.js';
import { createMaterialAIHandlers } from './api/handlers/MaterialAIHandlers.js';
import { createAiIngestionHandlers } from './api/handlers/AiIngestionHandlers.js';
import { IndexManager, createIndexManager } from './index/index.js';
import { createUISpecLoader, loadAllUISpecs, type UISpecLoader } from './ui/UISpecLoader.js';
import { createUIHandlers } from './api/handlers/UIHandlers.js';
import { registerRoutes } from './api/routes.js';
import type { ServerConfig } from './api/types.js';
import { resolveGitHubIdentity, type ResolvedIdentity } from './identity/GitHubIdentity.js';
import { createMcpServer, mcpPlugin } from './mcp/index.js';
import {
  ToolRegistry,
  createInferenceClient,
  createToolBridge,
  createAgentOrchestrator,
  testInferenceEndpoint,
  RunContextAssembler,
} from './ai/index.js';
import { createRunDraftHandlers } from './api/handlers/RunDraftHandlers.js';
import { createRelatedRecordsHandlers } from './api/handlers/RelatedRecordsHandlers.js';
import { createAiRecordDraftHandlers } from './api/handlers/AiRecordDraftHandlers.js';
import { createReadinessHandlers } from './api/handlers/ReadinessHandlers.js';
import { createExtractHandlers } from './api/handlers/ExtractHandlers.js';
import { ExtractionRunnerService } from './extract/ExtractionRunnerService.js';
import { ExtractionMetrics } from './extract/ExtractionMetrics.js';
import { OpenAICompatibleExtractor } from './extract/OpenAICompatibleExtractor.js';
import { MentionCandidatePopulator } from './extract/MentionCandidatePopulator.js';
import { findMatchingLibraryExtractor } from './extract/LibraryExtractorMatcher.js';
import type { AIHandlers } from './api/handlers/AIHandlers.js';
import type { KnowledgeAIHandlers } from './api/handlers/KnowledgeAIHandlers.js';
import type { AiRecordDraftHandlers } from './api/handlers/AiRecordDraftHandlers.js';
import type { ExtractHandlers } from './api/handlers/ExtractHandlers.js';
import { loadPlatformRegistry } from './platform-registry/YamlPlatformRegistryLoader.js';
import type { PlatformRegistry } from './platform-registry/PlatformRegistry.js';
import { ArtifactBlobStore } from './ingestion/ArtifactBlobStore.js';
import { LifecycleEngine, loadLifecyclesFromDir } from './lifecycle/index.js';
import { PolicyBundleService } from './policy/PolicyBundleService.js';
import { createLabwareLookup } from './ai/compiler/labwareLookup.js';
import type { ExtractorAdapter } from './extract/ExtractorAdapter.js';

/**
 * Null extractor that returns empty results with a diagnostic.
 * Used when the extractor profile is missing or disabled.
 */
function nullExtractor(reason: string): ExtractorAdapter {
  return {
    async extract() {
      return {
        candidates: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'CONFIG_MISSING',
            message: reason,
          },
        ],
      };
    },
  };
}

/**
 * Default server configuration.
 */
const DEFAULT_CONFIG: Required<ServerConfig> = {
  port: 3001,
  host: '0.0.0.0',
  recordsDir: 'records',
  schemaDir: 'schema',
  cors: true,
  bodyLimit: 25 * 1024 * 1024,
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
  uiSpecLoader: UISpecLoader;
  workspaceRoot: string;
  recordsDir: string;
  schemaDir: string;
  appConfig?: AppConfig | undefined;
  configPath?: string | undefined;
  predicateRegistry?: PredicateRegistry | undefined;
  identity?: ResolvedIdentity | undefined;
  platformRegistry: PlatformRegistry;
  lifecycleEngine: LifecycleEngine;
  policyBundleService: PolicyBundleService;
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
  const configPath = process.env.CONFIG_PATH || resolve(basePath, 'config.yaml');

  try {
    appConfig = await loadConfig({ configPath });
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
    appConfig = { ...DEFAULT_APP_CONFIG };
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

  // Load predicate registry
  let predicateRegistry: PredicateRegistry | undefined;
  const registryPath = resolve(schemaDir, 'registry/predicates.registry.yaml');
  try {
    predicateRegistry = loadPredicateRegistry(registryPath);
    console.log(`Loaded ${predicateRegistry.size} predicates from registry`);
  } catch (err) {
    console.warn('Failed to load predicate registry:', err instanceof Error ? err.message : err);
  }

  // Load lint specs (*.lint.yaml files from schema directory)
  const lintLoadResult = await loadAllLintSpecs({ basePath: schemaDir, recursive: true });

  if (lintLoadResult.errors.length > 0) {
    console.warn('Lint spec loading warnings:');
    for (const err of lintLoadResult.errors) {
      console.warn(`  - ${err.path}: ${err.error}`);
    }
  }

  // Inject predicate registry IDs into the approved-predicate rule before adding to engine
  let lintSpecCount = 0;
  let lintRuleCount = 0;
  for (const { name, spec } of lintLoadResult.specs) {
    if (spec.rules.length === 0) continue;

    // Inject registry values into the approved-predicate rule
    if (predicateRegistry) {
      for (const rule of spec.rules) {
        if (rule.id === 'approved-predicate' && rule.assert.op === 'in') {
          (rule.assert as { values: string[] }).values = predicateRegistry.getAllIds();
        }
      }
    }

    lintEngine.addSpec(name, spec);
    lintSpecCount++;
    lintRuleCount += spec.rules.length;
  }

  console.log(`Loaded ${lintSpecCount} lint specs, ${lintRuleCount} rules`);
  
  // Initialize lifecycle engine and load lifecycle specs
  const lifecycleEngine = new LifecycleEngine()
  const lifecycleDir = resolve(schemaDir, 'core/lifecycles')
  const loadedCount = loadLifecyclesFromDir(lifecycleDir, lifecycleEngine)
  console.log(`Loaded ${loadedCount} lifecycle specs`)

  // Initialize policy bundle service and load bundles
  const policyBundleService = new PolicyBundleService()
  const bundleDir = resolve(schemaDir, 'core/policy-bundles')
  const bundleCount = policyBundleService.loadFromDir(bundleDir)
  console.log(`Loaded ${bundleCount} policy bundles`)

  // Initialize repo adapter based on configuration
  let repoAdapter: RepoAdapter;
  let workspaceRoot = basePath;
  
  if (repoConfig && repoConfig.git?.url) {
    // Use GitRepoAdapter when git URL is configured
    const workspaceDir = appConfig?.server?.workspaceDir || '/tmp/cl-workspaces';
    const workspacePath = join(workspaceDir, repoConfig.id);
    workspaceRoot = workspacePath;
    
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
    workspaceRoot = basePath;
  }
  
  // Resolve GitHub identity from PAT (if configured)
  let identity: ResolvedIdentity | undefined;
  if (repoConfig?.git?.auth?.type === 'token' && repoConfig.git.auth.token) {
    identity = await resolveGitHubIdentity(repoConfig.git.auth.token);
    console.log(`Resolved identity: ${identity.username}`);
  }

  // Get records directory from config or use default
  const recordsDir = repoConfig?.records?.directory || opts.recordsDir;

  // Initialize record store (use resolved identity for git commits)
  const seedDir = resolveSeedRecordsDir();
  const store = createRecordStore(repoAdapter, validator, lintEngine, {
    baseDir: recordsDir,
    author: identity?.username ?? 'record-store',
    email: identity?.email ?? 'store@computable-lab.com',
    ...(seedDir ? { seedDir } : {}),
  });
  
  // Initialize index manager
  const indexManager = createIndexManager(repoAdapter, {
    baseDir: recordsDir,
  });
  
  // Load UI specs (*.ui.yaml files from schema directory)
  const uiSpecLoader = createUISpecLoader();
  const uiLoadResult = await loadAllUISpecs(uiSpecLoader, schemaDir);
  if (uiLoadResult.errors.length > 0) {
    console.warn('UI spec loading warnings:');
    for (const err of uiLoadResult.errors) {
      console.warn(`  - ${err.path}: ${err.error}`);
    }
  }
  console.log(`Loaded ${uiLoadResult.loaded} UI specs`);

  const { registry: platformRegistry, source: platformRegistrySource } = await loadPlatformRegistry(basePath);
  console.log(`Loaded ${platformRegistry.listPlatforms().length} platform manifests from ${platformRegistrySource}`);

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
    uiSpecLoader,
    workspaceRoot,
    recordsDir,
    schemaDir,
    appConfig,
    configPath,
    predicateRegistry,
    identity,
    platformRegistry,
    lifecycleEngine,
    policyBundleService,
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
    bodyLimit: opts.bodyLimit,
  });
  
  // Register CORS if enabled
  if (opts.cors) {
    await fastify.register(cors, {
      origin: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
  }

  // Register multipart support for file uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024, // 25 MB — match JSON bodyLimit
      files: 5,
    },
  });

  // Create handlers
  const recordHandlers = createRecordHandlers(
    ctx.store,
    ctx.indexManager,
    ctx.identity,
    () => ctx.appConfig?.lab?.materialTracking,
    ctx.lifecycleEngine,
  );
  const schemaHandlers = createSchemaHandlers(ctx.schemaRegistry);
  const validationHandlers = createValidationHandlers(ctx.validator, ctx.lintEngine);
  const gitHandlers = createGitHandlers(ctx.repoAdapter);
  const treeHandlers = createTreeHandlers(ctx.indexManager, ctx.store, ctx.platformRegistry);
  const libraryHandlers = createLibraryHandlers(ctx.store);
  const ontologyHandlers = createOntologyHandlers();
  const vendorSearchHandlers = createVendorSearchHandlers();
  const vendorDocumentHandlers = createVendorDocumentHandlers(ctx.store);
  const chemistryHandlers = createChemistryHandlers();
  const tagHandlers = createTagHandlers(ctx.store);
  const materialPrepHandlers = createMaterialPrepHandlers(ctx.store, ctx.indexManager);
  const materialLifecycleHandlers = createMaterialLifecycleHandlers(ctx.store, ctx.indexManager);
  const semanticsHandlers = createSemanticsHandlers(ctx);
  const runWorkspaceHandlers = createRunWorkspaceHandlers(ctx);
  const runContextAssembler = new RunContextAssembler(ctx.store);
  const platformHandlers = createPlatformHandlers(ctx.platformRegistry);
  const labSettingsHandlers = createLabSettingsHandlers(ctx.appConfig, ctx.policyBundleService);
  const uiHandlers = createUIHandlers(ctx.uiSpecLoader, ctx.store, ctx.schemaRegistry);

  // Build extraction infrastructure: extractor factory, populator, runner
  const extractorProfile = ctx.appConfig?.ai?.extractor;
  const extractorFactory = (targetKind: string): ExtractorAdapter => {
    if (!extractorProfile || !extractorProfile.enabled) {
      return nullExtractor('extractor profile missing or disabled');
    }
    return new OpenAICompatibleExtractor({
      config: extractorProfile,
    });
  };
  const populator = new MentionCandidatePopulator({ store: ctx.store });
  const metrics = new ExtractionMetrics();
  const runner = new ExtractionRunnerService({
    extractorFactory,
    populator,
    pipelinePath: join(ctx.schemaDir, 'registry/compile-pipelines/extraction-compile.yaml'),
    libraryMatcher: (fileName, content) =>
      findMatchingLibraryExtractor({ fileName, contentPreview: content }),
    metrics,
  });
  const extractHandlers = createExtractHandlers(runner, ctx.store, ctx.schemaRegistry, ctx.validator, metrics);

  const ingestionHandlers = createIngestionHandlers(
    ctx.store,
    new ArtifactBlobStore(ctx.workspaceRoot, join(ctx.recordsDir, '.ingestion-artifacts')),
    runner,
  );

  // Create meta handlers
  const repoConfig = ctx.appConfig ? getDefaultRepository(ctx.appConfig) ?? undefined : undefined;
  const metaHandlers = createMetaHandlers({
    schemaRegistry: ctx.schemaRegistry,
    getRuleCount: () => ctx.lintEngine.ruleCount,
    ...(isGitRepoAdapter(ctx.repoAdapter) ? { gitRepoAdapter: ctx.repoAdapter } : {}),
    ...(repoConfig ? { repoConfig, namespace: repoConfig.namespace } : {}),
  });

  // Create protocol, execution, and measurement handlers
  const protocolHandlers = createProtocolHandlers(ctx);
  const componentHandlers = createComponentHandlers(ctx);
  const executionHandlers = createExecutionHandlers(ctx);
  const measurementHandlers = createMeasurementHandlers(ctx);

  // Create tool registry for dual-registration (MCP + agent)
  const toolRegistry = new ToolRegistry();

  // Register MCP server on /mcp (also populates toolRegistry)
  const mcpServer = createMcpServer(ctx, toolRegistry);
  await fastify.register(mcpPlugin, { prefix: '/mcp', mcpServer });

  // Create bio-source proxy handlers (uses populated toolRegistry)
  const biosourceHandlers = createBiosourceHandlers(toolRegistry);

  // Initialize AI runtime state and hot-reload on config changes.
  let aiHandlersImpl: ReturnType<typeof createAIHandlers> | undefined;
  let knowledgeAIHandlersImpl: ReturnType<typeof createKnowledgeAIHandlers> | undefined;
  let ingestionAIHandlersImpl = createIngestionAIHandlers(undefined, ctx.store);
  let materialAIHandlersImpl = createMaterialAIHandlers(undefined, ctx.store);
  let aiIngestionHandlersImpl = createAiIngestionHandlers(undefined, undefined, ctx.store);
  let aiRecordDraftHandlersImpl: ReturnType<typeof createAiRecordDraftHandlers> | undefined;
  let currentOrchestrator: import('./ai/types.js').AgentOrchestrator | undefined;
  let aiInfo: {
    available: boolean;
    inferenceUrl: string;
    model: string;
    provider?: string;
    error?: string;
  } | undefined;

  const initializeAiRuntime = async (appConfig: AppConfig | undefined) => {
    aiHandlersImpl = undefined;
    knowledgeAIHandlersImpl = undefined;
    ingestionAIHandlersImpl = createIngestionAIHandlers(undefined, ctx.store);
    materialAIHandlersImpl = createMaterialAIHandlers(undefined, ctx.store);
    aiIngestionHandlersImpl = createAiIngestionHandlers(undefined, undefined, ctx.store);
    aiRecordDraftHandlersImpl = undefined;
    currentOrchestrator = undefined;
    aiInfo = undefined;

    const aiConfig = appConfig?.ai;
    if (!aiConfig?.inference?.baseUrl) {
      return;
    }

    const profile = resolveAiProfile(aiConfig);
    const inferenceConfig = profile.inference;
    const agentConfig = profile.agent ?? {};

    const probe = await testInferenceEndpoint(inferenceConfig.baseUrl, inferenceConfig.apiKey);
    aiInfo = {
      available: probe.available,
      inferenceUrl: inferenceConfig.baseUrl,
      model: inferenceConfig.model,
      ...(inferenceConfig.provider ? { provider: inferenceConfig.provider } : {}),
      ...(probe.error ? { error: probe.error } : {}),
    };

    if (!probe.available) {
      console.warn(`AI agent disabled — inference endpoint not reachable: ${probe.error}`);
      return;
    }

    try {
      const inferenceClient = createInferenceClient(inferenceConfig);
      const toolBridge = createToolBridge(toolRegistry);
      
      // Create ExtractionRunnerService for the chatbot-compile pipeline
      // Note: This is a minimal setup - the actual extractor factory and other deps
      // would need to be wired up from the full extraction infrastructure
      const extractionService = new ExtractionRunnerService({
        extractorFactory: (_targetKind: string) => {
          // Placeholder - in production this would return a real ExtractorAdapter
          throw new Error('ExtractionRunnerService extractorFactory not fully wired up');
        },
        pipelinePath: '../../../schema/registry/compile-pipelines/extraction-compile.yaml',
      } as any);
      
      // Placeholder deps - stub functions that return null
      // A follow-up spec will wire real fetchers
      const placeholderDeps = {
        fetchMaterialSpec: async (_id: string) => null,
        fetchAliquot: async (_id: string) => null,
        fetchMaterial: async (_id: string) => null,
        fetchLabware: async (_id: string) => null,
        fetchProtocol: async (_id: string) => null,
        fetchGraphComponent: async (_id: string) => null,
        searchLabwareByHint: createLabwareLookup(ctx.store),
        extractionService,
        llmClient: inferenceClient,
      };
      
      const orchestrator = createAgentOrchestrator(
        inferenceClient,
        toolBridge,
        inferenceConfig,
        agentConfig,
        placeholderDeps,
      );
      currentOrchestrator = orchestrator;
      aiHandlersImpl = createAIHandlers(orchestrator);
      ingestionAIHandlersImpl = createIngestionAIHandlers(orchestrator, ctx.store);
      materialAIHandlersImpl = createMaterialAIHandlers(orchestrator, ctx.store);
      aiIngestionHandlersImpl = createAiIngestionHandlers(inferenceClient, inferenceConfig.model, ctx.store);
      aiRecordDraftHandlersImpl = createAiRecordDraftHandlers(
        ctx.schemaRegistry,
        ctx.uiSpecLoader,
        appConfig,
      );

      const knowledgeAgentConfig: typeof agentConfig = {
        ...agentConfig,
        systemPromptPath: 'prompts/knowledge-extraction-agent.md',
      };
      knowledgeAIHandlersImpl = createKnowledgeAIHandlers(
        inferenceClient,
        toolBridge,
        inferenceConfig,
        knowledgeAgentConfig,
        ctx.predicateRegistry?.formatForPrompt() ?? '',
      );

      aiInfo = {
        available: true,
        inferenceUrl: inferenceConfig.baseUrl,
        model: inferenceConfig.model,
        ...(inferenceConfig.provider ? { provider: inferenceConfig.provider } : {}),
      };

      console.log(`AI agent initialized (model: ${inferenceConfig.model}, tools: ${toolRegistry.size})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      aiInfo = {
        available: false,
        inferenceUrl: inferenceConfig.baseUrl,
        model: inferenceConfig.model,
        ...(inferenceConfig.provider ? { provider: inferenceConfig.provider } : {}),
        error: message,
      };
      console.warn(`AI agent disabled — initialization failed: ${message}`);
    }
  };

  await initializeAiRuntime(ctx.appConfig);

  const aiUnavailableMessage = () => {
    if (!ctx.appConfig?.ai?.inference?.baseUrl) {
      return 'AI is not configured. Open Settings and add provider, model, and API key.';
    }
    return aiInfo?.error
      ? `AI is currently unavailable: ${aiInfo.error}`
      : 'AI is currently unavailable. Check provider, model, API key, and endpoint.';
  };

  const aiHandlers: AIHandlers = {
    async draftEvents(request, reply) {
      if (!aiHandlersImpl) {
        reply.status(503);
        return { error: 'AI_UNAVAILABLE', message: aiUnavailableMessage() };
      }
      return aiHandlersImpl.draftEvents(request, reply);
    },
    async draftEventsStream(request, reply) {
      if (!aiHandlersImpl) {
        reply.status(503);
        await reply.send({ error: 'AI_UNAVAILABLE', message: aiUnavailableMessage() });
        return;
      }
      return aiHandlersImpl.draftEventsStream(request, reply);
    },
    async assistStream(request, reply) {
      if (!aiHandlersImpl) {
        reply.status(503);
        await reply.send({ error: 'AI_UNAVAILABLE', message: aiUnavailableMessage() });
        return;
      }
      return aiHandlersImpl.assistStream(request, reply);
    },
  };

  const knowledgeAIHandlers: KnowledgeAIHandlers = {
    async extractKnowledge(request, reply) {
      if (!knowledgeAIHandlersImpl) {
        reply.status(503);
        return { error: 'AI_UNAVAILABLE', message: aiUnavailableMessage() };
      }
      return knowledgeAIHandlersImpl.extractKnowledge(request, reply);
    },
    async extractKnowledgeStream(request, reply) {
      if (!knowledgeAIHandlersImpl) {
        reply.status(503);
        await reply.send({ error: 'AI_UNAVAILABLE', message: aiUnavailableMessage() });
        return;
      }
      return knowledgeAIHandlersImpl.extractKnowledgeStream(request, reply);
    },
  };

  const aiRecordDraftHandlers: AiRecordDraftHandlers = {
    async draftRecord(request, reply) {
      if (!aiRecordDraftHandlersImpl) {
        reply.status(503);
        return { success: false, error: 'AI_UNAVAILABLE', message: aiUnavailableMessage() };
      }
      return aiRecordDraftHandlersImpl.draftRecord(request, reply);
    },
  };

  // Create config handlers — always available so the UI can add repos
  // even when no config.yaml exists yet (it will be created on first PATCH).
  const configHandlers = new ConfigHandlers(
    ctx.configPath ?? resolve(process.cwd(), 'config.yaml'),
    ctx.appConfig ?? { ...DEFAULT_APP_CONFIG },
    async (updated) => {
      ctx.appConfig = updated;
      await initializeAiRuntime(updated);
    },
    () => aiInfo,
  );

  // Create run-centered draft/accept handlers
  const runDraftHandlers = createRunDraftHandlers({
    store: ctx.store,
    contextAssembler: runContextAssembler,
    validator: ctx.validator,
    lintEngine: ctx.lintEngine,
    getOrchestrator: () => currentOrchestrator,
  });

  const relatedRecordsHandlers = createRelatedRecordsHandlers(ctx.store);
  const recordSearchHandlers = createRecordSearchHandlers(
    ctx.store,
    ctx.appConfig ?? DEFAULT_APP_CONFIG,
    ctx.schemaRegistry,
  );
  const readinessHandlers = createReadinessHandlers(ctx);

  // Register API routes with /api prefix
  await fastify.register(async (instance) => {
    const routeOpts: import('./api/routes.js').RouteOptions = {
      recordHandlers,
      recordSearchHandlers,
      relatedRecordsHandlers,
      schemaHandlers,
      validationHandlers,
      uiHandlers,
      gitHandlers,
      treeHandlers,
      libraryHandlers,
      ontologyHandlers,
      vendorSearchHandlers,
      vendorDocumentHandlers,
      chemistryHandlers,
      ingestionHandlers,
      tagHandlers,
      materialPrepHandlers,
      materialLifecycleHandlers,
      semanticsHandlers,
      runWorkspaceHandlers,
      runDraftHandlers,
      platformHandlers,
      labSettingsHandlers,
      metaHandlers,
      protocolHandlers,
      componentHandlers,
      executionHandlers,
      measurementHandlers,
      biosourceHandlers,
      readinessHandlers,
      schemaCount: () => ctx.schemaRegistry.size,
      ruleCount: () => ctx.lintEngine.ruleCount,
      uiSpecCount: () => ctx.uiSpecLoader.size(),
    };
    routeOpts.aiHandlers = aiHandlers;
    routeOpts.knowledgeAIHandlers = knowledgeAIHandlers;
    routeOpts.ingestionAIHandlers = ingestionAIHandlersImpl;
    routeOpts.aiIngestionHandlers = aiIngestionHandlersImpl;
    routeOpts.materialAIHandlers = materialAIHandlersImpl;
    routeOpts.aiRecordDraftHandlers = aiRecordDraftHandlers;
    routeOpts.extractHandlers = extractHandlers;
    if (aiInfo) routeOpts.aiInfo = aiInfo;
    routeOpts.getAiInfo = () => aiInfo;
    routeOpts.configHandlers = configHandlers;
    registerRoutes(instance, routeOpts);
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
    console.log(`UI specs loaded: ${ctx.uiSpecLoader.size()}`);
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
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
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
