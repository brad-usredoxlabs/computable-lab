import { z } from 'zod';
import { ExecutionError } from '../ExecutionOrchestrator.js';

export class AdapterParameterError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const executeParameterSchemas = {
  integra_assist: z.object({
    simulate: z.boolean().optional(),
    vialLayout: z.string().min(1).optional(),
    mixCycles: z.number().int().min(0).max(50).optional(),
  }).strict(),
  opentrons_ot2: z.object({
    simulate: z.boolean().optional(),
    mountLeft: z.string().optional(),
    mountRight: z.string().optional(),
    maxTipReuse: z.number().int().min(1).max(1000).optional(),
  }).strict(),
  opentrons_flex: z.object({
    simulate: z.boolean().optional(),
    gripperEnabled: z.boolean().optional(),
    maxTipReuse: z.number().int().min(1).max(1000).optional(),
  }).strict(),
} as const;

export const activeReadParameterSchemas = {
  molecular_devices_gemini: z.object({
    simulate: z.boolean().optional(),
    mode: z.enum(['fluorescence', 'absorbance', 'luminescence']).optional(),
    wavelengthNm: z.number().int().min(200).max(900).optional(),
    integrationMs: z.number().int().min(1).max(300000).optional(),
  }).strict(),
  abi_7500_qpcr: z.object({
    simulate: z.boolean().optional(),
    cycles: z.number().int().min(1).max(100).optional(),
    annealTempC: z.number().min(0).max(120).optional(),
  }).strict(),
  agilent_6890n_gc: z.object({
    simulate: z.boolean().optional(),
    methodId: z.string().min(1).optional(),
    runTimeSec: z.number().int().min(1).max(86400).optional(),
  }).strict(),
  metrohm_761_ic: z.object({
    simulate: z.boolean().optional(),
    methodId: z.string().min(1).optional(),
    acquisitionSec: z.number().int().min(1).max(86400).optional(),
  }).strict(),
} as const;

export type ExecuteTarget = keyof typeof executeParameterSchemas;
export type ActiveReadTarget = keyof typeof activeReadParameterSchemas;

export function listExecuteTargets(): ExecuteTarget[] {
  return Object.keys(executeParameterSchemas) as ExecuteTarget[];
}

export function listActiveReadTargets(): ActiveReadTarget[] {
  return Object.keys(activeReadParameterSchemas) as ActiveReadTarget[];
}

export function getExecuteParameterShape(target: ExecuteTarget): Record<string, string> {
  const shape = executeParameterSchemas[target].shape;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(shape)) {
    result[key] = value.constructor.name;
  }
  return result;
}

export function getActiveReadParameterShape(target: ActiveReadTarget): Record<string, string> {
  const shape = activeReadParameterSchemas[target].shape;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(shape)) {
    result[key] = value.constructor.name;
  }
  return result;
}

export function validateExecuteParameters(target: ExecuteTarget, input: unknown): Record<string, unknown> {
  const schema = executeParameterSchemas[target];
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw new ExecutionError('BAD_REQUEST', `Invalid execute parameters for ${target}: ${result.error.message}`, 400);
  }
  return result.data;
}

export function validateActiveReadParameters(target: ActiveReadTarget, input: unknown): Record<string, unknown> {
  const schema = activeReadParameterSchemas[target];
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw new AdapterParameterError('BAD_REQUEST', `Invalid active-read parameters for ${target}: ${result.error.message}`, 400);
  }
  return result.data;
}
