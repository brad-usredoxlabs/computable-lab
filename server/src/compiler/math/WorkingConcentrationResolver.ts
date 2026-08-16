/**
 * WorkingConcentrationResolver — pure math for the concentration-first quantity model.
 *
 * The north star of a recipe is the FINAL working concentration of a material in the
 * assay well (e.g. fenofibrate 10 nM), not the stock strength, volume, or ratio.
 * Given the target (C_target), the stock concentration (C_stock, from
 * material-spec.formulation.concentration at the lab/run binding), the per-well
 * volume (deck layer), and the run's sample count, this resolver derives:
 *
 *   V_stock   = V_well × C_target / C_stock     (C1V1 = C2V2)
 *   V_diluent = V_well − V_stock
 *   batch     = per-well stock volume × sampleCount (+ dead volume at deck layer)
 *
 * Scale and stock strength are free knobs; the target working concentration is the
 * lock. Ratio is advisory (mechanism), never the invariant — this module does not
 * read it. Always additive to legacy absolute-volume steps.
 */

import { parseConcentration, type Concentration } from '../../materials/concentration.js';

/** Units for molar basis. */
const MOLAR_UNITS = ['M', 'mM', 'uM', 'nM', 'pM', 'fM'] as const;
/** Units for mass-per-volume basis. */
const MPV_UNITS = ['g/L', 'mg/mL', 'ug/mL', 'ng/mL'] as const;
/** Units for activity-per-volume basis. */
const ACT_UNITS = ['U/mL', 'U/uL'] as const;
/** Units for count-per-volume basis. */
const CNT_UNITS = ['cells/mL', 'cells/uL'] as const;

/**
 * Reduce any concentration to a dimensionless "amount per L" scale so two
 * same-basis concentrations can be ratioed. Molar → mol/L, mass → g/L,
 * activity → U/L, count → cells/L, fraction → fraction (0-1).
 */
function toBasePerLiter(conc: Concentration): number | undefined {
  const { value, unit, basis } = conc;
  // Normalize a percent unit to its basis-implied fraction.
  if (basis === 'volume_fraction' || basis === 'mass_fraction') {
    // Percent (% v/v / % w/v) carries value as a percentage (e.g. 5 = 5% = 0.05).
    if (unit === '% v/v' || unit === '% w/v') return value / 100;
    // A plain 0-1 fraction unit.
    return value;
  }
  switch (basis) {
    case 'molar':
      switch (unit) {
        case 'M': return value;
        case 'mM': return value * 1e-3;
        case 'uM': return value * 1e-6;
        case 'nM': return value * 1e-9;
        case 'pM': return value * 1e-12;
        case 'fM': return value * 1e-15;
        default: return undefined;
      }
    case 'mass_per_volume':
      switch (unit) {
        case 'g/L': return value;
        case 'mg/mL': return value; // mg/mL ≡ g/L
        case 'ug/mL': return value * 1e-3;
        case 'ng/mL': return value * 1e-6;
        default: return undefined;
      }
    case 'activity_per_volume':
      switch (unit) {
        case 'U/mL': return value * 1e3; // U/L
        case 'U/uL': return value * 1e6;
        default: return undefined;
      }
    case 'count_per_volume':
      switch (unit) {
        case 'cells/mL': return value * 1e3;
        case 'cells/uL': return value * 1e6;
        default: return undefined;
      }
    default:
      return undefined;
  }
}

/**
 * An input/working concentration that failed to parse or whose unit is not in the
 * schema's enum is reported as a block (gap), never silently resolved.
 */
export interface ConcentrationBlock {
  ok: false;
  gap: string;
}

export interface WorkingConcentrationResult {
  ok: true;
  /** Volume of stock to dispense into one well (uL). */
  vStockUl: number;
  /** Volume of diluent/carrier to add (uL); 0 when stock occupies the full well. */
  vDiluentUl: number;
  /** Per-well active amount, in the stock's basis units (e.g. moles for molar). */
  perWellActiveAmount: number;
  /** Batch total of stock across all samples (uL), before dead volume. */
  batchStockUl: number;
  /** Ratio of stock to full well volume (C_target / C_stock); the dilution factor. */
  stockFraction: number;
}

export type WorkingConcentrationResolution =
  | ConcentrationBlock
  | WorkingConcentrationResult;

/**
 * Resolve a working concentration to concrete per-well and batch volumes.
 *
 * @param args.workingConcentration — the recipe's north star (C_target).
 * @param args.stockConcentration — stock strength from material-spec.formulation.concentration (C_stock).
 * @param args.wellVolumeUl — final well volume (deck layer / run layout).
 * @param args.sampleCount — run-wide count (e.g. from planned-run.sampleMap / execution-scale-plan).
 * @param args.deadVolumeUl — optional per-run pipette/platform dead volume added to the batch total.
 */
export function resolveWorkingConcentration(args: {
  workingConcentration: unknown;
  stockConcentration: unknown;
  wellVolumeUl: number;
  sampleCount: number;
  deadVolumeUl?: number;
}): WorkingConcentrationResolution {
  const target = parseConcentration(args.workingConcentration);
  const stock = parseConcentration(args.stockConcentration);

  if (!target) {
    return { ok: false, gap: 'working_concentration is not a valid concentration value.' };
  }
  if (!stock) {
    return { ok: false, gap: 'No resolvable stock concentration for this material (material-spec.formulation.concentration).' };
  }
  if (target.basis !== stock.basis) {
    return {
      ok: false,
      gap: `Working concentration basis (${target.basis}) does not match stock basis (${stock.basis}).`,
    };
  }
  if (!(args.wellVolumeUl > 0)) {
    return { ok: false, gap: 'wellVolumeUl must be > 0.' };
  }
  if (!(args.sampleCount >= 1) || !Number.isInteger(args.sampleCount)) {
    return { ok: false, gap: `sampleCount must be a positive integer (got ${args.sampleCount}).` };
  }

  const targetBase = toBasePerLiter(target);
  const stockBase = toBasePerLiter(stock);
  if (targetBase === undefined || stockBase === undefined || stockBase === 0) {
    return { ok: false, gap: 'Could not reduce working/stock concentration to a comparable scale.' };
  }

  // V_stock = V_well × C_target / C_stock
  const stockFraction = targetBase / stockBase;
  // Sanity: a working concentration must not exceed the stock (can't dilute "up").
  if (stockFraction > 1.000001) {
    return {
      ok: false,
      gap: `Working concentration (${String(args.workingConcentration)} >= stock) — cannot concentrate by dilution.`,
    };
  }

  const vStockUl = args.wellVolumeUl * stockFraction;
  const vDiluentUl = Math.max(0, args.wellVolumeUl - vStockUl);
  const perWellActiveAmount = vStockUl /* uL */ * stockBase; // stock "amount/L" × volume → amount
  const dead = args.deadVolumeUl && args.deadVolumeUl > 0 ? args.deadVolumeUl : 0;
  const batchStockUl = vStockUl * args.sampleCount + dead;

  return {
    ok: true,
    // Per-well volumes can be tiny (e.g. 0.001 uL for a 10 nM target from a 1 mM
    // stock) — keep 6-decimal precision so sub-uL dispensing isn't clamped to 0.
    vStockUl: round(vStockUl, 6),
    vDiluentUl: round(vDiluentUl, 6),
    perWellActiveAmount,
    batchStockUl: round(batchStockUl, 2),
    stockFraction,
  };
}

/** Snap to a small epsilon of decimal places to avoid float noise in assertions. */
function round(n: number, decimals = 2): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

/** Convenience re-export so the schema-datatype type flows through. */
export type ConcentrationShape = Concentration;
export { MOLAR_UNITS, MPV_UNITS, ACT_UNITS, CNT_UNITS };