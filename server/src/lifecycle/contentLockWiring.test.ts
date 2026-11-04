/**
 * L1-RECORD-LOCK-GUARD-1 LEG 1 U4 — AM-10: production wiring is engine-backed.
 *
 * Pins that the store the REAL server (server.ts initializeApp) constructs is
 * wired to the server's OWN loaded LifecycleEngine for content-lock policy,
 * NOT the shared default fallback. The discriminator is a PROBE lifecycle
 * whose `contentLocked` states exist ONLY in the server's temp engine (never
 * in the worktree's declared YAML), so the only resolver that can return that
 * exact set is the server engine's. If server.ts regressed to the shared
 * default (which reads the worktree schema dir), the probe set would not be
 * resolvable and this pin goes red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';

// A lifecycle id guaranteed NOT to collide with any worktree-declared
// lifecycle, and a locked-state set chosen to be DISTINCT from the
// document-control set so it cannot be mistaken for the default resolver's
// answer.
const PROBE_ID = 'am10-probe-lifecycle';
const PROBE_LOCKED = ['frozen', 'vaulted'];

describe('L1-RECORD-LOCK-GUARD-1 LEG 1 U4 — AM-10 server wiring is engine-backed', () => {
  let appDir: string;
  let ctx: AppContext;

  beforeAll(async () => {
    appDir = join(tmpdir(), `clg-am10-${randomUUID().slice(0, 8)}`);
    await mkdir(join(appDir, 'schema', 'core', 'lifecycles'), { recursive: true });
    await mkdir(join(appDir, 'records'), { recursive: true });
    // initializeApp loads the default lab profile from schema/lab/
    // (material-profile.registry.yaml) — same minimal registry the Api.test.ts
    // E2E harness scaffolds.
    await mkdir(join(appDir, 'schema', 'lab'), { recursive: true });
    await writeFile(
      join(appDir, 'schema', 'lab', 'material-profile.registry.yaml'),
      [
        'version: 1',
        'profiles:',
        '  chemical: { label: Chemical, applies_when: { domain: [chemical] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }',
        '  cell_line: { label: Cell, applies_when: { domain: [cell_line] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }',
        '  media_composition: { label: Media, applies_when: { domain: [media] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }',
        '  single_active_formulation: { label: Single, applies_when: { formulation_kind: [single_active] }, layers: [formulation], fields: [{ path: name, layer: formulation, label: Name, widget: text, control: free-text }], quick_add: [name] }',
        '  sample: { label: Sample, applies_when: { domain: [sample] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }',
        '  other: { label: Other, applies_when: { domain: [other] }, layers: [concept], fields: [{ path: name, layer: concept, label: Name, widget: text, control: free-text }], quick_add: [name] }',
        '',
      ].join('\n'),
    );
    // Minimal meta-schema-conformant lifecycle (lifecycleVersion/id/states/
    // transitions required; states minItems 2; transitions need from/to/role).
    await writeFile(
      join(appDir, 'schema', 'core', 'lifecycles', `${PROBE_ID}.lifecycle.yaml`),
      [
        'lifecycleVersion: 1',
        `id: ${PROBE_ID}`,
        'description: "AM-10 wiring probe — only the server engine knows this set."',
        'states:',
        '- id: open',
        '  label: "Open"',
        '  initial: true',
        '- id: frozen',
        '  label: "Frozen"',
        '  contentLocked: true',
        '- id: vaulted',
        '  label: "Vaulted"',
        '  contentLocked: true',
        '  terminal: true',
        'roles:',
        '- id: author',
        '  label: "Author"',
        'transitions:',
        '- from: open',
        '  to: frozen',
        '  role: author',
      ].join('\n'),
    );

    ctx = await initializeApp(appDir, {
      schemaDir: 'schema',
      recordsDir: 'records',
      logLevel: 'silent',
    });
  }, 60_000);

  afterAll(async () => {
    await rm(appDir, { recursive: true, force: true });
  });

  it('AM-10: the server-constructed store resolves content-lock from the server engine, not the default', () => {
    const store = ctx.store as unknown as {
      contentLockedStates?: (id: string) => ReadonlySet<string> | undefined;
    };
    const storeResolver = store.contentLockedStates;
    expect(storeResolver).toBeTypeOf('function');
    if (!storeResolver) throw new Error('store resolver missing');

    // 1) The probe lifecycle — loaded ONLY by the server's own engine — must
    //    resolve to exactly the declared probe set. The shared default
    //    resolver cannot know this id (it reads the worktree schema dir), so
    //    success here proves the wiring is the server engine.
    const probe = storeResolver(PROBE_ID);
    expect(probe).toBeDefined();
    expect(probe ? [...probe].sort() : undefined).toEqual([...PROBE_LOCKED].sort());

    // 2) The same id, resolved through the server's OWN LifecycleEngine,
    //    returns the identical set — the store resolver and the engine agree
    //    (engine-backed, not a parallel copy).
    const engineProbe = ctx.lifecycleEngine.contentLockedStates(PROBE_ID);
    expect(engineProbe ? [...engineProbe].sort() : undefined).toEqual([...PROBE_LOCKED].sort());

    // 3) Undeclared-by-the-server-engine id ⇒ explicit fail-open (undefined),
    //    at the store resolver too (bait 14: no accidental hardcoded set).
    expect(storeResolver('no-such-lifecycle-am10')).toBeUndefined();
  });

  it('AM-10: shared default resolver still serves the declared document-control set (four locked states)', async () => {
    // The shared default (declared worktree YAML) is the contract for the two
    // scripts and the absent-config store: document-control locks exactly
    // {approved, effective, superseded, archived}.
    const { defaultContentLockedStates } = await import('../lifecycle/contentLockDefault.js');
    const dc = defaultContentLockedStates('document-control');
    expect(dc).toBeDefined();
    expect([...(dc ?? [])].sort()).toEqual(['approved', 'archived', 'effective', 'superseded']);
  });
});
