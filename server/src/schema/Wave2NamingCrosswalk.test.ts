import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

/**
 * W2-1-NAMING-CROSSWALK — headless admission check for wave-2 terms.
 *
 * The admission predicate is DATA (schema/registry/wave2-naming-crosswalk.yaml
 * `admission:` section). This test is the enforcement: it loads the crosswalk,
 * generically enumerates the existing namespaces (record kinds across every
 * .schema.yaml under schema/, operations.yaml ids, the scientist-intent 31-verb
 * enum, verb-definition seed canonicals, verb-action-map verbs), and FAILS on
 * a deliberately-colliding fixture term proposed as NEW. Generic
 * set-comparison only — no hardcoded domain branches beyond reading these
 * data files.
 *
 * Also re-derives the machine counts pinned in
 * schema/registry/wave2-verb-adjudication.yaml (drift guard: the declared
 * counts must equal the parsed counts).
 */

const CROSSWALK_PATH = join(process.cwd(), '..', 'schema', 'registry', 'wave2-naming-crosswalk.yaml');
const ADJUDICATION_PATH = join(process.cwd(), '..', 'schema', 'registry', 'wave2-verb-adjudication.yaml');
const SCHEMA_ROOT = join(process.cwd(), '..', 'schema');
const RECORDS_VERB_DIR = join(process.cwd(), '..', 'records', 'seed', 'verb-definition');

type CrosswalkEntry = {
  term: string;
  status: string;
  curie_plan?: string;
  binds_to?: Record<string, unknown>;
};

type Crosswalk = {
  kind: string;
  entries: CrosswalkEntry[];
  forbidden_kinds: string[];
  admission: {
    rules: { id: string; namespaces?: string[]; pattern?: string }[];
  };
};

/** Normalize a term for collision comparison: lowercase, '-' == '_'. */
function normalize(term: string): string {
  return term.trim().toLowerCase().replace(/-/g, '_');
}

async function readYaml(path: string): Promise<unknown> {
  return parseYaml(await readFile(path, 'utf8'));
}

/** Recursively list every *.schema.yaml under schema/ (generic walk). */
async function walkSchemaYaml(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkSchemaYaml(p)));
    else if (entry.isFile() && entry.name.endsWith('.schema.yaml')) out.push(p);
  }
  return out;
}

/** Enumerate the existing namespaces purely from the data files. */
async function enumerateNamespaces(): Promise<Record<string, Set<string>>> {
  const kinds = new Set<string>();
  for (const path of await walkSchemaYaml(SCHEMA_ROOT)) {
    const doc = (await readYaml(path)) as Record<string, unknown> | null;
    const props = doc?.properties as Record<string, unknown> | undefined;
    const kind = props?.kind as Record<string, unknown> | undefined;
    if (kind && typeof kind.const === 'string') kinds.add(kind.const);
  }

  const ops = (await readYaml(join(SCHEMA_ROOT, 'registry', 'operations.yaml'))) as {
    operations: { id: string }[];
  };
  const operationIds = new Set(ops.operations.map((o) => o.id));

  const siSchema = (await readYaml(join(SCHEMA_ROOT, 'workflow', 'scientist-intent.schema.yaml'))) as {
    $defs: { actionVerb: { enum: string[] } };
  };
  const siVerbs = new Set(siSchema.$defs.actionVerb.enum);

  const vocab = (await readYaml(join(SCHEMA_ROOT, 'scientist-intent', 'scientist-intent-vocabulary.yaml'))) as {
    verbs: { name: string }[];
  };
  const vocabVerbs = new Set(vocab.verbs.map((v) => v.name));

  const vdCanonicals = new Set<string>();
  const vdIds = new Set<string>();
  for (const name of await readdir(RECORDS_VERB_DIR)) {
    if (!name.endsWith('.yaml')) continue;
    const rec = (await readYaml(join(RECORDS_VERB_DIR, name))) as { id: string; canonical: string };
    vdIds.add(rec.id);
    vdCanonicals.add(rec.canonical);
  }

  const vam = (await readYaml(join(SCHEMA_ROOT, 'registry', 'verb-action-map.yaml'))) as {
    mappings: { verb: string }[];
  };
  const vamVerbs = new Set(vam.mappings.map((m) => m.verb));

  return {
    'record-kind': kinds,
    'operation-id': operationIds,
    'scientist-intent-verb': siVerbs,
    'verb-definition-canonical': vdCanonicals,
    'verb-action-map-verb': vamVerbs,
    // extra sets exposed for the adjudication drift checks (not admission namespaces)
    'scientist-intent-vocabulary-verb': vocabVerbs,
    'verb-definition-id': vdIds,
  };
}

/**
 * Admission check exactly as declared in the crosswalk's `admission:` section:
 * (1) resolves through the crosswalk, (2) no collision with any enumerated
 * namespace (only enforced for terms proposed as NEW), (3) carries a `cf:`
 * CURIE plan matching the crosswalk's declared pattern.
 */
function checkAdmission(
  proposed: CrosswalkEntry,
  crosswalk: Crosswalk,
  namespaces: Record<string, Set<string>>,
): { admitted: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Rule 1: resolves through the crosswalk.
  const listed = crosswalk.entries.find((e) => normalize(e.term) === normalize(proposed.term));
  if (!listed) reasons.push('not-listed-in-crosswalk');

  // Rule 2: no-collision (NEW proposals only: pending-admission / missing-datatype).
  const noCollisionRule = crosswalk.admission.rules.find((r) => r.id === 'no-collision');
  const isNew = proposed.status === 'new-vocab-pending-admission' || proposed.status === 'missing-datatype';
  if (noCollisionRule && isNew) {
    const norm = normalize(proposed.term);
    for (const nsName of noCollisionRule.namespaces ?? []) {
      const set = namespaces[nsName];
      if (!set) continue;
      for (const existing of set) {
        if (normalize(existing) === norm) {
          reasons.push(`collides-with-${nsName}:${existing}`);
        }
      }
    }
  }

  // Rule 3: CURIE plan (NEW proposals only).
  const curieRule = crosswalk.admission.rules.find((r) => r.id === 'curie-plan');
  if (curieRule && isNew) {
    const pattern = new RegExp(curieRule.pattern ?? '^cf:[a-z0-9][a-z0-9-]*$');
    if (!proposed.curie_plan || !pattern.test(proposed.curie_plan)) {
      reasons.push('missing-or-invalid-curie-plan');
    }
  }

  return { admitted: reasons.length === 0, reasons };
}

describe('W2-1 naming crosswalk admission check', () => {
  it('crosswalk loads as data and declares its admission rules', async () => {
    const crosswalk = (await readYaml(CROSSWALK_PATH)) as Crosswalk;
    expect(crosswalk.kind).toBe('naming-crosswalk');
    expect(crosswalk.entries.length).toBeGreaterThan(0);
    const ruleIds = crosswalk.admission.rules.map((r) => r.id);
    expect(ruleIds).toContain('resolves-through-crosswalk');
    expect(ruleIds).toContain('no-collision');
    expect(ruleIds).toContain('curie-plan');
  });

  it('every crosswalk entry that binds to a record kind resolves against the enumerated kinds', async () => {
    const crosswalk = (await readYaml(CROSSWALK_PATH)) as Crosswalk;
    const namespaces = await enumerateNamespaces();
    const kinds = namespaces['record-kind'];
    for (const entry of crosswalk.entries) {
      const bound = entry.binds_to?.kind;
      if (typeof bound === 'string') {
        expect(kinds.has(bound), `${entry.term} binds to unknown kind ${bound}`).toBe(true);
      }
    }
  });

  it('forbidden kinds are NOT present in the enumerated record-kind set (zero new kinds minted)', async () => {
    const crosswalk = (await readYaml(CROSSWALK_PATH)) as Crosswalk;
    const namespaces = await enumerateNamespaces();
    const kinds = namespaces['record-kind'];
    for (const forbidden of crosswalk.forbidden_kinds) {
      expect(kinds.has(forbidden), `forbidden kind ${forbidden} exists`).toBe(false);
    }
  });

  it('DELIBERATE COLLISION fixtures: existing kind / verb / canonical proposed as NEW are flagged', async () => {
    const crosswalk = (await readYaml(CROSSWALK_PATH)) as Crosswalk;
    const namespaces = await enumerateNamespaces();

    // Fixture 1: an existing record kind proposed as a NEW wave-2 term.
    const collideKind: CrosswalkEntry = {
      term: 'local-protocol',
      status: 'new-vocab-pending-admission',
      curie_plan: 'cf:local-protocol',
    };
    const r1 = checkAdmission(collideKind, crosswalk, namespaces);
    expect(r1.admitted).toBe(false);
    expect(r1.reasons.some((r) => r.startsWith('collides-with-record-kind'))).toBe(true);

    // Fixture 2: a scientist-intent verb duplicate proposed as NEW.
    const collideVerb: CrosswalkEntry = {
      term: 'incubate',
      status: 'new-vocab-pending-admission',
      curie_plan: 'cf:incubate',
    };
    const r2 = checkAdmission(collideVerb, crosswalk, namespaces);
    expect(r2.admitted).toBe(false);
    expect(r2.reasons.some((r) => r.startsWith('collides-with-scientist-intent-verb'))).toBe(true);
    expect(r2.reasons.some((r) => r.startsWith('collides-with-verb-definition-canonical'))).toBe(true);

    // Fixture 3: a verb-definition-only canonical proposed as NEW.
    const collideCanonical: CrosswalkEntry = {
      term: 'rock',
      status: 'new-vocab-pending-admission',
      curie_plan: 'cf:rock',
    };
    const r3 = checkAdmission(collideCanonical, crosswalk, namespaces);
    expect(r3.admitted).toBe(false);
    expect(r3.reasons.some((r) => r.startsWith('collides-with-verb-definition-canonical'))).toBe(true);

    // Fixture 4: an operations.yaml id proposed as NEW.
    const collideOp: CrosswalkEntry = {
      term: 'centrifuge',
      status: 'new-vocab-pending-admission',
      curie_plan: 'cf:centrifuge',
    };
    const r4 = checkAdmission(collideOp, crosswalk, namespaces);
    expect(r4.admitted).toBe(false);
    expect(r4.reasons.some((r) => r.startsWith('collides-with-operation-id'))).toBe(true);

    // Fixture 5: an unlisted term (does not resolve through the crosswalk).
    const unlisted: CrosswalkEntry = {
      term: 'semantic-extraction-ir',
      status: 'new-vocab-pending-admission',
      curie_plan: 'cf:semantic-extraction-ir',
    };
    const r5 = checkAdmission(unlisted, crosswalk, namespaces);
    expect(r5.admitted).toBe(false);
    expect(r5.reasons).toContain('not-listed-in-crosswalk');
  });

  it('CLEAN fixtures pass admission (listed, no collision, cf: CURIE plan)', async () => {
    const crosswalk = (await readYaml(CROSSWALK_PATH)) as Crosswalk;
    const namespaces = await enumerateNamespaces();

    const clean: CrosswalkEntry[] = [
      { term: 'Quantity', status: 'missing-datatype', curie_plan: 'cf:quantity' },
      { term: 'VENDOR', status: 'new-vocab-pending-admission', curie_plan: 'cf:provenance-vendor' },
      { term: 'DERIVED', status: 'new-vocab-pending-admission', curie_plan: 'cf:provenance-derived' },
      { term: 'INFERRED_INVARIANT', status: 'new-vocab-pending-admission', curie_plan: 'cf:provenance-inferred-invariant' },
      { term: 'LOCAL_REALIZATION', status: 'new-vocab-pending-admission', curie_plan: 'cf:provenance-local-realization' },
      { term: 'constraint-classes', status: 'new-vocab-pending-admission', curie_plan: 'cf:constraint-class' },
    ];
    for (const entry of clean) {
      const result = checkAdmission(entry, crosswalk, namespaces);
      expect(result.reasons, `${entry.term}: ${result.reasons.join(', ')}`).toEqual([]);
      expect(result.admitted).toBe(true);
    }

    // A new term WITHOUT a CURIE plan is rejected (rule 3).
    const noCurie: CrosswalkEntry = { term: 'Quantity', status: 'missing-datatype' };
    const r = checkAdmission(noCurie, crosswalk, namespaces);
    expect(r.admitted).toBe(false);
    expect(r.reasons).toContain('missing-or-invalid-curie-plan');
  });

  it('machine-extracted vocabulary counts match the adjudication file (drift guard)', async () => {
    const namespaces = await enumerateNamespaces();
    const adjudication = (await readYaml(ADJUDICATION_PATH)) as {
      vocabularies: Record<string, { count: number; mirror_count?: number }>;
      mappings: {
        same_operation: { verb_definition_id: string; scientist_intent_action: string }[];
        protocol_semantic_only: { verb_definition_id: string }[];
        enum_only: string[];
      };
    };

    // Counts re-derived from the sources, never hand-copied.
    expect(namespaces['scientist-intent-verb'].size).toBe(
      adjudication.vocabularies.scientist_intent_enum.count,
    );
    expect(namespaces['scientist-intent-vocabulary-verb'].size).toBe(
      adjudication.vocabularies.scientist_intent_enum.mirror_count,
    );
    expect(namespaces['verb-definition-id'].size).toBe(
      adjudication.vocabularies.verb_definition_records.count,
    );
    expect(namespaces['operation-id'].size).toBe(
      adjudication.vocabularies.neighboring_operation_registry.count,
    );
    expect(namespaces['verb-action-map-verb'].size).toBe(
      adjudication.vocabularies.neighboring_verb_action_map.count,
    );

    // The two scientist-intent sources agree as SETS (single-source contract).
    expect(namespaces['scientist-intent-vocabulary-verb']).toEqual(namespaces['scientist-intent-verb']);

    // The ONE mapping table partitions both vocabularies exactly (set comparison).
    const mappedVd = new Set(adjudication.mappings.same_operation.map((m) => m.verb_definition_id));
    const vdOnly = new Set(adjudication.mappings.protocol_semantic_only.map((m) => m.verb_definition_id));
    const mappedEnum = new Set(adjudication.mappings.same_operation.map((m) => m.scientist_intent_action));
    const enumOnly = new Set(adjudication.mappings.enum_only);

    expect(mappedVd.size + vdOnly.size).toBe(namespaces['verb-definition-id'].size);
    expect(mappedEnum.size + enumOnly.size).toBe(namespaces['scientist-intent-verb'].size);
    for (const id of mappedVd) expect(namespaces['verb-definition-id'].has(id)).toBe(true);
    for (const id of vdOnly) expect(namespaces['verb-definition-id'].has(id)).toBe(true);
    for (const v of mappedEnum) expect(namespaces['scientist-intent-verb'].has(v)).toBe(true);
    for (const v of enumOnly) expect(namespaces['scientist-intent-verb'].has(v)).toBe(true);
    // No entry appears on both sides of a partition.
    expect([...mappedVd].some((id) => vdOnly.has(id))).toBe(false);
    expect([...mappedEnum].some((v) => enumOnly.has(v))).toBe(false);
  });
});
