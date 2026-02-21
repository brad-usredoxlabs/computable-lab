import { ExecutionError } from './ExecutionOrchestrator.js';
import type { AppContext } from '../server.js';

type PlateEvent = {
  eventId: string;
  event_type: string;
  details?: Record<string, unknown>;
};

type EventGraphPayload = {
  events?: PlateEvent[];
};

type WellState = {
  labwareId: string;
  well: string;
  eventId: string;
  eventType: string;
  material?: string;
  volume_uL?: number;
  note?: string;
};

function refId(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    if (typeof rec['id'] === 'string') return rec['id'];
  }
  return undefined;
}

function normalizeWells(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

function splitLabwareWell(composite: string): { labwareId: string; well: string } | null {
  const idx = composite.indexOf(':');
  if (idx < 0) return null;
  return {
    labwareId: composite.slice(0, idx),
    well: composite.slice(idx + 1),
  };
}

export class PlateMapExporter {
  private readonly ctx: AppContext;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  async export(input: { eventGraphId: string; labwareId?: string; format?: 'csv' | 'tsv' }): Promise<string> {
    const envelope = await this.ctx.store.get(input.eventGraphId);
    if (!envelope) {
      throw new ExecutionError('NOT_FOUND', `Event graph not found: ${input.eventGraphId}`, 404);
    }
    const payload = envelope.payload as EventGraphPayload;
    const events = payload.events ?? [];

    const latestByWell = new Map<string, WellState>();

    for (const event of events) {
      const details = event.details ?? {};

      if (event.event_type === 'add_material') {
        const labwareId = refId(details['labwareInstanceId']);
        if (!labwareId) continue;
        const material = refId(details['materialId']);
        const wells = normalizeWells(details['wells']);
        const volume_uL = typeof details['volume_uL'] === 'number' ? details['volume_uL'] : undefined;
        for (const well of wells) {
          latestByWell.set(`${labwareId}:${well}`, {
            labwareId,
            well,
            eventId: event.eventId,
            eventType: event.event_type,
            ...(material ? { material } : {}),
            ...(volume_uL !== undefined ? { volume_uL } : {}),
          });
        }
        continue;
      }

      if (event.event_type === 'transfer') {
        const source = details['source'];
        const target = details['target'];
        const sourceLabware = source && typeof source === 'object' ? refId((source as Record<string, unknown>)['labwareInstanceId']) : undefined;
        const targetLabware = target && typeof target === 'object' ? refId((target as Record<string, unknown>)['labwareInstanceId']) : undefined;
        if (!sourceLabware || !targetLabware) continue;
        const sourceWells = source && typeof source === 'object' ? normalizeWells((source as Record<string, unknown>)['wells']) : [];
        const targetWells = target && typeof target === 'object' ? normalizeWells((target as Record<string, unknown>)['wells']) : [];
        const volume_uL = typeof details['volume_uL'] === 'number' ? details['volume_uL'] : undefined;

        const mappingRaw = details['mapping'];
        if (Array.isArray(mappingRaw) && mappingRaw.length > 0) {
          for (const pairRaw of mappingRaw) {
            if (!pairRaw || typeof pairRaw !== 'object') continue;
            const pair = pairRaw as Record<string, unknown>;
            const sourceWell = typeof pair['source_well'] === 'string' ? pair['source_well'] : undefined;
            const targetWell = typeof pair['target_well'] === 'string' ? pair['target_well'] : undefined;
            if (!sourceWell || !targetWell) continue;
            const sourceState = latestByWell.get(`${sourceLabware}:${sourceWell}`);
            latestByWell.set(`${targetLabware}:${targetWell}`, {
              labwareId: targetLabware,
              well: targetWell,
              eventId: event.eventId,
              eventType: event.event_type,
              ...(sourceState?.material ? { material: sourceState.material } : {}),
              ...(typeof pair['volume_uL'] === 'number'
                ? { volume_uL: pair['volume_uL'] }
                : volume_uL !== undefined
                  ? { volume_uL }
                  : {}),
              note: `from ${sourceLabware}:${sourceWell}`,
            });
          }
          continue;
        }

        const count = Math.min(sourceWells.length, targetWells.length);
        for (let i = 0; i < count; i += 1) {
          const sourceWell = sourceWells[i];
          const targetWell = targetWells[i];
          if (!sourceWell || !targetWell) continue;
          const sourceState = latestByWell.get(`${sourceLabware}:${sourceWell}`);
          latestByWell.set(`${targetLabware}:${targetWell}`, {
            labwareId: targetLabware,
            well: targetWell,
            eventId: event.eventId,
            eventType: event.event_type,
            ...(sourceState?.material ? { material: sourceState.material } : {}),
            ...(volume_uL !== undefined ? { volume_uL } : {}),
            note: `from ${sourceLabware}:${sourceWell}`,
          });
        }
      }
    }

    const delimiter = input.format === 'tsv' ? '\t' : ',';
    const lines: string[] = ['labwareId,well,eventId,eventType,material,volume_uL,note'.replaceAll(',', delimiter)];

    const sorted = [...latestByWell.entries()]
      .map(([k, v]) => ({ key: k, state: v }))
      .sort((a, b) => a.key.localeCompare(b.key));

    for (const entry of sorted) {
      const split = splitLabwareWell(entry.key);
      if (!split) continue;
      if (input.labwareId && split.labwareId !== input.labwareId) continue;
      const s = entry.state;
      const row = [
        s.labwareId,
        s.well,
        s.eventId,
        s.eventType,
        s.material ?? '',
        s.volume_uL !== undefined ? String(s.volume_uL) : '',
        s.note ?? '',
      ]
        .map((v) => (v.includes(delimiter) ? `"${v.replaceAll('"', '""')}"` : v))
        .join(delimiter);
      lines.push(row);
    }

    return `${lines.join('\n')}\n`;
  }
}
