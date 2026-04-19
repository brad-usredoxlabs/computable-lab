import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError } from '../types.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from '../../extract/ExtractionRunnerService.js';
import type { ExtractionDraftBody } from '../../extract/ExtractionDraftBuilder.js';

type ExtractBody = {
  target_kind?: unknown;
  text?: unknown;
  source?: unknown;
  hint?: unknown;
};

export interface ExtractHandlers {
  extract(
    request: FastifyRequest<{ Body: ExtractBody }>,
    reply: FastifyReply,
  ): Promise<ExtractionDraftBody | ApiError>;
}

export function createExtractHandlers(runner: ExtractionRunnerService): ExtractHandlers {
  return {
    async extract(request, reply) {
      const body = request.body ?? {};
      const target_kind = typeof body.target_kind === 'string' ? body.target_kind.trim() : '';
      const text = typeof body.text === 'string' ? body.text : '';
      if (!target_kind || !text) {
        reply.code(400);
        return { error: 'INVALID_INPUT', message: 'target_kind and text are required' };
      }
      const source = isValidSource(body.source)
        ? body.source
        : { kind: 'freetext' as const, id: `ad-hoc-${new Date().toISOString()}` };
      const args: RunExtractionServiceArgs = buildArgs(target_kind, text, source, body.hint);
      return runner.run(args);
    },
  };
}

function buildArgs(
  target_kind: string,
  text: string,
  source: RunExtractionServiceArgs['source'],
  hint?: unknown
): RunExtractionServiceArgs {
  if (hint != null && typeof hint === 'object' && !Array.isArray(hint)) {
    const hintObj = hint as Record<string, unknown>;
    return { target_kind, text, source, hint: hintObj };
  }
  return { target_kind, text, source };
}

function isValidSource(v: unknown): v is RunExtractionServiceArgs['source'] {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (s.kind === 'file' || s.kind === 'publication' || s.kind === 'freetext')
    && typeof s.id === 'string';
}
