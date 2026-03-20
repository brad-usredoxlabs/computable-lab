import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiError } from '../types.js';

export interface VendorSearchResultItem {
  vendor: 'thermo' | 'sigma';
  name: string;
  catalogNumber: string;
  productUrl?: string;
  description?: string;
  grade?: string;
  formulation?: string;
}

export interface VendorSearchResponse {
  items: VendorSearchResultItem[];
  vendors: Array<{
    vendor: 'thermo' | 'sigma';
    success: boolean;
    error?: string;
  }>;
}

type VendorName = 'thermo' | 'sigma';
type VendorStatus = VendorSearchResponse['vendors'][number];

const VENDOR_TIMEOUT_MS = 8_000;
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

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
    items.push({
      vendor: 'thermo',
      name,
      catalogNumber,
      productUrl,
    });
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
    items.push({
      vendor: 'sigma',
      name,
      catalogNumber,
      productUrl,
    });
    if (items.length >= limit) break;
  }

  return items;
}

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

      const requestedVendors = (request.query.vendors || 'thermo,sigma')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry): entry is VendorName => entry === 'thermo' || entry === 'sigma');
      const vendors: VendorName[] = requestedVendors.length > 0 ? Array.from(new Set(requestedVendors)) : ['thermo', 'sigma'];
      const limit = Math.min(Math.max(Number(request.query.limit) || 10, 1), 25);

      const results: Array<VendorStatus & { items: VendorSearchResultItem[] }> = await Promise.all(vendors.map(async (vendor) => {
        try {
          const items = vendor === 'thermo'
            ? await searchThermo(q, limit)
            : await searchSigma(q, limit);
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
  };
}

export type VendorSearchHandlers = ReturnType<typeof createVendorSearchHandlers>;
