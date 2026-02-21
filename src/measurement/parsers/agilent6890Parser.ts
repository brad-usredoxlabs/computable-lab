import { findHeaderIndex, parseCsvTable } from './csvCommon.js';
import type { MeasurementParser } from './types.js';
import { MeasurementServiceError } from '../MeasurementService.js';

export const agilent6890CsvStubParser: MeasurementParser = {
  parserId: 'agilent6890_csv_stub',
  aliases: ['agilent6890', 'gc6890', 'gc_csv_stub'],
  parse(content) {
    const { header, rows } = parseCsvTable(content);
    const timeIdx = findHeaderIndex(header, ['time_min', 'retention_time_min', 'time']);
    const intensityIdx = findHeaderIndex(header, ['intensity', 'response', 'signal']);
    if (timeIdx < 0 || intensityIdx < 0) {
      throw new MeasurementServiceError(
        'BAD_REQUEST',
        'agilent6890_csv_stub expects columns: time_min (or retention_time_min) and intensity. Share sample files to finalize parser.',
        400
      );
    }

    const data = rows
      .map((cols) => {
        const t = cols[timeIdx];
        const y = cols[intensityIdx];
        if (!t || !y) return null;
        const value = Number.parseFloat(y);
        if (!Number.isFinite(value)) return null;
        return {
          well: 'NA',
          metric: 'intensity',
          value,
          channelId: 'chromatogram',
          unit: 'a.u.',
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (data.length === 0) {
      throw new MeasurementServiceError('BAD_REQUEST', 'agilent6890_csv_stub found no numeric chromatogram rows', 400);
    }
    return {
      assayType: 'gc_ms',
      parserId: 'agilent6890_csv_stub',
      parserVersion: '0.1.0',
      data,
      channels: ['chromatogram'],
      mimeType: 'text/csv',
    };
  },
};
