import type { Derivation, DerivationResult } from './types.js';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function extractSolventId(input: Record<string, unknown>): string | null {
  const solventVal = input['solvent'];
  if (typeof solventVal === 'string' && solventVal.length > 0) {
    return solventVal;
  }
  if (typeof solventVal === 'object' && solventVal !== null) {
    const sv = solventVal as Record<string, unknown>;
    if (typeof sv.id === 'string' && sv.id.length > 0) {
      return sv.id;
    }
  }

  const solventRefVal = input['solventRef'];
  if (typeof solventRefVal === 'string' && solventRefVal.length > 0) {
    return solventRefVal;
  }
  if (typeof solventRefVal === 'object' && solventRefVal !== null) {
    const sr = solventRefVal as Record<string, unknown>;
    if (typeof sr.id === 'string' && sr.id.length > 0) {
      return sr.id;
    }
  }

  return null;
}

function extractAnalyteId(item: Record<string, unknown>): string | null {
  const analyte = item['analyte'];
  if (typeof analyte === 'string' && analyte.length > 0) {
    return analyte;
  }
  if (typeof analyte === 'object' && analyte !== null) {
    const a = analyte as Record<string, unknown>;
    if (typeof a.id === 'string' && a.id.length > 0) {
      return a.id;
    }
  }
  return null;
}

function collectActives(input: Record<string, unknown>): string[] {
  const actives: string[] = [];

  // Walk ingredients array
  const ingredients = input['ingredients'];
  if (Array.isArray(ingredients)) {
    for (const item of ingredients) {
      if (typeof item === 'string' && item.length > 0) {
        actives.push(item);
      } else if (isObject(item)) {
        // Named-material boundary: item has its own id
        if (typeof item.id === 'string' && item.id.length > 0) {
          actives.push(item.id);
        } else {
          // Extract analyte from ingredient
          const aid = extractAnalyteId(item);
          if (aid) {
            actives.push(aid);
          }
        }
      }
    }
  }

  // Single-active formulation shape: input.analyte
  if (!actives.length) {
    const analyte = input['analyte'];
    if (typeof analyte === 'string' && analyte.length > 0) {
      actives.push(analyte);
    } else if (typeof analyte === 'object' && analyte !== null) {
      const a = analyte as Record<string, unknown>;
      if (typeof a.id === 'string' && a.id.length > 0) {
        actives.push(a.id);
      }
    }
  }

  // input.actives array of strings or {id} objects
  if (!actives.length) {
    const activesArr = input['actives'];
    if (Array.isArray(activesArr)) {
      for (const item of activesArr) {
        if (typeof item === 'string' && item.length > 0) {
          actives.push(item);
        } else if (isObject(item) && typeof item.id === 'string' && item.id.length > 0) {
          actives.push(item.id);
        }
      }
    }
  }

  return actives;
}

const activeIngredients: Derivation = (input) => {
  if (!isObject(input)) {
    return { ok: false, reason: 'expected object input' };
  }

  const obj = input as Record<string, unknown>;

  // Named-material boundary: if the formulation itself has an id, stop here.
  const topId = obj['id'];
  if (typeof topId === 'string' && topId.length > 0) {
    return { ok: true, value: [topId] };
  }

  // Walk the formulation for actives.
  const actives = collectActives(obj);

  if (actives.length === 0) {
    // Pure-vehicle case
    const solventId = extractSolventId(obj);
    if (solventId) {
      return { ok: true, value: [`vehicle:${solventId}`] };
    }
    return { ok: false, reason: 'no actives and no solvent found' };
  }

  // Sort and dedup
  const deduped = Array.from(new Set(actives));
  deduped.sort();
  return { ok: true, value: deduped };
};

export default activeIngredients;
