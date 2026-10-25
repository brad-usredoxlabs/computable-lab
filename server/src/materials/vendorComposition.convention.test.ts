/**
 * ROLE-AXES-1 LEG 2 (OQ-4 ruling) — the preferredRole pick order for the
 * primary declared concentration is config DATA (primaryConcentrationRoleOrder),
 * loaded per call. Convention absent -> LOUD-off console.warn naming the path
 * and the preference pass simply does not fire (the first concentration-bearing
 * entry wins) — existing behavior for concentration-bearing-first records is
 * unchanged, never a throw.
 */
import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractPrimaryDeclaredConcentration } from './vendorComposition.js';
import { loadParticipationConvention } from './participationConvention.js';

const ref = (kind: 'record' | 'ontology', id: string, label: string) => ({ kind, id, label });

const declared = [
  { component_ref: ref('ontology', 'CHEBI:15377', 'Water'), role: 'solvent' },
  { component_ref: ref('ontology', 'CHEBI:28284', 'NaCl'), role: 'additive', concentration: { value: 5, unit: 'mg/mL', basis: 'mass_per_volume' } },
  { component_ref: ref('record', 'vp-act', 'Enzyme'), role: 'activity_source', concentration: { value: 2, unit: 'U/mL', basis: 'activity_per_volume' } },
  { component_ref: ref('record', 'inst-x', 'Cells'), role: 'cells', concentration: { value: 1000000, unit: 'cells/mL', basis: 'count_per_volume' } },
];

describe('ROLE-AXES-1 vendorComposition: the pick order is config data', () => {
  it('the shipped config order picks the activity_source concentration (byte-stable legacy pick)', () => {
    expect(extractPrimaryDeclaredConcentration(declared)).toMatchObject({ value: 2, unit: 'U/mL', basis: 'activity_per_volume' });
  });

  it('the config order is read from the shipped data home (no TS literal)', () => {
    const conv = loadParticipationConvention()!;
    expect(conv.primaryConcentrationRoleOrder.length).toBeGreaterThan(0);
    // The pick follows the config order: the FIRST config-listed role that
    // carries a concentration wins.
    const firstCarrying = conv.primaryConcentrationRoleOrder.find((role) =>
      declared.some((entry) => entry.role === role && entry.concentration));
    const picked = extractPrimaryDeclaredConcentration(declared);
    const carryingEntry = declared.find((entry) => entry.role === firstCarrying && entry.concentration);
    expect(picked).toMatchObject(carryingEntry!.concentration!);
  });

  it('a record with only a solvent concentration still resolves it (fallback pass unchanged)', () => {
    expect(extractPrimaryDeclaredConcentration([
      { component_ref: ref('ontology', 'CHEBI:15377', 'Water'), role: 'solvent', concentration: { value: 90, unit: '% v/v', basis: 'volume_fraction' } },
      { component_ref: ref('ontology', 'CHEBI:28284', 'NaCl'), role: 'additive', concentration: { value: 5, unit: 'mg/mL', basis: 'mass_per_volume' } },
    ])).toMatchObject({ value: 90, unit: '% v/v', basis: 'volume_fraction' });
  });

  it('absent convention -> LOUD-off warn naming the path, the preference pass does not fire, never throws', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const tmp = mkdtempSync(join(tmpdir(), 'roleaxes-vendorconv-'));
      const missingPath = join(tmp, 'absent-convention.yaml');
      const conv = loadParticipationConvention(missingPath);
      expect(conv).toBeUndefined();
      const warns = warnSpy.mock.calls.map((call) => String(call[0]));
      expect(warns.some((w) => w.includes('composition-participation-convention-off') && w.includes(missingPath))).toBe(true);
      // The pick itself still works off the declared entries (no throw).
      expect(extractPrimaryDeclaredConcentration(declared)).toMatchObject({ value: 2, unit: 'U/mL', basis: 'activity_per_volume' });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('malformed convention -> THROWS naming the path', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'roleaxes-vendorconv-bad-'));
    const badPath = join(tmp, 'bad-convention.yaml');
    writeFileSync(badPath, 'primaryConcentrationRoleOrder: []\n');
    expect(() => loadParticipationConvention(badPath)).toThrowError(/composition-participation convention.*bad-convention\.yaml/);
  });
});
