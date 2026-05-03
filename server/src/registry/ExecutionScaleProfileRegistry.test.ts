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

  it('keeps ASSIST PLUS two-well reservoir as data-backed blocker', () => {
    const profile = getExecutionScaleProfileRegistry().get('robot-assist-plus-96');

    expect(profile?.reagentSource.sourceLabwareKind).toBe('2_well_reservoir');
    expect(profile?.defaultBlockers).toContainEqual(
      expect.objectContaining({ code: 'missing_2_well_reservoir_definition' }),
    );
  });
});
