import type { RecordStore, RecordEnvelope } from '../store/types.js';
import type { ResolutionCandidate } from './MentionResolver.js';
import type { MaterialMatchService } from '../ingestion/matching/MaterialMatchService.js';

export interface MentionCandidatePopulatorDeps {
  store: RecordStore;
  matchService?: MaterialMatchService;
}

export class MentionCandidatePopulator {
  constructor(private readonly deps: MentionCandidatePopulatorDeps) {}

  async populate(kinds: ReadonlyArray<string>): Promise<Map<string, ResolutionCandidate[]>> {
    const result = new Map<string, ResolutionCandidate[]>();
    for (const kind of kinds) {
      const records = await this.deps.store.list({ kind });
      const candidates = records.map(env => this.toResolutionCandidate(env, kind));
      result.set(kind, candidates);
    }
    return result;
  }

  private toResolutionCandidate(envelope: RecordEnvelope, kind: string): ResolutionCandidate {
    const p = envelope.payload as Record<string, unknown>;
    const name = typeof p.name === 'string' ? p.name
      : typeof p.display_name === 'string' ? p.display_name
      : typeof p.title === 'string' ? p.title
      : undefined;
    const aliases = Array.isArray(p.aliases)
      ? p.aliases.filter((a): a is string => typeof a === 'string')
      : undefined;
    const candidate: ResolutionCandidate = {
      record_id: envelope.recordId,
      kind,
    };
    if (name) candidate.name = name;
    if (aliases && aliases.length > 0) candidate.aliases = aliases;
    if (kind === 'claim' && typeof p.title === 'string') candidate.title = p.title;
    if (kind === 'operator' && typeof p.display_name === 'string') candidate.display_name = p.display_name;
    if (kind === 'facility-zone' && typeof p.zone_label === 'string') candidate.zone_label = p.zone_label;
    return candidate;
  }
}
