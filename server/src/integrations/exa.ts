import type { AppConfig, ExaConfig, ExaContentMode, ExaSearchType } from '../config/types.js';

const DEFAULT_EXA_BASE_URL = 'https://api.exa.ai';
const DEFAULT_EXA_SEARCH_TYPE: ExaSearchType = 'auto';
const DEFAULT_EXA_CONTENT_MODE: ExaContentMode = 'highlights';
const DEFAULT_EXA_MAX_CHARACTERS = 4000;
const DEFAULT_EXA_TIMEOUT_MS = 20_000;

export type ExaCategory =
  | 'company'
  | 'people'
  | 'research paper'
  | 'news'
  | 'tweet'
  | 'personal site'
  | 'financial report';

export interface ResolvedExaConfig {
  apiKey: string;
  baseUrl: string;
  defaultSearchType: ExaSearchType;
  defaultContentMode: ExaContentMode;
  defaultMaxCharacters: number;
  userLocation?: string | undefined;
  timeoutMs: number;
}

export interface ExaSearchRequest {
  query: string;
  searchType?: ExaSearchType | undefined;
  numResults?: number | undefined;
  category?: ExaCategory | undefined;
  includeDomains?: string[] | undefined;
  excludeDomains?: string[] | undefined;
  startPublishedDate?: string | undefined;
  endPublishedDate?: string | undefined;
  maxAgeHours?: number | undefined;
  contentMode?: ExaContentMode | undefined;
  maxCharacters?: number | undefined;
  highlightQuery?: string | undefined;
  summaryQuery?: string | undefined;
}

export interface ExaContentsRequest {
  urls: string[];
  contentMode?: ExaContentMode | undefined;
  maxCharacters?: number | undefined;
  query?: string | undefined;
  maxAgeHours?: number | undefined;
}

function withTimeout(timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

function trimString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeConfig(config?: ExaConfig | null): ResolvedExaConfig | null {
  if (!config || config.enabled === false) return null;
  const apiKey = trimString(config.apiKey);
  if (!apiKey) return null;

  return {
    apiKey,
    baseUrl: trimString(config.baseUrl) ?? DEFAULT_EXA_BASE_URL,
    defaultSearchType: config.defaultSearchType ?? DEFAULT_EXA_SEARCH_TYPE,
    defaultContentMode: config.defaultContentMode ?? DEFAULT_EXA_CONTENT_MODE,
    defaultMaxCharacters: config.defaultMaxCharacters ?? DEFAULT_EXA_MAX_CHARACTERS,
    timeoutMs: config.timeoutMs ?? DEFAULT_EXA_TIMEOUT_MS,
    ...(trimString(config.userLocation) ? { userLocation: trimString(config.userLocation) } : {}),
  };
}

export function resolveExaConfig(appConfig?: AppConfig): ResolvedExaConfig | null {
  return normalizeConfig(appConfig?.integrations?.exa);
}

function createContentRequest(
  contentMode: ExaContentMode,
  maxCharacters: number,
  query?: string,
): Record<string, unknown> {
  if (contentMode === 'text') {
    return { text: { maxCharacters } };
  }
  if (contentMode === 'summary') {
    return {
      summary: {
        ...(query ? { query } : {}),
      },
    };
  }
  return {
    highlights: {
      maxCharacters,
      ...(query ? { query } : {}),
    },
  };
}

async function parseErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return `HTTP ${response.status}: ${parsed.error.trim()}`;
    }
  } catch {
    // noop
  }
  return `HTTP ${response.status}: ${text}`;
}

export async function exaSearch(
  config: ResolvedExaConfig,
  request: ExaSearchRequest,
  fetchFn: typeof fetch = fetch,
): Promise<unknown> {
  const { signal, cleanup } = withTimeout(config.timeoutMs);
  try {
    const contentMode = request.contentMode ?? config.defaultContentMode;
    const maxCharacters = request.maxCharacters ?? config.defaultMaxCharacters;
    const body: Record<string, unknown> = {
      query: request.query,
      type: request.searchType ?? config.defaultSearchType,
      ...(typeof request.numResults === 'number' ? { numResults: request.numResults } : {}),
      ...(request.category ? { category: request.category } : {}),
      ...(request.includeDomains?.length ? { includeDomains: request.includeDomains } : {}),
      ...(request.excludeDomains?.length ? { excludeDomains: request.excludeDomains } : {}),
      ...(request.startPublishedDate ? { startPublishedDate: request.startPublishedDate } : {}),
      ...(request.endPublishedDate ? { endPublishedDate: request.endPublishedDate } : {}),
      ...(config.userLocation ? { userLocation: config.userLocation } : {}),
      contents: {
        ...createContentRequest(
          contentMode,
          maxCharacters,
          contentMode === 'summary' ? request.summaryQuery : request.highlightQuery,
        ),
        ...(typeof request.maxAgeHours === 'number' ? { maxAgeHours: request.maxAgeHours } : {}),
      },
    };

    const response = await fetchFn(`${config.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Exa search failed: ${await parseErrorMessage(response)}`);
    }

    return await response.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Exa search timed out');
    }
    throw err;
  } finally {
    cleanup();
  }
}

export async function exaGetContents(
  config: ResolvedExaConfig,
  request: ExaContentsRequest,
  fetchFn: typeof fetch = fetch,
): Promise<unknown> {
  const { signal, cleanup } = withTimeout(config.timeoutMs);
  try {
    const contentMode = request.contentMode ?? config.defaultContentMode;
    const maxCharacters = request.maxCharacters ?? config.defaultMaxCharacters;
    const body: Record<string, unknown> = {
      urls: request.urls,
      ...createContentRequest(contentMode, maxCharacters, request.query),
      ...(typeof request.maxAgeHours === 'number' ? { maxAgeHours: request.maxAgeHours } : {}),
    };

    const response = await fetchFn(`${config.baseUrl}/contents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Exa contents fetch failed: ${await parseErrorMessage(response)}`);
    }

    return await response.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Exa contents fetch timed out');
    }
    throw err;
  } finally {
    cleanup();
  }
}
