/**
 * Graph Query layer — public barrel.
 *
 * Presents the canonical GraphQuery / GraphResult types and their zod mirrors
 * used by the GraphQueryEngine (added in later phases) and the lab.* MCP tools.
 */
export * from './types.js';
export * from './schema.js';
export { GraphProjector } from './GraphProjector.js';
export type { ProjectableEventGraph, ProjectableEvent, ProjectedGraph } from './GraphProjector.js';
export { GraphEdgeIndex } from './GraphEdgeIndex.js';
export type { EdgeQueryOptions, TraversalEdge, GraphEdgeBuildInput } from './GraphEdgeIndex.js';
export { GraphQueryEngine } from './GraphQueryEngine.js';
export type { GraphQueryEngineDeps, ResolveSpineLike } from './GraphQueryEngine.js';
export { GraphValidation } from './GraphValidation.js';
export type { GraphValidationIssue, GraphValidationResult } from './GraphValidation.js';
export { CollectionService } from './CollectionService.js';
export type { CollectionMetadata } from './CollectionService.js';
export { NLPlanner } from './NLPlanner.js';
export type { PlanResult, PlanDeps } from './NLPlanner.js';