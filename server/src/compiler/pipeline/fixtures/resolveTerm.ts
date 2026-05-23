/**
 * resolveTerm — worktree harness for the Fix-it coder's `resolve_term` tool.
 * Per-table "what does this hint resolve to" inspector. Distinct from
 * `inspect_registry` (which lists catalog contents): this exercises the
 * actual matching function the compiler/fixture uses, so the coder can see
 * whether the bug is in the matcher logic vs the catalog data.
 *
 *   npx tsx server/src/compiler/pipeline/fixtures/resolveTerm.ts --table labware --hint "12-well reservoir"
 *
 * Supported tables right now:
 *   - labware: runs buildTestSearchLabwareByHint (the matcher `verify` uses)
 *     and cross-checks each returned recordId against LabwareDefinitionRegistry.
 *
 * Unsupported tables emit `{ supported: false, alternatives: [...] }` so the
 * model knows to use `probe` (synthesise a prompt) or `inspect_registry`.
 */
import { buildTestSearchLabwareByHint, TEST_LABWARE_ALIAS_MAP } from './FixtureRunner.js';
import { getLabwareDefinitionRegistry } from '../../../registry/LabwareDefinitionRegistry.js';

const SUPPORTED_TABLES = ['labware'] as const;

function argOf(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function resolveLabware(hint: string): Promise<unknown> {
  const search = buildTestSearchLabwareByHint();
  const matches = await search(hint);
  const registryIds = new Set(
    getLabwareDefinitionRegistry()
      .list()
      .map((r: { recordId?: unknown }) => (typeof r.recordId === 'string' ? r.recordId : ''))
      .filter(Boolean),
  );
  const annotated = matches.map((m) => ({
    recordId: m.recordId,
    title: m.title,
    inRegistry: registryIds.has(m.recordId),
  }));
  const aliasRecordIds = Array.from(new Set(Object.values(TEST_LABWARE_ALIAS_MAP))).sort();
  // Cross-check: which alias-map values are MISSING from the canonical
  // registry (these are the test-vs-prod divergences worth surfacing).
  const aliasNotInRegistry = aliasRecordIds.filter((id) => !registryIds.has(id));
  return {
    table: 'labware',
    hint,
    matches: annotated,
    aliasRecordIds,
    aliasNotInRegistry,
  };
}

async function main(): Promise<void> {
  const table = (argOf('--table') ?? '').trim();
  const hint = (argOf('--hint') ?? '').trim();
  if (!table) {
    process.stderr.write('resolveTerm: --table is required\n');
    process.exit(2);
  }
  if (!hint) {
    process.stderr.write('resolveTerm: --hint is required\n');
    process.exit(2);
  }
  if (table === 'labware') {
    process.stdout.write(JSON.stringify(await resolveLabware(hint)) + '\n');
    return;
  }
  process.stdout.write(
    JSON.stringify({
      table,
      hint,
      supported: false,
      supportedTables: [...SUPPORTED_TABLES],
      alternatives: [
        'inspect_registry — to browse what records EXIST in any registry catalog',
        'probe — to synthesise a minimal prompt and see how the compiler resolves it via resolvedRefs / resolvedLabwareRefs',
      ],
      reason:
        'No standalone search-by-hint function exists for this table yet. Most non-labware resolutions live inside compiler passes and are exercised end-to-end via `probe`.',
    }) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`resolveTerm failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
