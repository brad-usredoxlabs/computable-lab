import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RecordStore } from '../../store/types.js';
import { createEnvelope } from '../../types/RecordEnvelope.js';

type ExecuteRecipeBody = {
  scale?: number;
  outputCount?: number;
  outputVolume?: { value: number; unit: string };
  bindings?: Record<string, { aliquotId: string }>;
  notes?: string;
};

type RefShape = { kind: 'record'; id: string; type: string; label?: string };

function randomToken(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function toRef(id: string, type: string, label?: string): RefShape {
  return { kind: 'record', id, type, ...(label ? { label } : {}) };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function parseOutputSpecRef(recipePayload: Record<string, unknown>): RefShape | null {
  const raw = recipePayload['output_material_spec_ref'];
  if (!isObject(raw)) return null;
  const id = typeof raw['id'] === 'string' ? raw['id'] : '';
  if (!id) return null;
  return {
    kind: 'record',
    id,
    type: typeof raw['type'] === 'string' ? raw['type'] : 'material-spec',
    ...(typeof raw['label'] === 'string' ? { label: raw['label'] } : {}),
  };
}

export interface MaterialPrepHandlers {
  executeRecipe(
    request: FastifyRequest<{ Params: { id: string }; Body: ExecuteRecipeBody }>,
    reply: FastifyReply
  ): Promise<
    | {
      success: true;
      recipeId: string;
      preparationEventGraphId: string;
      createdAliquotIds: string[];
    }
    | { error: string; message: string }
  >;
}

export function createMaterialPrepHandlers(store: RecordStore): MaterialPrepHandlers {
  return {
    async executeRecipe(request, reply) {
      const recipeId = request.params.id;
      const scale = Number.isFinite(request.body?.scale) ? Number(request.body.scale) : 1;
      const outputCount = Number.isFinite(request.body?.outputCount) ? Math.max(1, Math.floor(Number(request.body.outputCount))) : 1;
      const outputVolume = request.body?.outputVolume && Number.isFinite(request.body.outputVolume.value)
        ? request.body.outputVolume
        : { value: 100, unit: 'uL' };
      const notes = typeof request.body?.notes === 'string' ? request.body.notes : undefined;

      const recipeEnv = await store.get(recipeId);
      if (!recipeEnv) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Recipe not found: ${recipeId}` };
      }
      const recipePayload = isObject(recipeEnv.payload) ? recipeEnv.payload : null;
      if (!recipePayload || recipePayload['kind'] !== 'recipe') {
        reply.status(422);
        return { error: 'INVALID_RECIPE', message: `${recipeId} is not a recipe record` };
      }
      const outputSpecRef = parseOutputSpecRef(recipePayload);
      if (!outputSpecRef) {
        reply.status(422);
        return { error: 'INVALID_RECIPE', message: 'Recipe is missing output_material_spec_ref' };
      }

      const now = new Date().toISOString();
      const createdAliquotIds: string[] = [];
      for (let i = 0; i < outputCount; i += 1) {
        const aliquotId = `ALQ-${Date.now().toString(36).toUpperCase()}-${randomToken()}-${i + 1}`;
        const aliquotPayload = {
          kind: 'aliquot',
          id: aliquotId,
          name: `${(recipePayload['name'] as string | undefined) || recipeId} output ${i + 1}`,
          material_spec_ref: outputSpecRef,
          volume: {
            value: Number((outputVolume.value * scale).toFixed(6)),
            unit: outputVolume.unit,
          },
          source_lot_ref: toRef(recipeId, 'recipe', (recipePayload['name'] as string | undefined) || recipeId),
          tags: ['recipe-output'],
          createdAt: now,
          updatedAt: now,
        };
        const aliquotEnvelope = createEnvelope(
          aliquotPayload,
          'https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml',
          { createdAt: now, updatedAt: now }
        );
        if (!aliquotEnvelope) {
          reply.status(500);
          return { error: 'CREATE_FAILED', message: 'Failed to create aliquot envelope' };
        }
        const created = await store.create({
          envelope: aliquotEnvelope,
          message: `Create aliquot ${aliquotId} from recipe ${recipeId}`,
        });
        if (!created.success) {
          reply.status(500);
          return { error: 'CREATE_FAILED', message: created.error || `Failed to create aliquot ${aliquotId}` };
        }
        createdAliquotIds.push(aliquotId);
      }

      const prepEventGraphId = `EVG-PREP-${Date.now().toString(36).toUpperCase()}-${randomToken()}`;
      const prepPayload = {
        id: prepEventGraphId,
        name: `Preparation Run ${recipeId}`,
        description: 'Recipe execution provenance',
        status: 'filed',
        tags: ['preparation-run', 'recipe'],
        events: [
          {
            eventId: `evt-prep-${randomToken()}`,
            event_type: 'other',
            details: {
              recipe_ref: toRef(recipeId, 'recipe', (recipePayload['name'] as string | undefined) || recipeId),
              scale,
              bindings: request.body?.bindings || {},
              outputs: createdAliquotIds.map((id) => toRef(id, 'aliquot')),
              ...(notes ? { notes } : {}),
            },
            notes: 'Recipe execution recorded by materials preparation endpoint',
          },
        ],
        labwares: [],
        createdAt: now,
        updatedAt: now,
      };
      const prepEnvelope = createEnvelope(
        prepPayload,
        'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
        { createdAt: now, updatedAt: now }
      );
      if (!prepEnvelope) {
        reply.status(500);
        return { error: 'CREATE_FAILED', message: 'Failed to create preparation event graph envelope' };
      }
      const prepCreate = await store.create({
        envelope: prepEnvelope,
        message: `Record recipe preparation run ${prepEventGraphId}`,
      });
      if (!prepCreate.success) {
        reply.status(500);
        return { error: 'CREATE_FAILED', message: prepCreate.error || 'Failed to create preparation event graph' };
      }

      return {
        success: true,
        recipeId,
        preparationEventGraphId: prepEventGraphId,
        createdAliquotIds,
      };
    },
  };
}

