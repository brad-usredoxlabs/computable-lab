import type { FastifyReply, FastifyRequest } from 'fastify';
import { resolveOntologyMolecularWeight } from '../../chemistry/molecularWeight.js';

export interface ChemistryHandlers {
  resolveMolecularWeight(
    request: FastifyRequest<{ Querystring: { namespace?: string; id?: string; label?: string; uri?: string } }>,
    reply: FastifyReply,
  ): Promise<unknown>;
}

export function createChemistryHandlers(): ChemistryHandlers {
  return {
    async resolveMolecularWeight(request, reply) {
      const { namespace, id, label, uri } = request.query;
      if (![namespace, id, label, uri].some((value) => typeof value === 'string' && value.trim())) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'namespace, id, label, or uri is required' };
      }

      try {
        const result = await resolveOntologyMolecularWeight({
          ...(typeof namespace === 'string' ? { namespace } : {}),
          ...(typeof id === 'string' ? { id } : {}),
          ...(typeof label === 'string' ? { label } : {}),
          ...(typeof uri === 'string' ? { uri } : {}),
        });
        return {
          resolved: result.resolved,
          source: result.source,
          ...(typeof result.molecularWeight === 'number'
            ? { molecularWeight: { value: result.molecularWeight, unit: 'g/mol' as const } }
            : {}),
          ...(result.formula ? { formula: result.formula } : {}),
          ...(result.matchedName ? { matchedName: result.matchedName } : {}),
          ...(result.chebiId ? { chebiId: result.chebiId } : {}),
          ...(typeof result.pubchemCid === 'number' ? { pubchemCid: result.pubchemCid } : {}),
        };
      } catch (err) {
        request.log.error(err, 'Failed to resolve molecular weight');
        reply.status(500);
        return {
          error: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
