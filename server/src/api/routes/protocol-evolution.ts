/**
 * Protocol Evolution API Routes
 * 
 * Endpoints for analyzing protocol execution patterns and suggesting updates.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import { createProtocolEvolutionService, type ProtocolEvolutionAnalysis } from '../../services/ProtocolEvolutionService.js';

/**
 * Evolution suggestion request body
 */
interface CreateVersionRequest {
  suggestionId: string;
  changes: Array<{
    stepOrdinal: number;
    proposedAction: string;
    rationale: string;
  }>;
  userNotes?: string;
}

/**
 * Register protocol evolution routes
 */
export function registerProtocolEvolutionRoutes(fastify: FastifyInstance, ctx: AppContext) {
  /**
   * GET /api/protocols/:id/evolution-suggestions
   * Analyze a protocol and return deviation patterns with suggestions
   */
  fastify.get<{
    Params: { id: string };
    Reply: ProtocolEvolutionAnalysis | { error: string };
  }>('/protocols/:id/evolution-suggestions', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const protocolId = request.params.id;
      const evolutionService = createProtocolEvolutionService(ctx);
      const analysis = await evolutionService.analyzeProtocolEvolution(protocolId);
      
      return reply.send(analysis);
    } catch (error) {
      console.error('Error analyzing protocol evolution:', error);
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to analyze protocol evolution' 
      });
    }
  });

  /**
   * POST /api/protocols/:id/evolve
   * Create a new protocol version based on evolution suggestions
   */
  fastify.post<{
    Params: { id: string };
    Body: CreateVersionRequest;
    Reply: { newProtocolId: string; version: string } | { error: string };
  }>('/protocols/:id/evolve', async (request: FastifyRequest<{ Params: { id: string }; Body: CreateVersionRequest }>, reply: FastifyReply) => {
    try {
      const protocolId = request.params.id;
      const { suggestionId, changes, userNotes } = request.body;
      
      const evolutionService = createProtocolEvolutionService(ctx);
      const result = await evolutionService.createProtocolVersion(
        protocolId,
        suggestionId,
        changes,
        userNotes
      );
      
      return reply.send(result);
    } catch (error) {
      console.error('Error creating protocol version:', error);
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : 'Failed to create protocol version' 
      });
    }
  });
}
