export type ProtocolSemanticVerb = {
  canonical: string;
  refId?: string;
  backendHints: string[];
};

type SemanticVerbShape = {
  ref?: { id?: unknown } | null;
  canonical?: unknown;
  backendHints?: unknown;
};

type LegacyVerbRefShape = {
  id?: unknown;
};

type ProtocolStepLike = {
  kind?: unknown;
  semanticVerb?: SemanticVerbShape | null;
  verbRef?: LegacyVerbRefShape | null;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
}

function normalizeCanonicalVerb(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const canonical = input.trim().toLowerCase();
  return canonical.length > 0 ? canonical : undefined;
}

export function defaultCanonicalVerbForStepKind(kind: string | undefined): string | undefined {
  return normalizeCanonicalVerb(kind);
}

export function resolveProtocolStepSemanticVerb(step: ProtocolStepLike): ProtocolSemanticVerb | null {
  const semanticVerb = step.semanticVerb ?? undefined;
  const canonical = normalizeCanonicalVerb(
    typeof semanticVerb?.canonical === 'string'
      ? semanticVerb.canonical
      : typeof step.kind === 'string'
        ? step.kind
        : undefined,
  );

  if (!canonical) return null;

  const refId = typeof semanticVerb?.ref?.id === 'string'
    ? semanticVerb.ref.id
    : typeof step.verbRef?.id === 'string'
      ? step.verbRef.id
      : undefined;

  return {
    canonical,
    ...(refId ? { refId } : {}),
    backendHints: asStringArray(semanticVerb?.backendHints),
  };
}
