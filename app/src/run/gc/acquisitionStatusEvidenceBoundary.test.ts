/**
 * FAME-1 FIX2 (DEFECT 1 + DEFECT 2, reviewer cycle 2): the APP-SIDE boundary
 * test for the acquisition-status evidence presentation.
 *
 * The cycle-2 defect: the server projection emits the evidence hints, but the
 * CLIENT mapper that renders /record/:recordId keys object decomposition on
 * `slot.properties` (documentMapper.ts:309) — the editor-config projection
 * NEVER emits `properties` (EditorProjectionService.ts:84-99 forwards
 * `fields`/`items` only) — so the evidence object rendered undecomposed.
 *
 * This test feeds the REAL server projection (createUISpecLoader +
 * projectRecord over the REAL acquisition-package.ui.yaml + a real evidence
 * payload) into the REAL client mapper (buildProjectionDocument) and asserts
 * the delivered evidence values appear at the client boundary — the surface
 * the record editor renders. Under the cycle-2 ruling (DEFECT 1 option (a),
 * DATA-ONLY): the ui.yaml carries the presentation in the shapes the client
 * ACTUALLY consumes:
 *   - sibling `readonly` slots at the deep dotted paths (documentMapper's
 *     getValueAtPath walks `$.a.b.c` — formHelpers.ts:15-25), and
 *   - a top-level `array` slot for `$.acquisitionStatusEvidence.matched` with
 *     an `items` hint (documentMapper.ts:335-347 → attrs.itemHint; the
 *     ArrayWidget renders items through the ObjectWidget).
 * No client-code change; no new key spelling.
 *
 * RED (pre-fix ui.yaml, cycle-2 tip 5f4fe06f): the flattened slots do not
 * exist — every fieldRow lookup below fails; the inert object row
 * ($.acquisitionStatusEvidence, no objectConfig) is present.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { buildProjectionDocument } from '../../editor/taptab/documentMapper';
import { serializeDocument } from '../../editor/taptab/recordSerializer';
import { createUISpecLoader } from '../../../../server/src/ui/UISpecLoader.js';
import { projectRecord } from '../../../../server/src/ui/EditorProjectionService.js';
import { loadAllSchemas } from '../../../../server/src/schema/SchemaLoader.js';
import { createSchemaRegistry } from '../../../../server/src/schema/SchemaRegistry.js';
import { createValidator } from '../../../../server/src/validation/AjvValidator.js';

interface DocNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
}

const SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/acquisition-package.schema.yaml';

/** A fully valid acquisition-package payload (neutral ids, mirrors the
 *  server contract test's validPackage). */
const basePackage = {
  kind: 'acquisition-package',
  id: 'ACQP-TEST-EVIDENCE-1',
  title: 'evidence boundary probe package',
  storageDeviceId: 'nas0',
  directoryKey: 'machine1/EVIDENCE.D',
  files: [
    {
      relativePath: 'FID1A.CH',
      dataReferenceRef: { kind: 'record', type: 'data-reference', id: 'DREF-000001' },
      role: 'signal_channel',
    },
    {
      relativePath: 'RUN.LOG',
      dataReferenceRef: { kind: 'record', type: 'data-reference', id: 'DREF-000003' },
      role: 'run_log',
    },
  ],
  signalCollectionRef: { kind: 'record', type: 'data-reference', id: 'DREF-000009' },
  lifecycleId: 'registry-ops',
  state: 'draft',
};

/** The REAL server projection of the REAL ui.yaml (the projection authority,
 *  not a hand-built fixture). The ui.yaml path resolves from process.cwd() —
 *  the app's vitest runs with cwd=app/, mirroring documentMapper.test.ts's
 *  real-YAML loader (the jsdom env gives import.meta.url no file: scheme). */
async function realProjection(payload: Record<string, unknown>) {
  const uiPath = join(process.cwd(), '..', 'schema', 'knowledge', 'acquisition-package.ui.yaml');
  const content = readFileSync(uiPath, 'utf-8');
  const res = createUISpecLoader().load(content, uiPath);
  if (!res.success || res.spec === undefined) {
    throw new Error(`ui.yaml failed to load: ${res.error ?? res.validationErrors?.join('; ') ?? 'unknown error'}`);
  }
  return projectRecord(res.spec, payload, SCHEMA_ID, String(payload.id));
}

/** The fieldRow attrs for `path` in a projection document (the client
 *  boundary — what FieldRow/WidgetRenderer receive). */
function fieldRowAttrs(doc: { type: string; content: DocNode[] }, path: string) {
  const row = (doc.content as DocNode[]).flatMap((section: DocNode) =>
    (section.content ?? []).filter((item: DocNode) => item.type === 'fieldRow'),
  ).find((row: DocNode) => row.attrs?.path === path);
  return row?.attrs ?? null;
}

/** The aborted-evidence package — the shared arm A payload (the real
 *  projection is built from it by every boundary + round-trip leg). */
const abortedPayload: Record<string, unknown> = {
  ...basePackage,
  acquisitionStatus: 'aborted',
  acquisitionStatusQualified: true,
  acquisitionStatusEvidence: {
    ruleset: {
      id: 'gc-acquisition-status',
      version: 1,
      sourceFile: 'config/gc-acquisition-status/log-patterns.yaml',
    },
    sourceMember: { relativePath: 'RUN.LOG' },
    decode: { encoding: 'utf-16le', bomPresent: true },
    matched: [
      {
        line: 'Method       Method aborted                                 13:19:33 10/23/26',
        ruleId: 'aborted-method-aborted',
        lineIndex: 5,
      },
    ],
  },
};

describe('FAME-1 FIX2: the evidence presentation is DELIVERED at the client boundary (real projection + real mapper)', () => {
  it('delivers the six flattened readonly evidence slots with their stored values (the shapes the client ACTUALLY consumes)', async () => {
    const projection = await realProjection(abortedPayload);
    const doc = buildProjectionDocument(projection.blocks, projection.slots, abortedPayload);

    const cases: Array<{ path: string; value: unknown; label: string }> = [
      {
        path: '$.acquisitionStatusEvidence.ruleset.id',
        value: 'gc-acquisition-status',
        label: 'Rule Set Id',
      },
      {
        path: '$.acquisitionStatusEvidence.ruleset.version',
        value: 1,
        label: 'Rule Set Version',
      },
      {
        path: '$.acquisitionStatusEvidence.ruleset.sourceFile',
        value: 'config/gc-acquisition-status/log-patterns.yaml',
        label: 'Rule Set Source File',
      },
      {
        path: '$.acquisitionStatusEvidence.sourceMember.relativePath',
        value: 'RUN.LOG',
        label: 'Source Member Relative Path',
      },
      {
        path: '$.acquisitionStatusEvidence.decode.encoding',
        value: 'utf-16le',
        label: 'Decode Encoding',
      },
      {
        path: '$.acquisitionStatusEvidence.decode.bomPresent',
        value: true,
        label: 'Decode BOM Present',
      },
    ];
    for (const c of cases) {
      const attrs = fieldRowAttrs(doc, c.path);
      expect(attrs, `the client boundary must carry a fieldRow for ${c.path}`).toBeTruthy();
      expect(attrs!.widget, `${c.path} must be a readonly display slot`).toBe('readonly');
      expect(attrs!.label, `${c.path} must carry a FULL WORD label`).toBe(c.label);
      expect(attrs!.value, `${c.path} must deliver the stored evidence value`).toEqual(c.value);
    }
  });

  it('delivers the matched array as a top-level array slot with its item hint (the array/items path the mapper consumes)', async () => {
    const projection = await realProjection(abortedPayload);
    const doc = buildProjectionDocument(projection.blocks, projection.slots, abortedPayload);

    const attrs = fieldRowAttrs(doc, '$.acquisitionStatusEvidence.matched');
    expect(attrs, 'the client boundary must carry a fieldRow for the matched array').toBeTruthy();
    expect(attrs!.widget).toBe('array');
    const storedMatched = (abortedPayload.acquisitionStatusEvidence as { matched: unknown[] }).matched;
    expect(attrs!.value, 'the matched lines deliver verbatim (the stored array)').toEqual(storedMatched);
    const itemHint = attrs!.itemHint as
      | { path?: string; widget?: string; label?: string; fields?: Array<{ path: string; widget: string }> }
      | null
      | undefined;
    expect(itemHint, 'the matched array slot must carry its itemHint (attrs.itemHint)').toBeTruthy();
    expect(itemHint!.path).toBeTruthy();
    expect(itemHint!.widget).toBe('object');
    expect(itemHint!.fields?.map((f) => f.path)).toEqual(['line', 'ruleId', 'lineIndex']);
  });

  it('delivers the degenerate (ruleset: {}) absence shape without crashing the boundary', async () => {
    const degenerate: Record<string, unknown> = {
      ...basePackage,
      id: 'ACQP-TEST-EVIDENCE-2',
      acquisitionStatus: 'unknown',
      acquisitionStatusQualified: true,
      acquisitionStatusEvidence: {
        ruleset: {},
        sourceMember: { relativePath: 'RUN.LOG' },
        decode: { encoding: 'none', bomPresent: false },
        matched: [],
        noEvidenceReason: 'rule-file-unreadable: ENOENT: synthetic',
      },
    };
    const projection = await realProjection(degenerate);
    const doc = buildProjectionDocument(projection.blocks, projection.slots, degenerate);

    // The flattened slots still exist. The ruleset members are ABSENT
    // (the degenerate arm is absence-shaped — D5: the display shows the
    // em-dash, never a fabricated identity); the decode facts are still
    // recorded ('none' — no member was read); the member path is named.
    for (const p of [
      '$.acquisitionStatusEvidence.ruleset.id',
      '$.acquisitionStatusEvidence.ruleset.sourceFile',
    ]) {
      const attrs = fieldRowAttrs(doc, p);
      expect(attrs, `the degenerate arm must still deliver a fieldRow for ${p}`).toBeTruthy();
      expect(attrs!.widget).toBe('readonly');
      expect(attrs!.value, `${p} is absent in the degenerate arm`).toBeUndefined();
    }
    const memberAttrs = fieldRowAttrs(doc, '$.acquisitionStatusEvidence.sourceMember.relativePath');
    expect(memberAttrs).toBeTruthy();
    expect(memberAttrs!.value).toBe('RUN.LOG');
    const encodingAttrs = fieldRowAttrs(doc, '$.acquisitionStatusEvidence.decode.encoding');
    expect(encodingAttrs).toBeTruthy();
    expect(encodingAttrs!.value, "the degenerate arm's decode fact is 'none', not a decode fault").toBe('none');
    const matchedAttrs = fieldRowAttrs(doc, '$.acquisitionStatusEvidence.matched');
    expect(matchedAttrs).toBeTruthy();
    expect(matchedAttrs!.value).toEqual([]);
  });

  it('the inert object slot is GONE from the client boundary (no properties-keyed decomposition, no undecomposed object row)', async () => {
    const projection = await realProjection(abortedPayload);
    const doc = buildProjectionDocument(projection.blocks, projection.slots, abortedPayload);

    // The undecomposed object row ($.acquisitionStatusEvidence) must not be
    // delivered: the client mapper only decomposes objects via
    // `slot.properties` (documentMapper.ts:309), which the editor-config
    // projection never emits — the row would render an inert "Click to edit"
    // surface (the DEFECT 1 defect).
    const objectRow = fieldRowAttrs(doc, '$.acquisitionStatusEvidence');
    expect(objectRow, 'no undecomposed object row at the client boundary').toBeNull();

    // The status word row is still delivered as the stable readonly display.
    const statusAttrs = fieldRowAttrs(doc, '$.acquisitionStatus');
    expect(statusAttrs).toBeTruthy();
    expect(statusAttrs!.widget).toBe('readonly');
    expect(statusAttrs!.value).toBe('aborted');
  });
});

/**
 * FAME-1 FIX3 (cycle-3 DEFECT 1 — MAJOR): the record surface is TWO-WAY.
 * RecordEditPanel serializes the SAME fieldRows on every save
 * (serializeDocument(editor.getJSON(), formData) — the save seam), and the
 * serializer's delete-on-empty contract (recordSerializer.ts:122-123) prunes
 * an emptied CONTAINER. On the degenerate arm (ruleset: {}) the three ruleset
 * leaf rows are absent -> `ruleset` is pruned; on the run-log-member-absent
 * arm (sourceMember.relativePath: '') the leaf row is '' -> `sourceMember` is
 * pruned. Both are schema-REQUIRED (acquisition-package.schema.yaml:216,
 * :243) -> the store rejects the save (422) and the pruned payload is what
 * the client would have written. The boundary tests above stop at the mapper
 * and cannot see the save direction — this block is the serialize round-trip
 * at the true seam: project -> build projection doc -> NO-OP edit (the
 * stored record is unchanged) -> serialize -> the payload must still carry
 * every schema-required evidence member and validate against the REAL
 * schema.
 */
describe('FAME-1 FIX3: the evidence survives the record SAVE direction (serialize round-trip, real serializer + real schema)', () => {
  const SCHEMA_DIR = join(process.cwd(), '..', 'schema');
  let acqpValidate: (data: unknown) => { valid: boolean; errors?: Array<{ path?: string; message?: string }> };
  beforeAll(async () => {
    const loaded = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true });
    const registry = createSchemaRegistry();
    registry.addSchemas(loaded.entries);
    const validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema as never, id);
    }
    acqpValidate = (data) => validator.validate(data, SCHEMA_ID) as never;
  });

  /** The save seam: project -> mapper doc -> NO-OP edit (formData untouched)
   *  -> serializeDocument(doc, storedRecord). */
  function roundTripSavedPayload(record: Record<string, unknown>) {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      realProjection(record)
        .then((projection) => {
          const doc = buildProjectionDocument(projection.blocks, projection.slots, record);
          const saved = serializeDocument(doc as never, record);
          resolve(saved);
        })
        .catch(reject);
    });
  }

  it('arm A (normal, ruleset populated): a no-op save keeps every evidence field and stays schema-valid', async () => {
    const saved = await roundTripSavedPayload(abortedPayload);
    const evidence = saved.acquisitionStatusEvidence as Record<string, unknown>;
    expect(evidence.ruleset, 'the ruleset container must survive the save').toEqual({
      id: 'gc-acquisition-status',
      version: 1,
      sourceFile: 'config/gc-acquisition-status/log-patterns.yaml',
    });
    expect(evidence.sourceMember).toEqual({ relativePath: 'RUN.LOG' });
    expect(evidence.decode).toEqual({ encoding: 'utf-16le', bomPresent: true });
    expect(evidence.matched, 'the matched lines survive verbatim').toEqual(
      (abortedPayload.acquisitionStatusEvidence as { matched: unknown[] }).matched,
    );
    expect(acqpValidate(saved), 'the no-op save payload must be schema-valid').toMatchObject({ valid: true });
  });

  it('arm B (degenerate ruleset: {}): the required ruleset member survives the save (the prune defect)', async () => {
    const degenerate: Record<string, unknown> = {
      ...basePackage,
      id: 'ACQP-TEST-EVIDENCE-B',
      acquisitionStatus: 'unknown',
      acquisitionStatusQualified: true,
      acquisitionStatusEvidence: {
        ruleset: {},
        sourceMember: { relativePath: 'RUN.LOG' },
        decode: { encoding: 'none', bomPresent: false },
        matched: [],
        noEvidenceReason: 'rule-file-unreadable: ENOENT: synthetic',
      },
    };
    const saved = await roundTripSavedPayload(degenerate);
    const evidence = saved.acquisitionStatusEvidence as Record<string, unknown>;
    // The schema REQUIRES the ruleset member (schema:216). The degenerate arm
    // is absence-shaped INSIDE it (D5: ruleset: {}) — but the container
    // itself must survive the save, not be pruned by the delete-on-empty
    // contract of its (absent) leaf rows.
    expect(
      'ruleset' in evidence,
      'the schema-required ruleset container must survive a no-op save',
    ).toBe(true);
    expect(evidence.ruleset, 'the degenerate ruleset is {} — absence-shaped, never fabricated').toEqual({});
    expect(evidence.sourceMember).toEqual({ relativePath: 'RUN.LOG' });
    expect(acqpValidate(saved), 'the degenerate-arm save payload must be schema-valid').toMatchObject({ valid: true });
  });

  it("arm C (run-log-member-absent, relativePath: ''): the required sourceMember member survives the save (the prune defect)", async () => {
    const noLog: Record<string, unknown> = {
      ...basePackage,
      id: 'ACQP-TEST-EVIDENCE-C',
      acquisitionStatus: 'unknown',
      acquisitionStatusQualified: true,
      acquisitionStatusEvidence: {
        ruleset: {
          id: 'gc-run-log-acquisition-status',
          version: 1,
          sourceFile: 'config/gc-acquisition-status/log-patterns.yaml',
        },
        sourceMember: { relativePath: '' },
        decode: { encoding: 'none', bomPresent: false },
        matched: [],
        noEvidenceReason: 'run-log-member-absent',
      },
    };
    const saved = await roundTripSavedPayload(noLog);
    const evidence = saved.acquisitionStatusEvidence as Record<string, unknown>;
    // The schema REQUIRES the sourceMember member (schema:216) and
    // sourceMember.relativePath (schema:243) — the empty relative path is the
    // honest run-log-member-absent arm (schema:245-252). The '' leaf must not
    // trigger the delete-on-empty prune of the container.
    expect(
      'sourceMember' in evidence,
      'the schema-required sourceMember container must survive a no-op save',
    ).toBe(true);
    expect(evidence.sourceMember, "relativePath '' is the honest floor value — never dropped").toEqual({
      relativePath: '',
    });
    expect((evidence.ruleset as { id?: string }).id, 'the ruleset container also survives (populated arm)').toBe(
      'gc-run-log-acquisition-status',
    );
    expect(acqpValidate(saved), 'the no-log-arm save payload must be schema-valid').toMatchObject({ valid: true });
  });
});
