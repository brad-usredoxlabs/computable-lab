/**
 * QMS7-7 FIX1 (adv-review D2) — the landing tab kind is DECLARATIVE DATA.
 *
 * The compiled landing document used to embed a TS literal (`kind:'registry'`,
 * `activeTabId:'registry'`). The sanctioned surface is the record-drafting
 * block's `landing:` sub-key in config/drafting/adapters.yaml (the block this
 * item already un-froze — no new YAML file, no new top-level adapter block).
 *
 * Pinned here:
 *  1. loadRecordDraftLandingTabKind() reads the declared tabKind from the YAML
 *     (the per-call adapters.yaml load precedent — presence check only);
 *  2. the compiled session document's tab kind + activeTabId EQUAL the YAML
 *     value (data-derived, not a literal);
 *  3. an absent `landing:` key fails the compile HONESTLY with a
 *     LANDING_TAB_KIND_UNDECLARED diagnostic and ZERO staged writes — the
 *     compiler never defaults a surface the YAML did not declare;
 *  4. source-pin: recordDraftCompile.ts carries no landing tab-kind literal.
 *
 * Pure-module harness (workstateCompile.test.ts precedent): fake deps, a stage
 * store whose create() is a tripwire where the test demands zero writes.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import type { SchemaEntry } from '../schema/types.js';
import type { UISpec } from '../ui/types.js';

const mocks = vi.hoisted(() => ({
  /** When set, the mocked readFileSync serves this text for adapters.yaml only;
   *  every other fs read rides the real module (faithful harness). */
  doctoredAdaptersYaml: null as string | null,
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const adaptersPath = new URL('../../../config/drafting/adapters.yaml', import.meta.url);
  return {
    ...actual,
    readFileSync: ((p: Parameters<typeof actual.readFileSync>[0], ...rest: unknown[]) =>
      String(p) === String(adaptersPath) && mocks.doctoredAdaptersYaml !== null
        ? mocks.doctoredAdaptersYaml
        : (actual.readFileSync as (...args: unknown[]) => unknown)(p, ...rest)) as never,
  };
});

import {
  compileRecordDraftIntent,
  loadRecordDraftLandingTabKind,
  type RecordDraftDeps,
} from './recordDraftCompile.js';

const adaptersPath = fileURLToPath(new URL('../../../config/drafting/adapters.yaml', import.meta.url));
const sourcePath = fileURLToPath(new URL('./recordDraftCompile.ts', import.meta.url));

const INTENT = {
  operation: 'compose-record',
  requestId: 'DRAFT-landing-1',
  kind: 'training-material',
  fields: { title: 'Pipetting safety basics', materialType: 'slide_deck' },
};

const entry = {
  id: 'https://computable-lab.com/schema/computable-lab/training-material.schema.yaml',
  schema: {
    properties: {
      kind: { const: 'training-material' },
      id: { pattern: '^TRM-[A-Z0-9][A-Z0-9_-]*' },
      lifecycleId: { const: 'document-control' },
    },
  },
} as unknown as SchemaEntry;

const uiSpec = {
  form: {
    sections: [
      { fields: [{ path: '$.title', label: 'Title' }, { path: '$.materialType', label: 'Material Type', widget: 'select', options: [{ value: 'slide_deck', label: 'Slide Deck' }] }] },
    ],
  },
} as unknown as UISpec;

/** Deps with a stage store that RECORDS creates (so "zero writes" is provable). */
function depsWith(writes: RecordEnvelope[]): RecordDraftDeps {
  const stage = {
    list: async () => [],
    get: async () => null,
    create: async ({ envelope }: { envelope: RecordEnvelope }) => {
      writes.push(envelope);
      return { success: true, recordId: envelope.recordId } as never;
    },
  } as unknown as RecordStore;
  const canonical = { list: async () => [], get: async () => null } as unknown as RecordStore;
  return {
    stage,
    canonical,
    entries: [entry],
    validate: () => ({ valid: true, errors: [] }),
    validateWithSchema: () => ({ valid: true, errors: [] }),
    uiSpecFor: () => uiSpec,
  };
}

describe('record-drafting landing tab kind — DATA, not a TS literal (QMS7-7 D2)', () => {
  it('the loader reads landing.tabKind from the record-drafting block of adapters.yaml', () => {
    const declared = loadRecordDraftLandingTabKind();
    const raw = parse(readFileSync(adaptersPath, 'utf8')) as {
      adapters: Record<string, { landing?: { tabKind?: string } }>;
    };
    expect(declared).toBe(raw.adapters['record-drafting']?.landing?.tabKind);
    expect(declared).toBeTruthy();
  });

  it('the compiled landing document derives tab kind + activeTabId from the YAML value', async () => {
    const writes: RecordEnvelope[] = [];
    const compiled = await compileRecordDraftIntent(INTENT, depsWith(writes), 'USR-QMS-TEST', () => '2026-10-16T00:00:00.000Z');
    expect(compiled.ok, compiled.ok ? '' : compiled.diagnostics.map((d) => `${d.code} ${d.path}: ${d.message}`).join('; ')).toBe(true);
    if (!compiled.ok) return;
    const declared = loadRecordDraftLandingTabKind()!;
    expect(compiled.result.sessionDocument.tabs[0]?.kind).toBe(declared);
    expect(compiled.result.sessionDocument.activeTabId).toBe(declared);
    expect(writes.length).toBe(1);
  });

  it('source-pin: recordDraftCompile.ts carries NO landing tab-kind literal', () => {
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).not.toMatch(/kind:\s*'registry'/);
    expect(source).not.toMatch(/activeTabId:\s*'registry'/);
    expect(source).toContain('loadRecordDraftLandingTabKind()');
  });

  it('an absent landing key fails the compile HONESTLY (LANDING_TAB_KIND_UNDECLARED) with ZERO staged writes', async () => {
    // Doctored adapters.yaml: the record-drafting block WITHOUT its landing key.
    // Only the adapters.yaml read is intercepted (the file-level vi.mock above
    // serves the doctored text for that path only); every other fs read rides
    // the real module, so the harness stays faithful.
    mocks.doctoredAdaptersYaml = `adapters:\n  record-drafting:\n    domain: registry-records\n    operations: [compose-record]\n    projection: {}\n`;
    try {
      expect(loadRecordDraftLandingTabKind()).toBeNull();
      const writes: RecordEnvelope[] = [];
      const compiled = await compileRecordDraftIntent(INTENT, depsWith(writes), 'USR-QMS-TEST', () => '2026-10-16T00:00:00.000Z');
      expect(compiled.ok).toBe(false);
      if (compiled.ok) return;
      expect(compiled.diagnostics.map((d) => d.code)).toEqual(['LANDING_TAB_KIND_UNDECLARED']);
      expect(compiled.diagnostics[0]?.path).toBe('/landing');
      expect(compiled.diagnostics[0]?.message).toContain('adapters.yaml');
      // Honest failure means NOTHING was staged — the diagnostic precedes the write.
      expect(writes.length).toBe(0);
    } finally {
      mocks.doctoredAdaptersYaml = null;
    }
  });
});
