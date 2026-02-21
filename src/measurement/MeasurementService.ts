import type { AppContext } from '../server.js';
import { ParserRegistry } from './parsers/ParserRegistry.js';

const MEASUREMENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/measurement.schema.yaml';

type Ref = {
  kind: 'record' | 'ontology';
  id: string;
  type?: string;
};

import type { MeasurementRow } from './parsers/types.js';

type MeasurementPayload = {
  kind: 'measurement';
  recordId: string;
  title: string;
  assayType: 'qpcr' | 'plate_reader' | 'microscopy' | 'gc_ms' | 'flow' | 'other';
  eventGraphRef?: Ref;
  readEventRef?: string;
  instrumentRef?: Ref;
  labwareInstanceRef?: Ref;
  channels?: Array<{ channelId: string }>;
  shape?: { wells?: number; channels?: number };
  data: MeasurementRow[];
  artifacts?: Array<{
    role: string;
    fileRef: {
      uri: string;
      mimeType: string;
      label: string;
    };
  }>;
  parserInfo: {
    parserId: string;
    parserVersion: string;
    parsedAt: string;
  };
};

export class MeasurementServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function parseSuffixNumber(id: string, prefix: string): number | null {
  if (!id.startsWith(`${prefix}-`)) return null;
  const suffix = id.slice(prefix.length + 1);
  if (!/^\d+$/.test(suffix)) return null;
  return Number.parseInt(suffix, 10);
}

function parseRef(value: unknown): Ref | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') {
    throw new MeasurementServiceError('BAD_REQUEST', 'reference must be an object', 400);
  }
  const ref = value as Record<string, unknown>;
  if (ref.kind !== 'record' && ref.kind !== 'ontology') {
    throw new MeasurementServiceError('BAD_REQUEST', 'reference.kind must be record or ontology', 400);
  }
  if (typeof ref.id !== 'string' || ref.id.length === 0) {
    throw new MeasurementServiceError('BAD_REQUEST', 'reference.id is required', 400);
  }
  return {
    kind: ref.kind,
    id: ref.id,
    ...(typeof ref.type === 'string' && ref.type.length > 0 ? { type: ref.type } : {}),
  };
}

export class MeasurementService {
  private readonly ctx: AppContext;
  private readonly parsers: ParserRegistry;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.parsers = new ParserRegistry();
  }

  private async nextRecordId(): Promise<string> {
    const records = await this.ctx.store.list({ kind: 'measurement' });
    let max = 0;
    for (const envelope of records) {
      const n = parseSuffixNumber(envelope.recordId, 'MSR');
      if (n !== null && n > max) max = n;
    }
    return `MSR-${String(max + 1).padStart(6, '0')}`;
  }

  async ingest(input: {
    instrumentRef?: unknown;
    labwareInstanceRef?: unknown;
    eventGraphRef?: unknown;
    readEventRef?: string;
    parserId?: string;
    rawData?: unknown;
  }): Promise<{ recordId: string }> {
    const parserId = input.parserId ?? 'generic_csv';
    const rawData = input.rawData;
    if (rawData === undefined || rawData === null || typeof rawData !== 'object') {
      throw new MeasurementServiceError('BAD_REQUEST', 'rawData is required and must be an object', 400);
    }
    const raw = rawData as Record<string, unknown>;
    const rawPath = typeof raw['path'] === 'string' ? raw['path'] : undefined;
    if (!rawPath) {
      throw new MeasurementServiceError('BAD_REQUEST', 'rawData.path is required', 400);
    }

    const file = await this.ctx.repoAdapter.getFile(rawPath);
    if (!file) {
      throw new MeasurementServiceError('NOT_FOUND', `raw data file not found: ${rawPath}`, 404);
    }
    const parser = this.parsers.resolve(parserId);
    const parsed = parser.parse(file.content);
    const data = parsed.data;
    const wells = new Set(data.map((d) => d.well));
    const channels = new Set(parsed.channels);
    const eventGraphRef = parseRef(input.eventGraphRef);
    const instrumentRef = parseRef(input.instrumentRef);
    const labwareInstanceRef = parseRef(input.labwareInstanceRef);

    const recordId = await this.nextRecordId();
    const parsedAt = new Date().toISOString();
    const payload: MeasurementPayload = {
      kind: 'measurement',
      recordId,
      title: `Measurement ${recordId}`,
      assayType: parsed.assayType,
      ...(eventGraphRef ? { eventGraphRef } : {}),
      ...(typeof input.readEventRef === 'string' ? { readEventRef: input.readEventRef } : {}),
      ...(instrumentRef ? { instrumentRef } : {}),
      ...(labwareInstanceRef ? { labwareInstanceRef } : {}),
      ...(channels.size > 0 ? { channels: [...channels].map((channelId) => ({ channelId })) } : {}),
      shape: {
        wells: wells.size,
        ...(channels.size > 0 ? { channels: channels.size } : {}),
      },
      data,
      artifacts: [
        {
          role: 'raw_data',
          fileRef: {
            uri: rawPath,
            mimeType: parsed.mimeType,
            label: 'Raw measurement CSV',
          },
        },
      ],
      parserInfo: {
        parserId: parsed.parserId,
        parserVersion: parsed.parserVersion,
        parsedAt,
      },
    };

    const result = await this.ctx.store.create({
      envelope: {
        recordId,
        schemaId: MEASUREMENT_SCHEMA_ID,
        payload,
      },
      message: `Ingest measurement ${recordId}`,
    });
    if (!result.success) {
      throw new MeasurementServiceError('CREATE_FAILED', result.error ?? 'failed to persist measurement', 400);
    }
    return { recordId };
  }
}
