/**
 * OpenAI-compatible extractor implementation.
 * 
 * This module provides an implementation of ExtractorAdapter that communicates
 * with OpenAI-compatible endpoints (including Qwen3.5 via vLLM).
 * 
 * Spec: spec-055-extractor-adapter-interface-and-qwen-impl
 */

import type { ExtractorAdapter, ExtractionRequest, ExtractionResult, ExtractionDiagnostic, ExtractionCandidate } from './ExtractorAdapter.js';
import type { ExtractorProfileConfig } from '../config/types.js';

/**
 * Options for creating an OpenAICompatibleExtractor.
 */
export interface OpenAICompatibleExtractorOptions {
  config: ExtractorProfileConfig;
  fetchImpl?: typeof fetch;    // for tests
  now?: () => Date;
}

/**
 * OpenAI-compatible extractor implementation.
 * 
 * Sends extraction requests to an OpenAI-compatible endpoint and parses
 * the JSON response into ExtractionCandidate objects.
 */
export class OpenAICompatibleExtractor implements ExtractorAdapter {
  private config: ExtractorProfileConfig;
  private fetchImpl: typeof fetch;

  constructor(opts: OpenAICompatibleExtractorOptions) {
    this.config = opts.config;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async extract(req: ExtractionRequest): Promise<ExtractionResult> {
    // Check if extractor is disabled
    if (this.config.enabled === false) {
      return {
        candidates: [],
        diagnostics: [
          {
            severity: 'warning',
            code: 'extractor_disabled',
            message: 'extractor backend disabled in config'
          }
        ]
      };
    }

    // Build the prompt
    const systemMessage = this.buildSystemMessage();
    const userMessage = this.buildUserMessage(req);

    // Build the request body
    const requestBody = {
      model: this.config.model,
      temperature: this.config.temperature,
      max_tokens: this.config.max_tokens,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ],
      response_format: { type: 'json_object' }
    };

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    // Make the HTTP request
    const url = `${this.config.baseUrl}/chat/completions`;
    
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });
    } catch (networkError) {
      // Network error - return error diagnostic
      return {
        candidates: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'extractor_http_error',
            message: `Network error: ${networkError instanceof Error ? networkError.message : String(networkError)}`
          }
        ]
      };
    }

    // Check HTTP status
    if (!response.ok) {
      let errorBody: string;
      try {
        errorBody = await response.text();
      } catch {
        errorBody = '(unable to read error body)';
      }
      
      return {
        candidates: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'extractor_http_error',
            message: `HTTP ${response.status}`,
            details: errorBody
          }
        ]
      };
    }

    // Parse response
    let json: unknown;
    try {
      const text = await response.text();
      json = JSON.parse(text);
    } catch (parseError) {
      return {
        candidates: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'extractor_parse_error',
            message: 'Failed to parse extractor response as JSON',
            details: parseError instanceof Error ? parseError.message : String(parseError)
          }
        ]
      };
    }

    // Extract candidates from response
    return this.processResponse(json);
  }

  private buildSystemMessage(): string {
    return 'You are a biology-protocol extractor. Given unstructured text, produce JSON with a candidates[] array. Each candidate has: target_kind (string), draft (object), confidence (0..1). Optionally ambiguity_spans[]. Respond ONLY with JSON.';
  }

  private buildUserMessage(req: ExtractionRequest): string {
    let userMessage = req.text;
    
    if (req.hint) {
      const hints: string[] = [];
      
      if (req.hint.target_kinds && req.hint.target_kinds.length > 0) {
        hints.push(`target_kinds = ${JSON.stringify(req.hint.target_kinds)}`);
      }
      
      if (req.hint.source_ref) {
        hints.push(`source_ref = ${JSON.stringify(req.hint.source_ref)}`);
      }
      
      if (hints.length > 0) {
        userMessage += `\n\nHint: ${hints.join(', ')}`;
      }
    }
    
    return userMessage;
  }

  private processResponse(json: unknown): ExtractionResult {
    const diagnostics: ExtractionDiagnostic[] = [];
    const candidates: ExtractionCandidate[] = [];

    // Validate response structure
    if (!json || typeof json !== 'object') {
      return {
        candidates: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'extractor_parse_error',
            message: 'Extractor response is not a valid JSON object'
          }
        ]
      };
    }

    const responseObj = json as Record<string, unknown>;
    
    // Check for choices array
    if (!Array.isArray(responseObj.choices)) {
      return {
        candidates: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'extractor_parse_error',
            message: 'Extractor response missing choices array'
          }
        ]
      };
    }

    if (responseObj.choices.length === 0) {
      return {
        candidates: [],
        diagnostics: []
      };
    }

    // Get the first choice's message content
    const firstChoice = responseObj.choices[0];
    if (!firstChoice || typeof firstChoice !== 'object' || !('message' in firstChoice)) {
      return {
        candidates: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'extractor_parse_error',
            message: 'Extractor response missing message in choice'
          }
        ]
      };
    }

    const message = (firstChoice as Record<string, unknown>).message;
    if (!message || typeof message !== 'object' || !('content' in message)) {
      return {
        candidates: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'extractor_parse_error',
            message: 'Extractor response missing content in message'
          }
        ]
      };
    }

    const content = (message as Record<string, unknown>).content;
    if (typeof content !== 'string') {
      return {
        candidates: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'extractor_parse_error',
            message: 'Extractor response content is not a string'
          }
        ]
      };
    }

    // Parse the content as JSON
    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(content);
    } catch (parseError) {
      return {
        candidates: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'extractor_parse_error',
            message: 'Failed to parse extractor content as JSON',
            details: parseError instanceof Error ? parseError.message : String(parseError)
          }
        ]
      };
    }

    // Extract candidates array from parsed content
    if (!parsedContent || typeof parsedContent !== 'object' || !('candidates' in parsedContent)) {
      return {
        candidates: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'extractor_parse_error',
            message: 'Extractor content missing candidates array'
          }
        ]
      };
    }

    const candidatesArray = (parsedContent as Record<string, unknown>).candidates;
    if (!Array.isArray(candidatesArray)) {
      return {
        candidates: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'extractor_parse_error',
            message: 'Extractor candidates is not an array'
          }
        ]
      };
    }

    // Validate each candidate
    for (const item of candidatesArray) {
      const validation = this.validateCandidate(item);
      if (validation.valid) {
        candidates.push(validation.candidate);
      } else {
        diagnostics.push({
          severity: 'warning',
          code: 'candidate_malformed',
          message: validation.error || 'Candidate validation failed'
        });
      }
    }

    return { candidates, diagnostics };
  }

  private validateCandidate(item: unknown): { valid: true; candidate: ExtractionCandidate } | { valid: false; error?: string } {
    if (!item || typeof item !== 'object') {
      return { valid: false, error: 'Candidate is not an object' };
    }

    const candidate = item as Record<string, unknown>;

    // Validate target_kind
    if (typeof candidate.target_kind !== 'string') {
      return { valid: false, error: 'Candidate missing target_kind string' };
    }

    // Validate draft
    if (!candidate.draft || typeof candidate.draft !== 'object') {
      return { valid: false, error: 'Candidate missing draft object' };
    }

    // Validate confidence
    if (typeof candidate.confidence !== 'number') {
      return { valid: false, error: 'Candidate missing confidence number' };
    }

    // Validate confidence range
    if (candidate.confidence < 0 || candidate.confidence > 1) {
      return { valid: false, error: 'Candidate confidence out of range [0, 1]' };
    }

    // Validate ambiguity_spans if present
    if (candidate.ambiguity_spans !== undefined) {
      if (!Array.isArray(candidate.ambiguity_spans)) {
        return { valid: false, error: 'Candidate ambiguity_spans is not an array' };
      }
      
      for (const span of candidate.ambiguity_spans) {
        if (!span || typeof span !== 'object') {
          return { valid: false, error: 'Ambiguity span is not an object' };
        }
        const spanObj = span as Record<string, unknown>;
        if (typeof spanObj.path !== 'string') {
          return { valid: false, error: 'Ambiguity span missing path string' };
        }
        if (typeof spanObj.reason !== 'string') {
          return { valid: false, error: 'Ambiguity span missing reason string' };
        }
      }
    }

    const ambiguitySpans = candidate.ambiguity_spans
      ? (candidate.ambiguity_spans as Array<{ path: string; reason: string }>)
      : undefined;

    return {
      valid: true,
      candidate: {
        target_kind: candidate.target_kind as string,
        draft: candidate.draft as Record<string, unknown>,
        confidence: candidate.confidence as number,
        ...(ambiguitySpans && { ambiguity_spans: ambiguitySpans })
      }
    };
  }
}
