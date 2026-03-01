#!/usr/bin/env tsx
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import type { LabwareDefinitionRecord } from '../types/liquidHandlingDefinitions.js';

type OpentronsDefinition = {
  namespace?: string;
  version?: number;
  metadata?: { displayName?: string };
  parameters?: {
    loadName?: string;
    format?: string;
  };
  ordering?: string[][];
  wells?: Record<string, {
    totalLiquidVolume?: number;
    xDimension?: number;
    yDimension?: number;
  }>;
  dimensions?: {
    xDimension?: number;
    yDimension?: number;
    zDimension?: number;
  };
};

function inferTopology(def: OpentronsDefinition): LabwareDefinitionRecord['topology'] {
  const ordering = Array.isArray(def.ordering) ? def.ordering : [];
  const rows = ordering.length;
  const columns = ordering[0]?.length ?? 0;

  if (rows > 1 && columns > 1) {
    return {
      addressing: 'grid',
      rows,
      columns,
      orientation_default: 'landscape',
      orientation_allowed: ['landscape', 'portrait'],
    };
  }
  if (rows === 1 && columns > 1) {
    return {
      addressing: 'linear',
      linear_count: columns,
      orientation_default: 'landscape',
      orientation_allowed: ['landscape', 'portrait'],
    };
  }
  if (rows > 1 && columns === 1) {
    return {
      addressing: 'linear',
      linear_count: rows,
      orientation_default: 'portrait',
      orientation_allowed: ['landscape', 'portrait'],
    };
  }
  return { addressing: 'single', orientation_default: 'landscape', orientation_allowed: ['landscape', 'portrait'] };
}

function inferAspirationHints(loadName: string | undefined): LabwareDefinitionRecord['aspiration_hints'] {
  const normalized = (loadName || '').toLowerCase();
  if (normalized.includes('12_reservoir')) {
    return {
      single_well_multichannel_source: true,
      per_channel_source_expected: false,
      notes: 'Trough geometry typically supports multichannel aspiration from one well.',
    };
  }
  if (normalized.includes('8_reservoir')) {
    return {
      single_well_multichannel_source: false,
      per_channel_source_expected: true,
      notes: 'Commonly used as per-channel source wells for 8-channel heads.',
    };
  }
  return undefined;
}

function inferMaxWellVolume(wells: OpentronsDefinition['wells']): number {
  const values = Object.values(wells || {})
    .map((w) => w.totalLiquidVolume)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0);
  if (values.length === 0) return 1;
  return Math.max(...values);
}

function buildRecord(def: OpentronsDefinition, inputPath: string): LabwareDefinitionRecord {
  const loadName = def.parameters?.loadName || 'unknown_opentrons_labware';
  const displayName = def.metadata?.displayName || loadName;
  const sourceRaw = readFileSync(inputPath, 'utf-8');
  const hash = createHash('sha256').update(sourceRaw).digest('hex');
  const aspirationHints = inferAspirationHints(loadName);
  return {
    kind: 'labware-definition',
    recordId: `LWD-${loadName.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
    type: 'labware_definition',
    id: `opentrons/${loadName}@v${def.version ?? 1}`,
    display_name: displayName,
    vendor: 'Opentrons',
    platform_aliases: [
      { platform: 'opentrons_ot2', alias: loadName },
      { platform: 'opentrons_flex', alias: loadName },
    ],
    read_only: true,
    source: {
      kind: 'imported',
      url: inputPath,
      hash,
      version: String(def.version ?? 1),
    },
    topology: inferTopology(def),
    capacity: {
      max_well_volume_uL: inferMaxWellVolume(def.wells),
      min_working_volume_uL: 0,
    },
    ...(aspirationHints ? { aspiration_hints: aspirationHints } : {}),
    compatibility_tags: [def.parameters?.format || 'unknown'],
    notes: `Imported from Opentrons ${def.namespace || 'opentrons'} definition.`,
  };
}

function main() {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input) {
    console.error('Usage: npx tsx src/tools/importOpentronsLabware.ts <opentrons-json-path> [output-yaml-path]');
    process.exit(1);
  }
  const absInput = resolve(input);
  const raw = readFileSync(absInput, 'utf-8');
  const parsed = JSON.parse(raw) as OpentronsDefinition;
  const record = buildRecord(parsed, absInput);
  const out = YAML.stringify(record);
  if (output) {
    const absOutput = resolve(output);
    writeFileSync(absOutput, out, 'utf-8');
    console.log(`Wrote ${absOutput}`);
  } else {
    process.stdout.write(out);
  }
}

main();
