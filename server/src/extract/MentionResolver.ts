/**
 * MentionResolver - Deterministic name/alias matching for mention resolution.
 * 
 * This module provides pure functions to resolve mentions (e.g., "H2O2") to
 * canonical record IDs (e.g., "MSP-h2o2") using case-insensitive exact matching
 * on name or aliases. No fuzzy matching, embeddings, or LLM calls.
 * 
 * Extended mention resolution rules per compiler-specs/80-ai-pre-compiler.md §6:
 * - claim: match on title (case-insensitive substring) OR recordId exact
 * - context: match on recordId exact OR name case-insensitive exact
 * - operator: match on recordId exact OR display_name case-insensitive exact
 * - facility-zone: match on recordId exact OR zone_label case-insensitive exact
 */

export interface Mention {
  _mention: string;
  _kind: string;               // e.g., 'material-spec'
}

export type ResolutionKind =
  | 'material'
  | 'protocol'
  | 'publication'
  | 'claim'
  | 'context'
  | 'operator'
  | 'facility-zone';

export interface ResolutionCandidate {
  record_id: string;
  kind: string;
  name?: string;
  aliases?: string[];
  // Extended fields for new resolution kinds
  title?: string;              // For claim kind
  display_name?: string;       // For operator kind
  zone_label?: string;         // For facility-zone kind
}

export interface ResolvedRef {
  kind: 'record';
  id: string;
  type: string;
}

export interface MentionResolution {
  status: 'resolved' | 'ambiguous' | 'unresolved';
  record_ref?: ResolvedRef;
  matched_candidate_ids?: string[];  // for 'ambiguous'
  reason?: string;                    // for 'unresolved' / 'ambiguous'
}

export interface AmbiguitySpan {
  path: string;    // JSON-path into the draft
  reason: string;
  matched_candidate_ids?: string[];
}

export interface ResolveManyResult<T> {
  resolved_draft: T;
  ambiguity_spans: AmbiguitySpan[];
}

/**
 * Helper: Find candidates by exact record_id match.
 */
function findByRecordId(candidates: ReadonlyArray<ResolutionCandidate>, id: string): ResolutionCandidate[] {
  return candidates.filter(c => c.record_id === id);
}

/**
 * Helper: Find candidates by case-insensitive exact match on a string field.
 */
function findByExactField(
  candidates: ReadonlyArray<ResolutionCandidate>,
  field: keyof ResolutionCandidate,
  value: string
): ResolutionCandidate[] {
  const needle = value.toLowerCase().trim();
  return candidates.filter(c => {
    const fieldValue = c[field];
    if (typeof fieldValue !== 'string') return false;
    return fieldValue.toLowerCase().trim() === needle;
  });
}

/**
 * Helper: Find candidates by case-insensitive substring match on a string field.
 */
function findBySubstringField(
  candidates: ReadonlyArray<ResolutionCandidate>,
  field: keyof ResolutionCandidate,
  value: string
): ResolutionCandidate[] {
  const needle = value.toLowerCase().trim();
  return candidates.filter(c => {
    const fieldValue = c[field];
    if (typeof fieldValue !== 'string') return false;
    return fieldValue.toLowerCase().includes(needle);
  });
}

/**
 * Resolve a single mention against a list of candidates.
 * 
 * @param mention - The mention to resolve (name and kind)
 * @param candidates - List of candidate records to match against
 * @returns Resolution result with status and optional record_ref
 */
export function resolveMention(
  mention: Mention,
  candidates: ReadonlyArray<ResolutionCandidate>,
): MentionResolution {
  // Filter to candidates of the same kind
  const filtered = candidates.filter(c => c.kind === mention._kind);
  
  // Normalize the mention string
  const needle = mention._mention.toLowerCase().trim();
  
  // Handle extended resolution kinds per compiler-specs/80-ai-pre-compiler.md §6
  switch (mention._kind) {
    case 'claim': {
      // claim (recordId pattern `CLM-*`): match on `title` (case-insensitive substring) OR `recordId` exact. Ambiguity if >1 match.
      // Try exact record_id match first
      const byId = findByRecordId(filtered, mention._mention);
      if (byId.length === 1) {
        return {
          status: 'resolved',
          record_ref: {
            kind: 'record',
            id: byId[0]!.record_id,
            type: 'claim'
          }
        };
      }
      if (byId.length > 1) {
        return {
          status: 'ambiguous',
          matched_candidate_ids: byId.map(c => c.record_id),
          reason: `${byId.length} claims matched by record ID`
        };
      }
      
      // Try substring match on title
      const byTitle = findBySubstringField(filtered, 'title', mention._mention);
      if (byTitle.length === 1) {
        return {
          status: 'resolved',
          record_ref: {
            kind: 'record',
            id: byTitle[0]!.record_id,
            type: 'claim'
          }
        };
      }
      if (byTitle.length > 1) {
        return {
          status: 'ambiguous',
          matched_candidate_ids: byTitle.map(c => c.record_id),
          reason: `${byTitle.length} claims matched by title substring`
        };
      }
      
      return {
        status: 'unresolved',
        reason: `no claim with record ID or title containing '${mention._mention}'`
      };
    }
    
    case 'context': {
      // context (recordId pattern `CTX-*`): match on `recordId` exact OR `name` case-insensitive exact. Context names may repeat across timelines, so ambiguity is common — tolerate.
      // Try exact record_id match first
      const byId = findByRecordId(filtered, mention._mention);
      if (byId.length === 1) {
        return {
          status: 'resolved',
          record_ref: {
            kind: 'record',
            id: byId[0]!.record_id,
            type: 'context'
          }
        };
      }
      if (byId.length > 1) {
        return {
          status: 'ambiguous',
          matched_candidate_ids: byId.map(c => c.record_id),
          reason: `${byId.length} contexts matched by record ID`
        };
      }
      
      // Try exact match on name
      const byName = findByExactField(filtered, 'name', mention._mention);
      if (byName.length === 1) {
        return {
          status: 'resolved',
          record_ref: {
            kind: 'record',
            id: byName[0]!.record_id,
            type: 'context'
          }
        };
      }
      if (byName.length > 1) {
        return {
          status: 'ambiguous',
          matched_candidate_ids: byName.map(c => c.record_id),
          reason: `${byName.length} contexts matched by name`
        };
      }
      
      return {
        status: 'unresolved',
        reason: `no context with record ID or name '${mention._mention}'`
      };
    }
    
    case 'operator': {
      // operator (recordId pattern `OP-*`): match on `recordId` exact OR `display_name` case-insensitive exact. Do not do fuzzy match on humans — too risky.
      // Try exact record_id match first
      const byId = findByRecordId(filtered, mention._mention);
      if (byId.length === 1) {
        return {
          status: 'resolved',
          record_ref: {
            kind: 'record',
            id: byId[0]!.record_id,
            type: 'operator'
          }
        };
      }
      if (byId.length > 1) {
        return {
          status: 'ambiguous',
          matched_candidate_ids: byId.map(c => c.record_id),
          reason: `${byId.length} operators matched by record ID`
        };
      }
      
      // Try exact match on display_name
      const byDisplayName = findByExactField(filtered, 'display_name', mention._mention);
      if (byDisplayName.length === 1) {
        return {
          status: 'resolved',
          record_ref: {
            kind: 'record',
            id: byDisplayName[0]!.record_id,
            type: 'operator'
          }
        };
      }
      if (byDisplayName.length > 1) {
        return {
          status: 'ambiguous',
          matched_candidate_ids: byDisplayName.map(c => c.record_id),
          reason: `${byDisplayName.length} operators matched by display name`
        };
      }
      
      return {
        status: 'unresolved',
        reason: `no operator with record ID or display name '${mention._mention}'`
      };
    }
    
    case 'facility-zone': {
      // facility-zone (recordId pattern `FZ-*`): match on `recordId` exact OR `zone_label` case-insensitive exact. Zones are typically unique per facility.
      // Try exact record_id match first
      const byId = findByRecordId(filtered, mention._mention);
      if (byId.length === 1) {
        return {
          status: 'resolved',
          record_ref: {
            kind: 'record',
            id: byId[0]!.record_id,
            type: 'facility-zone'
          }
        };
      }
      if (byId.length > 1) {
        return {
          status: 'ambiguous',
          matched_candidate_ids: byId.map(c => c.record_id),
          reason: `${byId.length} facility zones matched by record ID`
        };
      }
      
      // Try exact match on zone_label
      const byZoneLabel = findByExactField(filtered, 'zone_label', mention._mention);
      if (byZoneLabel.length === 1) {
        return {
          status: 'resolved',
          record_ref: {
            kind: 'record',
            id: byZoneLabel[0]!.record_id,
            type: 'facility-zone'
          }
        };
      }
      if (byZoneLabel.length > 1) {
        return {
          status: 'ambiguous',
          matched_candidate_ids: byZoneLabel.map(c => c.record_id),
          reason: `${byZoneLabel.length} facility zones matched by zone label`
        };
      }
      
      return {
        status: 'unresolved',
        reason: `no facility zone with record ID or zone label '${mention._mention}'`
      };
    }
    
    default: {
      // Original behavior for material, protocol, publication kinds
      // Find all matching candidates
      const matches: ResolutionCandidate[] = [];
      
      for (const candidate of filtered) {
        // Check name match
        if (candidate.name) {
          const normalized = candidate.name.toLowerCase().trim();
          if (normalized === needle) {
            matches.push(candidate);
            continue;
          }
        }
        
        // Check alias match
        if (candidate.aliases) {
          const aliasMatch = candidate.aliases.some(alias => 
            alias.toLowerCase().trim() === needle
          );
          if (aliasMatch) {
            matches.push(candidate);
          }
        }
      }
      
      // Determine status based on match count
      if (matches.length === 0) {
        return {
          status: 'unresolved',
          reason: `no record of kind '${mention._kind}' with name or alias '${mention._mention}'`
        };
      }
      
      if (matches.length === 1) {
        const candidate = matches[0]!;
        return {
          status: 'resolved',
          record_ref: {
            kind: 'record',
            id: candidate.record_id,
            type: candidate.kind
          }
        };
      }
      
      // 2+ matches = ambiguous
      return {
        status: 'ambiguous',
        matched_candidate_ids: matches.map(m => m.record_id),
        reason: `${matches.length} records matched`
      };
    }
  }
}

/**
 * Check if a value is a mention marker object.
 * A mention marker has exactly _mention (string) and _kind (string) keys.
 * It may have other keys too - we ignore them.
 */
function isMentionMarker(value: unknown): value is { _mention: string; _kind: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  
  const obj = value as Record<string, unknown>;
  return (
    typeof obj._mention === 'string' &&
    typeof obj._kind === 'string'
  );
}

/**
 * Deep clone a value without mutating the original.
 */
function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  
  if (Array.isArray(value)) {
    return value.map(deepClone) as unknown as T;
  }
  
  const cloned: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    cloned[key] = deepClone((value as Record<string, unknown>)[key]);
  }
  return cloned as T;
}

/**
 * Walk a draft Object tree and resolve all mention markers.
 * 
 * @param draft - The draft Object containing mention markers
 * @param candidatesByKind - Map from kind to list of candidates
 * @returns Resolved draft with ambiguity spans
 */
export function resolveMentions<T extends object>(
  draft: T,
  candidatesByKind: ReadonlyMap<string, ReadonlyArray<ResolutionCandidate>>,
): ResolveManyResult<T> {
  const resolved_draft = deepClone(draft);
  const ambiguity_spans: AmbiguitySpan[] = [];
  
  /**
   * DFS traversal to find and resolve mention markers.
   * @param node - Current node in the tree
   * @param path - Current JSON path (e.g., "contents[0].material_ref")
   * @param parent - Parent object (for replacement)
   * @param parentKey - Key in parent where this node lives
   */
  function traverse(node: unknown, path: string, parent: unknown, parentKey: string | null): void {
    if (node === null || typeof node !== 'object') {
      return;
    }
    
    // Check if this node is a mention marker
    if (isMentionMarker(node)) {
      const mention: Mention = {
        _mention: node._mention,
        _kind: node._kind
      };
      
      const candidates = candidatesByKind.get(mention._kind) ?? [];
      const resolution = resolveMention(mention, candidates);
      
      if (resolution.status === 'resolved' && resolution.record_ref && parentKey !== null) {
        // Replace the marker with the resolved ref
        if (Array.isArray(parent)) {
          const idx = parseInt(parentKey, 10);
          if (!isNaN(idx)) {
            (parent as unknown[])[idx] = resolution.record_ref;
          }
        } else {
          (parent as Record<string, unknown>)[parentKey] = resolution.record_ref;
        }
      } else {
        // Ambiguous or unresolved - add to ambiguity_spans
        const span: AmbiguitySpan = {
          path,
          reason: resolution.reason ?? 'unknown error'
        };
        if (resolution.matched_candidate_ids) {
          span.matched_candidate_ids = resolution.matched_candidate_ids;
        }
        ambiguity_spans.push(span);
      }
      return;
    }
    
    // Continue traversing children
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const childPath = path === '' ? `[${i}]` : `${path}[${i}]`;
        traverse(node[i], childPath, node, String(i));
      }
    } else {
      for (const key of Object.keys(node)) {
        const childPath = path === '' ? key : `${path}.${key}`;
        traverse((node as Record<string, unknown>)[key], childPath, node, key);
      }
    }
  }
  
  traverse(resolved_draft, '', null, null);
  
  return { resolved_draft, ambiguity_spans };
}
