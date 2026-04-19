/**
 * REST handlers for AI-assisted ingestion analyze endpoint.
 *
 * This endpoint analyzes uploaded files and produces a draft extraction spec
 * with clarifying questions if needed.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { InferenceClient } from '../../ai/types.js';
import type { RecordStore } from '../../store/types.js';
import { extractPdfLayoutText } from '../../ingestion/pdf/TableExtractionService.js';

// Maximum characters to send to AI (for 7B models, ~6000 chars is safe)
const MAX_AI_CONTEXT_CHARS = 6000;

/**
 * Analyze ingestion request body (multipart form data).
 */
export interface AnalyzeIngestionRequest {
  file?: unknown;
  prompt?: unknown;
  profileId?: unknown;
}

/**
 * Analysis result from AI.
 */
export interface FileAnalysis {
  fileType: string;
  contentSummary: string;
  detectedStructure: string;
  tableCount?: number;
  rowEstimate?: number;
}

/**
 * Draft extraction spec from AI.
 */
export interface DraftExtractionSpec {
  targets: Array<{
    targetSchema: string;
    recordKind: string;
    idPrefix: string;
    fieldMappings: Array<{
      targetField: string;
      source: string;
      transform?: string;
    }>;
    defaults?: Record<string, unknown>;
  }>;
  tableExtraction?: {
    method: string;
    columns?: string[];
    headerRow?: number;
  };
  matching?: {
    ontologyPreferences?: string[];
    batchSize?: number;
  };
}

/**
 * Response from analyze-ingestion endpoint.
 */
export interface AnalyzeIngestionResponse {
  success: boolean;
  analysis?: FileAnalysis;
  draftSpec?: DraftExtractionSpec;
  questions?: string[];
  confidence?: number;
  error?: string;
}

/**
 * Handlers interface.
 */
export interface AiIngestionHandlers {
  analyzeIngestion(
    request: FastifyRequest<{ Body: AnalyzeIngestionRequest }>,
    reply: FastifyReply,
  ): Promise<AnalyzeIngestionResponse>;
}

/**
 * Extract text content from a file buffer based on its MIME type.
 */
async function extractFileContent(buffer: Buffer, fileName: string, mimeType: string): Promise<{ content: string; fileType: string }> {
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();

  // PDF: Use TableExtractionService
  if (lowerName.endsWith('.pdf') || lowerMime === 'application/pdf') {
    try {
      const result = await extractPdfLayoutText(buffer, fileName);
      // Combine all pages, truncate to max context
      const fullText = result.pages.map(p => p.text).join('\n\n');
      return {
        content: truncateToContext(fullText, MAX_AI_CONTEXT_CHARS),
        fileType: 'pdf',
      };
    } catch (err) {
      // If pdftotext fails, fall back to raw text
      const text = buffer.toString('utf8', 0, MAX_AI_CONTEXT_CHARS);
      return { content: text, fileType: 'pdf' };
    }
  }

  // CSV: Read as text
  if (lowerName.endsWith('.csv') || lowerMime === 'text/csv' || lowerMime === 'text/tab-separated-values') {
    const text = buffer.toString('utf8');
    // For CSV, include first 100 rows
    const lines = text.split('\n').slice(0, 101);
    return {
      content: truncateToContext(lines.join('\n'), MAX_AI_CONTEXT_CHARS),
      fileType: 'csv',
    };
  }

  // Excel: Read as text (will be raw binary, but we'll try to get some info)
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || 
      lowerMime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      lowerMime === 'application/vnd.ms-excel') {
    // For Excel files, we can't easily extract text without a library
    // Return a placeholder indicating it's a spreadsheet
    return {
      content: `[Excel file: ${fileName} - Binary format requires spreadsheet parser]`,
      fileType: 'xlsx',
    };
  }

  // HTML: Read as UTF-8 text
  if (lowerName.endsWith('.html') || lowerName.endsWith('.htm') || 
      lowerMime === 'text/html' || lowerMime.startsWith('text/html')) {
    const text = buffer.toString('utf8');
    // Strip HTML tags for cleaner text
    const plainText = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      content: truncateToContext(plainText, MAX_AI_CONTEXT_CHARS),
      fileType: 'html',
    };
  }

  // Plain text or other: Read as UTF-8
  const text = buffer.toString('utf8');
  return {
    content: truncateToContext(text, MAX_AI_CONTEXT_CHARS),
    fileType: lowerName.endsWith('.txt') ? 'txt' : 'other',
  };
}

/**
 * Truncate text to fit within context window.
 */
function truncateToContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  // Truncate and add indicator
  return text.slice(0, maxChars - 100) + '\n\n[... content truncated ...]';
}

/**
 * Build the system prompt for AI analysis.
 */
function buildAnalysisPrompt(fileType: string, contentLength: number, truncatedContent: string, userPrompt: string): string {
  return `You are analyzing an uploaded file for a laboratory information system.

The user wants to: ${userPrompt}

Here is the content extracted from the file (${fileType}, ${contentLength} characters):
---
${truncatedContent}
---

Analyze this file and respond with a JSON object containing:

{
  "analysis": {
    "fileType": "pdf|xlsx|csv|html|txt|other",
    "contentSummary": "Brief description of what the file contains",
    "detectedStructure": "tabular|prose_steps|mixed|unstructured",
    "tableCount": number or null,
    "rowEstimate": number or null
  },
  "draftSpec": {
    "targets": [
      {
        "targetSchema": "schema ID like lab/material or workflow/protocol",
        "recordKind": "material|protocol|labware|etc",
        "idPrefix": "MAT-|PRT-|etc",
        "fieldMappings": [
          { "targetField": "name", "source": "column name or extraction rule" }
        ],
        "defaults": { ... }
      }
    ],
    "tableExtraction": {
      "method": "pdf_table|csv|xlsx_sheet|html_table|ai_extract",
      "columns": ["detected column names"],
      "headerRow": 0
    },
    "matching": {
      "ontologyPreferences": ["chebi", "ncit"],
      "batchSize": 12
    }
  },
  "questions": [
    "Any clarifying questions for the user, or empty array if intent is clear"
  ],
  "confidence": 0.0 to 1.0
}

Respond with ONLY the JSON object, no markdown fencing.`;
}

/**
 * Strip Qwen-style <think>...</think> reasoning blocks.
 */
function stripThinkTags(input: string): string {
  return input.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '').trim();
}

/**
 * Extract the first balanced JSON object from a string, ignoring braces
 * inside string literals. Returns null if no balanced {...} is found.
 */
function extractFirstJsonObject(input: string): string | null {
  const start = input.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = false; }
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') { depth++; continue; }
    if (ch === '}') {
      depth--;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parse AI response defensively. Handles <think> reasoning tags, markdown
 * fencing, and preamble/trailing text by extracting the first balanced JSON
 * object from the response.
 */
function parseAIResponse(content: string): { analysis: FileAnalysis; draftSpec: DraftExtractionSpec; questions: string[]; confidence: number } | null {
  let cleaned = stripThinkTags(content).trim();

  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch?.[1]) {
    cleaned = fenceMatch[1].trim();
  }

  const candidates: string[] = [];
  candidates.push(cleaned);
  const extracted = extractFirstJsonObject(cleaned);
  if (extracted && extracted !== cleaned) candidates.push(extracted);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (!parsed.analysis || typeof parsed.analysis !== 'object') continue;

      const analysis = parsed.analysis as FileAnalysis;
      const draftSpec = parsed.draftSpec as DraftExtractionSpec | undefined;
      const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;

      return {
        analysis,
        draftSpec: draftSpec || { targets: [] },
        questions,
        confidence,
      };
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Create AI ingestion handlers.
 */
export function createAiIngestionHandlers(
  inferenceClient: InferenceClient | undefined,
  model: string | undefined,
  _store: RecordStore,
): AiIngestionHandlers {
  return {
    async analyzeIngestion(request, reply) {
      // Iterate multipart parts — @fastify/multipart does not auto-attach
      // field values to request.body, so we must pull both the file and the
      // prompt field from the stream directly.
      let fileBuffer: Buffer | undefined;
      let fileName = '';
      let mimeType = '';
      let prompt: string | undefined;

      try {
        for await (const part of request.parts()) {
          if (part.type === 'file' && part.fieldname === 'file') {
            fileBuffer = await part.toBuffer();
            fileName = part.filename;
            mimeType = part.mimetype;
          } else if (part.type === 'field' && part.fieldname === 'prompt') {
            prompt = typeof part.value === 'string' ? part.value : String(part.value ?? '');
          }
        }
      } catch (err) {
        request.log.error(err, 'Failed to read multipart upload');
        reply.status(400);
        return {
          success: false,
          error: `Failed to read upload: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      if (!fileBuffer) {
        reply.status(400);
        return {
          success: false,
          error: 'File is required and must be uploaded as multipart form data',
        };
      }

      if (!prompt || prompt.trim().length === 0) {
        reply.status(400);
        return {
          success: false,
          error: 'Prompt is required and must be a non-empty string',
        };
      }

      // Check if AI is configured
      if (!inferenceClient || !model) {
        reply.status(503);
        return {
          success: false,
          error: 'AI is not configured. Add inference configuration to config.yaml.',
        };
      }

      // Extract file content
      let fileContent: string;
      let fileType: string;
      try {
        const extraction = await extractFileContent(fileBuffer, fileName, mimeType);
        fileContent = extraction.content;
        fileType = extraction.fileType;
      } catch (err) {
        request.log.error(err, 'Failed to extract file content');
        reply.status(500);
        return {
          success: false,
          error: `Failed to extract content from file: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      // Build prompt for AI
      const systemPrompt = buildAnalysisPrompt(fileType, fileContent.length, fileContent, prompt);

      // Call AI directly — no tools, we only need a JSON response.
      let result: string;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('AI analysis timed out')), 5 * 60 * 1000);
        });

        const completionPromise = inferenceClient.complete({
          model,
          messages: [
            { role: 'system', content: 'You are a precise JSON generator. Output ONLY a single valid JSON object. No reasoning, no commentary, no markdown fences, no prose. Start your response with `{` and end with `}`.' },
            { role: 'user', content: `${systemPrompt}\n\n/no_think\n\nRespond with ONLY the JSON object. Do not write a "Thinking Process" section. Do not write any text before or after the JSON. Begin your response with \`{\`.` },
          ],
          temperature: 0,
          max_tokens: 8192,
          response_format: { type: 'json_object' },
        });

        const response = await Promise.race([completionPromise, timeoutPromise]);
        const content = response.choices[0]?.message?.content;
        if (typeof content !== 'string' || content.length === 0) {
          throw new Error('AI response contained no content');
        }
        result = content;
      } catch (err) {
        request.log.error(err, 'AI analysis failed');
        reply.status(502);
        return {
          success: false,
          error: `AI analysis failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      // Parse AI response
      const parsed = parseAIResponse(result);
      if (!parsed) {
        request.log.error({ response: result }, 'Failed to parse AI response as JSON');
        reply.status(422);
        return {
          success: false,
          error: `Failed to parse AI response. The AI did not return valid JSON.\n\nFull AI response (${result.length} chars):\n${result}`,
        };
      }

      return {
        success: true,
        analysis: parsed.analysis,
        draftSpec: parsed.draftSpec,
        questions: parsed.questions,
        confidence: parsed.confidence,
      };
    },
  };
}
