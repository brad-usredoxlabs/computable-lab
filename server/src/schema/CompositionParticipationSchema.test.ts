/**
 * ROLE-AXES-1 LEG 1 — the schema participation axis (Brad ruling 2026-10-22:
 * "materials have identities and properties; their roles are contextual, and
 * their purposes are experimental").
 *
 * What this file machine-checks (the spec's MACHINE-CHECKABLE half):
 *  1. A declared participation validates on the datatype
 *     (schema/core/datatypes/composition-entry.schema.yaml) AND on the wire
 *     mirror (schema/workflow/scientist-intent.schema.yaml — the item declares
 *     unevaluatedProperties:false, so an UNDECLARED field could not ride).
 *  2. An unknown participation value is REJECTED, naming the instance path.
 *  3. A legacy payload WITHOUT participation validates byte-identically
 *     (the axis is additive-optional; no migration, per OQ-1 ruling).
 *  4. NESTED composition items carry participation (the MIXFRAC nested-recipe
 *     shape — medium = DMEM:FBS; bait 7: a parent-level-only implementation
 *     fails here).
 *  5. VOCABULARY EQUALITY (bait 6): the datatype enum == the wire enum == the
 *     server TS union == the app TS union == the config participationArms keys,
 *     read PROGRAMMATICALLY from the SHIPPED files (bait 2: a fixture copy
 *     fails this leg — nothing here reads a duplicated literal).
 *  6. Ontology discipline (bait 3): the vocabulary values appear in NO file
 *     under schema/registry/ontology-terms/ (participation is a LOCAL datatype
 *     enum, never a minted ontology term).
 *  7. MIXROLE-1 boundary (bait 8): gapRole stays `other` on ROLE and the
 *     role-gap bar does NOT double-fire for a participation_undeclared entry.
 *  8. Purpose axis (bait 9): nothing in the shipped participation path writes
 *     intended_purpose.
 *
 * Harness: ConcentrationFirstSchemaContract.test.ts (registry + topological
 * order for the datatype + its $refs) and ScientistIntentCountRate.test.ts
 * (fresh validator over the REAL wire document under the REAL $id — negative
 * assertions must not ride a module singleton).
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadAllSchemas } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator, type AjvValidator } from '../validation/AjvValidator.js';
import { SCIENTIST_INTENT_SCHEMA_ID } from '../compiler/scientistIntent/parseScientistIntent.js';
import { parseShorthandForChat } from '../ai/shorthandChat.js';
import {
  loadCompositionRoleGuidance,
  evaluateCompositionRoleGaps,
  COMPOSITION_ROLE_GUIDANCE_PATH,
} from '../compiler/scientistIntent/compositionRoles.js';
import type { CompositionParticipation as ServerCompositionParticipation } from '../materials/composition.js';

const COMPOSITION_ENTRY_ID =
  'https://computable-lab.com/schema/computable-lab/datatypes/composition-entry.schema.yaml';

const REPO = join(process.cwd(), '..');
const DATATYPE_PATH = join(REPO, 'schema', 'core', 'datatypes', 'composition-entry.schema.yaml');
const WIRE_PATH = join(REPO, 'schema', 'workflow', 'scientist-intent.schema.yaml');
const SERVER_TS_PATH = join(process.cwd(), 'src', 'materials', 'composition.ts');
const APP_TS_PATH = join(REPO, 'app', 'src', 'types', 'material.ts');
const CONVENTION_PATH = join(REPO, 'config', 'drafting', 'composition-participation-convention.yaml');
const ROLE_GUIDANCE_PATH = join(REPO, 'config', 'drafting', 'composition-role-guidance.yaml');
const ONTOLOGY_TERMS_DIR = join(REPO, 'schema', 'registry', 'ontology-terms');

function readYaml(path: string): Record<string, unknown> {
  return parseYaml(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Vocabulary extraction — every declaration read from its SHIPPED file
// ---------------------------------------------------------------------------

/** Walk a JSON-Schema subtree and collect every `participation` enum found. */
function participationEnumsIn(node: unknown, found: string[][] = []): string[][] {
  if (Array.isArray(node)) {
    for (const child of node) participationEnumsIn(child, found);
    return found;
  }
  if (node === null || typeof node !== 'object') return found;
  const record = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (key === 'participation' && value !== null && typeof value === 'object') {
      const enumValues = (value as Record<string, unknown>).enum;
      if (Array.isArray(enumValues)) found.push(enumValues.map(String));
    }
    participationEnumsIn(value, found);
  }
  return found;
}

function datatypeParticipationEnum(): string[] {
  const enums = participationEnumsIn(readYaml(DATATYPE_PATH));
  expect(enums.length, 'composition-entry.schema.yaml must declare exactly one participation enum').toBe(1);
  return enums[0]!;
}

function wireParticipationEnum(): string[] {
  const enums = participationEnumsIn(readYaml(WIRE_PATH));
  expect(enums.length, 'scientist-intent.schema.yaml must declare exactly one participation enum').toBe(1);
  return enums[0]!;
}

/** TS union members, extracted from the SHIPPED source text (the
 *  vocabularyMirrorDrift.test.ts union-extraction precedent). */
function tsUnionMembers(src: string, name: string): string[] {
  const lines = src.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`export type ${name} =`));
  if (start === -1) return [];
  // Single-line union: everything on the declaration line. Multi-line union:
  // the declaration line plus every following `|` continuation line.
  let block = lines[start]!;
  for (let i = start + 1; i < lines.length && lines[i]!.trimStart().startsWith('|'); i += 1) {
    block += '\n' + lines[i];
  }
  return [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
}

function serverTsParticipationUnion(): string[] {
  return tsUnionMembers(readFileSync(SERVER_TS_PATH, 'utf8'), 'CompositionParticipation');
}

function appTsParticipationUnion(): string[] {
  return tsUnionMembers(readFileSync(APP_TS_PATH, 'utf8'), 'CompositionParticipation');
}

/** The config participationArms keys (the SHIPPED data home). */
function configParticipationArms(): string[] {
  const doc = readYaml(CONVENTION_PATH);
  const arms = doc.participationArms;
  expect(arms, 'the convention must declare participationArms (the LEG 2b re-point)').toBeTypeOf('object');
  return Object.keys(arms as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

// ref.schema.yaml conditional requirements: ontology refs require
// namespace+id+label; record refs require id+type.
const ref = (kind: 'record' | 'ontology', id: string, label: string) =>
  kind === 'ontology'
    ? { kind, id, label, namespace: id.split(':')[0] }
    : { kind, id, label, type: 'material' };

function entryWith(participation?: string): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    component_ref: ref('ontology', 'CHEBI:15377', 'Water'),
    role: 'solvent',
  };
  // The eOPT idiom mirrored in the fixture: participation is ABSENT when
  // undeclared, never key:undefined (exactOptionalPropertyTypes).
  if (participation !== undefined) entry.participation = participation;
  return entry;
}

/** A minimal valid add_material document carrying the given composition. */
function docWithComposition(composition: unknown[]): Record<string, unknown> {
  return {
    intentId: 'roleaxes-1-participation',
    actions: [
      {
        action: 'add_material',
        labware: 'plate',
        volumeUl: 100,
        targetWells: ['A1'],
        composition: [
          { material: 'DMEM', role: 'buffer_component', fraction: '90%' },
          ...composition,
        ],
      },
    ],
  };
}

describe('ROLE-AXES-1 participation axis: the datatype validates both directions', () => {
  let validator!: AjvValidator;
  let registry!: ReturnType<typeof createSchemaRegistry>;

  beforeAll(async () => {
    const result = await loadAllSchemas({ basePath: join(process.cwd(), 'schema') });
    expect(result.errors).toEqual([]);
    registry = createSchemaRegistry();
    registry.addSchemas(result.entries);
    validator = createValidator({ strict: false });
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema, entry.id);
    }
  });

  it('registers the composition-entry datatype', () => {
    expect(registry.has(COMPOSITION_ENTRY_ID)).toBe(true);
  });

  it('every declared participation value validates on the datatype', () => {
    for (const participation of datatypeParticipationEnum()) {
      const result = validator.validate(entryWith(participation), COMPOSITION_ENTRY_ID);
      expect(result.errors ?? [], participation).toEqual([]);
      expect(result.valid, participation).toBe(true);
    }
  });

  it('an unknown participation is REJECTED naming the instance path', () => {
    const result = validator.validate(entryWith('dissolves_the_sample'), COMPOSITION_ENTRY_ID);
    expect(result.valid).toBe(false);
    const error = result.errors.find((e) => e.keyword === 'enum' || e.path.includes('participation'));
    expect(error, JSON.stringify(result.errors)).toBeDefined();
    expect(error!.path).toContain('/participation');
  });

  it('a legacy payload WITHOUT participation validates byte-identically (additive-optional, no migration)', () => {
    const legacy = {
      component_ref: ref('record', 'vp-1', 'Ethanol'),
      role: 'solvent',
      concentration: { value: 10, unit: '% v/v', basis: 'volume_fraction' },
      source: 'declared solvent',
    };
    const result = validator.validate(legacy, COMPOSITION_ENTRY_ID);
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
    // The key is ABSENT, not undefined-valued (the eOPT contract).
    expect(Object.prototype.hasOwnProperty.call(legacy, 'participation')).toBe(false);
  });

  it('NESTED composition items carry participation (MIXFRAC nested-recipe shape, bait 7)', () => {
    const nested = {
      component_ref: ref('record', 'ms-medium', 'DMEM:FBS'),
      role: 'buffer_component',
      participation: 'liquid_component',
      composition: [
        {
          component_ref: ref('record', 'ms-dmem', 'DMEM'),
          role: 'buffer_component',
          participation: 'qs_carrier',
          concentration: { value: 90, unit: '% v/v', basis: 'volume_fraction' },
        },
        {
          component_ref: ref('record', 'vp-fbs', 'FBS'),
          role: 'additive',
          participation: 'liquid_component',
          concentration: { value: 10, unit: '% v/v', basis: 'volume_fraction' },
        },
      ],
    };
    const result = validator.validate(nested, COMPOSITION_ENTRY_ID);
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('a NESTED unknown participation is rejected naming the nested path', () => {
    const nested = {
      component_ref: ref('record', 'ms-medium', 'DMEM:FBS'),
      role: 'buffer_component',
      composition: [
        { component_ref: ref('record', 'ms-x', 'Mystery'), role: 'additive', participation: 'makes_it_fizzy' },
      ],
    };
    const result = validator.validate(nested, COMPOSITION_ENTRY_ID);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('participation'))).toBe(true);
    expect(result.errors.some((e) => /composition\/0/.test(e.path))).toBe(true);
  });
});

describe('ROLE-AXES-1 participation axis: the wire mirror declares the field', () => {
  let validator!: AjvValidator;

  beforeAll(() => {
    // Fresh validator over the REAL wire document under the REAL $id
    // (ScientistIntentCountRate.test.ts harness — never the parse singleton).
    validator = createValidator({ strict: false });
    validator.addSchema(readYaml(WIRE_PATH), SCIENTIST_INTENT_SCHEMA_ID);
  });

  it('every declared participation value validates on the wire mirror', () => {
    for (const participation of wireParticipationEnum()) {
      const result = validator.validate(
        docWithComposition([{ material: 'FBS', role: 'additive', participation }]),
        SCIENTIST_INTENT_SCHEMA_ID,
      );
      expect(result.errors ?? [], participation).toEqual([]);
      expect(result.valid, participation).toBe(true);
    }
  });

  it('an unknown wire participation is REJECTED naming the item path', () => {
    const result = validator.validate(
      docWithComposition([{ material: 'FBS', role: 'additive', participation: 'dissolves_the_sample' }]),
      SCIENTIST_INTENT_SCHEMA_ID,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('participation'))).toBe(true);
  });

  it('a participation-absent wire document validates byte-identically', () => {
    const result = validator.validate(
      docWithComposition([{ material: 'FBS', role: 'additive', fraction: '10%' }]),
      SCIENTIST_INTENT_SCHEMA_ID,
    );
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('the wire item still forbids an undeclared sibling field (unevaluatedProperties unchanged)', () => {
    const result = validator.validate(
      docWithComposition([{ material: 'FBS', role: 'additive', intended_purpose: 'feed the cells' }]),
      SCIENTIST_INTENT_SCHEMA_ID,
    );
    expect(result.valid).toBe(false);
    // Ajv reports unevaluatedProperties on the PARENT path; the forbidden
    // property name rides the error message.
    expect(result.errors.some((e) => String(e.message).includes('intended_purpose'))).toBe(true);
  });
});

describe('ROLE-AXES-1 vocabulary equality (bait 6): read from the SHIPPED files, never a fixture copy', () => {
  it('datatype enum == wire enum == server TS union == app TS union == config arms, in declaration order', () => {
    const datatype = datatypeParticipationEnum();
    const wire = wireParticipationEnum();
    const serverTs = serverTsParticipationUnion();
    const appTs = appTsParticipationUnion();
    const configArms = configParticipationArms();

    expect(datatype.length).toBeGreaterThan(0);
    expect(wire, 'wire mirror vs datatype').toEqual(datatype);
    expect(serverTs, 'server TS union vs datatype').toEqual(datatype);
    expect(appTs, 'app TS union vs datatype').toEqual(datatype);
    expect(configArms, 'config participationArms keys vs datatype').toEqual(datatype);
  });

  it('the six ratified terms are exactly the vocabulary (OQ-2 ruling)', () => {
    expect(datatypeParticipationEnum()).toEqual([
      'liquid_component',
      'qs_carrier',
      'solute_contributor',
      'activity_contributor',
      'count_component',
      'participation_undeclared',
    ]);
  });

  it('the role enum mirrors are UNTOUCHED by this axis (role stays the honest closest label)', () => {
    const datatypeRoleEnum = ((readYaml(DATATYPE_PATH).properties as Record<string, unknown>).role as { enum: string[] }).enum;
    const wireRoleEnum = participationRoleEnumFromWire();
    expect(wireRoleEnum).toEqual(datatypeRoleEnum);
  });

  it('mutation leg (test-the-test): a wire enum with one value removed makes the equality leg go RED', () => {
    const mutated = readYaml(WIRE_PATH);
    const items = (((mutated.properties as Record<string, unknown>).actions as Record<string, unknown>).items as Record<string, unknown>);
    const composition = ((items.properties as Record<string, unknown>).composition as Record<string, unknown>).items as Record<string, unknown>;
    const participation = (composition.properties as Record<string, unknown>).participation as { enum: string[] };
    participation.enum = participation.enum.slice(1);
    const mutatedEnum = participationEnumsIn(mutated)[0]!;
    expect(mutatedEnum).not.toEqual(datatypeParticipationEnum());
  });
});

function participationRoleEnumFromWire(): string[] {
  const actions = (readYaml(WIRE_PATH).properties as Record<string, unknown>).actions as Record<string, unknown>;
  const items = actions.items as Record<string, unknown>;
  const composition = ((items.properties as Record<string, unknown>).composition as Record<string, unknown>).items as Record<string, unknown>;
  return ((composition.properties as Record<string, unknown>).role as { enum: string[] }).enum;
}

describe('ROLE-AXES-1 ontology discipline (bait 3): participation values are NEVER minted terms', () => {
  it('no participation value appears in any schema/registry/ontology-terms file', () => {
    const vocabulary = datatypeParticipationEnum();
    const files = readdirSync(ONTOLOGY_TERMS_DIR).filter((f) => f.endsWith('.yaml'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(join(ONTOLOGY_TERMS_DIR, file), 'utf8');
      for (const term of vocabulary) {
        expect(text, `${file} must not mint the participation term \`${term}\``).not.toContain(term);
      }
    }
  });

  it('the datatype header states the local-enum rationale (constituents carry EC terms, not participation words)', () => {
    const header = readFileSync(DATATYPE_PATH, 'utf8');
    expect(header).toContain('ontology-terms');
    expect(header).toContain('CONSTITUENT');
    expect(header).toContain('3.4.21.4');
  });
});

describe('ROLE-AXES-1 MIXROLE-1 boundary (bait 8): the role-gap bar does not double-fire', () => {
  it('gapRole stays `other` on ROLE in composition-role-guidance.yaml', () => {
    const guidance = readYaml(ROLE_GUIDANCE_PATH);
    expect(guidance.gapRole).toBe('other');
    // participation_undeclared is NOT the role gap arm and the guidance file
    // never names the participation vocabulary.
    const text = readFileSync(ROLE_GUIDANCE_PATH, 'utf8');
    for (const term of datatypeParticipationEnum()) {
      expect(text, `composition-role-guidance.yaml must not adopt \`${term}\``).not.toContain(term);
    }
  });

  it('the shipped guidance loads unchanged (gapRole `other`, siblingRole arm intact)', () => {
    const config = loadCompositionRoleGuidance()!;
    expect(config.gapRole).toBe('other');
    expect(COMPOSITION_ROLE_GUIDANCE_PATH).toBeDefined();
  });

  it('a participation_undeclared entry with an honest role produces NO role gap (no double-fire)', () => {
    const config = loadCompositionRoleGuidance()!;
    const composition = [
      { material: 'Trypsin-EDTA', role: 'additive', participation: 'participation_undeclared' },
      { material: 'HepG2 cells', role: 'cells' },
    ];
    expect(evaluateCompositionRoleGaps(composition, config, new Set())).toEqual([]);
  });

  it('the genuine role gap still fires exactly ONCE (the MIXROLE-1 bar unchanged)', () => {
    const config = loadCompositionRoleGuidance()!;
    const composition = [
      { material: 'Reagent Alpha', role: 'other' },
      { material: 'HepG2 cells', role: 'cells' },
    ];
    const gaps = evaluateCompositionRoleGaps(composition, config, new Set());
    expect(gaps.length).toBe(1);
    expect(gaps[0]!.label).toBe('Reagent Alpha');
  });
});

describe('ROLE-AXES-1 purpose axis (bait 9): nothing writes intended_purpose', () => {
  it('no shipped participation-path source writes or infers intended_purpose', () => {
    const sources = [
      DATATYPE_PATH,
      WIRE_PATH,
      CONVENTION_PATH,
      SERVER_TS_PATH,
      APP_TS_PATH,
      join(process.cwd(), 'src', 'materials', 'participationConvention.ts'),
      join(process.cwd(), 'src', 'materials', 'formulationMath.ts'),
      join(process.cwd(), 'src', 'materials', 'formulationCopilot.ts'),
      join(process.cwd(), 'src', 'ai', 'materialRefLabels.ts'),
    ];
    for (const path of sources) {
      const text = readFileSync(path, 'utf8');
      // A comment may NAME the axis (the header explains the boundary); no
      // shipped source may WRITE the field.
      const writes = text.match(/intended_purpose\s*:/g) ?? [];
      expect(writes, `${path} must not write intended_purpose`).toEqual([]);
    }
  });
});

describe('ROLE-AXES-1 wire carry-through: participation survives the chat parse door', () => {
  // shorthandChat's carry-through point (the fold's byte-stability contract at
  // :686: "the rest of the entry (role, fraction, the carrier's kind/id)
  // survives byte-stable"). The fold splices ONLY the label carrier in place
  // and re-serializes doc.actions verbatim; parseShorthandForChat carries a
  // declared `composition` array VERBATIM (the vocabulary argContracts
  // cardinality:'many' arm). So a declared participation survives the fold and
  // the recompile with NO key rewriting — proven here against the real door.
  it('parseShorthandForChat preserves a declared participation on a wire entry', () => {
    const yamlText = [
      'intentId: roleaxes-1-carry',
      'actions:',
      '  - action: add_material',
      '    labware: plate',
      '    volumeUl: 100',
      '    composition:',
      '      - material: DMEM',
      '        role: buffer_component',
      '        participation: qs_carrier',
      '      - material: FBS',
      '        role: additive',
      '        participation: liquid_component',
    ].join('\n')
    const doc = parseShorthandForChat(yamlText)
    const composition = (doc.actions[0] as unknown as Record<string, unknown>)['composition'] as Array<Record<string, unknown>>
    expect(composition[0]!.participation).toBe('qs_carrier')
    expect(composition[1]!.participation).toBe('liquid_component')
    // ABSENT stays ABSENT (never key:undefined) on an entry that declares none.
    expect(Object.prototype.hasOwnProperty.call(composition[0]!, 'participation')).toBe(true)
  })

  it('a participation-absent entry parses with the key ABSENT (eOPT contract)', () => {
    const yamlText = [
      'intentId: roleaxes-1-absent',
      'actions:',
      '  - action: add_material',
      '    labware: plate',
      '    composition:',
      '      - material: DMEM',
      '        role: buffer_component',
      '      - material: FBS',
      '        role: additive',
    ].join('\n')
    const doc = parseShorthandForChat(yamlText)
    const composition = (doc.actions[0] as unknown as Record<string, unknown>)['composition'] as Array<Record<string, unknown>>
    const entry = composition[0]!
    expect(Object.prototype.hasOwnProperty.call(entry, 'participation')).toBe(false)
  })
})

// Type-level pin: the server union is the one this test reads (compile-time
// evidence that the TS mirror exists and is the vocabulary).
const _typePin: ServerCompositionParticipation = 'participation_undeclared';
void _typePin;
