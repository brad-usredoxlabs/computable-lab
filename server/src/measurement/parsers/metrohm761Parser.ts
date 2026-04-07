import { findHeaderIndex, parseCsvTable } from './csvCommon.js';
import type { MeasurementParser } from './types.js';
import { MeasurementServiceError } from '../MeasurementService.js';

export const metrohm761CsvStubParser: MeasurementParser = {
  parserId: 'metrohm761_csv_stub',
  aliases: ['metrohm761', 'ic761', 'ic_csv_stub'],
  parse(content) {
    const { header, rows } = parseCsvTable(content);
    const timeIdx = findHeaderIndex(header, ['time_min', 'retention_time_min', 'time']);
    const conductivityIdx = findHeaderIndex(header, ['conductivity', 'signal', 'response']);
    if (timeIdx < 0 || conductivityIdx < 0) {
      throw new MeasurementServiceError(
        'BAD_REQUEST',
        'metrohm761_csv_stub expects columns: time_min and conductivity/signal. Share sample files to finalize parser.',
        400
      );
    }

    const data = rows
      .map((cols) => {
        const t = cols[timeIdx];
        const y = cols[conductivityIdx];
        if (!t || !y) return null;
        const value = Number.parseFloat(y);
        if (!Number.isFinite(value)) return null;
        return {
          well: 'NA',
          metric: 'conductivity',
          value,
          channelId: 'chromatogram',
          unit: 'uS/cm',
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (data.length === 0) {
      throw new MeasurementServiceError('BAD_REQUEST', 'metrohm761_csv_stub found no numeric chromatogram rows', 400);
    }
    return {
      assayType: 'other',
      parserId: 'metrohm761_csv_stub',
      parserVersion: '0.1.0',
      data,
      channels: ['chromatogram'],
      mimeType: 'text/csv',
    };
  },
};
