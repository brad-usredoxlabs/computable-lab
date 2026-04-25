import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError } from '../types.js';
import { parseConcentration, type Concentration } from '../../materials/concentration.js';
import type { ProtocolIdeDocumentResult, ProtocolIdeVendorId } from '../../vendor-documents/protocolIdeVendors.js';
import { isCuratedVendor } from '../../vendor-documents/protocolIdeVendors.js';
import { shapeDocumentResult } from '../../vendor-documents/service.js';

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
  vendors: Array<{
    vendor: VendorName;
    success: boolean;
    error?: string;
  }>;
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

export function createVendorSearchHandlers() {
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
        return { items: [], vendors: [] };
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
        vendors: vendorStatuses,
      };
    },
  };
}

export type VendorSearchHandlers = ReturnType<typeof createVendorSearchHandlers>;
