export type DerivationResult =
  | { ok: true; value: string | string[] }
  | { ok: false; reason: string };

export type Derivation = (input: unknown) => DerivationResult;
