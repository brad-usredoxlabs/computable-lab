/**
 * Ontology domain mappings for computable-lab.
 * 
 * Maps semantic domains (chemicals, cell types, etc.) to their primary ontologies
 * and OLS query configurations.
 */

/**
 * Specialty provider identifiers for non-OLS sources
 */
export type SpecialtyProvider = 'uniprot' | 'reactome' | 'ncbi_taxon'

/**
 * Configuration for an ontology domain
 */
export interface OntologyDomainConfig {
  /** Primary ontology identifier (lowercase, OLS-compatible) */
  primary: string
  /** Human-readable label for the domain */
  label: string
  /** OLS ontology names to search */
  olsOntologies?: string[]
  /** Non-OLS specialty provider */
  specialtyProvider?: SpecialtyProvider
  /** Additional OLS query options */
  olsQueryOpts?: {
    queryFields?: string
    type?: string
  }
  /** Example terms for documentation/testing */
  examples?: Array<{
    id: string
    label: string
  }>
}

/**
 * Canonical "one ontology per domain" mapping.
 * 
 * This defines which ontology to use for each semantic domain in computable-lab.
 */
export const ONTOLOGY_DOMAINS = {
  /**
   * Chemicals, metabolites, small molecules, reagents.
   * Use ChEBI for chemical entities.
   */
  chemical: {
    primary: 'chebi',
    label: 'Chemicals & Metabolites',
    olsOntologies: ['chebi'],
    examples: [
      { id: 'CHEBI:16236', label: 'ethanol' },
      { id: 'CHEBI:17855', label: 'triglyceride' },
      { id: 'CHEBI:27432', label: 'oleic acid' },
    ],
  },

  /**
   * Cell types including many "cell line-like" concepts.
   * Use CL (Cell Ontology) for cell type identity.
   */
  cellType: {
    primary: 'cl',
    label: 'Cell Types',
    olsOntologies: ['cl'],
    examples: [
      { id: 'CL:0000182', label: 'hepatocyte' },
      { id: 'CL:0000057', label: 'fibroblast' },
      { id: 'CL:0002322', label: 'embryonic stem cell' },
    ],
  },

  /**
   * Tissues, organs, and anatomical structures.
   * Use Uberon for cross-species anatomy.
   */
  tissue: {
    primary: 'uberon',
    label: 'Tissues & Anatomy',
    olsOntologies: ['uberon'],
    examples: [
      { id: 'UBERON:0002107', label: 'liver' },
      { id: 'UBERON:0001134', label: 'skeletal muscle' },
      { id: 'UBERON:0001264', label: 'pancreas' },
    ],
  },

  /**
   * Cellular components (organelles, structures).
   * Use GO-CC (Gene Ontology: Cellular Component).
   */
  cellularComponent: {
    primary: 'go',
    label: 'Cellular Components',
    olsOntologies: ['go'],
    olsQueryOpts: {
      queryFields: 'label,synonym',
      type: 'class',
    },
    examples: [
      { id: 'GO:0005739', label: 'mitochondrion' },
      { id: 'GO:0005634', label: 'nucleus' },
      { id: 'GO:0005783', label: 'endoplasmic reticulum' },
    ],
  },

  /**
   * Experimental processes, actions, assays, and some labware concepts.
   * Use OBI (Ontology for Biomedical Investigations).
   */
  experimentalAction: {
    primary: 'obi',
    label: 'Experimental Actions',
    olsOntologies: ['obi'],
    examples: [
      { id: 'OBI:0302893', label: 'incubation' },
      { id: 'OBI:0600042', label: 'pipetting' },
      { id: 'OBI:0000070', label: 'assay' },
    ],
  },

  /**
   * Units of measurement.
   * Use UO (Units Ontology).
   */
  unit: {
    primary: 'uo',
    label: 'Units',
    olsOntologies: ['uo'],
    examples: [
      { id: 'UO:0000101', label: 'microliter' },
      { id: 'UO:0000027', label: 'degree Celsius' },
      { id: 'UO:0000010', label: 'second' },
    ],
  },

  /**
   * Species and organism taxonomy.
   * Use NCBI Taxonomy (specialty provider, OLS coverage is inconsistent).
   */
  species: {
    primary: 'ncbitaxon',
    label: 'Species',
    specialtyProvider: 'ncbi_taxon',
    olsOntologies: ['ncbitaxon'], // Can fall back to OLS
    examples: [
      { id: 'NCBITaxon:9606', label: 'Homo sapiens' },
      { id: 'NCBITaxon:10090', label: 'Mus musculus' },
      { id: 'NCBITaxon:10116', label: 'Rattus norvegicus' },
    ],
  },

  /**
   * Proteins and enzymes.
   * Use UniProt for stable protein identifiers.
   */
  protein: {
    primary: 'uniprot',
    label: 'Proteins & Enzymes',
    specialtyProvider: 'uniprot',
    examples: [
      { id: 'UniProt:P04637', label: 'Cellular tumor antigen p53' },
      { id: 'UniProt:P00533', label: 'Epidermal growth factor receptor' },
    ],
  },

  /**
   * Biological pathways and reaction networks.
   * Use Reactome for pathway identifiers.
   */
  pathway: {
    primary: 'reactome',
    label: 'Pathways',
    specialtyProvider: 'reactome',
    examples: [
      { id: 'R-HSA-1430728', label: 'Metabolism' },
      { id: 'R-HSA-556833', label: 'Metabolism of lipids' },
    ],
  },

  /**
   * Biological processes (optional, for claims/annotations).
   * Use GO-BP (Gene Ontology: Biological Process).
   */
  biologicalProcess: {
    primary: 'go',
    label: 'Biological Processes',
    olsOntologies: ['go'],
    olsQueryOpts: {
      queryFields: 'label,synonym',
      type: 'class',
    },
    examples: [
      { id: 'GO:0006915', label: 'apoptotic process' },
      { id: 'GO:0007049', label: 'cell cycle' },
    ],
  },

  /**
   * Disease ontology (for context/claims).
   * Use MONDO or DO.
   */
  disease: {
    primary: 'mondo',
    label: 'Diseases',
    olsOntologies: ['mondo'],
    examples: [
      { id: 'MONDO:0004992', label: 'cancer' },
      { id: 'MONDO:0005015', label: 'diabetes mellitus' },
    ],
  },
} as const satisfies Record<string, OntologyDomainConfig>

/**
 * Type for ontology domain keys
 */
export type OntologyDomain = keyof typeof ONTOLOGY_DOMAINS

/**
 * Get domain config by key
 */
export function getOntologyDomainConfig(domain: OntologyDomain): OntologyDomainConfig {
  return ONTOLOGY_DOMAINS[domain]
}

/**
 * Get all OLS ontology names used across all domains
 */
export function getAllOLSOntologies(): string[] {
  const ontologies = new Set<string>()
  for (const config of Object.values(ONTOLOGY_DOMAINS)) {
    const olsOntologies = (config as OntologyDomainConfig).olsOntologies
    if (olsOntologies) {
      for (const ont of olsOntologies) {
        ontologies.add(ont)
      }
    }
  }
  return Array.from(ontologies)
}

/**
 * Find domain(s) that use a given namespace
 */
export function findDomainsByNamespace(namespace: string): OntologyDomain[] {
  const ns = namespace.toLowerCase()
  const domains: OntologyDomain[] = []
  
  for (const [key, config] of Object.entries(ONTOLOGY_DOMAINS)) {
    const cfg = config as OntologyDomainConfig
    if (cfg.primary === ns) {
      domains.push(key as OntologyDomain)
    } else if (cfg.olsOntologies?.includes(ns)) {
      domains.push(key as OntologyDomain)
    }
  }
  
  return domains
}
