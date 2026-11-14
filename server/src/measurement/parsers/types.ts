export type MeasurementRow = {
  well: string;
  metric: string;
  value: number;
  channelId?: string;
  unit?: string;
  timeMin?: number;
};

export type MeasurementParseResult = {
  assayType: 'qpcr' | 'plate_reader' | 'microscopy' | 'gc_ms' | 'flow' | 'other';
  parserId: string;
  parserVersion: string;
  data: MeasurementRow[];
  channels: string[];
  mimeType: string;
  units?: { time: string; intensity: string };
  metadata?: Record<string, string>;
};

export type MeasurementParser = {
  parserId: string;
  aliases?: string[];
  parse: (content: string) => MeasurementParseResult;
};
