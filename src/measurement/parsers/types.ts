export type MeasurementRow = {
  well: string;
  metric: string;
  value: number;
  channelId?: string;
  unit?: string;
};

export type MeasurementParseResult = {
  assayType: 'qpcr' | 'plate_reader' | 'microscopy' | 'gc_ms' | 'flow' | 'other';
  parserId: string;
  parserVersion: string;
  data: MeasurementRow[];
  channels: string[];
  mimeType: string;
};

export type MeasurementParser = {
  parserId: string;
  aliases?: string[];
  parse: (content: string) => MeasurementParseResult;
};
