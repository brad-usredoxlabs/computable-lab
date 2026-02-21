import { findHeaderIndex, parseCsvTable } from './csvCommon.js';
import type { MeasurementParser } from './types.js';
import { MeasurementServiceError } from '../MeasurementService.js';

function normalizeWell(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export const abi7500CsvParser: MeasurementParser = {
  parserId: 'abi7500_csv',
  aliases: ['abi7500', 'quantstudio_csv'],
  parse(content) {
    const { header, rows } = parseCsvTable(content);
    const wellIdx = findHeaderIndex(header, ['well', 'well position', 'well_position']);
    const valueIdx = findHeaderIndex(header, ['ct', 'cq', 'value']);
    const targetIdx = findHeaderIndex(header, ['target', 'target name', 'assay']);
    const reporterIdx = findHeaderIndex(header, ['reporter', 'dye', 'channelid', 'channel']);

    if (wellIdx < 0 || valueIdx < 0) {
      throw new MeasurementServiceError(
        'BAD_REQUEST',
        'abi7500_csv requires well and ct/cq/value columns',
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
        const target = targetIdx >= 0 ? cols[targetIdx] : '';
        const reporter = reporterIdx >= 0 ? cols[reporterIdx] : '';
        const channelId = reporter || target || 'qPCR';
        const metric = valueIdx >= 0 && (header[valueIdx] === 'cq' || header[valueIdx] === 'ct')
          ? header[valueIdx].toUpperCase()
          : 'Ct';
        return {
          well,
          metric,
          value,
          channelId,
          ...(target ? { unit: target } : {}),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (data.length === 0) {
      throw new MeasurementServiceError('BAD_REQUEST', 'abi7500_csv could not parse any numeric rows', 400);
    }

    const invalidWell = data.find((row) => !/^[A-Z]+[0-9]+$/.test(row.well));
    if (invalidWell) {
      throw new MeasurementServiceError('BAD_REQUEST', `Invalid well label in abi7500_csv: ${invalidWell.well}`, 400);
    }

    const channels = [...new Set(data.map((d) => d.channelId).filter((x): x is string => Boolean(x)))];
    return {
      assayType: 'qpcr',
      parserId: 'abi7500_csv',
      parserVersion: '0.1.0',
      data,
      channels,
      mimeType: 'text/csv',
    };
  },
};
