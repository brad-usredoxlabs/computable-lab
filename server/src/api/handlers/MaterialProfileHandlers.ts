import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RecordStore } from '../../store/types.js';
import type { MaterialProfileRegistry } from '../../materials/MaterialProfileRegistry.js';
import { ensureLocalMaterialForOntology, type RefShape } from '../../materials/MaterialGrounding.js';

interface ProfileParams {
  profileId: string;
}

interface GroundOntologyBody {
  ontologyRef?: Partial<RefShape>;
  domainHint?: string;
  profileId?: string;
  sourceLabel?: string;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeOntologyRef(body: GroundOntologyBody): RefShape | null {
  const ref = body.ontologyRef;
  if (!ref || ref.kind !== 'ontology') return null;
  const id = asString(ref.id);
  if (!id) return null;
  const normalized: RefShape = { kind: 'ontology', id };
  const type = asString(ref.type);
  const label = asString(ref.label);
  const namespace = asString(ref.namespace);
  const uri = asString(ref.uri);
  if (type) normalized.type = type;
  if (label) normalized.label = label;
  if (namespace) normalized.namespace = namespace;
  if (uri) normalized.uri = uri;
  return normalized;
}

export class MaterialProfileHandlers {
  constructor(
    private readonly registry: MaterialProfileRegistry,
    private readonly store: RecordStore,
  ) {}

  async listProfiles(_request: FastifyRequest, _reply: FastifyReply) {
    return {
      version: this.registry.toJSON().version,
      profiles: this.registry.list(),
    };
  }

  async getProfile(request: FastifyRequest<{ Params: ProfileParams }>, reply: FastifyReply) {
    const profile = this.registry.get(request.params.profileId);
    if (!profile) {
      reply.code(404);
      return { error: 'Material profile not found', profileId: request.params.profileId };
    }
    return { profile };
  }

  async groundOntology(request: FastifyRequest<{ Body: GroundOntologyBody }>, reply: FastifyReply) {
    const body = request.body ?? {};
    const ontologyRef = normalizeOntologyRef(body);
    if (!ontologyRef) {
      reply.code(400);
      return { error: 'ontologyRef with kind="ontology" and id is required' };
    }

    const profile = body.profileId ? this.registry.get(body.profileId) : null;
    if (body.profileId && !profile) {
      reply.code(400);
      return { error: 'Unknown material profile', profileId: body.profileId };
    }
    const domainHint = asString(body.domainHint)
      ?? profile?.applies_when.domain?.[0];

    const options = {
      source: 'ui' as const,
      sourceLabel: asString(body.sourceLabel) ?? ontologyRef.label ?? ontologyRef.id,
      createdBy: 'material-profile-api',
      note: 'Created as a proposed local material record from the material grounding API.',
      ...(domainHint ? { domainHint } : {}),
    };
    const materialRef = await ensureLocalMaterialForOntology(this.store, ontologyRef, options);

    return {
      materialRef,
      profileId: profile?.id ?? this.registry.lookup(domainHint ? { domain: domainHint } : {}).id,
    };
  }
}

export function createMaterialProfileHandlers(
  registry: MaterialProfileRegistry,
  store: RecordStore,
): MaterialProfileHandlers {
  return new MaterialProfileHandlers(registry, store);
}
