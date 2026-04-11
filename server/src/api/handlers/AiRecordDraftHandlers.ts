/**
 * Handlers for AI-assisted record draft endpoint.
 * Route: POST /api/ai/draft-record
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SchemaRegistry } from '../../schema/SchemaRegistry.js';
import type { UISpecLoader } from '../../ui/UISpecLoader.js';
import type { AppConfig } from '../../config/types.js';
import { resolveAiProfile } from '../../config/types.js';

export interface DraftRecordBody { schemaId: string; prompt: string; }
export interface DraftRecordResult { success: boolean; payload?: unknown; notes?: string[]; error?: string; }
export interface AiRecordDraftHandlers { draftRecord(request: FastifyRequest<{ Body: DraftRecordBody }>, reply: FastifyReply): Promise<DraftRecordResult>; }

export function createAiRecordDraftHandlers(schemaRegistry: SchemaRegistry, uiSpecLoader: UISpecLoader, appConfig: AppConfig | undefined): AiRecordDraftHandlers {
  return {
    async draftRecord(request: FastifyRequest<{ Body: DraftRecordBody }>, reply: FastifyReply): Promise<DraftRecordResult> {
      const { schemaId, prompt } = request.body;
      if (!schemaId || typeof schemaId !== 'string' || schemaId.trim().length === 0) {
        reply.status(400);
        return { success: false, error: 'schemaId is required and must be a non-empty string' };
      }
      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        reply.status(400);
        return { success: false, error: 'prompt is required and must be a non-empty string' };
      }
      const aiConfig = appConfig?.ai;
      if (!aiConfig?.inference?.baseUrl) {
        reply.status(503);
        return { success: false, error: 'AI is not configured. Add inference configuration to config.yaml.' };
      }
      const profile = resolveAiProfile(aiConfig);
      const schema = schemaRegistry.getById(schemaId);
      if (!schema) {
        reply.status(404);
        return { success: false, error: `Schema not found: ${schemaId}` };
      }
      const uiSpec = uiSpecLoader.get(schemaId);
      const systemPrompt = `You are a lab records assistant. Create a JSON record payload for the schema described below. Return ONLY valid JSON — no markdown fencing, no explanation.\n\nSchema ID: ${schemaId}\nSchema title: ${schema.schema.title || schemaId}\nRequired fields: ${JSON.stringify(schema.schema.required || [])}\nProperties: ${JSON.stringify(schema.schema.properties, null, 2)}\n\n${uiSpec ? `UI sections and fields:\n${JSON.stringify(uiSpec.form?.sections, null, 2)}\n\n` : ''}User request: ${prompt}`;
      const inferenceConfig = profile.inference;
      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(inferenceConfig.apiKey ? { 'Authorization': `Bearer ${inferenceConfig.apiKey}` } : {}) };
      let response: Response;
      try {
        response = await fetch(`${inferenceConfig.baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model: inferenceConfig.model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }], temperature: inferenceConfig.temperature ?? 0.2, max_tokens: inferenceConfig.maxTokens ?? 4096 }) });
      } catch (err) {
        request.log.error(err, 'Inference endpoint failed');
        reply.status(503);
        return { success: false, error: `Inference endpoint failed: ${err instanceof Error ? err.message : String(err)}` };
      }
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        request.log.error(`Inference endpoint returned ${response.status}: ${errorText}`);
        reply.status(502);
        return { success: false, error: `Inference endpoint error: ${response.status} ${errorText}` };
      }
      const completionData = await response.json() as Record<string, unknown>;
      // OpenAI format: choices[0].message.content (string)
      // Anthropic format: content[0].text (string)
      const choices = completionData.choices as Array<{ message?: { content?: string | null } }> | undefined;
      const anthropicContent = completionData.content as Array<{ type?: string; text?: string }> | undefined;
      let content = choices?.[0]?.message?.content
        ?? anthropicContent?.find(b => b.type === 'text')?.text;
      if (!content || typeof content !== 'string') {
        request.log.error({ completionData: JSON.stringify(completionData).slice(0, 500) }, 'Unexpected inference response structure');
        reply.status(422);
        return { success: false, error: 'Failed to parse AI response' };
      }
      // Strip markdown fencing if the model wrapped its JSON output
      content = content.trim();
      const fenceMatch = content.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
      if (fenceMatch?.[1]) content = fenceMatch[1].trim();
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(content);
      } catch {
        request.log.error({ content: content.slice(0, 500) }, 'AI response is not valid JSON');
        reply.status(422);
        return { success: false, error: 'Failed to parse AI response as JSON' };
      }
      return { success: true, payload: parsedJson, notes: ['AI-drafted record — review before saving'] };
    },
  };
}
