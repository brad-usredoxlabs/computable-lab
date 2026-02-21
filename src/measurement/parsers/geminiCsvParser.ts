import { findHeaderIndex, parseCsvTable } from './csvCommon.js';
import type { MeasurementParser } from './types.js';
import { MeasurementServiceError } from '../MeasurementService.js';

function normalizeWell(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export const geminiCsvParser: MeasurementParser = {
  parserId: 'gemini_csv',
  aliases: ['gemini'],
  parse(content) {
    const { header, rows } = parseCsvTable(content);
    const wellIdx = findHeaderIndex(header, ['well', 'wellid', 'well_id', 'well position']);
    const valueIdx = findHeaderIndex(header, ['value', 'rfu', 'od', 'signal', 'intensity']);
    const channelIdx = findHeaderIndex(header, ['channelid', 'channel', 'wavelength', 'filter']);
    const metricIdx = findHeaderIndex(header, ['metric', 'read', 'measurement', 'mode']);
    const unitIdx = findHeaderIndex(header, ['unit']);

    if (wellIdx < 0 || valueIdx < 0) {
      throw new MeasurementServiceError(
        'BAD_REQUEST',
        'gemini_csv requires at least well and value/rfu columns',
        400
      );
    }

    const data = rows
      .map((cols) => {
        const wellRaw = cols[wellIdx];
        const valueRaw = cols[valueIdx];
        if (!wellRaw || !valueRaw) return null;
        const value = Number.parseFloat(valueRaw);
        if (!Number.isFinite(value)) return null;
        const well = normalizeWell(wellRaw);
        const channel = channelIdx >= 0 ? cols[channelIdx] : '';
        const metric =
          (metricIdx >= 0 && cols[metricIdx]) ||
          (channel ? `RFU_${channel}` : 'RFU');
        return {
          well,
          metric,
          value,
          ...(channel ? { channelId: channel } : {}),
          ...(unitIdx >= 0 && cols[unitIdx] ? { unit: cols[unitIdx] } : {}),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (data.length === 0) {
      throw new MeasurementServiceError('BAD_REQUEST', 'gemini_csv could not parse any numeric rows', 400);
    }

    const invalidWell = data.find((row) => !/^[A-Z]+[0-9]+$/.test(row.well));
    if (invalidWell) {
      throw new MeasurementServiceError('BAD_REQUEST', `Invalid well label in gemini_csv: ${invalidWell.well}`, 400);
    }

    const channels = [...new Set(data.map((d) => d.channelId).filter((x): x is string => Boolean(x)))];
    return {
      assayType: 'plate_reader',
      parserId: 'gemini_csv',
      parserVersion: '0.1.0',
      data,
      channels,
      mimeType: 'text/csv',
    };
  },
};
