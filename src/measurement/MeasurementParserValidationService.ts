import type { AppContext } from '../server.js';
import { ParserRegistry } from './parsers/ParserRegistry.js';
import { MeasurementServiceError } from './MeasurementService.js';

export class MeasurementParserValidationService {
  private readonly ctx: AppContext;
  private readonly parsers: ParserRegistry;

  constructor(ctx: AppContext, parsers?: ParserRegistry) {
    this.ctx = ctx;
    this.parsers = parsers ?? new ParserRegistry();
  }

  async validate(input: { parserId: string; path: string }): Promise<Record<string, unknown>> {
    const parser = this.parsers.resolve(input.parserId);
    const file = await this.ctx.repoAdapter.getFile(input.path);
    if (!file) {
      throw new MeasurementServiceError('NOT_FOUND', `Raw data file not found: ${input.path}`, 404);
    }
    const parsed = parser.parse(file.content);
    return {
      parserId: parsed.parserId,
      parserVersion: parsed.parserVersion,
      assayType: parsed.assayType,
      path: input.path,
      rows: parsed.data.length,
      channels: parsed.channels,
      preview: parsed.data.slice(0, 5),
    };
  }
}
