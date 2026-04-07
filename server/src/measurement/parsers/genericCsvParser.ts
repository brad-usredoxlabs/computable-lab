import { parseCsvMeasurementRows } from './csvCommon.js';
import type { MeasurementParser } from './types.js';

export const genericCsvParser: MeasurementParser = {
  parserId: 'generic_csv',
  aliases: ['csv'],
  parse(content) {
    const data = parseCsvMeasurementRows(content);
    const channels = [...new Set(data.map((d) => d.channelId).filter((x): x is string => Boolean(x)))];
    return {
      assayType: 'other',
      parserId: 'generic_csv',
      parserVersion: '0.1.0',
      data,
      channels,
      mimeType: 'text/csv',
    };
  },
};
