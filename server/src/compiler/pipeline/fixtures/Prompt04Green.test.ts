import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFixture } from './FixtureTypes.js';
import { runFixture } from './FixtureRunner.js';

const FIXTURE_PATH = resolve(__dirname, 'prompt-04-fire-assay.yaml');

describe('Prompt 04 - FIRE assay with reorientation, pipette swap, role coordinates, compound-class gap', () => {
  it('FIRE assay: 3 directives, 5 downstream jobs, compound-class gap', async () => {
    const p4 = parseFixture(readFileSync(FIXTURE_PATH, 'utf8'));
    const r4 = await runFixture(p4);

    // Assert 1: outcome is 'gap' (AhR activator compound-class has >1 candidate)
    expect(r4.outcome).toBe('gap');

    // Assert 2: exactly 3 directives (mount_pipette, reorient_labware, swap_pipette)
    expect(r4.terminalArtifacts.directives.length).toBe(3);

    // Assert 3: exactly 5 downstream compile jobs
    expect(r4.terminalArtifacts.downstreamQueue?.length).toBe(5);

    // Assert 4: AhR-activator compound-class gap appears in gaps
    const ahrGap = r4.terminalArtifacts.gaps.find(g => /AhR/i.test(g.message));
    expect(ahrGap).toBeDefined();
    expect(ahrGap?.kind).toBe('unresolved_ref');

    // Assert 5: Triplicate stamp: 3 cols * 8 rows = 24 transfers
    const triplicateEvents = r4.terminalArtifacts.events.filter(
      e => typeof e.eventId === 'string' && e.eventId.startsWith('pe_triplicate'),
    );
    expect(triplicateEvents.length).toBeGreaterThanOrEqual(24);

    // Assert 6: column_stamp_differentiated: 6 cols * 8 rows = 48 transfers
    const colDiffEvents = r4.terminalArtifacts.events.filter(
      e => typeof e.eventId === 'string' && e.eventId.startsWith('pe_coldiff'),
    );
    expect(colDiffEvents.length).toBeGreaterThanOrEqual(48);

    // Assert 7: Role-resolved events: cell_region expansion
    const cellRegionEvents = r4.terminalArtifacts.events.filter(e => {
      const d = e.details as Record<string, unknown>;
      return d.materialKind === 'media-with-AhR-inhibitor';
    });
    expect(cellRegionEvents.length).toBeGreaterThan(0);

    // Assert 8: No cell-region event lands on an excluded edge well
    // Edge wells: row A or H, column 1 or 12
    const offenders = cellRegionEvents.filter(e => {
      const w = (e.details as { well?: string }).well;
      if (!w) return false;
      const row = w[0];
      const col = parseInt(w.slice(1), 10);
      return row === 'A' || row === 'H' || col === 1 || col === 12;
    });
    expect(offenders.length).toBe(0);
  });
});
