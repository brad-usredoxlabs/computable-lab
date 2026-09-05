/**
 * Lab Profile routes — expose the declarative lab identity (phase 1.2).
 *
 *   GET /api/lab-profile   → { profile } (namespace overridden from live
 *                             repo config, config wins over registry default)
 *
 * Single source: schema/registry/lab-profile/lab-profile.yaml; this module
 * only loads it and applies the live namespace override (repo rule #1).
 */
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../server.js';
import { loadDefaultLabProfile, mergeNamespace } from '../../labProfile/labProfile.js';
import { getDefaultRepository } from '../../config/loader.js';

let cachedProfileLoaded = false;
let cachedProfile: ReturnType<typeof loadDefaultLabProfile> | null = null;

function profileFor(schemaDir: string): ReturnType<typeof loadDefaultLabProfile> {
  if (!cachedProfileLoaded) {
    cachedProfile = loadDefaultLabProfile(schemaDir);
    cachedProfileLoaded = true;
  }
  return cachedProfile!;
}

export function registerLabProfileRoutes(fastify: FastifyInstance, ctx: AppContext) {
  fastify.get('/lab-profile', async () => {
    const base = profileFor(ctx.schemaDir);
    const repo = ctx.appConfig ? getDefaultRepository(ctx.appConfig) : null;
    const profile = mergeNamespace(base, repo?.namespace ?? null);
    return { profile };
  });
}