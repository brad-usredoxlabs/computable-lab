import type { Derivation } from './types.js';
import passthrough from './passthrough.js';
import modality from './modality.js';
import substanceId from './substance_id.js';
import programId from './program_id.js';
import labwareRole from './labware_role.js';
import solvent from './solvent.js';
import activeIngredients from './active_ingredients.js';

export const derivations: Record<string, Derivation> = {
  passthrough,
  modality,
  substance_id: substanceId,
  program_id: programId,
  labware_role: labwareRole,
  solvent,
  active_ingredients: activeIngredients,
};

export type { Derivation, DerivationResult } from './types.js';
