import { z } from 'zod';

export const TAG_KINDS = [
  'verb',
  'noun_phrase',
  'quantity',
  'concentration',
  'well_address',
  'well_region',
  'slot_ref',
  'instrument',
  'back_reference',
  'mention',
] as const;

export type TagKind = typeof TAG_KINDS[number];

const RawTagBaseSchema = z.object({
  kind: z.enum(TAG_KINDS),
  text: z.string().min(1),
  nthOccurrence: z.number().int().positive().optional(),
});

export const RawPromptTagSchema = RawTagBaseSchema.extend({
  candidateKinds: z.array(z.string()).optional(),
  mentionKind: z.string().optional(),
  id: z.string().optional(),
  label: z.string().optional(),
});

export const RawTaggerOutputSchema = z.object({
  tags: z.array(RawPromptTagSchema).default([]),
});

export type RawPromptTag = z.infer<typeof RawPromptTagSchema>;
export type RawTaggerOutput = z.infer<typeof RawTaggerOutputSchema>;

export interface MaterializedPromptTag extends RawPromptTag {
  span: [number, number];
}

export interface MaterializedTaggerOutput {
  tags: MaterializedPromptTag[];
}
