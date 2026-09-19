/**
 * Generic equipment kinds are registry definitions (ruling, 2026-09-19): a `CL:`
 * CURIE is not a record, so a registry definition is where the class-level facts
 * live — settingsDefinition above all, which had nowhere to go before this.
 *
 * These pin the data AND the cross-references: every `CL:` kind named by a
 * capability record must exist here, or the capability is unreadable.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { getEquipmentKindRegistry } from './EquipmentKindRegistry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAPABILITY_DIR = resolve(__dirname, '../../../records/seed/equipment-capability');

describe('EquipmentKindRegistry', () => {
  it('loads the generic physical kinds as CL: CURIEs', () => {
    const ids = getEquipmentKindRegistry().list().map((entry) => entry.id);
    expect(ids).toEqual(expect.arrayContaining([
      'CL:water_bath',
      'CL:heat_block',
      'CL:orbital_shaker',
      'CL:rocker',
      'CL:clamshell_heater_shaker',
      'CL:sonicating_bath',
    ]));
    for (const id of ids) expect(id).toMatch(/^CL:[a-z0-9_]+$/);
  });

  it('gives a generic kind a home for its settings keys', () => {
    const bath = getEquipmentKindRegistry().get('CL:water_bath');
    expect(bath?.name).toBe('Water bath');
    expect(bath?.settingsDefinition?.map((setting) => setting.key)).toEqual(['temperature_c']);
    const clamshell = getEquipmentKindRegistry().get('CL:clamshell_heater_shaker');
    expect(clamshell?.settingsDefinition?.map((setting) => setting.key)).toEqual([
      'temperature_c',
      'rpm',
      'timer_sec',
    ]);
  });

  it('keeps equipment that cannot heat from declaring a temperature setting', () => {
    const shaker = getEquipmentKindRegistry().get('CL:orbital_shaker');
    expect(shaker?.settingsDefinition?.map((setting) => setting.key)).toEqual(['rpm']);
    expect(shaker?.settingsDefinition?.map((setting) => setting.key)).not.toContain('temperature_c');
  });

  it('treats instrumentKind as a render hint, never the vocabulary', () => {
    // The deck glyph is display-only (D1); the verbs/acceptance come from data.
    expect(getEquipmentKindRegistry().get('CL:rocker')?.instrumentKind).toBe('heater_shaker');
  });

  it('every CL: kind a capability record points at exists here', () => {
    const kinds = new Set(getEquipmentKindRegistry().list().map((entry) => entry.id));
    const referenced = new Set<string>();
    for (const name of readdirSync(CAPABILITY_DIR)) {
      if (!name.endsWith('.yaml')) continue;
      const payload = parseYaml(readFileSync(join(CAPABILITY_DIR, name), 'utf8')) as {
        equipmentClassRef?: { kind?: string; id?: string };
      };
      if (payload.equipmentClassRef?.kind === 'ontology' && payload.equipmentClassRef.id) {
        referenced.add(payload.equipmentClassRef.id);
      }
    }
    expect(referenced.size).toBeGreaterThan(0);
    for (const id of referenced) expect(kinds.has(id), `${id} is not a registry definition`).toBe(true);
  });
});
