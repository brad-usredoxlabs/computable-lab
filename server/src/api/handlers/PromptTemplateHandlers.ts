/**
 * PromptTemplateHandlers — HTTP handlers for prompt-template registry.
 *
 * These handlers provide read-only access to prompt templates via the
 * prompt-template registry.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RegistryLoader } from '../../registry/RegistryLoader.js';
import type { PromptTemplate } from '../../registry/PromptTemplateRegistry.js';
import type { ApiError } from '../types.js';

/**
 * Response shape for a single prompt-template lookup.
 */
export interface PromptTemplateResponse {
  success: true;
  id: string;
  prompt_kind: string;
  description: string;
  content_format: 'markdown' | 'plain';
  content: string;
  variables: Array<{ name: string; type: string; description: string }>;
}

/**
 * Create prompt-template handlers bound to a PromptTemplate registry.
 */
export function createPromptTemplateHandlers(
  registry: RegistryLoader<PromptTemplate>,
) {
  return {
    /**
     * GET /prompt-templates/:id
     * Get a single prompt template by id.
     */
    async getPromptTemplate(
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ): Promise<PromptTemplateResponse | ApiError> {
      const { id } = request.params;

      const template = registry.get(id);

      if (!template) {
        reply.status(404);
        return {
          error: 'NOT_FOUND',
          message: `Prompt template not found: ${id}`,
        };
      }

      return {
        success: true,
        id: template.id,
        prompt_kind: template.prompt_kind,
        description: template.description,
        content_format: template.content_format,
        content: template.content,
        variables: template.variables ?? [],
      };
    },
  };
}

export type PromptTemplateHandlers = ReturnType<typeof createPromptTemplateHandlers>;
