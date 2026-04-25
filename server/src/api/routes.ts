/**
 * Route configuration for the API.
 * 
 * This module registers all API routes on a Fastify instance.
 * Route handlers are thin wrappers with no schema-specific logic.
 */

import type { FastifyInstance } from 'fastify';
import type { RecordSearchHandlers } from './handlers/RecordSearchHandlers.js';
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
import type { MaterialPrepHandlers } from './handlers/MaterialPrepHandlers.js';
import type { MaterialLifecycleHandlers } from './handlers/MaterialLifecycleHandlers.js';
import type { PlatformHandlers } from './handlers/PlatformHandlers.js';
import type { LabSettingsHandlers } from './handlers/LabSettingsHandlers.js';
import type { VendorSearchHandlers } from './handlers/VendorSearchHandlers.js';
import type { VendorDocumentHandlers } from './handlers/VendorDocumentHandlers.js';
import type { ChemistryHandlers } from './handlers/ChemistryHandlers.js';
import type { IngestionHandlers } from './handlers/IngestionHandlers.js';
import type { IngestionAIHandlers } from './handlers/IngestionAIHandlers.js';
import type { AiIngestionHandlers } from './handlers/AiIngestionHandlers.js';
import type { ExtractHandlers } from './handlers/ExtractHandlers.js';
import type { MaterialAIHandlers } from './handlers/MaterialAIHandlers.js';
import type { SemanticsHandlers } from './handlers/SemanticsHandlers.js';
import type { RunWorkspaceHandlers } from './handlers/RunWorkspaceHandlers.js';
import type { RunDraftHandlers } from './handlers/RunDraftHandlers.js';
import type { RelatedRecordsHandlers } from './handlers/RelatedRecordsHandlers.js';
import type { AiRecordDraftHandlers } from './handlers/AiRecordDraftHandlers.js';
import type { ReadinessHandlers } from './handlers/ReadinessHandlers.js';
import type { ProcurementHandlers } from './handlers/ProcurementHandlers.js';
import type { PromptTemplateHandlers } from './handlers/PromptTemplateHandlers.js';
import type { ProtocolIdeHandlers } from './handlers/ProtocolIdeHandlers.js';
import type { HealthResponse } from './types.js';

/**
 * Options for registering routes.
 */
export interface RouteOptions {
  recordHandlers: RecordHandlers;
  recordSearchHandlers?: RecordSearchHandlers;
  relatedRecordsHandlers?: RelatedRecordsHandlers;
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
  protocolIdeHandlers?: ProtocolIdeHandlers;
  componentHandlers?: ComponentHandlers;
  executionHandlers?: ExecutionHandlers;
  measurementHandlers?: MeasurementHandlers;
  biosourceHandlers?: BiosourceHandlers;
  knowledgeAIHandlers?: KnowledgeAIHandlers;
  tagHandlers?: TagHandlers;
  materialPrepHandlers?: MaterialPrepHandlers;
  materialLifecycleHandlers?: MaterialLifecycleHandlers;
  platformHandlers?: PlatformHandlers;
  labSettingsHandlers?: LabSettingsHandlers;
  vendorSearchHandlers?: VendorSearchHandlers;
  vendorDocumentHandlers?: VendorDocumentHandlers;
  chemistryHandlers?: ChemistryHandlers;
  ingestionHandlers?: IngestionHandlers;
  ingestionAIHandlers?: IngestionAIHandlers;
  aiIngestionHandlers?: AiIngestionHandlers;
  extractHandlers?: ExtractHandlers;
  materialAIHandlers?: MaterialAIHandlers;
  semanticsHandlers?: SemanticsHandlers;
  runWorkspaceHandlers?: RunWorkspaceHandlers;
  runDraftHandlers?: RunDraftHandlers;
  aiRecordDraftHandlers?: AiRecordDraftHandlers;
  readinessHandlers?: ReadinessHandlers;
  procurementHandlers?: ProcurementHandlers;
  promptTemplateHandlers?: PromptTemplateHandlers;
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

  // Related records (reverse-reference query)
  const { relatedRecordsHandlers } = options;
  if (relatedRecordsHandlers) {
    fastify.get('/records/:id/related', relatedRecordsHandlers.getRelatedRecords.bind(relatedRecordsHandlers));
  }

  // ============================================================================
  // Record Search Route
  // ============================================================================

  const { recordSearchHandlers } = options;
  if (recordSearchHandlers) {
    fastify.post('/ai/search-records', recordSearchHandlers.searchRecords.bind(recordSearchHandlers));
    fastify.post('/ai/precompile-record', recordSearchHandlers.precompileRecord.bind(recordSearchHandlers));
  }

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
    
    // Get editor projection for a record
    fastify.get('/ui/record/:recordId/editor', uiHandlers.getRecordEditorProjection.bind(uiHandlers));

    // Get a draft editor projection for create mode (POST /ui/schema/:schemaId/editor-draft)
    fastify.post('/ui/schema/:schemaId/editor-draft', uiHandlers.getEditorDraftProjection.bind(uiHandlers));

    // Get editor slot suggestions for a record
    fastify.post('/ui/record/:recordId/editor/suggestions', uiHandlers.getRecordEditorSlotSuggestions.bind(uiHandlers));
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
    fastify.get('/templates/search', treeHandlers.searchTemplates.bind(treeHandlers));
    fastify.post('/templates/:id/materialize', treeHandlers.materializeTemplate.bind(treeHandlers));

    // Run method attachment + summary
    fastify.get('/runs/:id/method', treeHandlers.getRunMethod.bind(treeHandlers));
    fastify.post('/runs/create-from-template', treeHandlers.createRunFromTemplate.bind(treeHandlers));
    fastify.post('/runs/:id/method/attach-template', treeHandlers.attachTemplateToRunMethod.bind(treeHandlers));
    fastify.post('/runs/:id/inputs/:templateLabwareId/create-upstream-run', treeHandlers.createUpstreamRunForInput.bind(treeHandlers));
    fastify.post('/runs/:id/inputs/:templateLabwareId/use-existing-plate', treeHandlers.useExistingPlateForInput.bind(treeHandlers));
    fastify.post('/runs/:id/outputs/:outputId/promote', treeHandlers.promoteRunOutput.bind(treeHandlers));

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

  const { runWorkspaceHandlers } = options;

  if (runWorkspaceHandlers) {
    fastify.get('/runs/:id/workspace', runWorkspaceHandlers.getRunWorkspace.bind(runWorkspaceHandlers));
    fastify.get('/runs/:id/analysis-bundle', runWorkspaceHandlers.getRunAnalysisBundle.bind(runWorkspaceHandlers));
    fastify.get('/runs/:id/ai-context', runWorkspaceHandlers.getRunAiContext.bind(runWorkspaceHandlers));
  }

  // ============================================================================
  // Run-Centered Workflow Routes (optional - requires runDraftHandlers)
  // ============================================================================

  const { runDraftHandlers } = options;

  if (runDraftHandlers) {
    // Event Graph Draft/Accept
    fastify.post('/runs/:id/event-graph/draft', runDraftHandlers.draftEventGraph.bind(runDraftHandlers));
    fastify.post('/runs/:id/event-graph/accept', runDraftHandlers.acceptEventGraph.bind(runDraftHandlers));

    // Meaning (Biological Context) Draft/Accept
    fastify.get('/runs/:id/meaning', runDraftHandlers.getMeaning.bind(runDraftHandlers));
    fastify.post('/runs/:id/meaning/draft', runDraftHandlers.draftMeaning.bind(runDraftHandlers));
    fastify.post('/runs/:id/meaning/accept', runDraftHandlers.acceptMeaning.bind(runDraftHandlers));

    // Readouts
    fastify.get('/runs/:id/readouts', runDraftHandlers.getReadouts.bind(runDraftHandlers));

    // Results
    fastify.post('/runs/:id/results', runDraftHandlers.createResults.bind(runDraftHandlers));
    fastify.get('/runs/:id/results', runDraftHandlers.getResults.bind(runDraftHandlers));
    fastify.post('/runs/:id/results/:jobId/approve', runDraftHandlers.approveResults.bind(runDraftHandlers));

    // Evidence Draft/Accept
    fastify.post('/runs/:id/evidence/draft', runDraftHandlers.draftEvidence.bind(runDraftHandlers));
    fastify.post('/runs/:id/evidence/accept', runDraftHandlers.acceptEvidence.bind(runDraftHandlers));

    // Result-to-Evidence Pipeline
    fastify.post('/runs/:id/results/interpret', runDraftHandlers.interpretResults.bind(runDraftHandlers));
    fastify.post('/runs/:id/evidence/assemble', runDraftHandlers.assembleEvidence.bind(runDraftHandlers));
    fastify.post('/runs/:id/assertions/draft', runDraftHandlers.draftAssertions.bind(runDraftHandlers));
    fastify.post('/runs/:id/assertions/check-contradictions', runDraftHandlers.checkContradictions.bind(runDraftHandlers));
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

  const { vendorSearchHandlers } = options;

  if (vendorSearchHandlers) {
    fastify.get('/vendors/search', vendorSearchHandlers.searchVendors.bind(vendorSearchHandlers));
    fastify.get('/vendors/protocol-ide/documents', vendorSearchHandlers.searchProtocolIdeDocuments.bind(vendorSearchHandlers));
  }

  const { vendorDocumentHandlers } = options;

  if (vendorDocumentHandlers) {
    fastify.post('/vendors/:id/documents/extract', vendorDocumentHandlers.extractVendorDocument.bind(vendorDocumentHandlers));
  }

  const { chemistryHandlers } = options;

  if (chemistryHandlers) {
    fastify.get('/chemistry/molecular-weight', chemistryHandlers.resolveMolecularWeight.bind(chemistryHandlers));
  }

  const { semanticsHandlers } = options;

  if (semanticsHandlers) {
    fastify.get('/semantics/instruments', semanticsHandlers.listInstruments.bind(semanticsHandlers));
    fastify.get('/semantics/readouts', semanticsHandlers.listReadouts.bind(semanticsHandlers));
    fastify.get('/semantics/assays', semanticsHandlers.listAssays.bind(semanticsHandlers));
    fastify.get('/semantics/measurement-contexts', semanticsHandlers.listMeasurementContexts.bind(semanticsHandlers));
    fastify.post('/semantics/measurement-contexts', semanticsHandlers.createMeasurementContext.bind(semanticsHandlers));
    fastify.get('/semantics/well-groups', semanticsHandlers.listWellGroups.bind(semanticsHandlers));
    fastify.post('/semantics/well-groups', semanticsHandlers.createWellGroup.bind(semanticsHandlers));
    fastify.get('/semantics/well-role-assignments', semanticsHandlers.listWellRoleAssignments.bind(semanticsHandlers));
    fastify.post('/semantics/well-role-assignments', semanticsHandlers.createWellRoleAssignment.bind(semanticsHandlers));
  }

  // ============================================================================
  // Tag Suggestion Routes (optional - requires tagHandlers)
  // ============================================================================

  const { tagHandlers } = options;

  if (tagHandlers) {
    fastify.get('/tags/suggest', tagHandlers.suggestTags.bind(tagHandlers));
  }

  const { materialPrepHandlers } = options;
  if (materialPrepHandlers) {
    fastify.get('/materials/formulations/summary', materialPrepHandlers.getFormulationsSummary.bind(materialPrepHandlers));
    fastify.get('/materials/inventory', materialPrepHandlers.getInventory.bind(materialPrepHandlers));
    fastify.post('/materials/formulations/copilot/draft-from-text', materialPrepHandlers.draftFormulationFromText.bind(materialPrepHandlers));
    fastify.post('/materials/formulations/copilot/explain', materialPrepHandlers.explainFormulationDraft.bind(materialPrepHandlers));
    fastify.post('/materials/formulations/copilot/suggest-missing', materialPrepHandlers.suggestMissingFormulationFields.bind(materialPrepHandlers));
    fastify.post('/materials/formulations/copilot/flatten', materialPrepHandlers.flattenFormulationComposition.bind(materialPrepHandlers));
    fastify.post('/materials/formulations', materialPrepHandlers.createFormulation.bind(materialPrepHandlers));
    fastify.post('/materials/recipes/:id/execute', materialPrepHandlers.executeRecipe.bind(materialPrepHandlers));
  }

  const { materialLifecycleHandlers } = options;
  if (materialLifecycleHandlers) {
    fastify.get('/materials/search', materialLifecycleHandlers.searchMaterials.bind(materialLifecycleHandlers));
    fastify.get('/materials/:id', materialLifecycleHandlers.getMaterial.bind(materialLifecycleHandlers));
    fastify.get('/materials/:id/lineage', materialLifecycleHandlers.getMaterialLineage.bind(materialLifecycleHandlers));
    fastify.post('/materials/:id/status', materialLifecycleHandlers.updateMaterialStatus.bind(materialLifecycleHandlers));
    fastify.post('/materials/instances', materialLifecycleHandlers.createMaterialInstance.bind(materialLifecycleHandlers));
    fastify.post('/materials/instances/:id/split', materialLifecycleHandlers.splitMaterialInstance.bind(materialLifecycleHandlers));
    fastify.post('/materials/derivations', materialLifecycleHandlers.createMaterialDerivation.bind(materialLifecycleHandlers));
    fastify.post('/materials/promote-from-context', materialLifecycleHandlers.promoteMaterialFromContext.bind(materialLifecycleHandlers));
  }

  const { labSettingsHandlers } = options;
  if (labSettingsHandlers) {
    fastify.get('/settings/lab', labSettingsHandlers.getLabSettings.bind(labSettingsHandlers));
  }

  const { platformHandlers } = options;
  if (platformHandlers) {
    fastify.get('/platforms', platformHandlers.listPlatforms.bind(platformHandlers));
    fastify.get('/platforms/:id', platformHandlers.getPlatform.bind(platformHandlers));
  }

  const { ingestionHandlers } = options;
  if (ingestionHandlers) {
    fastify.get('/ingestion/jobs', ingestionHandlers.listJobs.bind(ingestionHandlers));
    fastify.get('/ingestion/jobs/:id', ingestionHandlers.getJob.bind(ingestionHandlers));
    fastify.post('/ingestion/jobs', ingestionHandlers.createJob.bind(ingestionHandlers));
    fastify.post('/ingestion/jobs/:id/artifacts', ingestionHandlers.addArtifact.bind(ingestionHandlers));
    fastify.post('/ingestion/jobs/:id/run', ingestionHandlers.runJob.bind(ingestionHandlers));
    fastify.post('/ingestion/jobs/:id/bundles/:bundleId/approve', ingestionHandlers.approveBundle.bind(ingestionHandlers));
    fastify.post('/ingestion/jobs/:id/bundles/:bundleId/publish', ingestionHandlers.publishBundle.bind(ingestionHandlers));
    fastify.post('/ingestion/jobs/:id/extraction-spec', ingestionHandlers.attachExtractionSpec.bind(ingestionHandlers));
  }

  // ============================================================================
  // Extract Routes (optional - requires extractHandlers)
  // ============================================================================

  const { extractHandlers } = options;
  if (extractHandlers) {
    fastify.post('/extract', extractHandlers.extract.bind(extractHandlers));
    fastify.post('/extract/upload', extractHandlers.upload.bind(extractHandlers));
    fastify.get('/extract/metrics', extractHandlers.getMetrics.bind(extractHandlers));
    fastify.post('/extraction/drafts/:id/candidates/:i/promote', extractHandlers.promoteCandidate.bind(extractHandlers));
    fastify.post('/extraction/drafts/:id/candidates/:i/reject', extractHandlers.rejectCandidate.bind(extractHandlers));
  }

  // ============================================================================
  // AI Agent Routes (optional - requires aiHandlers)
  // ============================================================================

  const { aiHandlers } = options;

  if (aiHandlers) {
    fastify.post('/ai/draft-events', aiHandlers.draftEvents.bind(aiHandlers));
    fastify.post('/ai/draft-events/stream', aiHandlers.draftEventsStream.bind(aiHandlers));
    fastify.post('/ai/assist/stream', aiHandlers.assistStream.bind(aiHandlers));
  }

  const { aiRecordDraftHandlers } = options;

  if (aiRecordDraftHandlers) {
    fastify.post('/ai/draft-record', aiRecordDraftHandlers.draftRecord.bind(aiRecordDraftHandlers));
  }

  const { ingestionAIHandlers } = options;
  if (ingestionAIHandlers) {
    fastify.post('/ai/infer-source-kind', ingestionAIHandlers.inferSourceKind.bind(ingestionAIHandlers));
    fastify.post('/ai/suggest-ingestion-mapping', ingestionAIHandlers.suggestIngestionMapping.bind(ingestionAIHandlers));
    fastify.post('/ai/explain-ingestion-issue', ingestionAIHandlers.explainIngestionIssue.bind(ingestionAIHandlers));
  }

  const { aiIngestionHandlers } = options;
  if (aiIngestionHandlers) {
    fastify.post('/ai/analyze-ingestion', aiIngestionHandlers.analyzeIngestion.bind(aiIngestionHandlers));
  }

  const { materialAIHandlers } = options;
  if (materialAIHandlers) {
    fastify.post('/ai/draft-material', materialAIHandlers.draftMaterial.bind(materialAIHandlers));
    fastify.post('/ai/search-materials', materialAIHandlers.searchMaterials.bind(materialAIHandlers));
    fastify.post('/ai/review-material-composition', materialAIHandlers.reviewComposition.bind(materialAIHandlers));
    fastify.post('/ai/check-material-duplicate', materialAIHandlers.checkDuplicate.bind(materialAIHandlers));
  }

  // ============================================================================
  // Config Routes (optional - requires configHandlers)
  // ============================================================================

  const { configHandlers } = options;

  if (configHandlers) {
    fastify.get('/config', configHandlers.getConfig.bind(configHandlers));
    fastify.patch('/config', configHandlers.patchConfig.bind(configHandlers));
    fastify.post('/config/ai/test', configHandlers.testAiConfig.bind(configHandlers));
    fastify.get('/config/ai/profiles', configHandlers.listAiProfiles.bind(configHandlers));
    fastify.put('/config/ai/profiles/:name', configHandlers.saveAiProfile.bind(configHandlers));
    fastify.post('/config/ai/profiles/:name/activate', configHandlers.activateAiProfile.bind(configHandlers));
    fastify.delete('/config/ai/profiles/:name', configHandlers.deleteAiProfile.bind(configHandlers));
  }

  // ============================================================================
  // Protocol Routes (optional - requires protocolHandlers)
  // ============================================================================

  const { protocolHandlers } = options;

  if (protocolHandlers) {
    // Legacy endpoint - keeps backward compatibility
    fastify.post('/protocols/from-event-graph', protocolHandlers.saveFromEventGraph.bind(protocolHandlers));
    
    // New extraction-draft flow endpoints
    fastify.post('/extraction/protocols/draft', protocolHandlers.extractProtocolDraft.bind(protocolHandlers));
    fastify.post('/extraction/protocols/:draftId/promote', protocolHandlers.promoteProtocolDraft.bind(protocolHandlers));
    
    fastify.post('/protocols/import', protocolHandlers.importProtocolPdf.bind(protocolHandlers));
    fastify.post('/protocols/materials/compile', protocolHandlers.compileMaterialIntents.bind(protocolHandlers));
    fastify.post('/protocols/lab-review', protocolHandlers.reviewLabProtocol.bind(protocolHandlers));
    fastify.get('/protocols/:id/load', protocolHandlers.loadProtocol.bind(protocolHandlers));
    fastify.post('/protocols/:id/bind', protocolHandlers.bindProtocol.bind(protocolHandlers));
  }

  // ============================================================================
  // Protocol IDE Routes (optional - requires protocolIdeHandlers)
  // ============================================================================

  const { protocolIdeHandlers } = options;

  if (protocolIdeHandlers) {
    fastify.post('/protocol-ide/sessions', protocolIdeHandlers.createSession.bind(protocolIdeHandlers));
    fastify.post('/protocol-ide/sessions/:sessionId/feedback', protocolIdeHandlers.submitFeedback.bind(protocolIdeHandlers));
    fastify.get('/protocol-ide/sessions/:sessionId/rolling-summary', protocolIdeHandlers.getRollingSummary.bind(protocolIdeHandlers));
    fastify.post('/protocol-ide/sessions/:sessionId/generate-issue-cards', protocolIdeHandlers.generateIssueCards.bind(protocolIdeHandlers));
    fastify.get('/protocol-ide/sessions/:sessionId/issue-cards', protocolIdeHandlers.getIssueCards.bind(protocolIdeHandlers));
    fastify.post('/protocol-ide/sessions/:sessionId/export-issue-cards', protocolIdeHandlers.exportIssueCards.bind(protocolIdeHandlers));
    fastify.get('/protocol-ide/sessions/:sessionId/can-export', protocolIdeHandlers.canExport.bind(protocolIdeHandlers));
    fastify.get('/protocol-ide/sessions/:sessionId/overlay-summaries', protocolIdeHandlers.getOverlaySummaries.bind(protocolIdeHandlers));
    fastify.get('/protocol-ide/sessions/:sessionId/event-graph', protocolIdeHandlers.getEventGraph.bind(protocolIdeHandlers));
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
    // Default ON for local/dev usage. Set CL_FEATURE_EXECUTION_PLANNING=0/false to disable explicitly.
    const executionPlanningEnabled =
      process.env['CL_FEATURE_EXECUTION_PLANNING'] !== '0' &&
      process.env['CL_FEATURE_EXECUTION_PLANNING'] !== 'false';
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
    if (executionPlanningEnabled) {
      fastify.post('/execution-plans/validate', executionHandlers.validateExecutionPlan.bind(executionHandlers));
      fastify.post('/execution-plans/:id/emit', executionHandlers.emitExecutionPlan.bind(executionHandlers));
    }
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
    fastify.get('/execution-runs/:id/evidence', executionHandlers.getExecutionRunEvidence.bind(executionHandlers));
    fastify.get('/execution-runs/:id/reality', executionHandlers.getExecutionRunReality.bind(executionHandlers));
    fastify.get('/execution-runs/:id/status', executionHandlers.getExecutionRunStatus.bind(executionHandlers));
    fastify.get('/execution-runs/:id/lineage', executionHandlers.getExecutionRunLineage.bind(executionHandlers));
    fastify.post('/execution-runs/:id/retry', executionHandlers.retryExecutionRun.bind(executionHandlers));
    fastify.post('/execution-runs/:id/resolve', executionHandlers.resolveExecutionRun.bind(executionHandlers));
    fastify.post('/execution-runs/:id/remediation-decisions', executionHandlers.recordExecutionRunRemediationDecision.bind(executionHandlers));
    fastify.post('/execution-runs/:id/deviations', executionHandlers.recordExecutionRunDeviation.bind(executionHandlers));
    fastify.post('/execution-runs/:id/observations', executionHandlers.recordExecutionRunObservation.bind(executionHandlers));
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
    fastify.post('/measurements/upload-raw', measurementHandlers.uploadRawMeasurementFile.bind(measurementHandlers));
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

  // ============================================================================
  // Readiness Routes (optional - requires readinessHandlers)
  // ============================================================================

  const { readinessHandlers } = options;

  if (readinessHandlers) {
    fastify.get('/execution/readiness', readinessHandlers.getReadinessReport.bind(readinessHandlers));
  }

  // ============================================================================
  // Procurement Routes (optional - requires procurementHandlers)
  // ============================================================================

  const { procurementHandlers } = options;

  if (procurementHandlers) {
    fastify.post('/planned-runs/:id/procurement/draft', procurementHandlers.generateProcurementDraft.bind(procurementHandlers));
  }

  // ============================================================================
  // Prompt Template Routes (optional - requires promptTemplateHandlers)
  // ============================================================================

  const { promptTemplateHandlers } = options;

  if (promptTemplateHandlers) {
    fastify.get('/prompt-templates/:id', promptTemplateHandlers.getPromptTemplate.bind(promptTemplateHandlers));
  }
}
