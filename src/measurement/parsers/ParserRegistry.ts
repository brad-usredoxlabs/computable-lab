import { MeasurementServiceError } from '../MeasurementService.js';
import { abi7500CsvParser } from './abi7500CsvParser.js';
import { agilent6890CsvStubParser } from './agilent6890Parser.js';
import { geminiCsvParser } from './geminiCsvParser.js';
import { genericCsvParser } from './genericCsvParser.js';
import { metrohm761CsvStubParser } from './metrohm761Parser.js';
import type { MeasurementParser } from './types.js';

const PARSERS: MeasurementParser[] = [
  genericCsvParser,
  geminiCsvParser,
  abi7500CsvParser,
  agilent6890CsvStubParser,
  metrohm761CsvStubParser,
];

export class ParserRegistry {
  private readonly byId = new Map<string, MeasurementParser>();

  constructor() {
    for (const parser of PARSERS) {
      this.byId.set(parser.parserId, parser);
      for (const alias of parser.aliases ?? []) {
        this.byId.set(alias, parser);
      }
    }
  }

  resolve(parserId: string): MeasurementParser {
    const parser = this.byId.get(parserId);
    if (!parser) {
      throw new MeasurementServiceError('BAD_REQUEST', `Unknown parserId: ${parserId}`, 400);
    }
    return parser;
  }

  list(): Array<{ parserId: string; aliases: string[] }> {
    return PARSERS.map((parser) => ({
      parserId: parser.parserId,
      aliases: parser.aliases ?? [],
    }));
  }
}
