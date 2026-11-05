/**
 * A grounded material's TYPE decides what it owes — so read the type from the
 * record itself, not from the model's memory.
 *
 * Reported 2026-09-20: after picking the MESH HepG2 term, the harness still asked
 * "what volume of HepG2 cells". The pick was grounded (`MAT-MESH-D056945`), but
 * the per-type rules are selected by `domain` and neither the model's ref nor the
 * wire carried one — so the CHEMICAL default applied (concentration + volume) to
 * a cell line.
 *
 * The record knows: a `material` record declares `domain: cell_line`. This fills
 * that field onto the draft's reference so the rules follow the DATA. A minted
 * reference has no record to consult and is left exactly as the model wrote it
 * (its identity is still an open question, and an ungrounded material has no
 * type yet).
 */
type Dict = Record<string, unknown>;

const MATERIAL_REF_FIELDS = [
  'material_spec_ref',
  'material_instance_ref',
  'aliquot_ref',
  'vendor_product_ref',
  'material_ref',
] as const;

function asDict(value: unknown): Dict | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Dict) : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** The narrow slice of the record store this needs (keeps the module testable). */
export interface DomainLookupStore {
  get(recordId: string): Promise<unknown> | unknown;
}

/**
 * Pull `domain` out of whatever shape a stored record arrives in. The store and
 * the API both hand back `{ record: { recordId, payload: {...} } }`, and some
 * callers pass the bare payload — accept either rather than assume one.
 */
function domainOfRecord(record: unknown): string {
  const envelope = asDict(record);
  if (!envelope) return '';
  const inner = asDict(envelope['record']) ?? envelope;
  const payload = asDict(inner['payload']) ?? inner;
  return asString(payload['domain']);
}

export interface DomainEnrichment {
  events: unknown[];
  /** Ids whose domain was filled in (for the log). */
  enriched: string[];
}

export async function enrichMaterialDomains<T>(
  events: readonly T[],
  store: DomainLookupStore | undefined,
): Promise<DomainEnrichment> {
  const enriched: string[] = [];
  if (!store) return { events: [...events], enriched };
  const out: unknown[] = [];
  for (const ev of events) {
    const event = asDict(ev);
    const details = event ? asDict(event['details']) : null;
    if (!event || !details) {
      out.push(ev);
      continue;
    }
    let nextDetails: Dict | null = null;
    for (const field of MATERIAL_REF_FIELDS) {
      const ref = asDict(details[field]);
      if (!ref) continue;
      if (asString(ref['domain'])) continue;          // already known
      const id = asString(ref['id']);
      if (!id || id.startsWith('mint:')) continue;    // a mint has no record to consult
      let record: unknown;
      try {
        record = await store.get(id);
      } catch {
        continue;                                     // a lookup failure must not break a draft
      }
      const domain = domainOfRecord(record);
      if (!domain) continue;
      nextDetails = { ...(nextDetails ?? details), [field]: { ...ref, domain } };
      enriched.push(id);
    }
    out.push(nextDetails ? { ...event, details: nextDetails } : ev);
  }
  return { events: out, enriched };
}
