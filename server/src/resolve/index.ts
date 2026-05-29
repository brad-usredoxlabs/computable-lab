/**
 * The resolve() spine — barrel export.
 */
export * from './types.js';
export { createResolveSpine, createResolveSpineFromContext } from './ResolveSpine.js';
export type { ResolveSpine, ResolveSpineDeps } from './ResolveSpine.js';
export { createOakProvider, resolveOakServiceUrl } from './providers/oak.js';
export { createOls4Provider, searchOls4 } from './providers/ols4.js';
export { createRecordProvider } from './providers/records.js';
