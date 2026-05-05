import { describe, expect, it } from 'vitest';
import { getExecutionScaleProfileRegistry } from './ExecutionScaleProfileRegistry.js';

describe('ExecutionScaleProfileRegistry', () => {
  it('loads YAML execution scale profiles', () => {
    const registry = getExecutionScaleProfileRegistry();
    registry.reload();

    const profiles = registry.list();
    expect(profiles.map((profile) => profile.id)).toEqual([
      'bench-96-multichannel',
      'manual-tubes',
      'robot-assist-plus-96',
      'robot-opentrons-ot2-96',
    ]);
  });

  it('uses a single shared reservoir as the default ASSIST PLUS reagent source', () => {
    const profile = getExecutionScaleProfileRegistry().get('robot-assist-plus-96');

    expect(profile?.reagentSource.sourceLabwareKind).toBe('1_well_reservoir');
    expect(profile?.reagentSource.labwareDefinition).toBe('lbw-def-generic-reservoir-1-v1');
    expect(profile?.defaultBlockers ?? []).not.toContainEqual(
      expect.objectContaining({ code: 'missing_2_well_reservoir_definition' }),
    );
  });
});
