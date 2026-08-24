/**
 * Intent-accept handlers — persist an ACCEPTED one-shot local macro as a
 * `local-protocol` record (the durable artifact, D4).
 *
 * The user browses + refines the one-shot macro in the chat, then Accepts. This
 * endpoint maps the final (refinement-folded) scientist-intent macro into a
 * `local-protocol` that `inherits_from` the source universal protocol, records
 * the resolved branch axes, and carries the macro's per-action parameters under
 * `overrides.parameters` so the localized intent is preserved verbatim (this is
 * exactly the artifact the corpus trains to — Q6).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from '../../server.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import type { ScientistIntentActionValue } from '../../compiler/scientistIntent/types.js';

export const LOCAL_PROTOCOL_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml';

interface AcceptBody {
  sourceProtocolId?: string;
  sourceTitle?: string;
  title?: string;
  localMacro?: { intentId?: string; actions?: ScientistIntentActionValue[]; [key: string]: unknown };
  /** Resolved branch axes: { axisId: chosenValue } (provenance of localization). */
  answers?: Record<string, string>;
  links?: { studyId?: string; experimentId?: string; runId?: string };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function createIntentAcceptHandlers(ctx: AppContext) {
  return {
    async accept(
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply,
    ): Promise<void> {
      const body = request.body as AcceptBody | undefined;
      const sourceProtocolId = body?.sourceProtocolId;
      const macro = body?.localMacro;
      const actions = Array.isArray(macro?.actions) ? macro.actions : [];
      if (!sourceProtocolId || actions.length === 0) {
        return reply.status(400).send({
          error: 'INVALID_ACCEPT',
          message: 'Body must provide sourceProtocolId and a localMacro with actions.',
        });
      }

      // Build a stable local-protocol recordId.
      const base = slugify(body?.title ?? body?.sourceTitle ?? sourceProtocolId) || 'localized';
      const recordId = `LPR-${base}-${Date.now().toString(36)}`;

      // Persist the macro actions verbatim under overrides.parameters.
      const overrides = {
        parameters: actions.map((action) => {
          const { action: verb, ...params } = action ?? {};
          return { action: verb, ...params };
        }),
      };

      const payload: Record<string, unknown> = {
        protocolLayer: 'lab',
        kind: 'local-protocol',
        recordId,
        title: body?.title ?? (body?.sourceTitle ? `${body.sourceTitle} (localized)` : 'Localized protocol'),
        inherits_from: { kind: 'record', id: sourceProtocolId, type: 'protocol' },
        status: 'active',
        overrides,
        ...(body?.answers && Object.keys(body.answers).length > 0
          ? {
              branch_resolution: Object.entries(body.answers).map(([axisId, chosenValue]) => ({
                axisId,
                matched: true,
                branchIds: [chosenValue],
                choices: { [axisId]: chosenValue },
              })),
            }
          : {}),
        ...(body?.links ? { links: body.links } : {}),
      };

      const envelope: RecordEnvelope = {
        recordId,
        schemaId: LOCAL_PROTOCOL_SCHEMA_ID,
        payload,
      };

      try {
        const result = await ctx.store.create({ envelope, message: `Accept one-shot local protocol ${recordId}` });
        if (!result.success) {
          return reply.status(409).send({
            error: 'ACCEPT_CREATE_FAILED',
            message: result.error ?? 'Failed to create local-protocol',
            ...(result.validation ? { validation: result.validation } : {}),
          });
        }
        return reply.send({
          ok: true,
          recordId,
          localProtocol: payload,
        });
      } catch (err) {
        request.log.error({ err }, 'Failed to persist accepted local-protocol');
        return reply.status(500).send({
          error: 'ACCEPT_INTERNAL',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function registerIntentAcceptRoutes(instance: FastifyInstance, ctx: AppContext): void {
  const h = createIntentAcceptHandlers(ctx);
  instance.post('/intent/accept', h.accept.bind(h));
}