import type { FastifyReply, FastifyRequest } from 'fastify';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInferenceClient } from '../../ai/InferenceClient.js';
import type { InferenceClient } from '../../ai/types.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import {
  FoundryAcquisitionJobManager,
  type FoundryAcquisitionJobEvent,
  type FoundryAcquisitionJobRecord,
} from '../../foundry/FoundryAcquisitionJobManager.js';
import {
  FOUNDRY_ACQUISITION_TOOL_ALLOWLISTS,
  type FoundryAcquisitionJobKind,
} from '../../foundry/FoundryRegistryTools.js';
import { runFoundryAcquisitionJob } from '../../foundry/FoundryAcquisitionRunner.js';

export interface CreateFoundryJobBody {
  kind: FoundryAcquisitionJobKind;
  prompt: string;
  title?: string;
}

export interface ContinueFoundryJobBody {
  message: string;
}

export interface FoundryJobsResponse {
  jobs: FoundryAcquisitionJobRecord[];
}

export interface FoundryJobDetailResponse {
  job: FoundryAcquisitionJobRecord;
  events: FoundryAcquisitionJobEvent[];
}

export interface FoundryJobToolsResponse {
  allowlists: typeof FOUNDRY_ACQUISITION_TOOL_ALLOWLISTS;
  registeredTools: string[];
}

export interface FoundryJobHandlers {
  createJob(
    request: FastifyRequest<{ Body: CreateFoundryJobBody }>,
    reply: FastifyReply,
  ): Promise<FoundryJobDetailResponse | { error: string; message: string }>;
  listJobs(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FoundryJobsResponse>;
  getJob(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<FoundryJobDetailResponse | { error: string; message: string }>;
  continueJob(
    request: FastifyRequest<{ Params: { id: string }; Body: ContinueFoundryJobBody }>,
    reply: FastifyReply,
  ): Promise<FoundryJobDetailResponse | { error: string; message: string }>;
  completeJob(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<FoundryJobDetailResponse | { error: string; message: string }>;
  tools(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FoundryJobToolsResponse>;
}

export interface CreateFoundryJobHandlersDeps {
  workspaceRoot: string;
  toolRegistry: ToolRegistry;
  manager?: FoundryAcquisitionJobManager;
  clientFactory?: () => InferenceClient;
  runJob?: typeof runFoundryAcquisitionJob;
}

interface FoundryInferenceConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

const VALID_KINDS = new Set(Object.keys(FOUNDRY_ACQUISITION_TOOL_ALLOWLISTS));

function resolveFoundryInferenceConfig(): FoundryInferenceConfig {
  const baseUrl =
    process.env['PI_WORKER_BASE_URL']
    ?? process.env['OPENAI_BASE_URL']
    ?? 'http://thunderbeast:8001/v1';
  const model =
    process.env['PI_WORKER_MODEL']
    ?? process.env['OPENAI_MODEL']
    ?? 'Qwen/Qwen3.6-35B-A3B-FP8';
  const apiKey = process.env['PI_WORKER_API_KEY'] ?? process.env['OPENAI_API_KEY'];
  return { baseUrl, model, ...(apiKey ? { apiKey } : {}) };
}

export function createFoundryJobHandlers(deps: CreateFoundryJobHandlersDeps): FoundryJobHandlers {
  const workspaceRoot = resolve(deps.workspaceRoot);
  const manager = deps.manager ?? new FoundryAcquisitionJobManager({
    artifactRoot: resolve(workspaceRoot, 'artifacts'),
  });
  const runner = deps.runJob ?? runFoundryAcquisitionJob;
  const buildClient = deps.clientFactory
    ?? (() => {
      const cfg = resolveFoundryInferenceConfig();
      return createInferenceClient({
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        ...(cfg.apiKey ? { apiKey: cfg.apiKey } : {}),
        timeoutMs: 180_000,
        enableThinking: false,
      });
    });

  const startJob = (job: FoundryAcquisitionJobRecord) => {
    const cfg = resolveFoundryInferenceConfig();
    void runner({
      manager,
      job,
      registry: deps.toolRegistry,
      client: buildClient(),
      model: cfg.model,
      workspaceRoot,
    }).catch(async (error) => {
      await manager.failJob(job.id, error instanceof Error ? error.message : String(error));
    });
  };

  const detail = async (id: string): Promise<FoundryJobDetailResponse> => {
    const job = await manager.getJob(id);
    if (!job) throw new Error(`Foundry job not found: ${id}`);
    return { job, events: await manager.readEvents(id) };
  };

  return {
    async createJob(request, reply) {
      const body = request.body;
      if (!body?.prompt || typeof body.prompt !== 'string' || !body.prompt.trim()) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'prompt is required' };
      }
      if (!body.kind || !VALID_KINDS.has(body.kind)) {
        reply.status(400);
        return {
          error: 'INVALID_KIND',
          message: `kind must be one of: ${Array.from(VALID_KINDS).join(', ')}`,
        };
      }
      if (!existsSync(workspaceRoot)) {
        reply.status(500);
        return { error: 'WORKSPACE_MISSING', message: `workspaceRoot does not exist: ${workspaceRoot}` };
      }

      const job = await manager.enqueue({
        jobKind: body.kind,
        prompt: body.prompt,
        ...(body.title ? { title: body.title } : {}),
      });
      startJob(job);
      return detail(job.id);
    },

    async listJobs() {
      return { jobs: await manager.listJobs() };
    },

    async getJob(request, reply) {
      try {
        return await detail(request.params.id);
      } catch (error) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: error instanceof Error ? error.message : String(error) };
      }
    },

    async continueJob(request, reply) {
      if (!request.body?.message || typeof request.body.message !== 'string' || !request.body.message.trim()) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'message is required' };
      }
      try {
        const job = await manager.continueJob(request.params.id, request.body.message);
        startJob(job);
        return await detail(job.id);
      } catch (error) {
        reply.status(400);
        return { error: 'JOB_CONTINUE_FAILED', message: error instanceof Error ? error.message : String(error) };
      }
    },

    async completeJob(request, reply) {
      try {
        const job = await manager.markComplete(request.params.id);
        return { job, events: await manager.readEvents(job.id) };
      } catch (error) {
        reply.status(400);
        return { error: 'JOB_COMPLETE_FAILED', message: error instanceof Error ? error.message : String(error) };
      }
    },

    async tools() {
      return {
        allowlists: FOUNDRY_ACQUISITION_TOOL_ALLOWLISTS,
        registeredTools: deps.toolRegistry.listNames(),
      };
    },
  };
}
