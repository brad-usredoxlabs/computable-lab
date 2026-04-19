/**
 * Unit algebra and conversion table for derivation engine.
 * 
 * Units are represented as {base, scale, offset} where:
 * - base: Record of dimension names to their integer powers (e.g., {m: 1, s: -1} for m/s)
 * - scale: Numeric scale factor to SI base units
 * - offset: Optional offset for temperature conversions (only used by °C → K)
 */

export interface Unit {
  base: Readonly<Record<string, number>>;   // e.g. {m: 1, s: -1}  = m/s
  scale: number;                             // scale to SI base units
  offset?: number;                           // only used by temperature (K)
}

export interface DimensionsEqualResult { 
  ok: boolean; 
  reason?: string 
}

/**
 * Fixed conversion table covering common lab units.
 * All units are expressed in terms of SI base dimensions.
 */
const UNIT_TABLE: Record<string, Unit> = {
  // Length
  'm':   { base: { m: 1 }, scale: 1 },
  'cm':  { base: { m: 1 }, scale: 0.01 },
  'mm':  { base: { m: 1 }, scale: 0.001 },
  'µm':  { base: { m: 1 }, scale: 1e-6 },
  'nm':  { base: { m: 1 }, scale: 1e-9 },
  
  // Volume (L = liter = 10^-3 m^3)
  'L':   { base: { m: 3 }, scale: 0.001 },
  'mL':  { base: { m: 3 }, scale: 1e-6 },
  'µL':  { base: { m: 3 }, scale: 1e-9 },
  'nL':  { base: { m: 3 }, scale: 1e-12 },
  
  // Mass
  'kg':  { base: { kg: 1 }, scale: 1 },
  'g':   { base: { kg: 1 }, scale: 1e-3 },
  'mg':  { base: { kg: 1 }, scale: 1e-6 },
  'µg':  { base: { kg: 1 }, scale: 1e-9 },
  'ng':  { base: { kg: 1 }, scale: 1e-12 },
  
  // Amount of substance
  'mol': { base: { mol: 1 }, scale: 1 },
  
  // Time
  's':   { base: { s: 1 }, scale: 1 },
  'min': { base: { s: 1 }, scale: 60 },
  'h':   { base: { s: 1 }, scale: 3600 },
  
  // Temperature
  'K':   { base: { K: 1 }, scale: 1 },
  '°C':  { base: { K: 1 }, scale: 1, offset: 273.15 },
  
  // Concentration (mol per volume)
  'M':   { base: { mol: 1, m: -3 }, scale: 1000 },   // mol/L = 1000 mol/m^3
  'mM':  { base: { mol: 1, m: -3 }, scale: 1 },
  'µM':  { base: { mol: 1, m: -3 }, scale: 1e-3 },
  'nM':  { base: { mol: 1, m: -3 }, scale: 1e-6 },
  'pM':  { base: { mol: 1, m: -3 }, scale: 1e-9 },
};

/**
 * Parse a unit string into a canonical Unit representation.
 * 
 * Accepts:
 * - Primitives: 'm', 's', 'kg', 'mol', 'L', 'g', 'K', etc.
 * - Prefixes: m, µ, n, p, k, M (when combined with base units)
 * - Ratios: 'mol/L', 'mg/mL'
 * - Products: 'mg*mL', 'm*s'
 * - Powers: 'm^2', 's^-1'
 * - Named lab units: 'M' (molar), 'nM', 'µM', '°C', 'min', 'h'
 * 
 * @param s - The unit string to parse
 * @returns A canonical Unit representation
 * @throws Error('unknown unit: <s>') if the unit is not recognized
 */
export function parseUnit(s: string): Unit {
  const trimmed = s.trim();
  
  // Check if it's a simple unit in the table
  if (UNIT_TABLE[trimmed]) {
    return UNIT_TABLE[trimmed];
  }
  
  // Handle division (ratios) - split on '/'
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length !== 2) {
      throw new Error(`unknown unit: ${s}`);
    }
    const numeratorStr = parts[0];
    const denominatorStr = parts[1];
    if (numeratorStr === undefined || denominatorStr === undefined) {
      throw new Error(`unknown unit: ${s}`);
    }
    const numerator = parseUnit(numeratorStr.trim());
    const denominator = parseUnit(denominatorStr.trim());
    return divideUnits(numerator, denominator);
  }
  
  // Handle multiplication - split on '*'
  if (trimmed.includes('*')) {
    const parts = trimmed.split('*');
    const nonEmptyParts: string[] = [];
    for (const part of parts) {
      const trimmedPart = part.trim();
      if (trimmedPart !== '') {
        nonEmptyParts.push(trimmedPart);
      }
    }
    if (nonEmptyParts.length === 0) {
      throw new Error(`unknown unit: ${s}`);
    }
    let result: Unit = parseUnit(nonEmptyParts[0]!);
    for (let i = 1; i < nonEmptyParts.length; i++) {
      const part = nonEmptyParts[i];
      if (part === undefined) continue;
      result = multiplyUnits(result, parseUnit(part));
    }
    return result;
  }
  
  // Handle powers - look for '^'
  if (trimmed.includes('^')) {
    const idx = trimmed.indexOf('^');
    const baseUnit = trimmed.substring(0, idx);
    const powerStr = trimmed.substring(idx + 1);
    const power = parseFloat(powerStr);
    if (isNaN(power)) {
      throw new Error(`unknown unit: ${s}`);
    }
    return powerUnit(parseUnit(baseUnit), power);
  }
  
  // Try to parse as prefixed unit (e.g., 'km', 'mg', 'µL')
  const prefixed = tryParsePrefixedUnit(trimmed);
  if (prefixed) {
    return prefixed;
  }
  
  throw new Error(`unknown unit: ${s}`);
}

/**
 * Try to parse a prefixed unit like 'km', 'mg', 'µL', 'nm', etc.
 * Returns null if not a valid prefixed unit.
 */
function tryParsePrefixedUnit(s: string): Unit | null {
  // Prefix multipliers
  const prefixes: Record<string, number> = {
    'k': 1e3,
    'h': 1e2,
    'da': 1e1,
    'd': 1e-1,
    'c': 1e-2,
    'm': 1e-3,
    'µ': 1e-6,
    'n': 1e-9,
    'p': 1e-12,
  };
  
  // Base units that can be prefixed
  const baseUnits: Record<string, Unit> = {
    'm': { base: { m: 1 }, scale: 1 },
    'g': { base: { kg: 1 }, scale: 1e-3 },
    'L': { base: { m: 3 }, scale: 0.001 },
    's': { base: { s: 1 }, scale: 1 },
    'mol': { base: { mol: 1 }, scale: 1 },
  };
  
  // Try to match prefix + base
  for (const [prefix, mult] of Object.entries(prefixes)) {
    if (s.startsWith(prefix)) {
      const baseName = s.substring(prefix.length);
      if (baseUnits[baseName]) {
        const base = baseUnits[baseName];
        return {
          base: { ...base.base },
          scale: base.scale * mult,
        };
      }
    }
  }
  
  return null;
}

/**
 * Multiply two units together.
 * Base powers are summed, scales are multiplied, offset is cleared.
 */
export function multiplyUnits(a: Unit, b: Unit): Unit {
  const base: Record<string, number> = { ...a.base };
  
  for (const [dim, power] of Object.entries(b.base)) {
    base[dim] = (base[dim] || 0) + power;
  }
  
  return {
    base: base as Readonly<Record<string, number>>,
    scale: a.scale * b.scale,
  };
}

/**
 * Divide two units.
 * Base powers are subtracted (a - b), scales are divided, offset is cleared.
 */
export function divideUnits(a: Unit, b: Unit): Unit {
  const base: Record<string, number> = { ...a.base };
  
  for (const [dim, power] of Object.entries(b.base)) {
    base[dim] = (base[dim] || 0) - power;
  }
  
  return {
    base: base as Readonly<Record<string, number>>,
    scale: a.scale / b.scale,
  };
}

/**
 * Raise a unit to a power.
 * Base powers are multiplied by n, scale is raised to n, offset is cleared.
 */
export function powerUnit(u: Unit, n: number): Unit {
  const base: Record<string, number> = {};
  
  for (const [dim, power] of Object.entries(u.base)) {
    base[dim] = power * n;
  }
  
  return {
    base: base as Readonly<Record<string, number>>,
    scale: Math.pow(u.scale, n),
  };
}

/**
 * Check if two units are equal.
 * All base powers must be equal, scales must be equal within 1e-12 relative tolerance,
 * and offsets must be equal.
 */
export function unitsEqual(a: Unit, b: Unit): boolean {
  // Check base dimensions
  const allDims = new Set([...Object.keys(a.base), ...Object.keys(b.base)]);
  for (const dim of allDims) {
    const aVal = a.base[dim] || 0;
    const bVal = b.base[dim] || 0;
    if (aVal !== bVal) {
      return false;
    }
  }
  
  // Check scale with relative tolerance
  const relTol = 1e-12;
  const scaleDiff = Math.abs(a.scale - b.scale);
  const maxScale = Math.max(Math.abs(a.scale), Math.abs(b.scale), 1);
  if (scaleDiff / maxScale > relTol) {
    return false;
  }
  
  // Check offset
  if (a.offset !== b.offset) {
    return false;
  }
  
  return true;
}

/**
 * Check if two units have the same dimensions (ignoring scale and offset).
 * Returns an object with ok flag and optional reason string.
 */
export function dimensionsEqual(a: Unit, b: Unit): DimensionsEqualResult {
  const allDims = new Set([...Object.keys(a.base), ...Object.keys(b.base)]);
  
  for (const dim of allDims) {
    const aVal = a.base[dim] || 0;
    const bVal = b.base[dim] || 0;
    if (aVal !== bVal) {
      return { ok: false, reason: `dimension mismatch: ${dim} has power ${aVal} vs ${bVal}` };
    }
  }
  
  return { ok: true };
}

/**
 * Convert a value from one unit to another.
 * 
 * If dimensions don't match, throws an error with the reason.
 * Temperature conversions with offsets are handled specially:
 * - Converting from °C to K: value + from.offset
 * - Converting from K to °C: value - to.offset
 * - Converting between two offset units: (value + from.offset) - to.offset
 * 
 * @param value - The numeric value to convert
 * @param fromUnit - The source unit
 * @param toUnit - The target unit
 * @returns The converted value
 * @throws Error if dimensions don't match
 */
export function convertTo(value: number, fromUnit: Unit, toUnit: Unit): number {
  const dimCheck = dimensionsEqual(fromUnit, toUnit);
  if (!dimCheck.ok) {
    throw new Error(`cannot convert: ${dimCheck.reason}`);
  }
  
  // Handle temperature offset conversions
  if (fromUnit.offset !== undefined && toUnit.offset !== undefined) {
    // Both have offsets: convert via SI (K)
    const inSI = value + fromUnit.offset;
    return inSI - toUnit.offset;
  } else if (fromUnit.offset !== undefined) {
    // Converting from offset unit to non-offset (e.g., °C to K without offset)
    return (value + fromUnit.offset) * (fromUnit.scale / toUnit.scale);
  } else if (toUnit.offset !== undefined) {
    // Converting to offset unit from non-offset (e.g., K to °C)
    return (value * (fromUnit.scale / toUnit.scale)) - toUnit.offset;
  }
  
  // Standard conversion: scale ratio
  return value * (fromUnit.scale / toUnit.scale);
}
