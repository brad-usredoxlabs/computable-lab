import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError } from '../types.js';
import type { AppConfig } from '../../config/types.js';
import { parseConcentration, type Concentration } from '../../materials/concentration.js';
import type { ProtocolIdeDocumentResult } from '../../vendor-documents/protocolIdeVendors.js';
import { isCuratedVendor } from '../../vendor-documents/protocolIdeVendors.js';
import {
  protocolIdeDocumentsToFoundryPdfCandidates,
  shapeDocumentResult,
} from '../../vendor-documents/service.js';
import type { FoundryPdfCollectionCandidate } from '../../foundry/FoundryPdfCollector.js';
import type { ProtocolCandidateSummary, SourcePdfSummary } from '../../ai/types.js';
import { exaSearch, resolveExaConfig } from '../../integrations/exa.js';
import { getCuratedVendorRegistry } from '../../registry/CuratedVendorRegistry.js';
import {
  downloadVendorPdf,
  extractVendorPdfText,
} from '../../vendor-documents/pdfAcquisition.js';
import { extractVendorProtocolCandidateFromInput } from '../../ingestion/vendor-protocol/VendorProtocolCandidateService.js';
import type { RecordStore } from '../../store/types.js';
import { createEnvelope } from '../../types/RecordEnvelope.js';
import type {
  ExtractedCandidateItem,
  ProtocolCandidate,
  ProtocolStepCandidate,
  VendorProtocolProvenance,
} from '../../ingestion/vendor-protocol/types.js';

export type VendorName = 'thermo' | 'sigma' | 'fisher' | 'vwr' | 'cayman' | 'thomas';

export interface VendorSearchResultItem {
  vendor: VendorName;
  name: string;
  catalogNumber: string;
  productUrl?: string;
  description?: string;
  grade?: string;
  formulation?: string;
  declaredConcentration?: Concentration;
  compositionSourceText?: string;
}

export interface VendorSearchResponse {
  items: VendorSearchResultItem[];
  vendors: Array<{
    vendor: VendorName;
    success: boolean;
    error?: string;
  }>;
}

export interface ProtocolIdeDocumentSearchResponse {
  items: ProtocolIdeDocumentResult[];
  foundryCandidates: FoundryPdfCollectionCandidate[];
  vendors: Array<{
    vendor: VendorName;
    success: boolean;
    error?: string;
  }>;
}


export interface GraphLemurPdfSearchItem {
  id: string;
  title: string;
  url: string;
  vendor?: string;
  snippet?: string;
  score?: number;
  publishedDate?: string;
  source: 'exa';
  documentType: 'protocol' | 'application_note' | 'white_paper' | 'manual' | 'other';
  sourcePdf: SourcePdfSummary;
  sourceProtocolCandidate: ProtocolCandidateSummary;
}

export interface GraphLemurPdfSearchResponse {
  items: GraphLemurPdfSearchItem[];
  configured: boolean;
  query: string;
  vendors: Array<{
    vendor: VendorName;
    success: boolean;
    error?: string;
  }>;
}

export interface GraphLemurPdfIngestResponse {
  sourcePdf: SourcePdfSummary;
  sourceProtocolCandidate: ProtocolCandidateSummary;
  extraction: {
    requestedUrl: string;
    resolvedPdfUrl: string;
    resolution: 'direct' | 'landing_page';
    artifactPath: string;
    candidatePath?: string;
    pageCount: number;
    sectionCount: number;
    tableCount: number;
    diagnostics: Array<{
      code: string;
      severity: 'info' | 'warning' | 'error';
      message: string;
    }>;
  };
  /**
   * Recorded artifact id when the request supplied a `studyId` AND a
   * RecordStore is configured. Absent for legacy callers (the chat dock
   * before the workspace migration) — they treat `sourcePdf` as transient
   * draft state. The `extractedTextPageCount` mirrors the persisted
   * `extractedText[].length` for UI display before re-fetching the record.
   */
  recordedArtifact?: {
    recordId: string;
    studyId: string;
    extractedTextPageCount: number;
  };
}

export interface VendorSearchHandlerOptions {
  appConfig?: AppConfig;
  workspaceRoot?: string;
  /**
   * Optional RecordStore. When supplied, GraphLemur PDF ingests with a
   * `studyId` in the request body will additionally persist a kind=artifact
   * record under records/studies/<studyId>/artifacts/, picking up the
   * downloaded PDF as a content-addressed file ref and the layout-extracted
   * per-page text. Without a store, ingest preserves its legacy behavior:
   * download + return metadata, no durable artifact.
   */
  store?: RecordStore;
}

type VendorStatus = VendorSearchResponse['vendors'][number];

const VENDOR_TIMEOUT_MS = 8_000;
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const DECLARED_CONCENTRATION_PATTERN = /(\d+(?:\.\d+)?)\s*(µM|uM|mM|nM|pM|fM|M|mg\s*\/\s*mL|ug\s*\/\s*mL|ng\s*\/\s*mL|g\s*\/\s*L|U\s*\/\s*mL|U\s*\/\s*uL|cells\s*\/\s*mL|cells\s*\/\s*uL|%\s*v\s*\/\s*v|%\s*w\s*\/\s*v)\b/i;

const VALID_VENDOR_IDS: readonly VendorName[] = ['thermo', 'sigma', 'fisher', 'vwr', 'cayman', 'thomas'];

export { VALID_VENDOR_IDS };

export function parseVendorIds(raw: string): VendorName[] {
  return Array.from(new Set(
    raw
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry): entry is VendorName => VALID_VENDOR_IDS.includes(entry as VendorName))
  ));
}

function canonicalConcentrationUnit(unit: string): string {
  const trimmed = unit.replace(/\s+/g, '').replace('µ', 'u');
  switch (trimmed.toLowerCase()) {
    case 'm':
      return 'M';
    case 'mm':
      return 'mM';
    case 'um':
      return 'uM';
    case 'nm':
      return 'nM';
    case 'pm':
      return 'pM';
    case 'fm':
      return 'fM';
    case 'mg/ml':
      return 'mg/mL';
    case 'ug/ml':
      return 'ug/mL';
    case 'ng/ml':
      return 'ng/mL';
    case 'g/l':
      return 'g/L';
    case 'u/ml':
      return 'U/mL';
    case 'u/ul':
      return 'U/uL';
    case 'cells/ml':
      return 'cells/mL';
    case 'cells/ul':
      return 'cells/uL';
    case '%v/v':
      return '% v/v';
    case '%w/v':
      return '% w/v';
    default:
      return unit.trim();
  }
}

export function parseDeclaredConcentrationText(...parts: Array<string | undefined>): { concentration: Concentration; sourceText: string } | null {
  for (const part of parts) {
    const sourceText = String(part || '').trim();
    if (!sourceText) continue;
    const match = sourceText.match(DECLARED_CONCENTRATION_PATTERN);
    if (!match) continue;
    const value = Number(match[1]);
    const unit = canonicalConcentrationUnit(match[2] || '');
    const concentration = parseConcentration({ value, unit });
    if (!concentration) continue;
    return { concentration, sourceText };
  }
  return null;
}

function withDeclaredConcentration(item: VendorSearchResultItem): VendorSearchResultItem {
  const declared = parseDeclaredConcentrationText(item.formulation, item.description, item.name);
  if (!declared) return item;
  return {
    ...item,
    declaredConcentration: declared.concentration,
    compositionSourceText: declared.sourceText,
  };
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&trade;/gi, '™')
    .replace(/&reg;/gi, '®')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = VENDOR_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'user-agent': BROWSER_UA,
        'accept-language': 'en-US,en;q=0.9',
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function searchThermo(query: string, limit: number): Promise<VendorSearchResultItem[]> {
  const params = new URLSearchParams({ query });
  const url = `https://www.thermofisher.com/search/service/typeaheadSuggestions?${params.toString()}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Thermo returned HTTP ${res.status}`);
  const json = (await res.json()) as {
    products?: Array<{
      title?: string;
      suggestion?: string;
      catalogNumber?: string;
      formattedCatalogNumber?: string;
      hijackUrl?: string;
    }>;
  };
  const seen = new Set<string>();
  const items: VendorSearchResultItem[] = [];
  for (const product of json.products ?? []) {
    const catalogNumber = String(product.formattedCatalogNumber || product.catalogNumber || '').trim();
    const name = String(product.title || product.suggestion || '').trim();
    if (!catalogNumber || !name) continue;
    const dedupeKey = `${catalogNumber}::${name}`.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const productUrl = product.hijackUrl && product.hijackUrl.trim()
      ? (product.hijackUrl.startsWith('http') ? product.hijackUrl : `https://www.thermofisher.com${product.hijackUrl}`)
      : `https://www.thermofisher.com/search/results?query=${encodeURIComponent(catalogNumber)}`;
    items.push(withDeclaredConcentration({
      vendor: 'thermo',
      name,
      catalogNumber,
      productUrl,
    }));
    if (items.length >= limit) break;
  }
  return items;
}

async function searchSigma(query: string, limit: number): Promise<VendorSearchResultItem[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://www.sigmaaldrich.com/US/en/search/${encoded}?focus=products&page=1&perpage=${Math.max(1, Math.min(limit, 24))}&sort=relevance&term=${encoded}&type=product`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Sigma returned HTTP ${res.status}`);
  const html = await res.text();
  const items: VendorSearchResultItem[] = [];
  const seen = new Set<string>();

  const anchorPattern = /<a[^>]+href="([^"]*\/US\/en\/product\/[^"#?]+)"[^>]*>(.*?)<\/a>/gis;
  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1] ? String(match[1]) : '';
    const rawLabel = match[2] ? String(match[2]) : '';
    const name = stripHtml(rawLabel);
    if (!href || !name) continue;
    const productUrl = href.startsWith('http') ? href : `https://www.sigmaaldrich.com${href}`;
    const pathParts = href.split('/').filter(Boolean);
    const catalogNumber = (pathParts[pathParts.length - 1] || '').toUpperCase();
    if (!catalogNumber) continue;
    const dedupeKey = `${catalogNumber}::${name}`.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    items.push(withDeclaredConcentration({
      vendor: 'sigma',
      name,
      catalogNumber,
      productUrl,
    }));
    if (items.length >= limit) break;
  }

  return items;
}

async function searchFisher(query: string, limit: number): Promise<VendorSearchResultItem[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://www.fishersciential.com/shop/products?q=${encoded}&page=1&pageSize=${Math.max(1, Math.min(limit, 24))}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Fisher returned HTTP ${res.status}`);
  const html = await res.text();
  const items: VendorSearchResultItem[] = [];
  const seen = new Set<string>();

  const anchorPattern = /<a[^>]+href="([^"]*\/shop\/products\/[^"#?]+)"[^>]*>(.*?)<\/a>/gis;
  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1] ? String(match[1]) : '';
    const rawLabel = match[2] ? String(match[2]) : '';
    const name = stripHtml(rawLabel);
    if (!href || !name) continue;
    const productUrl = href.startsWith('http') ? href : `https://www.fishersciential.com${href}`;
    const pathParts = href.split('/').filter(Boolean);
    const catalogNumber = (pathParts[pathParts.length - 1] || '').toUpperCase();
    if (!catalogNumber) continue;
    const dedupeKey = `${catalogNumber}::${name}`.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    items.push(withDeclaredConcentration({
      vendor: 'fisher',
      name,
      catalogNumber,
      productUrl,
    }));
    if (items.length >= limit) break;
  }

  return items;
}

async function searchVwr(query: string, limit: number): Promise<VendorSearchResultItem[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://www.vwr.com/search?q=${encoded}&page=1&pageSize=${Math.max(1, Math.min(limit, 24))}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`VWR returned HTTP ${res.status}`);
  const html = await res.text();
  const items: VendorSearchResultItem[] = [];
  const seen = new Set<string>();

  const anchorPattern = /<a[^>]+href="([^"]*\/product\/[^"#?]+)"[^>]*>(.*?)<\/a>/gis;
  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1] ? String(match[1]) : '';
    const rawLabel = match[2] ? String(match[2]) : '';
    const name = stripHtml(rawLabel);
    if (!href || !name) continue;
    const productUrl = href.startsWith('http') ? href : `https://www.vwr.com${href}`;
    const pathParts = href.split('/').filter(Boolean);
    const catalogNumber = (pathParts[pathParts.length - 1] || '').toUpperCase();
    if (!catalogNumber) continue;
    const dedupeKey = `${catalogNumber}::${name}`.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    items.push(withDeclaredConcentration({
      vendor: 'vwr',
      name,
      catalogNumber,
      productUrl,
    }));
    if (items.length >= limit) break;
  }

  return items;
}

async function searchCayman(query: string, limit: number): Promise<VendorSearchResultItem[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://caymanchem.com/search?search=${encoded}&page=1&pageSize=${Math.max(1, Math.min(limit, 24))}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Cayman Chemical returned HTTP ${res.status}`);
  const html = await res.text();
  const items: VendorSearchResultItem[] = [];
  const seen = new Set<string>();

  const anchorPattern = /<a[^>]+href="([^"]*\/product\/[^"#?]+)"[^>]*>(.*?)<\/a>/gis;
  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1] ? String(match[1]) : '';
    const rawLabel = match[2] ? String(match[2]) : '';
    const name = stripHtml(rawLabel);
    if (!href || !name) continue;
    const productUrl = href.startsWith('http') ? href : `https://caymanchem.com${href}`;
    const pathParts = href.split('/').filter(Boolean);
    const catalogNumber = (pathParts[pathParts.length - 1] || '').toUpperCase();
    if (!catalogNumber) continue;
    const dedupeKey = `${catalogNumber}::${name}`.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    items.push(withDeclaredConcentration({
      vendor: 'cayman',
      name,
      catalogNumber,
      productUrl,
    }));
    if (items.length >= limit) break;
  }

  return items;
}

async function searchThomas(query: string, limit: number): Promise<VendorSearchResultItem[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://www.thomasscientific.com/search?search=${encoded}&page=1&pageSize=${Math.max(1, Math.min(limit, 24))}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Thomas Scientific returned HTTP ${res.status}`);
  const html = await res.text();
  const items: VendorSearchResultItem[] = [];
  const seen = new Set<string>();

  const anchorPattern = /<a[^>]+href="([^"]*\/product\/[^"#?]+)"[^>]*>(.*?)<\/a>/gis;
  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1] ? String(match[1]) : '';
    const rawLabel = match[2] ? String(match[2]) : '';
    const name = stripHtml(rawLabel);
    if (!href || !name) continue;
    const productUrl = href.startsWith('http') ? href : `https://www.thomasscientific.com${href}`;
    const pathParts = href.split('/').filter(Boolean);
    const catalogNumber = (pathParts[pathParts.length - 1] || '').toUpperCase();
    if (!catalogNumber) continue;
    const dedupeKey = `${catalogNumber}::${name}`.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    items.push(withDeclaredConcentration({
      vendor: 'thomas',
      name,
      catalogNumber,
      productUrl,
    }));
    if (items.length >= limit) break;
  }

  return items;
}

const VENDOR_SEARCH_MAP: Record<VendorName, (query: string, limit: number) => Promise<VendorSearchResultItem[]>> = {
  thermo: searchThermo,
  sigma: searchSigma,
  fisher: searchFisher,
  vwr: searchVwr,
  cayman: searchCayman,
  thomas: searchThomas,
};


const GRAPH_LEMUR_VENDOR_DOMAINS: Record<VendorName, string[]> = {
  thermo: ['thermofisher.com'],
  sigma: ['sigmaaldrich.com'],
  fisher: ['fishersci.com', 'fisherscientific.com'],
  vwr: ['vwr.com'],
  cayman: ['caymanchem.com'],
  thomas: ['thomassci.com', 'thomasscientific.com'],
};

type ExaResultLike = {
  id?: unknown;
  title?: unknown;
  url?: unknown;
  score?: unknown;
  publishedDate?: unknown;
  text?: unknown;
  summary?: unknown;
  highlights?: unknown;
};

function exaResults(response: unknown): ExaResultLike[] {
  if (!response || typeof response !== 'object') return [];
  const results = (response as { results?: unknown }).results;
  return Array.isArray(results) ? results.filter((item): item is ExaResultLike => Boolean(item && typeof item === 'object')) : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function highlightText(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object') {
        return stringValue((entry as { text?: unknown }).text)
          ?? stringValue((entry as { highlight?: unknown }).highlight);
      }
      return undefined;
    })
    .filter((entry): entry is string => Boolean(entry))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim() || undefined;
}

function looksLikePdfUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return /\.pdf$/i.test(parsed.pathname);
  } catch {
    return /\.pdf(?:$|[?#])/i.test(value);
  }
}

function inferVendorFromUrl(url: string): VendorName | undefined {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = url.toLowerCase();
  }
  for (const [vendor, domains] of Object.entries(GRAPH_LEMUR_VENDOR_DOMAINS) as Array<[VendorName, string[]]>) {
    if (domains.some((domain) => host.includes(domain))) return vendor;
  }
  return undefined;
}

function inferGraphLemurDocumentType(title: string, text?: string): GraphLemurPdfSearchItem['documentType'] {
  const combined = `${title} ${text ?? ''}`.toLowerCase();
  if (/application note|app note|application_note/.test(combined)) return 'application_note';
  if (/white paper|whitepaper|white_paper/.test(combined)) return 'white_paper';
  if (/manual|guide|instructions?/.test(combined)) return 'manual';
  if (/protocol|assay|workflow|procedure|extraction/.test(combined)) return 'protocol';
  return 'other';
}

function excerpt(value: string | undefined, max = 900): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  return normalized.slice(0, max);
}

function candidateStepsFromText(text: string | undefined): NonNullable<ProtocolCandidateSummary['steps']> {
  const normalized = text?.replace(/\r/g, '').trim();
  if (!normalized) return [];
  const lines = normalized
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 24 && line.length <= 800);
  const numbered = lines.filter((line) => /^(?:step\s*)?\d+[.)\s:-]/i.test(line)).slice(0, 12);
  const selected = numbered.length > 0 ? numbered : lines.slice(0, 6);
  if (selected.length === 0) return [{ text: excerpt(normalized, 900) ?? normalized.slice(0, 900), confidence: 0.35 }];
  return selected.map((line, index) => ({
    stepNumber: index + 1,
    text: line,
    evidence: [{ snippet: line }],
    confidence: numbered.length > 0 ? 0.55 : 0.35,
    uncertainty: numbered.length > 0 ? 'inferred' : 'ambiguous',
  }));
}

function graphLemurQuery(q: string): string {
  return `${q} vendor protocol PDF application note assay workflow procedure`;
}

const GRAPH_LEMUR_LANDING_PAGE_MAX_BYTES = 2 * 1024 * 1024;

type GraphLemurPdfResolution = {
  requestedUrl: string;
  pdfUrl: string;
  resolution: 'direct' | 'landing_page';
};

type GraphLemurPdfLinkCandidate = {
  url: string;
  label: string;
  score: number;
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function htmlText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hostName(value: string): string | undefined {
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return undefined;
  }
}

async function responseTextLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return (await response.text()).slice(0, maxBytes);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) throw new Error(`landing page exceeded max bytes (${maxBytes})`);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

function scorePdfLink(url: string, label: string, baseUrl: string): number {
  const combined = `${url} ${label}`.toLowerCase();
  let score = 0;
  if (looksLikePdfUrl(url)) score += 100;
  if (/\.pdf(?:$|[?#])|pdf\b/.test(combined)) score += 35;
  if (/protocol|procedure|workflow|assay|extraction|isolation|purification/.test(combined)) score += 30;
  if (/application\s*note|app\s*note|manual|guide|instructions?|ifu|product\s*insert|user\s*guide/.test(combined)) score += 20;
  if (/sds|safety\s*data|certificate|certificat|coa|cofa|terms|privacy|warranty/.test(combined)) score -= 35;
  if (hostName(url) === hostName(baseUrl)) score += 10;
  return score;
}

function extractPdfLinkCandidates(html: string, baseUrl: string): GraphLemurPdfLinkCandidate[] {
  const candidates = new Map<string, GraphLemurPdfLinkCandidate>();
  const addCandidate = (rawHref: string, rawLabel = '') => {
    const href = decodeHtmlEntities(rawHref).trim();
    if (!href || href.startsWith('#') || /^javascript:/i.test(href) || /^mailto:/i.test(href)) return;
    let url: string;
    try {
      const parsed = new URL(href, baseUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      url = parsed.href;
    } catch {
      return;
    }
    const label = htmlText(rawLabel);
    const score = scorePdfLink(url, label, baseUrl);
    if (score < 70) return;
    const key = url.toLowerCase();
    const existing = candidates.get(key);
    if (!existing || score > existing.score) candidates.set(key, { url, label, score });
  };

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1] ?? '';
    const label = match[2] ?? '';
    const href = attrs.match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    if (href) addCandidate(href[1] ?? href[2] ?? href[3] ?? '', label);
  }
  for (const match of html.matchAll(/\bhref\s*=\s*(?:"([^"]+\.pdf(?:[^"]*)?)"|'([^']+\.pdf(?:[^']*)?)'|([^\s>]+\.pdf[^\s>]*))/gi)) {
    addCandidate(match[1] ?? match[2] ?? match[3] ?? '');
  }

  return Array.from(candidates.values()).sort((a, b) => b.score - a.score);
}

async function resolveGraphLemurPdfUrl(url: string): Promise<GraphLemurPdfResolution> {
  if (looksLikePdfUrl(url)) return { requestedUrl: url, pdfUrl: url, resolution: 'direct' };
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
    },
  });
  if (!response.ok) throw new Error(`landing page fetch failed: HTTP ${response.status}`);
  const html = await responseTextLimited(response, GRAPH_LEMUR_LANDING_PAGE_MAX_BYTES);
  const candidates = extractPdfLinkCandidates(html, response.url || url);
  const selected = candidates[0];
  if (!selected) throw new Error('No protocol-like PDF link found on landing page');
  return {
    requestedUrl: url,
    pdfUrl: selected.url,
    resolution: 'landing_page',
  };
}

function includeDomainsForVendors(vendors: VendorName[]): string[] | undefined {
  if (vendors.length === 0) return undefined;
  const registry = getCuratedVendorRegistry();
  const domains = vendors.flatMap((vendor) => {
    const configured = registry.get(vendor);
    if (configured?.landing_url) {
      try {
        return [new URL(configured.landing_url).hostname.replace(/^www\./, '')];
      } catch {
        return GRAPH_LEMUR_VENDOR_DOMAINS[vendor];
      }
    }
    return GRAPH_LEMUR_VENDOR_DOMAINS[vendor];
  });
  return Array.from(new Set(domains));
}

function shapeGraphLemurPdfResult(result: ExaResultLike, index: number): GraphLemurPdfSearchItem | null {
  const url = stringValue(result.url);
  if (!url) return null;
  const title = stringValue(result.title) ?? url;
  const text = stringValue(result.text);
  const summary = stringValue(result.summary);
  const highlights = highlightText(result.highlights);
  const snippet = excerpt(highlights ?? summary ?? text, 700);
  const pdfLike = looksLikePdfUrl(url) || /\bpdf\b/i.test(`${title} ${snippet ?? ''}`);
  const protocolLike = /protocol|application note|app note|assay|workflow|procedure|manual|extraction/i.test(`${title} ${snippet ?? ''}`);
  if (!pdfLike && !protocolLike) return null;
  const vendor = inferVendorFromUrl(url);
  const documentType = inferGraphLemurDocumentType(title, snippet ?? text);
  const sourcePdf: SourcePdfSummary = {
    url,
    title,
    ...(vendor ? { vendor } : {}),
  };
  const sourceProtocolCandidate: ProtocolCandidateSummary = {
    kind: 'vendor-protocol-candidate',
    title,
    ...(snippet ? { scope: snippet } : {}),
    source: {
      documentId: `exa-${index + 1}`,
      ...(vendor ? { vendor } : {}),
      title,
      url,
    },
    materials: [],
    labware: [],
    equipment: [],
    steps: candidateStepsFromText(text ?? snippet),
    diagnostics: [{
      code: text ? 'EXA_TEXT_SNIPPET' : 'EXA_SEARCH_SNIPPET_ONLY',
      severity: 'info',
      message: text
        ? 'Protocol candidate was seeded from Exa text content. Full PDF extraction is still required before promotion.'
        : 'Protocol candidate was seeded from Exa search metadata. Full PDF extraction is still required before promotion.',
      ...(snippet ? { evidence: [{ snippet }] } : {}),
    }],
  };
  return {
    id: stringValue(result.id) ?? `exa-${index + 1}`,
    title,
    url,
    ...(vendor ? { vendor } : {}),
    ...(snippet ? { snippet } : {}),
    ...(numberValue(result.score) !== undefined ? { score: numberValue(result.score)! } : {}),
    ...(stringValue(result.publishedDate) ? { publishedDate: stringValue(result.publishedDate)! } : {}),
    source: 'exa',
    documentType,
    sourcePdf,
    sourceProtocolCandidate,
  };
}


type ProtocolCandidateEvidenceSummary = NonNullable<NonNullable<ProtocolCandidateSummary['steps']>[number]['evidence']>;

function evidenceFromProvenance(provenance?: VendorProtocolProvenance, snippet?: string): ProtocolCandidateEvidenceSummary {
  const evidence: ProtocolCandidateEvidenceSummary = [];
  if (!provenance && !snippet) return evidence;
  evidence.push({
    ...(provenance ? {
      pageNumber: provenance.pageStart,
      ...(provenance.sectionId ? { sectionId: provenance.sectionId } : {}),
    } : {}),
    ...(snippet ? { snippet: excerpt(snippet, 500) ?? snippet.slice(0, 500) } : {}),
  });
  return evidence;
}

function summarizeCandidateItem(item: ExtractedCandidateItem): NonNullable<ProtocolCandidateSummary['materials']>[number] {
  const evidence = evidenceFromProvenance(item.provenance, item.sourceText);
  return {
    label: item.label,
    ...(item.role ? { role: item.role } : {}),
    ...(item.quantity ? { notes: [item.quantity] } : {}),
    ...(evidence && evidence.length > 0 ? { evidence } : {}),
    confidence: item.confidence,
  };
}

function summarizeCandidateStep(step: ProtocolStepCandidate): NonNullable<ProtocolCandidateSummary['steps']>[number] {
  const evidence = evidenceFromProvenance(step.provenance, step.sourceText);
  return {
    stepNumber: step.stepNumber,
    text: step.sourceText,
    ...(step.materials.length > 0 ? { materials: step.materials } : {}),
    ...(step.labware.length > 0 ? { labware: step.labware } : {}),
    ...(step.equipment.length > 0 ? { equipment: step.equipment } : {}),
    ...(step.notes.length > 0 ? { notes: step.notes } : {}),
    ...(evidence && evidence.length > 0 ? { evidence } : {}),
    confidence: step.confidence,
    ...(step.uncertainty ? { uncertainty: step.uncertainty } : {}),
  };
}

function summarizeProtocolCandidate(candidate: ProtocolCandidate, options: {
  url?: string;
  sha256?: string;
  vendor?: string;
  title?: string;
} = {}): ProtocolCandidateSummary {
  return {
    kind: 'vendor-protocol-candidate',
    title: candidate.title,
    ...(candidate.scope ? { scope: candidate.scope } : {}),
    source: {
      documentId: candidate.source.documentId,
      ...(options.vendor ?? candidate.source.vendor ? { vendor: options.vendor ?? candidate.source.vendor } : {}),
      ...(options.title ?? candidate.source.title ? { title: options.title ?? candidate.source.title } : {}),
      ...(options.url ? { url: options.url } : {}),
      ...(options.sha256 ? { sha256: options.sha256 } : {}),
    },
    materials: candidate.materials.slice(0, 40).map(summarizeCandidateItem),
    labware: candidate.labware.slice(0, 40).map(summarizeCandidateItem),
    equipment: candidate.equipment.slice(0, 40).map(summarizeCandidateItem),
    steps: candidate.steps.slice(0, 80).map(summarizeCandidateStep),
    diagnostics: candidate.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
    })),
  };
}

export function createVendorSearchHandlers(options: VendorSearchHandlerOptions = {}) {
  const appConfig = options.appConfig;
  const workspaceRoot = options.workspaceRoot;
  const store = options.store;
  return {
    async searchVendors(
      request: FastifyRequest<{
        Querystring: {
          q?: string;
          vendors?: string;
          limit?: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<VendorSearchResponse | ApiError> {
      const q = (request.query.q || '').trim();
      if (q.length < 2) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: 'Query parameter "q" must be at least 2 characters.',
        };
      }

      const requestedVendors = parseVendorIds(request.query.vendors || '');
      const vendors: VendorName[] = requestedVendors.length > 0 ? Array.from(new Set(requestedVendors)) : [...VALID_VENDOR_IDS];
      const limit = Math.min(Math.max(Number(request.query.limit) || 10, 1), 25);

      const results: Array<VendorStatus & { items: VendorSearchResultItem[] }> = await Promise.all(vendors.map(async (vendor) => {
        try {
          const items = await VENDOR_SEARCH_MAP[vendor](q, limit);
          return {
            vendor,
            success: true as const,
            items,
          };
        } catch (err) {
          return {
            vendor,
            success: false as const,
            items: [] as VendorSearchResultItem[],
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }));

      const items = results.flatMap((entry) => entry.items).slice(0, limit * vendors.length);
      const vendorStatuses: VendorSearchResponse['vendors'] = results.map((entry) => ({
        vendor: entry.vendor,
        success: entry.success,
        ...(entry.error ? { error: entry.error } : {}),
      }));

      return {
        items,
        vendors: vendorStatuses,
      };
    },

    async searchGraphLemurPdfs(
      request: FastifyRequest<{
        Querystring: {
          q?: string;
          vendors?: string;
          limit?: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<GraphLemurPdfSearchResponse | ApiError> {
      const q = (request.query.q || '').trim();
      if (q.length < 2) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: 'Query parameter "q" must be at least 2 characters.',
        };
      }

      const resolvedConfig = resolveExaConfig(appConfig);
      if (!resolvedConfig) {
        reply.status(503);
        return {
          error: 'EXA_NOT_CONFIGURED',
          message: 'Exa is not configured. Configure integrations.exa.apiKey before searching vendor PDFs.',
        };
      }

      const requestedVendors = parseVendorIds(request.query.vendors || '');
      const vendors: VendorName[] = requestedVendors.length > 0 ? Array.from(new Set(requestedVendors)) : [];
      const limit = Math.min(Math.max(Number(request.query.limit) || 8, 1), 20);
      const includeDomains = includeDomainsForVendors(vendors);

      try {
        const response = await exaSearch(resolvedConfig, {
          query: graphLemurQuery(q),
          searchType: 'auto',
          numResults: Math.min(limit * 2, 25),
          ...(includeDomains?.length ? { includeDomains } : {}),
          contentMode: 'text',
          maxCharacters: 6000,
          highlightQuery: q,
        });
        const seen = new Set<string>();
        const items = exaResults(response)
          .map((entry, index) => shapeGraphLemurPdfResult(entry, index))
          .filter((entry): entry is GraphLemurPdfSearchItem => Boolean(entry))
          .filter((entry) => {
            const key = entry.url.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, limit);
        return {
          configured: true,
          query: q,
          items,
          vendors: vendors.map((vendor) => ({ vendor, success: true })),
        };
      } catch (err) {
        reply.status(502);
        return {
          error: 'EXA_SEARCH_FAILED',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },


    async ingestGraphLemurPdf(
      request: FastifyRequest<{
        Body: {
          url?: string;
          title?: string;
          vendor?: string;
          /**
           * When present, persist the ingest as an `artifact` record under
           * records/studies/<studyId>/artifacts/. Validated to match the
           * STU-... pattern so we don't write to an arbitrary path. When
           * absent, legacy behavior: transient sourcePdf metadata only.
           */
          studyId?: string;
          query?: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<GraphLemurPdfIngestResponse | ApiError> {
      const body = request.body ?? {};
      const url = stringValue(body.url);
      if (!url) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: 'Body field "url" is required.',
        };
      }
      if (!workspaceRoot) {
        reply.status(503);
        return {
          error: 'WORKSPACE_NOT_CONFIGURED',
          message: 'GraphLemur PDF ingest requires a configured workspace root.',
        };
      }

      const title = stringValue(body.title);
      const vendor = stringValue(body.vendor) ?? inferVendorFromUrl(url);
      const requestedStudyId = stringValue(body.studyId);
      const ingestQuery = stringValue(body.query);
      if (requestedStudyId && !/^STU-[A-Za-z0-9_-]+$/.test(requestedStudyId)) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: `Body field "studyId" must match /^STU-[A-Za-z0-9_-]+$/ (got "${requestedStudyId}").`,
        };
      }

      try {
        let resolution: GraphLemurPdfResolution = { requestedUrl: url, pdfUrl: url, resolution: 'direct' };
        const downloadInput = (pdfUrl: string) => {
          const sourceDomain = (() => {
            try {
              return new URL(pdfUrl).hostname.replace(/^www\./, '');
            } catch {
              return undefined;
            }
          })();
          return {
            url: pdfUrl,
            workspaceRoot,
            ...(title ? { title, outputName: title } : {}),
            ...(sourceDomain ? { sourceDomain } : {}),
          };
        };
        let download = await downloadVendorPdf(downloadInput(url)).catch(async (directError) => {
          if (looksLikePdfUrl(url)) throw directError;
          resolution = await resolveGraphLemurPdfUrl(url);
          return downloadVendorPdf(downloadInput(resolution.pdfUrl));
        });
        const extraction = await extractVendorProtocolCandidateFromInput({
          workspaceRoot,
          artifactPath: download.relativePath,
          documentId: `graph-lemur-${download.sha256.slice(0, 12)}`,
          ...(vendor ? { vendor } : {}),
          persist: true,
        });
        const sourcePdf: SourcePdfSummary = {
          url: download.effectiveUrl || download.url,
          ...(title ? { title } : extraction.candidate.title ? { title: extraction.candidate.title } : {}),
          ...(vendor ? { vendor } : {}),
          artifactPath: download.relativePath,
          sha256: download.sha256,
        };
        const sourceProtocolCandidate = summarizeProtocolCandidate(extraction.candidate, {
          url: download.effectiveUrl || download.url,
          sha256: download.sha256,
          ...(vendor ? { vendor } : {}),
          ...(sourcePdf.title ? { title: sourcePdf.title } : {}),
        });

        // Phase 9: persist the ingest as a study-scoped artifact record so it
        // shows up in the workspace Browse tab and the PDF viewer can open it
        // later by id. Best-effort — a failure here doesn't break the legacy
        // chat flow that just wants the sourcePdf metadata.
        let recordedArtifact: GraphLemurPdfIngestResponse['recordedArtifact'];
        if (requestedStudyId && store) {
          const artifactTitle =
            title ||
            extraction.candidate.title ||
            sourcePdf.url ||
            'Vendor PDF';
          // Content-addressed id: the sha256 prefix gives idempotency across
          // re-ingests of the same PDF. If the record already exists, treat
          // that as a successful no-op rather than surfacing an error.
          const recordId = `ART-${download.sha256.slice(0, 12).toUpperCase()}`;
          let extractedTextPages: Array<{ pageNumber: number; text: string }> = [];
          try {
            const layout = await extractVendorPdfText({
              workspaceRoot,
              artifactPath: download.relativePath,
              fileName: download.relativePath.split('/').pop() ?? 'document.pdf',
              mode: 'layout',
            });
            extractedTextPages = layout.layoutText?.pages ?? [];
          } catch (extractionErr) {
            // Layout extraction is best-effort; the artifact is still useful
            // even with empty extractedText (the PDF viewer falls back to
            // pdfjs's on-the-fly text layer for selection).
            request.log?.warn?.(
              { err: extractionErr },
              'GraphLemur ingest: layout extraction failed; artifact will have no extractedText',
            );
          }

          const nowIso = new Date().toISOString();
          // The schema URI belongs in the envelope's `schemaId` (passed to
          // createEnvelope below), not the payload. The artifact schema
          // declares `unevaluatedProperties: false`, so a stray `$schema`
          // here makes validation fail and store.create returns success:false,
          // which the frontend surfaces as "legacy chat-draft mode."
          const payload = {
            kind: 'artifact' as const,
            recordId,
            title: artifactTitle,
            studyId: requestedStudyId,
            artifactKind: 'pdf' as const,
            file: {
              file_name: download.relativePath.split('/').pop() ?? 'document.pdf',
              media_type: 'application/pdf',
              source_url: sourcePdf.url,
              size_bytes: download.bytesDownloaded,
              sha256: download.sha256,
              stored_path: download.relativePath,
              page_count: extraction.document.pageCount,
            },
            extractedText: extractedTextPages.map((p) => ({
              pageNumber: p.pageNumber,
              text: p.text,
            })),
            source: {
              ...(vendor ? { vendor } : {}),
              url: sourcePdf.url,
              ...(ingestQuery ? { query: ingestQuery } : {}),
              ingestedAt: nowIso,
            },
          };

          const envelope = createEnvelope(
            payload,
            'https://computable-lab.com/schema/computable-lab/artifact.schema.yaml',
            { kind: 'artifact' },
          );
          if (envelope) {
            const exists = await store.exists(recordId).catch(() => false);
            if (!exists) {
              const result = await store.create({
                envelope,
                message: `GraphLemur ingest: ${artifactTitle}`,
              });
              if (result.success) {
                recordedArtifact = {
                  recordId,
                  studyId: requestedStudyId,
                  extractedTextPageCount: extractedTextPages.length,
                };
              } else {
                request.log?.warn?.(
                  { error: result.error },
                  'GraphLemur ingest: artifact record create failed',
                );
              }
            } else {
              // Already on disk from a previous ingest — return its id so the
              // caller can still reference the record.
              recordedArtifact = {
                recordId,
                studyId: requestedStudyId,
                extractedTextPageCount: extractedTextPages.length,
              };
            }
          }
        }

        return {
          sourcePdf,
          sourceProtocolCandidate,
          extraction: {
            requestedUrl: resolution.requestedUrl,
            resolvedPdfUrl: resolution.pdfUrl,
            resolution: resolution.resolution,
            artifactPath: download.relativePath,
            ...(extraction.candidatePath ? { candidatePath: extraction.candidatePath } : {}),
            pageCount: extraction.document.pageCount,
            sectionCount: extraction.document.sectionCount,
            tableCount: extraction.document.tableCount,
            diagnostics: extraction.document.diagnostics.map((diagnostic) => ({
              code: diagnostic.code,
              severity: diagnostic.severity,
              message: diagnostic.message,
            })),
          },
          ...(recordedArtifact ? { recordedArtifact } : {}),
        };
      } catch (err) {
        reply.status(502);
        return {
          error: 'GRAPH_LEMUR_PDF_INGEST_FAILED',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * Protocol IDE–specific document search.
     *
     * Returns only document-oriented results from the curated vendor allowlist.
     * Each result includes vendor, title, pdfUrl, landingUrl, snippet, and
     * documentType for a clean developer-facing picker.
     */
    async searchProtocolIdeDocuments(
      request: FastifyRequest<{
        Querystring: {
          q?: string;
          vendors?: string;
          limit?: string;
        };
      }>,
      reply: FastifyReply,
    ): Promise<ProtocolIdeDocumentSearchResponse | ApiError> {
      const q = (request.query.q || '').trim();
      if (q.length < 2) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: 'Query parameter "q" must be at least 2 characters.',
        };
      }

      const requestedVendors = parseVendorIds(request.query.vendors || '');
      const vendors: VendorName[] = requestedVendors.length > 0 ? Array.from(new Set(requestedVendors)) : [...VALID_VENDOR_IDS];
      const limit = Math.min(Math.max(Number(request.query.limit) || 10, 1), 25);

      // Only search curated vendors for Protocol IDE
      const curatedVendors = vendors.filter((v): v is VendorName => isCuratedVendor(v));
      if (curatedVendors.length === 0) {
        return { items: [], foundryCandidates: [], vendors: [] };
      }

      const results: Array<VendorStatus & { items: VendorSearchResultItem[] }> = await Promise.all(
        curatedVendors.map(async (vendor) => {
          try {
            const items = await VENDOR_SEARCH_MAP[vendor](q, limit);
            return {
              vendor,
              success: true as const,
              items,
            };
          } catch (err) {
            return {
              vendor,
              success: false as const,
              items: [] as VendorSearchResultItem[],
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }),
      );

      // Shape results into Protocol IDE document results
      const items: ProtocolIdeDocumentResult[] = [];
      const seen = new Set<string>();
      for (const entry of results) {
        for (const item of entry.items) {
          const shaped = shapeDocumentResult(
            item.vendor,
            item.name,
            item.productUrl,
            item.description,
          );
          if (shaped && !seen.has(shaped.sessionIdHint ?? '')) {
            seen.add(shaped.sessionIdHint ?? '');
            items.push(shaped);
          }
          if (items.length >= limit) break;
        }
        if (items.length >= limit) break;
      }

      const vendorStatuses: VendorSearchResponse['vendors'] = results.map((entry) => ({
        vendor: entry.vendor,
        success: entry.success,
        ...(entry.error ? { error: entry.error } : {}),
      }));

      return {
        items,
        foundryCandidates: protocolIdeDocumentsToFoundryPdfCandidates(items, {
          searchQuery: q,
          provenance: {
            endpoint: 'protocol-ide-document-search',
            vendors: curatedVendors,
          },
        }),
        vendors: vendorStatuses,
      };
    },
  };
}

export type VendorSearchHandlers = ReturnType<typeof createVendorSearchHandlers>;
