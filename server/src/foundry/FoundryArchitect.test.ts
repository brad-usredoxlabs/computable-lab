import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import { runFoundryArchitectReview } from './FoundryArchitect.js';

async function writeYaml(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, YAML.stringify(value), 'utf-8');
}

describe('runFoundryArchitectReview', () => {
  it('routes existing labware lookup failures to the resolver lane', async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), 'foundry-architect-'));
    const protocolId = 'demo-protocol';
    const variant = 'manual_tubes';

    await writeYaml(join(artifactRoot, 'compiler', protocolId, `${variant}.yaml`), {
      kind: 'protocol-foundry-compiler-result',
      outcome: 'gap',
      eventCount: 7,
      diagnostics: [],
      gaps: [
        {
          kind: 'unresolved_ref',
          message: 'generic_24x1_5ml_tube_rack (no matching labware in prior snapshot)',
          details: {
            hint: 'generic_24x1_5ml_tube_rack',
            reason: 'no matching labware in prior snapshot',
          },
        },
      ],
    });
    await writeYaml(join(artifactRoot, 'event-graphs', protocolId, `${variant}.yaml`), {
      kind: 'protocol-event-graph-proposal',
      eventGraph: { events: Array.from({ length: 7 }, (_, index) => ({ eventId: `e${index}` })) },
    });
    await writeYaml(join(artifactRoot, 'execution-scale', protocolId, `${variant}.yaml`), {
      kind: 'execution-scale-plan',
      blockers: [],
    });
    await writeYaml(join(artifactRoot, 'browser-review', protocolId, variant, 'report.yaml'), {
      status: 'blocked',
    });
    await writeYaml(join(artifactRoot, 'segments', `${protocolId}.yaml`), { protocolId });
    await writeYaml(join(artifactRoot, 'material-context', `${protocolId}.yaml`), {});
    await mkdir(join(artifactRoot, 'text'), { recursive: true });
    await writeFile(join(artifactRoot, 'text', `${protocolId}.txt`), 'Use a generic 24x1.5 mL tube rack.', 'utf-8');

    const verdict = await runFoundryArchitectReview({
      artifactRoot,
      protocolId,
      variant,
      dryRun: true,
    });

    expect(verdict.failureClasses).toContain('labware_alias_or_resolver_gap');
    const resolverFix = verdict.recommendedFixes.find((fix) => fix.class === 'labware_alias_or_resolver_gap');
    expect(resolverFix).toBeDefined();
    expect(resolverFix?.ownedFiles).toContain('server/src/foundry/ProtocolFoundryCompileRunner.ts');
    expect(resolverFix?.ownedFiles).not.toContain('records/seed/labware-definition');

    const specRaw = await readFile(
      join(artifactRoot, 'patch-specs', protocolId, variant, 'fix-labware-alias-resolver-gap.yaml'),
      'utf-8',
    );
    const spec = YAML.parse(specRaw) as Record<string, unknown>;
    expect(spec['fixClass']).toBe('labware_alias_or_resolver_gap');
  });
});
