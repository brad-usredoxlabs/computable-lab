/**
 * Vendor catalog page adapter / extractor.
 *
 * Parses a saved HTML artifact (or fetches from sourceUrl) and extracts
 * vendor-offer candidate payloads: vendor, catalog number, productUrl,
 * package size, price, currency, and a short specification summary.
 *
 * When a required field is missing the adapter emits a `needs_review`
 * issue instead of silently inventing values.
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface VendorOfferCandidate {
  vendor: string;
  productTitle: string;
  catalogNumber: string | undefined;
  productUrl: string | undefined;
  packageSize: string | undefined;
  price: number | undefined;
  currency: string | undefined;
  summary: string;
}

export interface VendorCatalogPageExtraction {
  title: string;
  sourceUrl?: string | undefined;
  vendor: string;
  offers: VendorOfferCandidate[];
  issues: VendorCatalogIssue[];
  sha256: string;
  htmlExcerpt: string;
}

export interface VendorCatalogIssue {
  severity: 'warning' | 'error';
  issueType: 'missing_catalog_number' | 'missing_price' | 'missing_currency' | 'missing_vendor' | 'missing_product_title' | 'ambiguous_price';
  title: string;
  detail: string;
}

// ---------------------------------------------------------------------------
// HTML helpers (lightweight, no heavy framework)
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function extractMetaContent(html: string, name: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)\\s*=\\s*["']${name}["'][^>]+content\\s*=\\s*["']([^"']+)["']`,
    'i',
  );
  const m = re.exec(html);
  return m ? m[1].trim() : undefined;
}

function extractTextContent(html: string): string {
  return stripHtml(html);
}

// ---------------------------------------------------------------------------
// Price / currency extraction
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS: Record<string, string> = {
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
  '₩': 'KRW',
  '₱': 'PHP',
  'R$': 'BRL',
  'R': 'ZAR',
  'kr': 'SEK',
  'kr': 'NOK',
  'kr': 'DKK',
  'CHF': 'CHF',
  'C$': 'CAD',
  'A$': 'AUD',
};

function detectCurrencyFromSymbol(symbol: string): string | undefined {
  if (CURRENCY_SYMBOLS[symbol]) return CURRENCY_SYMBOLS[symbol];
  // Try to match the symbol as a substring of known currency codes
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (symbol.includes(sym) || sym.includes(symbol)) return code;
  }
  return undefined;
}

function detectCurrencyFromText(text: string): string | undefined {
  const upper = text.toUpperCase();
  // Try ISO codes first
  const isoMatch = upper.match(/\b(USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|BRL|KRW|MXN|SGD|HKD|NOK|SEK|DKK|NZD|ZAR|PHP|TWD|THB|MYR|IDR|PLN|CZK|HUF|RON|BGN|HRK|RUB|TRY|ILS|AED|SAR|QAR|KWD|BHD|OMR|JOD|EGP|NGN|KES|GHS|TZS|UGX|MAD|TND|DZD|LKR|PKR|BDT|VND|MMK|KHR|LAK|TMT|UZS|KZT|GEL|AMD|AZN|BYN|MDL|UAH|RON|BAM|RSD|MKD|ALL|BAM)\b/);
  if (isoMatch) return isoMatch[1];
  // Try symbols
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (text.includes(sym)) return code;
  }
  return undefined;
}

function extractPriceFromText(text: string): { price: number; currency: string | undefined } | undefined {
  // Look for patterns like "$123.45", "€ 123,45", "123.45 EUR", etc.
  // Pattern: optional currency symbol/code, then number
  const patterns = [
    // "$123.45" or "$123"
    /[\$€£¥₹₩₱]\s*(\d{1,3}(?:[.,]\d{3})*(?:\.\d{1,2})?)/g,
    // "123.45 EUR" or "123,45 EUR"
    /(\d{1,3}(?:[.,]\d{3})*(?:\.\d{1,2})?)\s+(USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|BRL|KRW|MXN|SGD|HKD|NOK|SEK|DKK|NZD|ZAR|PHP|TWD|THB|MYR|IDR|PLN|CZK|HUF|RON|BGN|HRK|RUB|TRY|ILS|AED|SAR|QAR|KWD|BHD|OMR|JOD|EGP|NGN|KES|GHS|TZS|UGX|MAD|TND|DZD|LKR|PKR|BDT|VND|MMK|KHR|LAK|TMT|UZS|KZT|GEL|AMD|AZN|BYN|MDL|UAH|BAM|RSD|MKD|ALL)/gi,
  ];

  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const raw = match[1];
      const priceStr = raw.replace(/[,.]/g, (m, offset, str) => {
        // If followed by exactly 3 digits and not a decimal point, treat as thousands separator
        if (m === ',' && /\d{3}$/.test(str.slice(offset + 1))) return '';
        if (m === '.' && /\d{3}$/.test(str.slice(offset + 1))) return '';
        return '.';
      });
      const price = parseFloat(priceStr);
      if (!isNaN(price) && price > 0) {
        let currency: string | undefined;
        if (match[2]) {
          currency = match[2].toUpperCase();
        } else {
          currency = detectCurrencyFromSymbol(match[0][0]);
        }
        return { price, currency };
      }
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Catalog number extraction
// ---------------------------------------------------------------------------

function extractCatalogNumber(text: string): string | undefined {
  // Common patterns: "Cat. No. XXX-XXXX", "Catalog # XXX", "Product No. XXX", "SKU: XXX"
  // Require a non-alphanumeric separator after the keyword to avoid matching inside words
  const patterns = [
    // "Cat. No. XXX" or "Cat No XXX" - keyword followed by space/punctuation then number
    /\bcat(?:\.?\s*no\.?)?\s+[:\-]?\s*([A-Z0-9][A-Z0-9\-_.]{2,20})\b/gi,
    // "Catalog # XXX" or "Catalog: XXX"
    /\bcatalog\s+#?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-_.]{2,20})\b/gi,
    // "Product No. XXX"
    /\bproduct\s+no\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-_.]{2,20})\b/gi,
    // "SKU: XXX"
    /\bsku\s+[:\-]?\s*([A-Z0-9][A-Z0-9\-_.]{2,20})\b/gi,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const captured = match[1] ? match[1].trim() : match[0].trim();
      // Skip if the captured value is too short (likely a false match)
      if (captured.length < 3) continue;
      return captured;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Vendor extraction
// ---------------------------------------------------------------------------

function extractVendor(html: string, text: string): string {
  // Try meta tags first
  const ogSiteName = extractMetaContent(html, 'og:site_name');
  if (ogSiteName) return ogSiteName;
  const ogTitle = extractMetaContent(html, 'og:title');
  if (ogTitle) {
    // Try to extract vendor from og:title
    const vendorMatch = ogTitle.match(/^([A-Z][A-Za-z0-9\s&]+?)\s*[-–—:]/);
    if (vendorMatch) return vendorMatch[1].trim();
  }
  // Try title tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1].trim();
    // Common vendor patterns in title
    const vendorPatterns = [
      /^Fisher\s+Scientific/i,
      /^Thermo\s+Fisher/i,
      /^VWR\s+International/i,
      /^VWR\s+Scientific/i,
      /^Cayman\s+Chemical/i,
      /^Cayman/i,
      /^Sigma[-\s]Aldrich/i,
      /^Merck/i,
      /^Millipore/i,
      /^Thomas\s+Scientific/i,
      /^Fisher\s+Scientific/i,
    ];
    for (const vp of vendorPatterns) {
      const m = title.match(vp);
      if (m) return m[0];
    }
  }
  // Try to detect from text
  const vendorKeywords = [
    /Fisher\s+Scientific/i,
    /Thermo\s+Fisher/i,
    /VWR\s+International/i,
    /Cayman\s+Chemical/i,
    /Sigma[-\s]Aldrich/i,
    /Merck/i,
    /Millipore/i,
    /Thomas\s+Scientific/i,
  ];
  for (const kw of vendorKeywords) {
    const m = text.match(kw);
    if (m) return m[0];
  }
  return 'Unknown Vendor';
}

// ---------------------------------------------------------------------------
// Product title extraction
// ---------------------------------------------------------------------------

function extractProductTitle(html: string, text: string): string {
  // Try og:title
  const ogTitle = extractMetaContent(html, 'og:title');
  if (ogTitle) return ogTitle;
  // Try h1
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();
  // Try title tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();
  // Fallback to first meaningful text
  return text.slice(0, 200).trim() || 'Unknown Product';
}

// ---------------------------------------------------------------------------
// Package size extraction
// ---------------------------------------------------------------------------

function extractPackageSize(text: string): string | undefined {
  // Priority order:
  // 1. "Package Size: X" — capture everything after the label
  // 2. "Pack of N" — explicit pack quantity
  // 3. "N plates per case" — quantity with unit and context
  // 4. "N unit" — number followed by a unit (last resort)

  // Pattern 1: "Package Size: X" — capture the full value after the label
  const p1 = /(?:package\s*size|pack(?:age)?\s*size)\s*[:\-]?\s*(.+?)(?:\n|$)/i;
  const m1 = p1.exec(text);
  if (m1) {
    const val = m1[1].trim();
    if (val && val.length > 0 && !/^(of|a|an|the|per|each)$/i.test(val)) {
      return val;
    }
  }

  // Pattern 2: "Pack of N" — explicit pack quantity
  const p2 = /pack\s+of\s+(\d+)/i;
  const m2 = p2.exec(text);
  if (m2) {
    return m2[1];
  }

  // Pattern 3: "N plates per case" — quantity with unit and context
  const p3 = /(\d+)\s+(?:plates?|vials?|bottles?|units?|cases?|boxes?|bags?|tubes?|flasks?|wells?)\s+per\s+(?:case|box|pack|bag)/i;
  const m3 = p3.exec(text);
  if (m3) {
    return `${m3[1]} ${m3[0].match(/plates?|vials?|bottles?|units?|cases?|boxes?|bags?|tubes?|flasks?|wells?/i)?.[0]}`;
  }

  // Pattern 4: "N unit" — number followed by a unit (last resort)
  const p4 = /(\d+(?:\.\d+)?)\s*(mg|g|ml|l|kg|μg|ng|μl|nl|mm|cm|in|ft|yd|km|mi|mol|mM|μM|nM|pM|fM|%|units?|U|IU|CFU|cells?|spores?|pfu?|cc|oz|lb|tons?)/i;
  const m4 = p4.exec(text);
  if (m4) {
    return `${m4[1]} ${m4[2]}`;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Summary extraction
// ---------------------------------------------------------------------------

function extractSummary(html: string, text: string): string {
  // Try to find a meta description
  const metaDesc = extractMetaContent(html, 'description');
  if (metaDesc) return metaDesc;
  // Try to find a short paragraph near the product info
  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 20 && p.trim().length < 500);
  if (paragraphs.length > 0) return paragraphs[0].trim();
  // Fallback
  return text.slice(0, 300).trim();
}

// ---------------------------------------------------------------------------
// Product URL extraction
// ---------------------------------------------------------------------------

function extractProductUrl(html: string, sourceUrl?: string): string | undefined {
  // Try og:url
  const ogUrl = extractMetaContent(html, 'og:url');
  if (ogUrl) return ogUrl;
  // Try canonical link
  const canonicalMatch = html.match(/<link[^>]+rel\s*=\s*["']canonical["'][^>]+href\s*=\s*["']([^"']+)["']/i);
  if (canonicalMatch) return canonicalMatch[1];
  // Fall back to sourceUrl
  return sourceUrl;
}

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------

async function loadHtml(input: { contentBase64?: string; sourceUrl?: string }): Promise<string> {
  if (input.contentBase64) {
    return Buffer.from(input.contentBase64, 'base64').toString('utf8');
  }
  if (!input.sourceUrl) {
    throw new Error('Vendor catalog page ingestion requires contentBase64 or sourceUrl.');
  }
  const response = await fetch(input.sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch vendor catalog page: HTTP ${response.status}`);
  }
  return await response.text();
}

/**
 * Extract vendor-offer candidates from a vendor catalog page HTML artifact.
 *
 * Returns a `VendorCatalogPageExtraction` with:
 * - `offers`: array of `VendorOfferCandidate` objects
 * - `issues`: array of `VendorCatalogIssue` objects for missing/ambiguous fields
 */
export async function extractVendorCatalogPage(input: {
  contentBase64?: string;
  sourceUrl?: string;
}): Promise<VendorCatalogPageExtraction> {
  const html = await loadHtml(input);
  const text = extractTextContent(html);
  const sha = sha256Hex(html);

  const vendor = extractVendor(html, text);
  const productTitle = extractProductTitle(html, text);
  const productUrl = extractProductUrl(html, input.sourceUrl);
  const catalogNumber = extractCatalogNumber(text);
  const packageSize = extractPackageSize(text);
  const priceInfo = extractPriceFromText(text);
  const summary = extractSummary(html, text);

  const issues: VendorCatalogIssue[] = [];

  // Check required fields
  if (!catalogNumber) {
    issues.push({
      severity: 'warning',
      issueType: 'missing_catalog_number',
      title: 'Missing catalog number',
      detail: 'Could not extract a catalog number from the page. Manual review recommended.',
    });
  }
  if (!priceInfo?.price) {
    issues.push({
      severity: 'error',
      issueType: 'missing_price',
      title: 'Missing price',
      detail: 'Could not extract a price from the page. This offer cannot be used for budgeting without a price.',
    });
  }
  if (!priceInfo?.currency) {
    issues.push({
      severity: 'warning',
      issueType: 'missing_currency',
      title: 'Missing currency',
      detail: 'Could not determine the currency for the extracted price.',
    });
  }

  const offer: VendorOfferCandidate = {
    vendor,
    productTitle,
    catalogNumber,
    productUrl,
    packageSize,
    price: priceInfo?.price,
    currency: priceInfo?.currency,
    summary,
  };

  return {
    title: productTitle,
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    vendor,
    offers: [offer],
    issues,
    sha256: sha,
    htmlExcerpt: text.slice(0, 500),
  };
}
