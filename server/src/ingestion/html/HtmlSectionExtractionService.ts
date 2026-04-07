import { createHash } from 'node:crypto';

export interface HtmlTableRow {
  rowIndex: number;
  cells: string[];
}

export interface HtmlTable {
  index: number;
  rows: HtmlTableRow[];
}

export interface HtmlSection {
  index: number;
  headingLevel: number;
  title: string;
  text: string;
  tables: HtmlTable[];
}

export interface HtmlExtraction {
  title: string;
  html: string;
  text: string;
  sections: HtmlSection[];
  sha256: string;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&micro;/gi, 'u')
    .replace(/&mu;/gi, 'u')
    .replace(/&#916;|&Delta;/gi, 'Δ')
    .replace(/&#945;|&alpha;/gi, 'α')
    .replace(/&#946;|&beta;/gi, 'β')
    .replace(/&#947;|&gamma;/gi, 'γ');
}

function stripHtml(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function parseTables(html: string): HtmlTable[] {
  const tables: HtmlTable[] = [];
  const tablePattern = /<table\b[\s\S]*?<\/table>/gi;
  let tableIndex = 0;
  for (const tableMatch of html.matchAll(tablePattern)) {
    const tableHtml = tableMatch[0] ?? '';
    const rows: HtmlTableRow[] = [];
    const rowPattern = /<tr\b[\s\S]*?<\/tr>/gi;
    let rowIndex = 0;
    for (const rowMatch of tableHtml.matchAll(rowPattern)) {
      const rowHtml = rowMatch[0] ?? '';
      const cells = Array.from(rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi))
        .map((match) => stripHtml(match[1] ?? ''))
        .filter(Boolean);
      if (cells.length === 0) continue;
      rows.push({ rowIndex, cells });
      rowIndex += 1;
    }
    if (rows.length > 0) {
      tables.push({ index: tableIndex, rows });
      tableIndex += 1;
    }
  }
  return tables;
}

function parseSections(html: string): HtmlSection[] {
  const headingPattern = /<(h[1-4])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const matches = Array.from(html.matchAll(headingPattern));
  if (matches.length === 0) {
    return [{
      index: 0,
      headingLevel: 1,
      title: 'Document',
      text: stripHtml(html),
      tables: parseTables(html),
    }];
  }

  const sections: HtmlSection[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]!;
    const tag = match[1] ?? 'h1';
    const title = stripHtml(match[2] ?? '') || `Section ${index + 1}`;
    const start = match.index ?? 0;
    const headingHtml = match[0] ?? '';
    const bodyStart = start + headingHtml.length;
    const bodyEnd = (matches[index + 1]?.index ?? html.length);
    const bodyHtml = html.slice(bodyStart, bodyEnd);
    sections.push({
      index,
      headingLevel: Number(tag.slice(1)),
      title,
      text: stripHtml(bodyHtml),
      tables: parseTables(bodyHtml),
    });
  }
  return sections;
}

function documentTitle(html: string): string {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) return stripHtml(titleMatch[1]);
  const headingMatch = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (headingMatch?.[1]) return stripHtml(headingMatch[1]);
  return 'Vendor formulation';
}

export function extractHtmlSections(html: string): HtmlExtraction {
  const cleaned = cleanHtml(html);
  return {
    title: documentTitle(cleaned),
    html: cleaned,
    text: stripHtml(cleaned),
    sections: parseSections(cleaned),
    sha256: createHash('sha256').update(cleaned).digest('hex'),
  };
}
