/**
 * deriveDocumentTableAxis — lift a QUESTION out of a vendor document TABLE.
 *
 * Phase 3b (plan 2026-09-19_121028). The vendor extractor already captures the
 * document's tables verbatim (`candidate.tables[]`, e.g. ZymoBIOMICS 96 kit's
 * "Sample type maximum input": Feces / Soil / Liquid samples and swab
 * collections / Cells suspended in PBS / Samples in DNA/RNA Shield). Those
 * tables ARE the document stating a question — "which sample type are we
 * extracting?" — in the same sense that lettered `a./b.` branches state one.
 *
 * Deterministic rules (no inference, no fabrication):
 *   - a table qualifies when its title names a sample choice
 *     (/sample (type|source|input)/i);
 *   - the OPTION COLUMN is its first column; the option LABEL is the cell
 *     verbatim and the option KEY is slug(cell) (same key convention as
 *     branch options, so the localization UI renders both the same way);
 *   - a step is GATED when its own text points at that table: it says "the
 *     table below/above", or quotes the table title, or names one of the
 *     options (Zymo step 1: "Add sample to the BashingBead Lysis Module using
 *     the table below:"). A table no step points at yields NO axis — an
 *     unanswerable question is worse than no question (the question gate
 *     refuses gate-less axes anyway);
 *   - everything else about the document is left alone.
 */

export interface DocumentTableLike {
  id?: unknown;
  title?: unknown;
  headers?: unknown;
  rows?: unknown;
  sourceText?: unknown;
  provenance?: unknown;
}

export interface DocumentTableStepLike {
  stepId?: unknown;
  stepNumber?: unknown;
  sourceText?: unknown;
  actions?: unknown;
  branches?: unknown;
}

export interface DocumentTableAxisCondition {
  id: string;
  label: string;
  predicate: { op: 'equals'; path: string; value: string };
  then_stepIds: string[];
}

export interface DocumentTableAxis {
  axisId: string;
  question: string;
  choiceKey: string;
  origin: 'document_table';
  evidence: Array<{ quote: string; page?: number; stepNumber?: number }>;
  conditions: DocumentTableAxisCondition[];
}

export type DocumentTableAxisRefusal =
  | 'no_sample_table'
  | 'table_too_small'
  | 'option_column_not_categorical'
  | 'no_step_references_table';

export interface DocumentTableAxisResult {
  axis: DocumentTableAxis | null;
  reason?: DocumentTableAxisRefusal;
}

/** Titles that name a sample-source-style choice. */
const SAMPLE_TABLE_TITLE = /sample\s*(type|source|input)/i;
/** A step that points at a table instead of restating it. */
const TABLE_REFERENCE = /(the|this|following|above)\s+table\s+(below|above|shown)/i;

function slug(input: string): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.length > 0 ? s : 'option';
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Flatten strings, string arrays, and {text|label|action}-ish objects to text. */
function asText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(asText).filter((s) => s.length > 0).join(' ');
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    const parts = ['text', 'label', 'action', 'description', 'instruction']
      .map((k) => asText(o[k]))
      .filter((s) => s.length > 0);
    return parts.length > 0 ? parts.join(' ') : '';
  }
  return '';
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function asRows(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? v.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null) : [];
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function stepText(step: DocumentTableStepLike): string {
  return [asText(step.sourceText), asText(step.actions), asText(step.branches)]
    .filter((s) => s.length > 0)
    .join(' ');
}

function stepIdOf(step: DocumentTableStepLike, index: number): string {
  const id = asString(step.stepId).trim();
  if (id.length > 0) return id;
  const n = typeof step.stepNumber === 'number' ? step.stepNumber : index + 1;
  return `step-${String(n).padStart(3, '0')}`;
}

function numberValue(cell: string): number | null {
  const match = cell.replace(/,/g, '').match(/^[<>]?\s*(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function pageOf(provenance: unknown): number | undefined {
  if (typeof provenance !== 'object' || provenance === null) return undefined;
  const p = provenance as Record<string, unknown>;
  // Vendor tables carry `pageStart`; hand-authored trees carry `page`.
  for (const key of ['page', 'pageStart']) {
    const v = p[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 1) return v;
  }
  return undefined;
}

/**
 * Derive a `document_table` axis from the document's own sample table.
 * Returns `{ axis: null, reason }` when the document states no answerable
 * question of this kind — the caller logs the reason, never invents an axis.
 */
export function deriveSampleSourceAxis(input: {
  tables?: unknown;
  steps?: DocumentTableStepLike[];
}): DocumentTableAxisResult {
  const tables = (Array.isArray(input.tables) ? input.tables : []).filter(
    (t): t is DocumentTableLike => typeof t === 'object' && t !== null,
  );
  const candidateTables = tables.filter((t) => SAMPLE_TABLE_TITLE.test(asString(t.title)));
  if (candidateTables.length === 0) return { axis: null, reason: 'no_sample_table' };

  // Deterministic choice among qualifying tables: the one with most options.
  const ranked = candidateTables
    .map((table) => ({ table, rows: asRows(table.rows) }))
    .sort((a, b) => b.rows.length - a.rows.length);
  const { table, rows } = ranked[0]!;

  const headers = asStringArray(table.headers);
  const optionHeader = headers[0] ?? 'Sample type';
  const optionColumn = optionHeader;

  const options: Array<{ label: string; key: string }> = [];
  const seen = new Set<string>();
  let numericCells = 0;
  let considered = 0;
  for (const row of rows) {
    const raw = asString(row[optionColumn]).trim();
    if (raw.length === 0) continue;
    considered += 1;
    if (numberValue(raw) !== null) numericCells += 1;
    const key = slug(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ label: raw, key });
  }
  if (options.length < 2) return { axis: null, reason: 'table_too_small' };
  if (numericCells === considered) return { axis: null, reason: 'option_column_not_categorical' };

  // Which steps point at this table?
  const steps = input.steps ?? [];
  const optionKeys = new Set(options.map((o) => o.key));
  const optionLabels = options.map((o) => normalizeText(o.label));
  const tableTitle = normalizeText(asString(table.title));
  const gating = steps
    .map((step, index) => ({ stepId: stepIdOf(step, index), text: normalizeText(stepText(step)), step }))
    .filter(({ text }) => {
      if (text.length === 0) return false;
      if (TABLE_REFERENCE.test(text)) return true;
      if (tableTitle.length > 0 && text.includes(tableTitle)) return true;
      // "Samples in DNA/RNA Shield" vs a step that says "samples in DNA/RNA shield"
      if (optionLabels.some((label) => label.length > 4 && text.includes(label))) return true;
      return optionKeys.size > 0 && [...optionKeys].some((key) => key.length > 4 && text.includes(key.replace(/-/g, ' ')));
    });
  if (gating.length === 0) return { axis: null, reason: 'no_step_references_table' };

  const thenStepIds = gating.map((g) => g.stepId).sort();
  const axisId = `axis-${slug(optionHeader)}`;
  const quote = asString(table.sourceText).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join(' | ');
  const page = pageOf(table.provenance);
  const firstGatingStep = gating[0]!.step;

  return {
    axis: {
      axisId,
      question: `Which ${optionHeader}?`,
      choiceKey: 'branchSelection',
      origin: 'document_table',
      evidence: [
        {
          quote: quote.length > 0 ? quote : asString(table.title),
          ...(page !== undefined ? { page } : {}),
          ...(typeof firstGatingStep.stepNumber === 'number' ? { stepNumber: firstGatingStep.stepNumber } : {}),
        },
      ],
      conditions: options.map((option, i) => ({
        id: `option-${i + 1}`,
        label: option.label,
        predicate: { op: 'equals' as const, path: '$.branchSelection', value: option.key },
        then_stepIds: thenStepIds,
      })),
    },
  };
}