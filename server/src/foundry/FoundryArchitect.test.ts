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

  it('routes Foundry harness dependency issues to runtime wiring lane', async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), 'foundry-architect-'));
    const protocolId = 'demo-protocol';
    const variant = 'manual_tubes';

    await writeYaml(join(artifactRoot, 'compiler', protocolId, `${variant}.yaml`), {
      kind: 'protocol-foundry-compiler-result',
      outcome: 'gap',
      eventCount: 7,
      diagnostics: [
        { severity: 'info', code: 'foundry_presegmented_candidates', pass_id: 'extract_entities' },
      ],
      gaps: [
        {
          kind: 'unresolved_ref',
          message: 'generic_96_well_plate (no matching labware in prior snapshot)',
          details: {
            hint: 'generic_96_well_plate',
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

    const verdict = await runFoundryArchitectReview({
      artifactRoot,
      protocolId,
      variant,
      dryRun: true,
    });

    expect(verdict.failureClasses).toContain('foundry_runtime_wiring_gap');
    const wiringFix = verdict.recommendedFixes.find((fix) => fix.class === 'foundry_runtime_wiring_gap');
    expect(wiringFix?.ownedFiles).toContain('server/src/foundry/ProtocolFoundryCompileRunner.ts');
    expect(wiringFix?.acceptance.join('\n')).toContain('real lookup/resolver dependencies');
  });

  it('routes malformed unresolved refs to the precompiler reference shape lane', async () => {
    const artifactRoot = await mkdtemp(join(tmpdir(), 'foundry-architect-'));
    const protocolId = 'demo-protocol';
    const variant = 'manual_tubes';

    await writeYaml(join(artifactRoot, 'compiler', protocolId, `${variant}.yaml`), {
      kind: 'protocol-foundry-compiler-result',
      outcome: 'gap',
      eventCount: 7,
      diagnostics: [
        { severity: 'warning', code: 'ai_precompile_shape_mismatch', pass_id: 'ai_precompile' },
      ],
      gaps: [
        {
          kind: 'unresolved_ref',
          message: 'undefined (kind undefined not handled by resolve_references)',
          details: {
            '0': 'c',
            '1': 'a',
            '2': 'p',
            '3': 't',
            '4': 'u',
            '5': 'r',
            '6': 'e',
            reason: 'kind undefined not handled by resolve_references',
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

    const verdict = await runFoundryArchitectReview({
      artifactRoot,
      protocolId,
      variant,
      dryRun: true,
    });

    expect(verdict.failureClasses).toContain('precompiler_reference_shape_gap');
    const shapeFix = verdict.recommendedFixes.find((fix) => fix.class === 'precompiler_reference_shape_gap');
    expect(shapeFix?.ownedFiles).toContain('server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts');
    expect(shapeFix?.acceptance.join('\n')).toContain('Character-index object refs no longer appear');
  });
});
