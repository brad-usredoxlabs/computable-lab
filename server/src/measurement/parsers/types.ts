export type MeasurementRow = {
  well: string;
  metric: string;
  value: number;
  channelId?: string;
  unit?: string;
  timeMin?: number;
};

export type MeasurementParseResult = {
  assayType: 'qpcr' | 'plate_reader' | 'microscopy' | 'gc_fid' | 'gc_ms' | 'flow' | 'other';
  parserId: string;
  parserVersion: string;
  data: MeasurementRow[];
  channels: string[];
  mimeType: string;
  units?: { time: string; intensity: string };
  metadata?: Record<string, string>;
  // Full ordinate series of the chromatogram channel (present when the file
  // carries one — the AIA/ANDI .cdf 'ordinate_values' variable). Values are in
  // file order; the time of point i is i * samplingIntervalSeconds (uniform
  // sampling grid).
  trace?: {
    channelId: string;
    samplingIntervalSeconds: number;
    values: number[];
    timeUnit: string;
    intensityUnit: string;
  };
};

export type MeasurementParser = {
  parserId: string;
  aliases?: string[];
  parse: (content: string) => MeasurementParseResult;
};
