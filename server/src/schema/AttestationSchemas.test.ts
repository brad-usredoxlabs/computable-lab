/**
 * MATRES-ATTEST §5.1 — attestation envelope schema + lint contract tests.
 *
 * RED-first: these tests are written BEFORE schema/lab/attestation.schema.yaml
 * and attestation.lint.yaml exist. Harness mirrors ServiceDomainSchemas.test.ts
 * (registry loads schema set, Ajv validate, LintEngine fires on violating records).
 *
 * Business rules live in lint YAML (§4 negative commitments): this file asserts
 * the DATA contract only — no TS-side policy branches.
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadSchemasFromContent, loadAllSchemas } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { LintEngine } from '../lint/LintEngine.js';

const ATTESTATION_SCHEMA_PATH = 'lab/attestation.schema.yaml';
const PLATE_EVENT_SCHEMA_PATH = 'workflow/events/plate-event.schema.yaml';
const BASE = 'https://computable-lab.com/schema/computable-lab';
const ATTESTATION_SCHEMA_ID = `${BASE}/attestation.schema.yaml`;
const PLATE_EVENT_SCHEMA_ID = `${BASE}/datatypes/plate-event.schema.yaml`;

// Schemas the envelope $refs: FAIRCommon mixin + the shared ref datatype.
const SUPPORTING_SCHEMA_PATHS = [
  'core/common.schema.yaml',
  'core/datatypes/ref.schema.yaml',
] as const;

async function loadAttestationSchemas() {
  const schemaRoot = join(process.cwd(), 'schema');
  const contents = new Map<string, string>();
  for (const path of [...SUPPORTING_SCHEMA_PATHS, ATTESTATION_SCHEMA_PATH]) {
    contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
  }
  return loadSchemasFromContent(contents);
}

async function buildWorld() {
  const result = await loadAttestationSchemas();
  const validator = createValidator({ strict: false });
  for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);

  const schemaRoot = join(process.cwd(), 'schema');
  const lintLoad = await loadAllLintSpecs({ basePath: schemaRoot, recursive: true });
  const engine = new LintEngine();
  for (const { name, spec } of lintLoad.specs) {
    try {
      engine.addSpec(name, spec);
    } catch (err) {
      // Pre-existing repo-wide specs may collide on rule ids; a collision
      // involving the ATTESTATION spec (its name or its rule ids) is NOT
      // swallowed — rethrow so a spec-load regression surfaces (advc1 obs).
      const message = err instanceof Error ? err.message : String(err);
      if (/attestation/i.test(name) || /attestation/i.test(message)) throw err;
    }
  }
  // The attestation spec itself must be registered (loader fact: empty-rule
  // specs load silently; the firing assertions below also cover this).
  expect(engine.getRule('attestation-occurred-known-needs-occurred-at')).toBeDefined();
  return { validator, engine, lintLoad };
}

const person = (id: string) => ({ kind: 'record' as const, type: 'person' as const, id });

/** One schema-legal claim: completed, occurrence known. */
function completedClaim(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    claimStatus: 'completed',
    assertion: { verb: 'received', about: { kind: 'record', type: 'material-instance', id: 'MATI-000123' } },
    occurredAtStatus: 'known',
    occurredAt: '2026-10-19T09:12:00-04:00',
    ...overrides,
  };
}

/** One schema-legal envelope (pre-accept: NO attestedAt — server stamps it). */
function envelope(claims: Array<Record<string, unknown>>, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'attestation',
    recordId: 'ATT-TEST-0001',
    artifactKind: 'attestation-chain',
    claims,
    ...overrides,
  };
}

describe('attestation envelope schema (§2a)', () => {
  it('attestation schema + lint spec load cleanly and register', async () => {
    const result = await loadAttestationSchemas();
    expect(result.errors.map(e => `${e.path}: ${e.error}`)).toEqual([]);
    const registry = createSchemaRegistry();
    registry.addSchemas(result.entries);
    expect(registry.getById(ATTESTATION_SCHEMA_ID)).toBeDefined();

    const lintLoad = await loadAllLintSpecs({ basePath: join(process.cwd(), 'schema'), recursive: true });
    const ourLintErrors = lintLoad.errors.filter(e => /attestation/.test(e.path));
    expect(ourLintErrors.map(e => `${e.path}: ${e.error}`)).toEqual([]);
    const names = lintLoad.specs.map(s => s.name);
    expect(names).toContain('attestation');
    const spec = lintLoad.specs.find(s => s.name === 'attestation');
    // server.ts skips empty-rule specs silently (lint-dsl loader fact): assert rule ids exist.
    expect((spec?.spec.rules ?? []).map(r => r.id).length).toBeGreaterThan(0);
  });

  it('valid envelope with one completed claim (occurredAtStatus known + occurredAt) validates', async () => {
    const { validator } = await buildWorld();
    const payload = envelope([completedClaim()]);
    const result = validator.validate(payload, ATTESTATION_SCHEMA_ID);
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('occurredAtStatus unknown with occurredAt ABSENT is schema-valid AND lint-clean (Q5 terminal honesty)', async () => {
    const { validator, engine } = await buildWorld();
    const claim = completedClaim({ occurredAtStatus: 'unknown' });
    delete (claim as Record<string, unknown>).occurredAt;
    const payload = envelope([claim]);
    expect(validator.validate(payload, ATTESTATION_SCHEMA_ID).valid).toBe(true);
    const lintResult = engine.lint(payload, ATTESTATION_SCHEMA_ID);
    expect(lintResult.violations).toEqual([]);
    expect(lintResult.valid).toBe(true);
    // Terminal-honest: the data shape carries "I don't know" as a complete answer.
    expect('occurredAt' in claim).toBe(false);
  });

  it('occurredAtStatus known WITHOUT occurredAt fires the lint pairing rule naming the claim path', async () => {
    const { validator, engine } = await buildWorld();
    const claim = completedClaim();
    delete (claim as Record<string, unknown>).occurredAt;
    const payload = envelope([claim]);
    // Schema-side stays loose enough for the lint layer to own the pairing (§4).
    expect(validator.validate(payload, ATTESTATION_SCHEMA_ID).valid).toBe(true);
    const lintResult = engine.lint(payload, ATTESTATION_SCHEMA_ID);
    expect(lintResult.valid).toBe(false);
    const firing = lintResult.violations.filter(v => v.severity === 'error');
    expect(firing.length).toBeGreaterThan(0);
    // Names the offending claim path: the everyItem quantifier reports the
    // collection path ('claims') on the violation and the pairing in the message.
    expect(firing.some(v => /claims/.test(`${v.path ?? ''} ${v.message}`))).toBe(true);
    expect(firing.some(v => /occurredAt/.test(v.message))).toBe(true);
  });

  it('occurredAt present with occurredAtStatus unknown fires the lint pairing rule', async () => {
    const { engine } = await buildWorld();
    const payload = envelope([completedClaim({ occurredAtStatus: 'unknown' })]);
    const lintResult = engine.lint(payload, ATTESTATION_SCHEMA_ID);
    expect(lintResult.valid).toBe(false);
    expect(lintResult.violations.some(v => v.severity === 'error' && /claims/.test(`${v.path ?? ''} ${v.message}`))).toBe(true);
    expect(lintResult.violations.some(v => v.severity === 'error' && /occurredAt/.test(v.message))).toBe(true);
  });

  it('claimStatus reported-by-other with accountSupplier != attestor passes with zero identity coercion (P3)', async () => {
    const { validator, engine } = await buildWorld();
    const claim = completedClaim({
      claimStatus: 'reported-by-other',
      performer: person('USR-bob'),
      accountSupplier: person('USR-alice'),
      attestor: person('USR-carol'),
    });
    const payload = envelope([claim]);
    expect(validator.validate(payload, ATTESTATION_SCHEMA_ID).valid).toBe(true);
    expect(engine.lint(payload, ATTESTATION_SCHEMA_ID).valid).toBe(true);
    // Stored payload keeps all three refs byte-identical — no coercion, no presumption.
    expect(claim.performer).toEqual({ kind: 'record', type: 'person', id: 'USR-bob' });
    expect(claim.accountSupplier).toEqual({ kind: 'record', type: 'person', id: 'USR-alice' });
    expect(claim.attestor).toEqual({ kind: 'record', type: 'person', id: 'USR-carol' });
  });

  it('claim with performer ABSENT passes and NO identity field is synthesized (P3)', async () => {
    const { validator, engine } = await buildWorld();
    const claim = completedClaim();
    const payload = envelope([claim]);
    expect(validator.validate(payload, ATTESTATION_SCHEMA_ID).valid).toBe(true);
    expect(engine.lint(payload, ATTESTATION_SCHEMA_ID).valid).toBe(true);
    // Absence means unknown, never presumed equal to attestor/accountSupplier.
    expect('performer' in claim).toBe(false);
    expect('accountSupplier' in claim).toBe(false);
    expect('attestor' in claim).toBe(false);
    // And the validator did not mutate the payload with defaults.
    expect(payload).toEqual(envelope([claim]));
  });

  it('attestation-chain carrying a proposed claim fires the P2 lint wall', async () => {
    const { engine } = await buildWorld();
    const payload = envelope([completedClaim({ claimStatus: 'proposed' })]);
    const lintResult = engine.lint(payload, ATTESTATION_SCHEMA_ID);
    expect(lintResult.valid).toBe(false);
    expect(lintResult.violations.some(v => v.severity === 'error')).toBe(true);
    // A non-chain artifactKind MAY carry proposed claims (plan-slot review).
    const planSide = envelope([completedClaim({ claimStatus: 'proposed' })], { artifactKind: 'plan-slot-reference' });
    expect(engine.lint(planSide, ATTESTATION_SCHEMA_ID).valid).toBe(true);
  });

  it('unevaluated property in the envelope or in a claim is rejected naming the offending path', async () => {
    const { validator } = await buildWorld();
    const withExtraEnvelope = envelope([completedClaim()], { notAField: 'smuggled' });
    const envelopeResult = validator.validate(withExtraEnvelope, ATTESTATION_SCHEMA_ID);
    expect(envelopeResult.valid).toBe(false);
    // Ajv names the offending location (unevaluatedProperties reports the path).
    const envelopeErrors = envelopeResult.errors ?? [];
    expect(envelopeErrors.length).toBeGreaterThan(0);
    expect(envelopeErrors.some(e => /notAField|unevaluated|additional/i.test(`${e.path} ${e.message} ${e.keyword ?? ''}`))).toBe(true);

    const withExtraClaim = envelope([{ ...completedClaim(), smuggled: true }]);
    const claimResult = validator.validate(withExtraClaim, ATTESTATION_SCHEMA_ID);
    expect(claimResult.valid).toBe(false);
    const claimErrors = claimResult.errors ?? [];
    expect(claimErrors.some(e => /smuggled|claims\/0|unevaluated|additional/i.test(`${e.path} ${e.message} ${e.keyword ?? ''}`))).toBe(true);
  });

  it('undefined-valued optionals never reach the validator (exactOptionalPropertyTypes discipline)', async () => {
    const { validator } = await buildWorld();
    // Runtime mirror of the compile-time rule: the conditional-spread idiom
    // (FormDraftService.ts:73-77) makes the key ABSENT, never undefined-valued.
    const claim = completedClaim();
    expect('approximation' in claim).toBe(false);
    const optionalValue: string | undefined = undefined;
    const base = completedClaim({ occurredAtStatus: 'unknown' });
    delete base.occurredAt;
    const built = { ...base, ...(optionalValue !== undefined ? { occurredAt: optionalValue } : {}) };
    expect('occurredAt' in built).toBe(false);
    const payload = envelope([built]);
    expect('occurredAt' in (payload.claims as Array<Record<string, unknown>>)[0]!).toBe(false);
    expect(validator.validate(payload, ATTESTATION_SCHEMA_ID).valid).toBe(true);
  });

  it('attestedAt is ABSENT pre-accept and schema-legal once server-stamped', async () => {
    const { validator } = await buildWorld();
    const preAccept = envelope([completedClaim()]);
    expect('attestedAt' in preAccept).toBe(false);
    expect(validator.validate(preAccept, ATTESTATION_SCHEMA_ID).valid).toBe(true);
    const stamped = envelope([completedClaim()], { attestedAt: '2026-10-19T14:00:00Z' });
    expect(validator.validate(stamped, ATTESTATION_SCHEMA_ID).valid).toBe(true);
  });

  it('against pinning block validates as reference-copy data and rejects unknown pin fields', async () => {
    const { validator } = await buildWorld();
    const pinned = envelope([completedClaim()], {
      against: {
        plannedRunRef: { kind: 'record', type: 'planned-run', id: 'LPR-0001' },
        eventGraphRef: { kind: 'record', type: 'event-graph', id: 'EVTG-0001' },
        graphRevision: 'a'.repeat(40),
        protocolSha: 'b'.repeat(40),
      },
    });
    expect(validator.validate(pinned, ATTESTATION_SCHEMA_ID).valid).toBe(true);
    const badPin = envelope([completedClaim()], { against: { livePointer: 'nope' } });
    expect(validator.validate(badPin, ATTESTATION_SCHEMA_ID).valid).toBe(false);
  });

  it('supersedes without correction (and correction without supersedes) fire the lint pairing rules (§2c)', async () => {
    const { validator, engine } = await buildWorld();
    const supersedes = { kind: 'record', type: 'attestation', id: 'ATT-TEST-0001' };
    const correction = {
      claimTarget: { mode: 'same-entity-reattribute' },
      changedFacts: { lot: '09213' },
    };
    expect(validator.validate(envelope([completedClaim()], { supersedes, correction }), ATTESTATION_SCHEMA_ID).valid).toBe(true);

    const noCorrection = envelope([completedClaim()], { supersedes });
    const r1 = engine.lint(noCorrection, ATTESTATION_SCHEMA_ID);
    expect(r1.valid).toBe(false);
    expect(r1.violations.some(v => v.severity === 'error')).toBe(true);

    const orphanCorrection = envelope([completedClaim()], { correction });
    const r2 = engine.lint(orphanCorrection, ATTESTATION_SCHEMA_ID);
    expect(r2.valid).toBe(false);
    expect(r2.violations.some(v => v.severity === 'error')).toBe(true);
  });

  it('claimStatus enum is EXACTLY proposed|completed|unknown|reported-by-other (bait 3)', async () => {
    const schemaRoot = join(process.cwd(), 'schema');
    const schema = parseYaml(await readFile(join(schemaRoot, ATTESTATION_SCHEMA_PATH), 'utf8')) as Record<string, unknown>;
    const claims = (schema.properties as Record<string, unknown>).claims as Record<string, unknown>;
    const items = claims.items as Record<string, unknown>;
    const claimProps = (items.properties as Record<string, unknown>).claimStatus as Record<string, unknown>;
    // The enum is EXACTLY the four P2 labels (hyphen, lowercase — bait 3).
    expect(claimProps.enum).toEqual(['proposed', 'completed', 'unknown', 'reported-by-other']);
    const occurred = (items.properties as Record<string, unknown>).occurredAtStatus as Record<string, unknown>;
    expect(occurred.enum).toEqual(['known', 'approximate', 'unknown']);
  });
});

describe('plate-event occurredAt story (§2e, retrospective events)', () => {
  async function plateEventWorld() {
    // Registry-level load of the WHOLE schema set (the PlateEventSchemaContracts
    // harness): the datatypes/plate-event details $refs have a pre-existing
    // namespace mismatch (workflow/events vs datatypes ids), so a partial
    // loadSchemasFromContent set cannot resolve them. Full loadAllSchemas +
    // topological Ajv registration is the working precedent.
    const schemaRoot = join(process.cwd(), 'schema');
    const result = await loadAllSchemas({ basePath: schemaRoot, recursive: true });
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) {
      validator.addSchema(entry.schema, entry.id);
      // Pre-existing namespace mismatch (documented in PlateEventSchemaContracts
      // .test.ts): datatypes/plate-event's details $refs resolve to
      // datatypes/plate-event.* ids while the files declare workflow/events/*
      // ids (and plate-event-macro-program uses a dash). Test-local alias
      // registration so Ajv can resolve the oneOf arms.
      const base = entry.path.split('/').pop() ?? '';
      const alias = `${BASE}/datatypes/${base}`;
      if (alias !== entry.id && (base.startsWith('plate-event.') || base.startsWith('plate-event-'))) {
        validator.addSchema(entry.schema, alias);
      }
    }
    const lintLoad = await loadAllLintSpecs({ basePath: schemaRoot, recursive: true });
    const engine = new LintEngine();
    for (const { name, spec } of lintLoad.specs) {
      try { engine.addSpec(name, spec); } catch { /* pre-existing collisions */ }
    }
    return { result, validator, engine };
  }

  // details payload legal for the datatypes/plate-event.transfer oneOf arm.
  const transferDetails = () => ({
    source: { labwareInstanceId: { kind: 'record', type: 'labware-instance', id: 'LBWI-0001' }, wells: ['A1'] },
    target: { labwareInstanceId: { kind: 'record', type: 'labware-instance', id: 'LBWI-0002' }, wells: ['B1'] },
    volume_uL: 10,
  });

  const baseEvent = () => ({
    eventId: 'evt-0001',
    event_type: 'transfer',
    at: '2026-10-19T09:00:00-04:00',
    details: transferDetails(),
  });

  it('existing at:/t_offset shape stays byte-stable and valid (bait 7)', async () => {
    const { validator } = await plateEventWorld();
    expect(validator.validate(baseEvent(), PLATE_EVENT_SCHEMA_ID).valid).toBe(true);
    const offsetOnly = { eventId: 'evt-0002', event_type: 'transfer', t_offset: 'PT5M', details: transferDetails() };
    expect(validator.validate(offsetOnly, PLATE_EVENT_SCHEMA_ID).valid).toBe(true);
  });

  it('retrospective event with occurredAt + occurredAtStatus known validates', async () => {
    const { validator } = await plateEventWorld();
    const event = { ...baseEvent(), occurredAtStatus: 'known', occurredAt: '2026-10-12T08:30:00-04:00' };
    expect(validator.validate(event, PLATE_EVENT_SCHEMA_ID).valid).toBe(true);
  });

  it('occurredAt present without occurredAtStatus (or status unknown) fires the plate-event lint rule', async () => {
    const { validator, engine } = await plateEventWorld();
    const noStatus = { ...baseEvent(), occurredAt: '2026-10-12T08:30:00-04:00' };
    // Schema stays purely additive (byte-stable fixtures); the pairing is lint DATA.
    expect(validator.validate(noStatus, PLATE_EVENT_SCHEMA_ID).valid).toBe(true);
    const r1 = engine.lint(noStatus, PLATE_EVENT_SCHEMA_ID);
    expect(r1.valid).toBe(false);
    expect(r1.violations.some(v => v.ruleId === 'plate-event-occurred-at-needs-status' && v.severity === 'error')).toBe(true);

    const unknownStatus = { ...baseEvent(), occurredAt: '2026-10-12T08:30:00-04:00', occurredAtStatus: 'unknown' };
    const r2 = engine.lint(unknownStatus, PLATE_EVENT_SCHEMA_ID);
    expect(r2.valid).toBe(false);
    expect(r2.violations.some(v => v.ruleId === 'plate-event-occurred-at-needs-status')).toBe(true);
  });

  it('occurredAtStatus known WITHOUT occurredAt fires the plate-event lint rule', async () => {
    const { engine } = await plateEventWorld();
    const knownNoTime = { ...baseEvent(), occurredAtStatus: 'known' };
    const result = engine.lint(knownNoTime, PLATE_EVENT_SCHEMA_ID);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.ruleId === 'plate-event-occurred-status-known-needs-occurred-at' && v.severity === 'error')).toBe(true);
  });

  it('occurredAtStatus approximate without occurredAt is legal (approximate-only annotation)', async () => {
    const { validator, engine } = await plateEventWorld();
    const approximate = { ...baseEvent(), occurredAtStatus: 'approximate' };
    expect(validator.validate(approximate, PLATE_EVENT_SCHEMA_ID).valid).toBe(true);
    expect(engine.lint(approximate, PLATE_EVENT_SCHEMA_ID).valid).toBe(true);
  });
});
