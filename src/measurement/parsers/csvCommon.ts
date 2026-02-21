import { MeasurementServiceError } from '../MeasurementService.js';
import type { MeasurementRow } from './types.js';

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

export function parseCsvTable(content: string): { header: string[]; rows: string[][] } {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new MeasurementServiceError('BAD_REQUEST', 'CSV must include header and at least one data row', 400);
  }

  const firstLine = lines[0];
  if (firstLine === undefined) {
    throw new MeasurementServiceError('BAD_REQUEST', 'CSV header missing', 400);
  }
  const header = splitCsvLine(firstLine).map((v) => v.toLowerCase());
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    rows.push(splitCsvLine(line));
  }
  return { header, rows };
}

export function findHeaderIndex(header: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = header.indexOf(candidate.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseCsvMeasurementRows(content: string): MeasurementRow[] {
  const { header, rows } = parseCsvTable(content);
  const wellIdx = header.indexOf('well');
  const metricIdx = header.indexOf('metric');
  const valueIdx = header.indexOf('value');
  const channelIdx = header.indexOf('channelid');
  const unitIdx = header.indexOf('unit');
  if (wellIdx < 0 || metricIdx < 0 || valueIdx < 0) {
    throw new MeasurementServiceError('BAD_REQUEST', 'CSV header must include well,metric,value columns', 400);
  }

  const data: MeasurementRow[] = [];
  for (const cols of rows) {
    const valueStr = cols[valueIdx];
    const well = cols[wellIdx];
    const metric = cols[metricIdx];
    if (!valueStr || !well || !metric) continue;

    const valueNum = Number.parseFloat(valueStr);
    if (!Number.isFinite(valueNum)) continue;

    data.push({
      well,
      metric,
      value: valueNum,
      ...(channelIdx >= 0 && cols[channelIdx] ? { channelId: cols[channelIdx] } : {}),
      ...(unitIdx >= 0 && cols[unitIdx] ? { unit: cols[unitIdx] } : {}),
    });
  }

  if (data.length === 0) {
    throw new MeasurementServiceError('BAD_REQUEST', 'No numeric rows parsed from CSV', 400);
  }
  return data;
}
