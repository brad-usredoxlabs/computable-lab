/**
 * Canonical-term spine — barrel export.
 */
export { TERM_SCHEMA_ID, ensureTermForLabel } from './EnsureTerm.js';
export type { EnsureTermOptions, TermKind, TermLinkout } from './EnsureTerm.js';
export { normalizeAlias, aliasesEquivalent } from './alias.js';
export {
  migrateConceptToTerms,
  repointRoleRefs,
  migrateRootsToTerms,
  CONCEPT_KIND_TO_TERM,
} from './MigrateTerms.js';
export type { MigrationResult } from './MigrateTerms.js';