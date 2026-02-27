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
import type { ComponentHandlers } from './handlers/ComponentHandlers.js';
import type { ExecutionHandlers } from './handlers/ExecutionHandlers.js';
import type { MeasurementHandlers } from './handlers/MeasurementHandlers.js';
import type { BiosourceHandlers } from './handlers/BiosourceHandlers.js';
import type { KnowledgeAIHandlers } from './handlers/KnowledgeAIHandlers.js';
import type { TagHandlers } from './handlers/TagHandlers.js';
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
  componentHandlers?: ComponentHandlers;
  executionHandlers?: ExecutionHandlers;
  measurementHandlers?: MeasurementHandlers;
  biosourceHandlers?: BiosourceHandlers;
  knowledgeAIHandlers?: KnowledgeAIHandlers;
  tagHandlers?: TagHandlers;
  schemaCount: () => number;
  ruleCount: () => number;
  uiSpecCount?: () => number;
  aiInfo?: { available: boolean; inferenceUrl: string; model: string; provider?: string; error?: string };
  getAiInfo?: () => { available: boolean; inferenceUrl: string; model: string; provider?: string; error?: string } | undefined;
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

  // Check claim duplicates
  fastify.post('/claims/check-duplicates', recordHandlers.checkClaimDuplicates.bind(recordHandlers));

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
    fastify.post('/library/promote-context', libraryHandlers.promoteContext.bind(libraryHandlers));
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
  // Tag Suggestion Routes (optional - requires tagHandlers)
  // ============================================================================

  const { tagHandlers } = options;

  if (tagHandlers) {
    fastify.get('/tags/suggest', tagHandlers.suggestTags.bind(tagHandlers));
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
    fastify.post('/config/ai/test', configHandlers.testAiConfig.bind(configHandlers));
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
  // Component Graph Routes (optional - requires componentHandlers)
  // ============================================================================

  const { componentHandlers } = options;

  if (componentHandlers) {
    fastify.post('/components', componentHandlers.createComponent.bind(componentHandlers));
    fastify.get('/components', componentHandlers.listComponents.bind(componentHandlers));
    fastify.get('/components/:id', componentHandlers.getComponent.bind(componentHandlers));
    fastify.put('/components/:id', componentHandlers.updateComponent.bind(componentHandlers));
    fastify.post('/components/:id/publish', componentHandlers.publishComponent.bind(componentHandlers));
    fastify.post('/components/:id/instantiate', componentHandlers.instantiateComponent.bind(componentHandlers));
    fastify.get('/components/instances/:id/status', componentHandlers.componentInstanceStatus.bind(componentHandlers));
    fastify.post('/components/instances/:id/upgrade', componentHandlers.upgradeComponentInstance.bind(componentHandlers));
    fastify.post('/components/suggest-from-event-graph', componentHandlers.suggestFromEventGraph.bind(componentHandlers));
  }

  // ============================================================================
  // Execution Pipeline Routes (optional - requires executionHandlers)
  // ============================================================================

  const { executionHandlers } = options;

  if (executionHandlers) {
    fastify.get('/execution/adapters', executionHandlers.listAdapters.bind(executionHandlers));
    fastify.get('/execution/health/adapters', executionHandlers.getAdapterHealth.bind(executionHandlers));
    fastify.get('/execution/sidecar/contracts', executionHandlers.listSidecarContracts.bind(executionHandlers));
    fastify.get('/execution/sidecar/contracts/diagnostics', executionHandlers.sidecarContractDiagnostics.bind(executionHandlers));
    fastify.get('/execution/sidecar/contracts/examples', executionHandlers.listSidecarContractExamples.bind(executionHandlers));
    fastify.post('/execution/sidecar/contracts/self-test', executionHandlers.sidecarContractSelfTest.bind(executionHandlers));
    fastify.post('/execution/sidecar/contracts/self-test/persist', executionHandlers.sidecarContractSelfTestPersist.bind(executionHandlers));
    fastify.post('/execution/sidecar/contracts/validate', executionHandlers.validateSidecarContract.bind(executionHandlers));
    fastify.post('/execution/sidecar/contracts/validate-batch', executionHandlers.validateSidecarContractBatch.bind(executionHandlers));
    fastify.post('/execution/sidecar/contracts/gate', executionHandlers.sidecarContractGate.bind(executionHandlers));
    fastify.get('/execution/failure-runbook', executionHandlers.getFailureRunbook.bind(executionHandlers));
    fastify.get('/execution/incidents', executionHandlers.listIncidents.bind(executionHandlers));
    fastify.post('/execution/incidents/scan', executionHandlers.scanIncidents.bind(executionHandlers));
    fastify.post('/execution/incidents/:id/ack', executionHandlers.acknowledgeIncident.bind(executionHandlers));
    fastify.post('/execution/incidents/:id/resolve', executionHandlers.resolveIncident.bind(executionHandlers));
    fastify.get('/execution/incidents/summary', executionHandlers.incidentSummary.bind(executionHandlers));
    fastify.get('/execution/incidents/worker/status', executionHandlers.incidentWorkerStatus.bind(executionHandlers));
    fastify.post('/execution/incidents/worker/start', executionHandlers.startIncidentWorker.bind(executionHandlers));
    fastify.post('/execution/incidents/worker/takeover', executionHandlers.takeoverIncidentWorker.bind(executionHandlers));
    fastify.post('/execution/incidents/worker/stop', executionHandlers.stopIncidentWorker.bind(executionHandlers));
    fastify.post('/execution/incidents/worker/run-once', executionHandlers.runIncidentWorkerOnce.bind(executionHandlers));
    fastify.get('/execution/capabilities', executionHandlers.getCapabilities.bind(executionHandlers));
    fastify.get('/execution/parameters/schema', executionHandlers.getExecutionParameterSchemas.bind(executionHandlers));
    fastify.post('/execution/parameters/validate', executionHandlers.validateExecutionParameters.bind(executionHandlers));
    fastify.post('/execution-tasks/claim', executionHandlers.claimExecutionTasks.bind(executionHandlers));
    fastify.post('/execution-tasks/:id/heartbeat', executionHandlers.heartbeatExecutionTask.bind(executionHandlers));
    fastify.post('/execution-tasks/:id/logs', executionHandlers.appendExecutionTaskLogs.bind(executionHandlers));
    fastify.post('/execution-tasks/:id/status', executionHandlers.updateExecutionTaskStatus.bind(executionHandlers));
    fastify.post('/execution-tasks/:id/complete', executionHandlers.completeExecutionTask.bind(executionHandlers));
    fastify.get('/execution-runs', executionHandlers.listExecutionRuns.bind(executionHandlers));
    fastify.get('/execution-runs/latest', executionHandlers.getLatestExecutionRun.bind(executionHandlers));
    fastify.get('/execution-runs/:id', executionHandlers.getExecutionRun.bind(executionHandlers));
    fastify.get('/execution-runs/:id/event-graph', executionHandlers.getExecutionRunEventGraph.bind(executionHandlers));
    fastify.get('/execution-runs/:id/timeline', executionHandlers.getExecutionRunTimeline.bind(executionHandlers));
    fastify.get('/execution-runs/:id/status', executionHandlers.getExecutionRunStatus.bind(executionHandlers));
    fastify.get('/execution-runs/:id/lineage', executionHandlers.getExecutionRunLineage.bind(executionHandlers));
    fastify.post('/execution-runs/:id/retry', executionHandlers.retryExecutionRun.bind(executionHandlers));
    fastify.post('/execution-runs/:id/resolve', executionHandlers.resolveExecutionRun.bind(executionHandlers));
    fastify.post('/execution-runs/:id/cancel', executionHandlers.cancelExecutionRun.bind(executionHandlers));
    fastify.get('/execution/poller/status', executionHandlers.pollerStatus.bind(executionHandlers));
    fastify.get('/execution/workers/leases', executionHandlers.workerLeases.bind(executionHandlers));
    fastify.get('/execution/ops/snapshot', executionHandlers.getOpsSnapshot.bind(executionHandlers));
    fastify.post('/execution/poller/start', executionHandlers.startPoller.bind(executionHandlers));
    fastify.post('/execution/poller/takeover', executionHandlers.takeoverPoller.bind(executionHandlers));
    fastify.post('/execution/poller/stop', executionHandlers.stopPoller.bind(executionHandlers));
    fastify.post('/execution/poller/poll-once', executionHandlers.pollOnce.bind(executionHandlers));
    fastify.get('/execution/retry-worker/status', executionHandlers.retryWorkerStatus.bind(executionHandlers));
    fastify.post('/execution/retry-worker/start', executionHandlers.startRetryWorker.bind(executionHandlers));
    fastify.post('/execution/retry-worker/takeover', executionHandlers.takeoverRetryWorker.bind(executionHandlers));
    fastify.post('/execution/retry-worker/stop', executionHandlers.stopRetryWorker.bind(executionHandlers));
    fastify.post('/execution/retry-worker/run-once', executionHandlers.runRetryWorkerOnce.bind(executionHandlers));
    fastify.post('/execution/recovery/reconcile', executionHandlers.reconcileRecovery.bind(executionHandlers));
    fastify.post('/execution-runs/:id/materialize', executionHandlers.materializeExecutionRun.bind(executionHandlers));
    fastify.post('/execution/orchestrate', executionHandlers.orchestrateExecution.bind(executionHandlers));
    fastify.post('/measurements/validate-parser', executionHandlers.validateMeasurementParser.bind(executionHandlers));
    fastify.post('/planned-runs', executionHandlers.createPlannedRun.bind(executionHandlers));
    fastify.get('/planned-runs/:id', executionHandlers.getPlannedRun.bind(executionHandlers));
    fastify.get('/planned-runs/:id/logs', executionHandlers.listPlannedRunLogs.bind(executionHandlers));
    fastify.post('/planned-runs/:id/compile', executionHandlers.compilePlannedRun.bind(executionHandlers));
    fastify.get('/robot-plans/:id', executionHandlers.getRobotPlan.bind(executionHandlers));
    fastify.get('/robot-plans/:id/status', executionHandlers.getRobotPlanStatus.bind(executionHandlers));
    fastify.get('/robot-plans/:id/logs', executionHandlers.listRobotPlanLogs.bind(executionHandlers));
    fastify.get('/robot-plans/:id/artifact', executionHandlers.getRobotPlanArtifact.bind(executionHandlers));
    fastify.post('/robot-plans/:id/execute', executionHandlers.executeRobotPlan.bind(executionHandlers));
    fastify.post('/robot-plans/:id/cancel', executionHandlers.cancelRobotPlan.bind(executionHandlers));
  }

  // ============================================================================
  // Measurement Routes (optional - requires measurementHandlers)
  // ============================================================================

  const { measurementHandlers } = options;

  if (measurementHandlers) {
    fastify.post('/measurements/ingest', measurementHandlers.ingestMeasurement.bind(measurementHandlers));
    fastify.post('/measurements/active-read', measurementHandlers.activeReadMeasurement.bind(measurementHandlers));
    fastify.get('/measurements/active-read/schema', measurementHandlers.getActiveReadSchemas.bind(measurementHandlers));
    fastify.post('/measurements/active-read/validate', measurementHandlers.validateActiveRead.bind(measurementHandlers));
    fastify.get('/measurements/:id', measurementHandlers.getMeasurement.bind(measurementHandlers));
    fastify.get('/measurements/:id/well/:well', measurementHandlers.getMeasurementWell.bind(measurementHandlers));
    fastify.post('/plate-maps/export', measurementHandlers.exportPlateMap.bind(measurementHandlers));
  }

  // ============================================================================
  // Bio-Source Proxy Routes (optional - requires biosourceHandlers)
  // ============================================================================

  const { biosourceHandlers } = options;

  if (biosourceHandlers) {
    fastify.get('/biosource/:source/search', biosourceHandlers.search.bind(biosourceHandlers));
    fastify.get('/biosource/:source/fetch', biosourceHandlers.fetch.bind(biosourceHandlers));
  }

  // ============================================================================
  // Knowledge Extraction AI Routes (optional - requires knowledgeAIHandlers)
  // ============================================================================

  const { knowledgeAIHandlers } = options;

  if (knowledgeAIHandlers) {
    fastify.post('/ai/extract-knowledge', knowledgeAIHandlers.extractKnowledge.bind(knowledgeAIHandlers));
    fastify.post('/ai/extract-knowledge/stream', knowledgeAIHandlers.extractKnowledgeStream.bind(knowledgeAIHandlers));
  }
}
