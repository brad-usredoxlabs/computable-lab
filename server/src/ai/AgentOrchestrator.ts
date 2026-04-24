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
  PlateEventProposal,
} from './types.js';
import { buildSystemPrompt, buildSurfaceAwarePrompt } from './systemPrompt.js';
import { resolveMentionsForPrompt, buildResolvedContextMessage } from './resolveMentions.js';
import { runChatbotCompile } from './runChatbotCompile.js';
import { getDefaultLabStateCache } from '../compiler/state/LabStateCache.js';
import { decodeAttachmentText } from '../extract/decodeAttachment.js';
import type { PlateEventPrimitive } from '../compiler/biology/BiologyVerbExpander.js';

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
export interface AgentOrchestratorDeps extends ResolveMentionDeps {
  extractionService?: import('../extract/ExtractionRunnerService.js').ExtractionRunnerService;
  llmClient?: import('./runChatbotCompile.js').LlmClient;
}

export function createAgentOrchestrator(
  inferenceClient: InferenceClient,
  toolBridge: ToolBridge,
  inferenceConfig: InferenceConfig,
  agentConfig: AgentConfig,
  deps: AgentOrchestratorDeps = {},
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
      const { prompt, context, history, surface, toolFilter, onEvent, attachments } = request;
      const tid = traceId();
      const t0 = Date.now();
      const surfaceName = surface ?? 'default';
      const model = inferenceConfig.model;
      console.log(`[agent ${tid}] start surface=${surfaceName} model=${model} promptLen=${prompt.length} historyLen=${Array.isArray(history) ? history.length : 0} attachments=${attachments?.length ?? 0}`);

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
      
      // New: route through chatbot-compile pipeline
      const compileResult = await runChatbotCompile({
        prompt,
        ...(attachments ? { attachments } : {}),
        deps: {
          extractionService: deps.extractionService!,
          llmClient: deps.llmClient!,
          searchLabwareByHint: deps.searchLabwareByHint!,
          labStateCache: getDefaultLabStateCache(),
        },
        ...(inferenceConfig.model ? { model: inferenceConfig.model } : {}),
      });
      // Outcome-based forwarding: decide whether to short-circuit the LLM
      // fallback based on compileResult.outcome and terminalArtifacts, not
      // on compileResult.events.length alone.
      const hasArtifacts =
        compileResult.terminalArtifacts.events.length > 0 ||
        compileResult.terminalArtifacts.gaps.length > 0;

      const shouldShortCircuit =
        compileResult.outcome === 'complete' ||
        (compileResult.outcome === 'gap' && hasArtifacts);

      if (shouldShortCircuit) {
        // Pipeline produced concrete events or gaps — return them without
        // invoking the LLM loop.
        const elapsed = Date.now() - t0;

        // Convert PlateEventPrimitive[] to PlateEventProposal[]
        const events: PlateEventProposal[] = compileResult.events.map((prim) => ({
          eventId: prim.eventId,
          event_type: prim.event_type,
          verb: prim.event_type, // Use event_type as verb for primitives
          vocabPackId: 'general',
          details: prim.details,
          ...(prim.labwareId ? { labwareId: prim.labwareId } : {}),
          ...(prim.t_offset ? { t_offset: prim.t_offset } : {}),
          provenance: {
            actor: 'ai-agent',
            timestamp: new Date().toISOString(),
            method: 'pipeline',
            actionGroupId: 'chatbot-compile',
          },
        }));

        // Wire terminalArtifacts.gaps into the response fields the UI consumes.
        const unresolvedRefs = [...(compileResult.unresolvedRefs ?? [])];
        let clarification: string | undefined = compileResult.clarification;
        for (const gap of compileResult.terminalArtifacts.gaps) {
          if (gap.kind === 'unresolved_ref') {
            unresolvedRefs.push({
              label: gap.message,
              reason: (gap.details as Record<string, unknown>)?.reason ?? 'unresolved',
            });
          } else if (gap.kind === 'clarification') {
            clarification = gap.message; // last one wins
          } else {
            // 'other' — wrap into unresolvedRefs with a synthetic kind tag
            unresolvedRefs.push({
              label: gap.message,
              reason: `other: ${gap.message}`,
            });
          }
        }

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
          bypass: 'compiler-pipeline',
        };
        logAgentSummary(tid, summary);
        console.log(`[agent ${tid}] chatbot-compile pipeline bypass: success, events=${events.length}, gaps=${compileResult.terminalArtifacts.gaps.length}`);
        const result: AgentResult = {
          success: true,
          events,
          ...(compileResult.labwareAdditions.length > 0 ? { labwareAdditions: compileResult.labwareAdditions } : {}),
          unresolvedRefs: unresolvedRefs.length > 0 ? unresolvedRefs : undefined,
          ...(clarification ? { clarification: { prompt: clarification, entityType: 'general', options: [] } } : {}),
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            turns: 0,
            toolCalls: 0,
          },
        };
        return result;
      } else {
        // Pipeline produced no events and no gaps (or outcome is 'error') —
        // fall through to LLM fallback loop.
        console.log(`[agent ${tid}] outcome=${compileResult.outcome}, hasArtifacts=${hasArtifacts}; falling through to LLM loop`);
      }

      // Decode attachments into plain text so the fallthrough LLM loop can
      // actually see the document. Without this, the pipeline consumed the
      // attachments inside extract_entities/ai_precompile and then discarded
      // them, leaving the agent to flail with no context when the pipeline
      // returned empty. Generous per-attachment cap keeps the context from
      // blowing up on large manuals; truncation is announced in the message
      // so the model can ask for the rest if it matters.
      const ATTACHMENT_CHAR_CAP = 80_000; // ~20K tokens per file at a typical ratio
      const attachmentMessages: ChatMessage[] = [];
      for (const att of attachments ?? []) {
        try {
          const decoded = await decodeAttachmentText(att.name, att.mime_type, att.content);
          if (decoded.text.length === 0) {
            console.warn(`[agent ${tid}] attachment ${att.name} decoded to empty text; skipping`);
            continue;
          }
          const truncated = decoded.text.length > ATTACHMENT_CHAR_CAP;
          const body = truncated
            ? `${decoded.text.slice(0, ATTACHMENT_CHAR_CAP)}\n\n[...truncated: ${decoded.text.length - ATTACHMENT_CHAR_CAP} more characters not shown]`
            : decoded.text;
          attachmentMessages.push({
            role: 'system',
            content: `[Attached file: ${att.name} (${att.mime_type || 'unknown type'})]\n\n${body}`,
          });
        } catch (err) {
          console.warn(`[agent ${tid}] failed to decode attachment ${att.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (attachmentMessages.length > 0) {
        const totalChars = attachmentMessages.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0), 0);
        console.log(`[agent ${tid}] injected ${attachmentMessages.length} attachment(s) into LLM context, totalChars=${totalChars}`);
        onEvent?.({ type: 'status', message: `Reading ${attachmentMessages.length} attachment(s)…` });
      }

      // If the compile pipeline produced no events AND the user attached a
      // document, treat this as a document-discussion turn, not event
      // authoring. Use a lighter system prompt with no tools so the model
      // answers in plain text instead of thrashing against the event-graph
      // system prompt's "return structured JSON or tool-call" directive.
      const isDocDiscussionTurn = attachmentMessages.length > 0;
      const effectiveSystemPrompt = isDocDiscussionTurn
        ? 'You are a helpful laboratory assistant. The user has uploaded one or more documents whose full text appears in earlier system messages. Read them and answer the user\'s question directly, in clear prose. Use markdown for structure when helpful (numbered steps, headings, tables). Be specific and cite values from the document.'
        : systemPrompt;

      // Qwen3 chat template rejects multiple consecutive system messages
      // with "System message must be at the beginning." Fold all system
      // content into a single message before user/assistant turns.
      const systemSections: string[] = [effectiveSystemPrompt];
      for (const m of attachmentMessages) {
        if (typeof m.content === 'string' && m.content.length > 0) systemSections.push(m.content);
      }
      if (resolvedContextMessage) systemSections.push(resolvedContextMessage);
      if (historySummary) systemSections.push(historySummary);

      const messages: ChatMessage[] = [
        { role: 'system', content: systemSections.join('\n\n---\n\n') },
        ...historyMessages,
        { role: 'user', content: prompt },
      ];

      const allToolDefs = toolBridge.getToolDefinitions();
      const toolDefs = isDocDiscussionTurn
        ? []
        : toolFilter
          ? allToolDefs.filter((d) => toolFilter.includes(d.function.name))
          : allToolDefs;
      const effectiveMaxTurns = isDocDiscussionTurn ? 1 : maxTurns;
      const totalUsage = { promptTokens: 0, completionTokens: 0 };
      console.log(`[agent ${tid}] tools=${toolDefs.length}${toolFilter ? ` (filtered from ${allToolDefs.length})` : ''} docDiscussion=${isDocDiscussionTurn} maxTurns=${effectiveMaxTurns}`);

      // 2. Agent loop
      for (let turn = 0; turn < effectiveMaxTurns; turn++) {
        const turnStart = Date.now();
        const turnToolStats: Array<{ name: string; durationMs: number; success: boolean }> = [];
        const promptSize = messages.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0), 0);
        console.log(`[agent ${tid}] turn ${turn + 1} starting, promptChars=${promptSize}, docDiscussion=${isDocDiscussionTurn}`);
        onEvent?.({ type: 'status', message: isDocDiscussionTurn ? `Generating summary… (${Math.round(promptSize / 1024)} KB context)` : `Turn ${turn + 1}...` });

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
          // On a document-discussion turn the answer is plain text by
          // design. Don't route it through parseAgentFinalResponse, which
          // would demote prose to clarificationNeeded=false-success.
          const docDiscussionContent = typeof assistantMsg.content === 'string' ? assistantMsg.content : '';
          const docUsage = {
            ...totalUsage,
            totalTokens: totalUsage.promptTokens + totalUsage.completionTokens,
            turns: turn + 1,
            toolCalls: totalToolCalls,
          };
          const result: AgentResult = isDocDiscussionTurn
            ? docDiscussionContent.trim().length > 0
              ? { success: true, clarificationNeeded: docDiscussionContent, events: [], usage: docUsage }
              : {
                  success: false,
                  error: `Model returned an empty response (finish_reason=${choice.finish_reason ?? 'unknown'}). Try shortening the document or asking a more specific question.`,
                  usage: docUsage,
                }
            : parseAgentFinalResponse(
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
