/**
 * Route configuration for the API.
 * 
 * This module registers all API routes on a Fastify instance.
 * Route handlers are thin wrappers with no schema-specific logic.
 */

import type { FastifyInstance } from 'fastify';
import type { RecordHandlers } from './handlers/RecordHandlers.js';
import type { SchemaHandlers } from './handlers/SchemaHandlers.js';
import type { ValidationHandlers } from './handlers/ValidationHandlers.js';
import type { UIHandlers } from './handlers/UIHandlers.js';
import type { GitHandlers } from './handlers/GitHandlers.js';
import type { TreeHandlers } from './handlers/TreeHandlers.js';
import type { LibraryHandlers } from './handlers/LibraryHandlers.js';
import type { OntologyHandlers } from './handlers/OntologyHandlers.js';
import type { AIHandlers } from './handlers/AIHandlers.js';
import type { ConfigHandlers } from './handlers/configHandlers.js';
import type { MetaHandlers } from './handlers/metaHandlers.js';
import type { ProtocolHandlers } from './handlers/ProtocolHandlers.js';
import type { ExecutionHandlers } from './handlers/ExecutionHandlers.js';
import type { MeasurementHandlers } from './handlers/MeasurementHandlers.js';
import type { HealthResponse } from './types.js';

/**
 * Options for registering routes.
 */
export interface RouteOptions {
  recordHandlers: RecordHandlers;
  schemaHandlers: SchemaHandlers;
  validationHandlers: ValidationHandlers;
  uiHandlers?: UIHandlers;
  gitHandlers?: GitHandlers;
  treeHandlers?: TreeHandlers;
  libraryHandlers?: LibraryHandlers;
  ontologyHandlers?: OntologyHandlers;
  aiHandlers?: AIHandlers;
  configHandlers?: ConfigHandlers;
  metaHandlers?: MetaHandlers;
  protocolHandlers?: ProtocolHandlers;
  executionHandlers?: ExecutionHandlers;
  measurementHandlers?: MeasurementHandlers;
  schemaCount: () => number;
  ruleCount: () => number;
  uiSpecCount?: () => number;
  aiInfo?: { available: boolean; inferenceUrl: string; model: string };
  getAiInfo?: () => { available: boolean; inferenceUrl: string; model: string } | undefined;
}

/**
 * Register all API routes on a Fastify instance.
 */
export function registerRoutes(
  fastify: FastifyInstance,
  options: RouteOptions
): void {
  const {
    recordHandlers,
    schemaHandlers,
    validationHandlers,
    schemaCount,
    ruleCount,
  } = options;
  
  // ============================================================================
  // Health Check
  // ============================================================================
  
  fastify.get('/health', async (): Promise<HealthResponse> => {
    const components: HealthResponse['components'] = {
      schemas: { loaded: schemaCount() },
      lintRules: { loaded: ruleCount() },
    };
    const currentAiInfo = options.getAiInfo?.() ?? options.aiInfo;
    if (currentAiInfo) {
      components!.ai = currentAiInfo;
    }
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      components,
    };
  });
  
  // ============================================================================
  // Meta Routes (optional - requires metaHandlers)
  // ============================================================================

  const { metaHandlers } = options;

  if (metaHandlers) {
    fastify.get('/meta', metaHandlers.getMeta);
    fastify.post('/sync', metaHandlers.postSync);
  }

  // ============================================================================
  // Record Routes
  // ============================================================================
  
  // List records
  fastify.get('/records', recordHandlers.listRecords.bind(recordHandlers));
  
  // Get single record
  fastify.get('/records/:id', recordHandlers.getRecord.bind(recordHandlers));
  
  // Create record
  fastify.post('/records', recordHandlers.createRecord.bind(recordHandlers));
  
  // Update record
  fastify.put('/records/:id', recordHandlers.updateRecord.bind(recordHandlers));
  
  // Delete record
  fastify.delete('/records/:id', recordHandlers.deleteRecord.bind(recordHandlers));
  
  // ============================================================================
  // Schema Routes
  // ============================================================================
  
  // List schemas
  fastify.get('/schemas', schemaHandlers.listSchemas.bind(schemaHandlers));
  
  // Get schema by $id (URL-encoded)
  fastify.get('/schemas/:id', schemaHandlers.getSchema.bind(schemaHandlers));
  
  // Get schema by file path (URL-encoded)
  fastify.get('/schemas/by-path/:path', schemaHandlers.getSchemaByPath.bind(schemaHandlers));
  
  // ============================================================================
  // Validation Routes
  // ============================================================================
  
  // Validate payload against schema
  fastify.post('/validate', validationHandlers.validate.bind(validationHandlers));
  
  // Lint payload
  fastify.post('/lint', validationHandlers.lint.bind(validationHandlers));
  
  // Full validation (validate + lint)
  fastify.post('/validate-full', validationHandlers.validateFull.bind(validationHandlers));
  
  // ============================================================================
  // UI Routes (optional - requires uiHandlers)
  // ============================================================================
  
  const { uiHandlers } = options;
  
  if (uiHandlers) {
    // List UI specs
    fastify.get('/ui/specs', uiHandlers.listUISpecs.bind(uiHandlers));
    
    // Get UI spec for a schema
    fastify.get('/ui/schema/:schemaId', uiHandlers.getUISpecForSchema.bind(uiHandlers));
    
    // Get record with UI spec (for rendering)
    fastify.get('/ui/record/:recordId', uiHandlers.getRecordWithUI.bind(uiHandlers));
  }
  
  // ============================================================================
  // Git Routes (optional - requires gitHandlers)
  // ============================================================================
  
  const { gitHandlers } = options;
  
  if (gitHandlers) {
    // Get git status (branch, modified files, etc.)
    fastify.get('/git/status', gitHandlers.getStatus.bind(gitHandlers));
    
    // Commit and push changes
    fastify.post('/git/commit-push', gitHandlers.commitAndPush.bind(gitHandlers));
    
    // Pull latest changes from remote
    fastify.post('/git/sync', gitHandlers.sync.bind(gitHandlers));
    
    // Push committed changes
    fastify.post('/git/push', gitHandlers.push.bind(gitHandlers));
  }
  
  // ============================================================================
  // Tree Routes (optional - requires treeHandlers)
  // ============================================================================
  
  const { treeHandlers } = options;
  
  if (treeHandlers) {
    // Get study hierarchy tree
    fastify.get('/tree/studies', treeHandlers.getStudies.bind(treeHandlers));

    // Get records for a run
    fastify.get('/tree/records', treeHandlers.getRecordsForRun.bind(treeHandlers));

    // Get inbox records
    fastify.get('/tree/inbox', treeHandlers.getInbox.bind(treeHandlers));

    // Search records by title
    fastify.get('/tree/search', treeHandlers.searchRecords.bind(treeHandlers));

    // File a record from inbox into a run
    fastify.post('/records/:id/file', treeHandlers.fileRecord.bind(treeHandlers));

    // Rebuild the index
    fastify.post('/index/rebuild', treeHandlers.rebuildIndex.bind(treeHandlers));
  }

  // ============================================================================
  // Library Routes (optional - requires libraryHandlers)
  // ============================================================================

  const { libraryHandlers } = options;

  if (libraryHandlers) {
    // Static paths before parameterized
    fastify.get('/library/search', libraryHandlers.searchLibrary.bind(libraryHandlers));
    fastify.get('/library/stats', libraryHandlers.getLibraryStats.bind(libraryHandlers));
    fastify.get('/library/:type', libraryHandlers.listLibraryType.bind(libraryHandlers));
    fastify.post('/library/promote', libraryHandlers.promoteOntologyTerm.bind(libraryHandlers));
    fastify.post('/library/reindex', libraryHandlers.reindexLibrary.bind(libraryHandlers));
  }

  // ============================================================================
  // Ontology Routes (optional - requires ontologyHandlers)
  // ============================================================================

  const { ontologyHandlers } = options;

  if (ontologyHandlers) {
    fastify.get('/ontology/search', ontologyHandlers.searchOntology.bind(ontologyHandlers));
  }

  // ============================================================================
  // AI Agent Routes (optional - requires aiHandlers)
  // ============================================================================

  const { aiHandlers } = options;

  if (aiHandlers) {
    fastify.post('/ai/draft-events', aiHandlers.draftEvents.bind(aiHandlers));
    fastify.post('/ai/draft-events/stream', aiHandlers.draftEventsStream.bind(aiHandlers));
  }

  // ============================================================================
  // Config Routes (optional - requires configHandlers)
  // ============================================================================

  const { configHandlers } = options;

  if (configHandlers) {
    fastify.get('/config', configHandlers.getConfig.bind(configHandlers));
    fastify.patch('/config', configHandlers.patchConfig.bind(configHandlers));
  }

  // ============================================================================
  // Protocol Routes (optional - requires protocolHandlers)
  // ============================================================================

  const { protocolHandlers } = options;

  if (protocolHandlers) {
    fastify.post('/protocols/from-event-graph', protocolHandlers.saveFromEventGraph.bind(protocolHandlers));
    fastify.get('/protocols/:id/load', protocolHandlers.loadProtocol.bind(protocolHandlers));
    fastify.post('/protocols/:id/bind', protocolHandlers.bindProtocol.bind(protocolHandlers));
  }

  // ============================================================================
  // Execution Pipeline Routes (optional - requires executionHandlers)
  // ============================================================================

  const { executionHandlers } = options;

  if (executionHandlers) {
    fastify.post('/planned-runs', executionHandlers.createPlannedRun.bind(executionHandlers));
    fastify.get('/planned-runs/:id', executionHandlers.getPlannedRun.bind(executionHandlers));
    fastify.post('/planned-runs/:id/compile', executionHandlers.compilePlannedRun.bind(executionHandlers));
    fastify.get('/robot-plans/:id', executionHandlers.getRobotPlan.bind(executionHandlers));
    fastify.get('/robot-plans/:id/artifact', executionHandlers.getRobotPlanArtifact.bind(executionHandlers));
  }

  // ============================================================================
  // Measurement Routes (optional - requires measurementHandlers)
  // ============================================================================

  const { measurementHandlers } = options;

  if (measurementHandlers) {
    fastify.post('/measurements/ingest', measurementHandlers.ingestMeasurement.bind(measurementHandlers));
    fastify.get('/measurements/:id', measurementHandlers.getMeasurement.bind(measurementHandlers));
    fastify.get('/measurements/:id/well/:well', measurementHandlers.getMeasurementWell.bind(measurementHandlers));
    fastify.post('/plate-maps/export', measurementHandlers.exportPlateMap.bind(measurementHandlers));
  }
}
