import { z } from 'zod';

export const LABOS_BRIDGE_CONTRACT_VERSION = 'labos-bridge/v1';

const assistSubmitV1Schema = z.object({
  contractVersion: z.literal(LABOS_BRIDGE_CONTRACT_VERSION),
  adapterId: z.literal('integra_assist'),
  operation: z.literal('submit'),
  result: z.object({
    runId: z.string().min(1),
    status: z.string().min(1),
  }),
});

const assistStatusV1Schema = z.object({
  contractVersion: z.literal(LABOS_BRIDGE_CONTRACT_VERSION),
  adapterId: z.literal('integra_assist'),
  operation: z.literal('status'),
  result: z.object({
    runId: z.string().min(1),
    status: z.string().min(1),
  }),
});

const assistCancelV1Schema = z.object({
  contractVersion: z.literal(LABOS_BRIDGE_CONTRACT_VERSION),
  adapterId: z.literal('integra_assist'),
  operation: z.literal('cancel'),
  result: z.object({
    runId: z.string().min(1),
    status: z.string().min(1),
  }),
});

const geminiActiveReadV1Schema = z.object({
  contractVersion: z.literal(LABOS_BRIDGE_CONTRACT_VERSION),
  adapterId: z.literal('molecular_devices_gemini'),
  operation: z.literal('active_read'),
  result: z.object({
    rawDataPath: z.string().min(1),
    parserId: z.string().optional(),
    status: z.string().optional(),
  }),
});

function parseJsonMaybe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function pickString(payload: unknown, keys: string[]): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const obj = payload as Record<string, unknown>;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  for (const value of Object.values(obj)) {
    const nested = pickString(value, keys);
    if (nested) return nested;
  }
  return undefined;
}

function strictContractsEnabled(): boolean {
  const value = process.env['LABOS_SIDECAR_CONTRACT_STRICT'];
  if (value === undefined) return true;
  const normalized = value.trim().toLowerCase();
  return !(normalized === '0' || normalized === 'false' || normalized === 'no');
}

type ParsedAssistContract = {
  runId: string;
  status: string;
  contractVersion: string;
  legacy: boolean;
};

function parseAssistLegacy(json: unknown): { runId?: string; status?: string } {
  const runId = pickString(json, ['runId', 'id']);
  const status = pickString(json, ['status', 'runStatus']);
  return {
    ...(runId ? { runId } : {}),
    ...(status ? { status } : {}),
  };
}

function parseAssist(
  text: string,
  schema: typeof assistSubmitV1Schema | typeof assistStatusV1Schema | typeof assistCancelV1Schema,
  operation: 'submit' | 'status' | 'cancel',
): ParsedAssistContract {
  const json = parseJsonMaybe(text);
  const parsed = schema.safeParse(json);
  if (parsed.success) {
    return {
      runId: parsed.data.result.runId,
      status: parsed.data.result.status,
      contractVersion: parsed.data.contractVersion,
      legacy: false,
    };
  }
  const legacy = parseAssistLegacy(json);
  if (!strictContractsEnabled() && legacy.runId && legacy.status) {
    return {
      runId: legacy.runId,
      status: legacy.status,
      contractVersion: 'legacy',
      legacy: true,
    };
  }
  throw new Error(
    `Invalid INTEGRA ${operation} response contract. Expected ${LABOS_BRIDGE_CONTRACT_VERSION} with {result:{runId,status}}.`,
  );
}

export function parseAssistSubmitResponse(text: string): ParsedAssistContract {
  return parseAssist(text, assistSubmitV1Schema, 'submit');
}

export function parseAssistStatusResponse(text: string): ParsedAssistContract {
  return parseAssist(text, assistStatusV1Schema, 'status');
}

export function parseAssistCancelResponse(text: string): ParsedAssistContract {
  return parseAssist(text, assistCancelV1Schema, 'cancel');
}

export function parseGeminiActiveReadResponse(text: string): {
  rawDataPath: string;
  parserId?: string;
  status?: string;
  contractVersion: string;
  legacy: boolean;
} {
  const json = parseJsonMaybe(text);
  const parsed = geminiActiveReadV1Schema.safeParse(json);
  if (parsed.success) {
    return {
      rawDataPath: parsed.data.result.rawDataPath,
      ...(parsed.data.result.parserId ? { parserId: parsed.data.result.parserId } : {}),
      ...(parsed.data.result.status ? { status: parsed.data.result.status } : {}),
      contractVersion: parsed.data.contractVersion,
      legacy: false,
    };
  }
  const rawDataPath = pickString(json, ['rawDataPath']);
  const parserId = pickString(json, ['parserId']);
  const status = pickString(json, ['status', 'runStatus']);
  if (!strictContractsEnabled() && rawDataPath) {
    return {
      rawDataPath,
      ...(parserId ? { parserId } : {}),
      ...(status ? { status } : {}),
      contractVersion: 'legacy',
      legacy: true,
    };
  }
  throw new Error(
    `Invalid Gemini active_read response contract. Expected ${LABOS_BRIDGE_CONTRACT_VERSION} with {result:{rawDataPath}}.`,
  );
}
