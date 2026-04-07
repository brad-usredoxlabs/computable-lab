/**
 * Bio-source types for literature & database search.
 */

export type BioSourceId =
  | 'pubmed'
  | 'europepmc'
  | 'uniprot'
  | 'pdb'
  | 'chebi'
  | 'reactome'
  | 'ncbi_gene'

export interface BioSourceConfig {
  id: BioSourceId
  label: string
  color: string
  placeholder: string
  fetchable: boolean
}

export const BIO_SOURCES: BioSourceConfig[] = [
  { id: 'pubmed', label: 'PubMed', color: '#1971c2', placeholder: 'Search biomedical literature...', fetchable: true },
  { id: 'europepmc', label: 'Papers & Preprints', color: '#5f3dc4', placeholder: 'Search papers, preprints, patents...', fetchable: false },
  { id: 'uniprot', label: 'UniProt', color: '#2b8a3e', placeholder: 'Search proteins...', fetchable: true },
  { id: 'pdb', label: 'PDB', color: '#e67700', placeholder: 'Search structures...', fetchable: true },
  { id: 'chebi', label: 'ChEBI', color: '#c92a2a', placeholder: 'Search compounds...', fetchable: true },
  { id: 'reactome', label: 'Reactome', color: '#0b7285', placeholder: 'Search pathways...', fetchable: true },
  { id: 'ncbi_gene', label: 'NCBI Gene', color: '#364fc7', placeholder: 'Search genes...', fetchable: false },
]

export interface BioSourceResult {
  source: BioSourceId
  sourceId: string
  title: string
  subtitle?: string
  description?: string
  date?: string
  url?: string
  badges?: Array<{ label: string; color: string }>
  raw: Record<string, unknown>
}
