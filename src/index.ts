/**
 * computable-lab — Schema-driven laboratory information and knowledge system.
 * 
 * This is the main entry point for the library.
 */

// Types
export * from './types/index.js';

// Schema loading and registry
export * from './schema/index.js';

// Validation
export * from './validation/index.js';

// Lint engine
export * from './lint/index.js';

// Repository adapter
export * from './repo/index.js';

// Record store
export * from './store/index.js';

// JSON-LD generation and graph building
export * from './jsonld/index.js';

// UI specification and form building
export * from './ui/index.js';

// HTTP API
export * from './api/index.js';

// Server
export { initializeApp, createServer, startServer } from './server.js';
export type { AppContext } from './server.js';
