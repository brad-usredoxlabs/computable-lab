// MATRES-REPLAY harvest leg — ESM resolve hook (harness-only; never product code).
// Trunk 9841434b imports server/src/ai/materialRefFields.js from tracked code, but
// the file is UNTRACKED (excluded via /home/brad/.hermes/cl/lanes/1/lane-exclude:72 —
// it exists only in Brad's main disk tree). The replay therefore resolves that one
// specifier to a byte copy pinned under fixtures/ (hash recorded in the report).
import { pathToFileURL } from 'node:url';
import { register } from 'node:module';

// Self-register when loaded via --import (a bare --import does NOT install
// export resolve; register() must be called by the loaded module itself).
if (process.env.MATRES_REPLAY_HOOK_REGISTERED !== '1') {
  process.env.MATRES_REPLAY_HOOK_REGISTERED = '1';
  register(import.meta.url);
}

const PINNED = pathToFileURL(new URL('../fixtures/materialRefFields.pinned.ts', import.meta.url).pathname).href;

export function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('/ai/materialRefFields.js') || specifier === './materialRefFields.js') {
    // Only redirect when the importer is under server/src (i.e. the product import).
    if (context.parentURL?.includes('/server/src/')) return { url: PINNED, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
