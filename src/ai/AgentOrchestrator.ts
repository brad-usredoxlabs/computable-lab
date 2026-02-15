/**
 * Core agent orchestrator — runs a multi-turn tool-calling loop
 * against an LLM inference endpoint, returning validated event
 * graph fragments for preview.
 */

import type { InferenceConfig, AgentConfig } from '../config/types.js';
import type {
  InferenceClient,
  ToolBridge,
  AgentOrchestrator,
  AgentRequest,
  AgentResult,
  ChatMessage,
} from './types.js';
import { buildSystemPrompt } from './systemPrompt.js';

/**
 * Parse the agent's final text response into an AgentResult.
 *
 * Extracts JSON from markdown code fences (```json...```) or raw JSON.
 * If no valid JSON is found, treats the content as a clarification request.
 */
function parseAgentFinalResponse(
  content: string | null,
  usage: { promptTokens: number; completionTokens: number },
  turns: number,
  toolCalls: number,
): AgentResult {
  const usageResult = {
    ...usage,
    totalTokens: usage.promptTokens + usage.completionTokens,
    turns,
    toolCalls,
  };

  if (!content) {
    return { success: false, error: 'Empty response from agent', usage: usageResult };
  }

  // Try to extract JSON from markdown code fences first, then raw JSON
  const jsonMatch =
    content.match(/```json\s*([\s\S]*?)\s*```/) ||
    content.match(/```\s*([\s\S]*?)\s*```/) ||
    content.match(/(\{[\s\S]*\})/);

  if (!jsonMatch || !jsonMatch[1]) {
    // No structured output — treat as clarification request
    return {
      success: false,
      clarificationNeeded: content,
      usage: usageResult,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
    const result: AgentResult = { success: true, usage: usageResult };
    if (Array.isArray(parsed.events)) result.events = parsed.events;
    if (Array.isArray(parsed.notes)) result.notes = parsed.notes;
    if (Array.isArray(parsed.unresolvedRefs)) result.unresolvedRefs = parsed.unresolvedRefs;
    return result;
  } catch {
    return {
      success: false,
      error: 'Failed to parse agent output as JSON',
      clarificationNeeded: content,
      usage: usageResult,
    };
  }
}

/**
 * Create an agent orchestrator.
 */
export function createAgentOrchestrator(
  inferenceClient: InferenceClient,
  toolBridge: ToolBridge,
  inferenceConfig: InferenceConfig,
  agentConfig: AgentConfig,
): AgentOrchestrator {
  const {
    maxTurns = 15,
    maxToolCallsPerTurn = 5,
    systemPromptPath,
  } = agentConfig;

  return {
    async run(request: AgentRequest): Promise<AgentResult> {
      const { prompt, context, onEvent } = request;

      // 1. Build the message array
      const systemPrompt = buildSystemPrompt(context, systemPromptPath);
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ];

      const toolDefs = toolBridge.getToolDefinitions();
      let totalToolCalls = 0;
      const totalUsage = { promptTokens: 0, completionTokens: 0 };

      // 2. Agent loop
      for (let turn = 0; turn < maxTurns; turn++) {
        onEvent?.({ type: 'status', message: `Turn ${turn + 1}...` });

        let response;
        try {
          const completionReq: import('./types.js').CompletionRequest = {
            model: inferenceConfig.model,
            messages,
            temperature: inferenceConfig.temperature ?? 0.1,
            max_tokens: inferenceConfig.maxTokens ?? 4096,
          };
          if (toolDefs.length > 0) {
            completionReq.tools = toolDefs;
            completionReq.tool_choice = 'auto';
          }
          response = await inferenceClient.complete(completionReq);
        } catch (err) {
          return {
            success: false,
            error: `Inference error on turn ${turn + 1}: ${err instanceof Error ? err.message : String(err)}`,
            usage: {
              ...totalUsage,
              totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
              turns: turn + 1,
              toolCalls: totalToolCalls,
            },
          };
        }

        // Accumulate usage
        if (response.usage) {
          totalUsage.promptTokens += response.usage.prompt_tokens;
          totalUsage.completionTokens += response.usage.completion_tokens;
        }

        const choice = response.choices[0];
        if (!choice) {
          return { success: false, error: 'No response from inference' };
        }

        const assistantMsg = choice.message;
        messages.push(assistantMsg);

        // 3. If no tool calls, the agent is done
        if (choice.finish_reason === 'stop' || !assistantMsg.tool_calls?.length) {
          return parseAgentFinalResponse(
            assistantMsg.content,
            totalUsage,
            turn + 1,
            totalToolCalls,
          );
        }

        // 4. Execute tool calls (capped per turn)
        const toolCalls = assistantMsg.tool_calls.slice(0, maxToolCallsPerTurn);
        for (const tc of toolCalls) {
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
          } catch {
            args = {};
          }

          onEvent?.({ type: 'tool_call', tool: tc.function.name, args });

          const result = await toolBridge.executeTool(tc.function.name, args);
          totalToolCalls++;

          onEvent?.({
            type: 'tool_result',
            tool: tc.function.name,
            success: result.success,
            durationMs: result.durationMs,
          });

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result.content,
          });
        }

        // 5. If finish_reason is 'length', warn and continue
        if (choice.finish_reason === 'length') {
          onEvent?.({ type: 'status', message: 'Response truncated, continuing...' });
        }
      }

      // Max turns exceeded
      return {
        success: false,
        error: `Agent did not converge after ${maxTurns} turns`,
        usage: {
          ...totalUsage,
          totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
          turns: maxTurns,
          toolCalls: totalToolCalls,
        },
      };
    },
  };
}
