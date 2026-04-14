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
  AgentClarificationOption,
  AgentLabwareAddition,
  ChatMessage,
  ConversationHistoryMessage,
  ResolveMentionDeps,
  AgentSummary,
  TurnStats,
} from './types.js';
import { buildSystemPrompt, buildSurfaceAwarePrompt } from './systemPrompt.js';
import { resolveMentionsForPrompt, buildResolvedContextMessage } from './resolveMentions.js';
import { parseIntent } from './compiler/parseIntent.js';
import { compileToEvents } from './compiler/compileToEvents.js';

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
    const result: AgentResult = {
      success: true,
      usage: usageResult,
      events: Array.isArray(parsed.events) ? parsed.events : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      unresolvedRefs: Array.isArray(parsed.unresolvedRefs) ? parsed.unresolvedRefs : [],
    };

    // Structured clarification (from the proactive-resolution prompt)
    if (parsed.clarification && typeof parsed.clarification === 'object' && parsed.clarification !== null) {
      const c = parsed.clarification as Record<string, unknown>;
      const optionsRaw = Array.isArray(c.options) ? c.options : [];
      const options = optionsRaw
        .map((o): AgentClarificationOption | null => {
          if (!o || typeof o !== 'object') return null;
          const oo = o as Record<string, unknown>;
          if (typeof oo.id !== 'string' || typeof oo.label !== 'string') return null;
          const out: AgentClarificationOption = { id: oo.id, label: oo.label };
          if (typeof oo.snippet === 'string') out.snippet = oo.snippet;
          return out;
        })
        .filter((o): o is AgentClarificationOption => o !== null);
      if (typeof c.prompt === 'string' && typeof c.entityType === 'string' && options.length > 0) {
        result.clarification = { prompt: c.prompt, entityType: c.entityType, options };
      }
    }

    // Labware additions (from the labware-additions prompt)
    if (Array.isArray(parsed.labwareAdditions)) {
      const additions: AgentLabwareAddition[] = [];
      for (const raw of parsed.labwareAdditions) {
        if (!raw || typeof raw !== 'object') continue;
        const r = raw as Record<string, unknown>;
        if (typeof r.recordId !== 'string' || r.recordId.length === 0) continue;
        const entry: AgentLabwareAddition = { recordId: r.recordId };
        if (typeof r.reason === 'string') entry.reason = r.reason;
        additions.push(entry);
      }
      if (additions.length > 0) {
        result.labwareAdditions = additions;
      }
    }

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

function normalizeHistoryMessage(message: ConversationHistoryMessage): ChatMessage | null {
  const content = typeof message.content === 'string' ? message.content.trim() : '';
  if ((message.role !== 'user' && message.role !== 'assistant') || content.length === 0) {
    return null;
  }
  return {
    role: message.role,
    content,
  };
}

function summarizeConversationHistory(history: ChatMessage[]): string | null {
  if (history.length === 0) return null;
  const lines = history
    .slice(-6)
    .map((message, index) => {
      const speaker = message.role === 'user' ? 'User' : 'Assistant';
      const content = (message.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
      return `${index + 1}. ${speaker}: ${content}`;
    })
    .filter((line) => !line.endsWith(':'));
  if (lines.length === 0) return null;
  return [
    'Recent conversation context:',
    ...lines,
    'Treat the latest user message as a continuation of this exchange when resolving references like "yes", "that one", or omitted wells/materials.',
  ].join('\n');
}

/**
 * Create an agent orchestrator.
 */
export function createAgentOrchestrator(
  inferenceClient: InferenceClient,
  toolBridge: ToolBridge,
  inferenceConfig: InferenceConfig,
  agentConfig: AgentConfig,
  deps: ResolveMentionDeps = {},
): AgentOrchestrator {
  const {
    maxTurns = 15,
    maxToolCallsPerTurn = 5,
    systemPromptPath,
  } = agentConfig;

  const traceId = () => Math.random().toString(36).slice(2, 8);

  // Helper to emit the structured summary log line
  function logAgentSummary(_tid: string, summary: AgentSummary): void {
    console.log(`[agent-summary] ${JSON.stringify(summary)}`);
  }

  return {
    async run(request: AgentRequest): Promise<AgentResult> {
      const { prompt, context, history, surface, toolFilter, onEvent } = request;
      const tid = traceId();
      const t0 = Date.now();
      const surfaceName = surface ?? 'default';
      const model = inferenceConfig.model;
      console.log(`[agent ${tid}] start surface=${surfaceName} model=${model} promptLen=${prompt.length} historyLen=${Array.isArray(history) ? history.length : 0}`);

      // Instrumentation tracking
      const turnStats: TurnStats[] = [];
      let totalToolCalls = 0;
      let resolvedMentionsCount = 0;

      // 1. Build the message array
      const systemPrompt = surface
        ? buildSurfaceAwarePrompt(surface, context)
        : buildSystemPrompt(context, systemPromptPath);
      const historyMessages = Array.isArray(history)
        ? history.map(normalizeHistoryMessage).filter((message): message is ChatMessage => message !== null)
        : [];
      const historySummary = summarizeConversationHistory(historyMessages);
      
      // Resolve mentions and build resolved context message
      const resolvedMentions = await resolveMentionsForPrompt(prompt, deps);
      resolvedMentionsCount = resolvedMentions.length;
      const resolvedContextMessage = buildResolvedContextMessage(resolvedMentions);
      
      // Compiler bypass: try to compile intent directly without LLM
      const intent = parseIntent(prompt, resolvedMentions);
      const compileDeps: { searchLabwareByHint?: (hint: string) => Promise<Array<{ recordId: string; title: string }>> } = {};
      if (deps.searchLabwareByHint) {
        compileDeps.searchLabwareByHint = deps.searchLabwareByHint;
      }
      const compileResult = await compileToEvents(intent, resolvedMentions, compileDeps);
      if (compileResult.bypass) {
        // Emit summary with bypass flag
        const elapsed = Date.now() - t0;
        const summary: AgentSummary = {
          traceId: tid,
          surface: surfaceName,
          model,
          success: true,
          elapsedMs: elapsed,
          turns: [],
          totals: {
            turns: 0,
            toolCalls: 0,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
          resolvedMentions: resolvedMentionsCount,
          bypass: 'compiler',
        };
        logAgentSummary(tid, summary);
        console.log(`[agent ${tid}] compiler bypass: success, events=${compileResult.events.length}`);
        const result: AgentResult = {
          success: true,
          events: compileResult.events,
          notes: compileResult.notes,
          unresolvedRefs: [],
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            turns: 0,
            toolCalls: 0,
          },
        };
        if (compileResult.labwareAdditions && compileResult.labwareAdditions.length > 0) {
          result.labwareAdditions = compileResult.labwareAdditions.map((a) => ({
            recordId: a.recordId,
            ...(a.reason ? { reason: a.reason } : {}),
          }));
        }
        return result;
      } else {
        // Compiler skipped - log debug info and continue to LLM path
        console.log(`[agent ${tid}] compiler skipped: ${compileResult.reason}`);
      }
      
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...(resolvedContextMessage ? [{ role: 'system' as const, content: resolvedContextMessage }] : []),
        ...(historySummary ? [{ role: 'system' as const, content: historySummary }] : []),
        ...historyMessages,
        { role: 'user', content: prompt },
      ];

      const allToolDefs = toolBridge.getToolDefinitions();
      const toolDefs = toolFilter
        ? allToolDefs.filter((d) => toolFilter.includes(d.function.name))
        : allToolDefs;
      const totalUsage = { promptTokens: 0, completionTokens: 0 };
      console.log(`[agent ${tid}] tools=${toolDefs.length}${toolFilter ? ` (filtered from ${allToolDefs.length})` : ''}`);

      // 2. Agent loop
      for (let turn = 0; turn < maxTurns; turn++) {
        const turnStart = Date.now();
        const turnToolStats: Array<{ name: string; durationMs: number; success: boolean }> = [];
        onEvent?.({ type: 'status', message: `Turn ${turn + 1}...` });

        let response: import('./types.js').CompletionResponse;
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

          // Accumulators for the streaming response
          let accumulatedContent = '';
          const toolCallAcc = new Map<number, {
            id?: string;
            type?: 'function';
            name?: string;
            args?: string;
          }>();
          let finishReason: 'stop' | 'tool_calls' | 'length' | null = null;
          let lastId = '';

          for await (const chunk of inferenceClient.completeStream(completionReq)) {
            if (chunk.id) lastId = chunk.id;
            const choice = chunk.choices?.[0];
            if (!choice) continue;

            // --- Text content delta ---
            const deltaContent = choice.delta?.content;
            if (typeof deltaContent === 'string' && deltaContent.length > 0) {
              accumulatedContent += deltaContent;
              onEvent?.({ type: 'text_delta', delta: deltaContent });
            }

            // --- Tool-call deltas (structure not in ChatMessage type; needs local cast) ---
            type PartialToolCallDelta = {
              index?: number;
              id?: string;
              type?: 'function';
              function?: { name?: string; arguments?: string };
            };
            const deltaWithToolCalls = choice.delta as Partial<import('./types.js').ChatMessage> & {
              tool_calls?: PartialToolCallDelta[];
            };
            const deltaToolCalls = deltaWithToolCalls.tool_calls;
            if (Array.isArray(deltaToolCalls)) {
              for (const tcDelta of deltaToolCalls) {
                const idx = tcDelta.index ?? 0;
                const entry = toolCallAcc.get(idx) ?? {};
                if (tcDelta.id) entry.id = tcDelta.id;
                if (tcDelta.type) entry.type = tcDelta.type;
                if (tcDelta.function?.name) {
                  entry.name = (entry.name ?? '') + tcDelta.function.name;
                }
                if (typeof tcDelta.function?.arguments === 'string') {
                  entry.args = (entry.args ?? '') + tcDelta.function.arguments;
                }
                toolCallAcc.set(idx, entry);
              }
            }

            if (choice.finish_reason) {
              finishReason = choice.finish_reason;
            }
          }

          // Reassemble the final assistant message
          const finalToolCalls = Array.from(toolCallAcc.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, entry]) => ({
              id: entry.id ?? '',
              type: 'function' as const,
              function: {
                name: entry.name ?? '',
                arguments: entry.args ?? '',
              },
            }));

          const assistantMsg: import('./types.js').ChatMessage = {
            role: 'assistant',
            content: accumulatedContent.length > 0 ? accumulatedContent : null,
          };
          if (finalToolCalls.length > 0) {
            assistantMsg.tool_calls = finalToolCalls;
          }

          response = {
            id: lastId,
            choices: [{
              index: 0,
              message: assistantMsg,
              finish_reason: finishReason ?? 'stop',
            }],
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[agent ${tid}] turn ${turn + 1} inference error: ${msg}`);
          const elapsed = Date.now() - t0;
          const summary: AgentSummary = {
            traceId: tid,
            surface: surfaceName,
            model,
            success: false,
            elapsedMs: elapsed,
            turns: turnStats,
            totals: {
              turns: turn + 1,
              toolCalls: totalToolCalls,
              promptTokens: totalUsage.promptTokens,
              completionTokens: totalUsage.completionTokens,
              totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
            },
            resolvedMentions: resolvedMentionsCount,
            bypass: null,
          };
          summary.error = `Inference error on turn ${turn + 1}: ${msg}`;
          logAgentSummary(tid, summary);
          return {
            success: false,
            error: `Inference error on turn ${turn + 1}: ${msg}`,
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
          const elapsed = Date.now() - t0;
          const summary: AgentSummary = {
            traceId: tid,
            surface: surfaceName,
            model,
            success: false,
            elapsedMs: elapsed,
            turns: turnStats,
            totals: {
              turns: turn + 1,
              toolCalls: totalToolCalls,
              promptTokens: totalUsage.promptTokens,
              completionTokens: totalUsage.completionTokens,
              totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
            },
            resolvedMentions: resolvedMentionsCount,
            bypass: null,
          };
          summary.error = 'No response from inference';
          logAgentSummary(tid, summary);
          return { success: false, error: 'No response from inference' };
        }

        const assistantMsg = choice.message;
        messages.push(assistantMsg);

        const contentLen = typeof assistantMsg.content === 'string' ? assistantMsg.content.length : 0;
        const tcCount = assistantMsg.tool_calls?.length ?? 0;
        const tcNames = assistantMsg.tool_calls?.map(t => t.function.name).join(',') ?? '';
        console.log(`[agent ${tid}] turn ${turn + 1} finish=${choice.finish_reason} contentLen=${contentLen} toolCalls=${tcCount}${tcNames ? ` [${tcNames}]` : ''}`);

        // 3. If no tool calls, the agent is done
        if (choice.finish_reason === 'stop' || !assistantMsg.tool_calls?.length) {
          const result = parseAgentFinalResponse(
            assistantMsg.content,
            totalUsage,
            turn + 1,
            totalToolCalls,
          );
          const elapsed = Date.now() - t0;
          
          // Record final turn stats
          const turnDuration = Date.now() - turnStart;
          turnStats.push({
            turn: turn + 1,
            durationMs: turnDuration,
            finishReason: choice.finish_reason,
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
            tools: turnToolStats,
          });
          
          // Emit summary
          const summary: AgentSummary = {
            traceId: tid,
            surface: surfaceName,
            model,
            success: result.success,
            elapsedMs: elapsed,
            turns: turnStats,
            totals: {
              turns: turn + 1,
              toolCalls: totalToolCalls,
              promptTokens: totalUsage.promptTokens,
              completionTokens: totalUsage.completionTokens,
              totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
            },
            resolvedMentions: resolvedMentionsCount,
            bypass: null,
          };
          if (result.error) summary.error = result.error;
          logAgentSummary(tid, summary);
          
          if (!result.success) {
            const preview = typeof assistantMsg.content === 'string'
              ? assistantMsg.content.replace(/\s+/g, ' ').slice(0, 400)
              : '<empty>';
            console.warn(`[agent ${tid}] done success=false elapsedMs=${elapsed} turns=${turn + 1} toolCalls=${totalToolCalls} error=${result.error ?? '(none)'} clarification=${result.clarificationNeeded ? 'yes' : 'no'} contentPreview="${preview}"`);
          } else {
            console.log(`[agent ${tid}] done success=true elapsedMs=${elapsed} turns=${turn + 1} toolCalls=${totalToolCalls} events=${result.events?.length ?? 0}`);
          }
          return result;
        }

        // 4. Execute tool calls (capped per turn) in parallel
        const toolCalls = assistantMsg.tool_calls.slice(0, maxToolCallsPerTurn);

        // Fire all onEvent('tool_call') synchronously in original order so the
        // client UI sees them immediately, not after completions.
        const preparedCalls = toolCalls.map((tc) => {
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
          } catch {
            args = {};
          }
          onEvent?.({ type: 'tool_call', toolName: tc.function.name, args });
          return { tc, args };
        });

        const results = await Promise.all(
          preparedCalls.map(({ tc, args }) => toolBridge.executeTool(tc.function.name, args)),
        );

        // Emit tool_result events and append tool messages in original order.
        for (let i = 0; i < preparedCalls.length; i++) {
          const { tc } = preparedCalls[i]!;
          const result = results[i]!;
          totalToolCalls++;
          turnToolStats.push({ name: tc.function.name, durationMs: result.durationMs, success: result.success });
          console.log(`[agent ${tid}] turn ${turn + 1} tool ${tc.function.name} success=${result.success} durationMs=${result.durationMs}${result.success ? '' : ` error=${(result.content ?? '').slice(0, 200)}`}`);
          onEvent?.({
            type: 'tool_result',
            toolName: tc.function.name,
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

        // Record turn stats
        const turnEnd = Date.now();
        const turnDuration = turnEnd - turnStart;
        turnStats.push({
          turn: turn + 1,
          durationMs: turnDuration,
          finishReason: choice.finish_reason,
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          tools: turnToolStats,
        });
      }

      // Max turns exceeded
      const elapsed = Date.now() - t0;
      console.warn(`[agent ${tid}] done success=false reason=max_turns turns=${maxTurns} toolCalls=${totalToolCalls} elapsedMs=${elapsed}`);
      
      // Emit summary
      const summary: AgentSummary = {
        traceId: tid,
        surface: surfaceName,
        model,
        success: false,
        elapsedMs: elapsed,
        turns: turnStats,
        totals: {
          turns: maxTurns,
          toolCalls: totalToolCalls,
          promptTokens: totalUsage.promptTokens,
          completionTokens: totalUsage.completionTokens,
          totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
        },
        resolvedMentions: resolvedMentionsCount,
        bypass: null,
      };
      summary.error = `Agent did not converge after ${maxTurns} turns`;
      logAgentSummary(tid, summary);
      
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
