import type { ToolRegistry } from '../ai/ToolRegistry.js';
import type { FoundryToolAgentTool, ToolExecution } from './FoundryToolAgent.js';

export type FoundryAcquisitionJobKind =
  | 'protocol-from-document'
  | 'labware-from-spec'
  | 'material-from-source'
  | 'literature-extraction';

export const FOUNDRY_ACQUISITION_TOOL_ALLOWLISTS = {
  'literature-extraction': [
    'pubmed_search',
    'pubmed_fetch',
    'europepmc_search',
    'europepmc_citations',
    'europepmc_references',
    'ncbi_gene_search',
    'uniprot_search',
    'uniprot_fetch',
    'pdb_search',
    'pdb_fetch',
    'chebi_search',
    'chebi_fetch',
    'reactome_search',
    'reactome_pathway',
    'ontology_search',
    'record_search',
    'search_records',
    'schema_get',
    'validate_payload',
    'lint_payload',
  ],
  'protocol-from-document': [
    'web_search_exa',
    'web_get_contents_exa',
    'vendor_pdf_download',
    'vendor_pdf_extract_text',
    'vendor_protocol_extract_candidate',
    'vendor_protocol_draft_event_graph',
    'vendor_protocol_promote_event_graph',
    'vendor_document_extract',
    'record_search',
    'search_records',
    'schema_get',
    'validate_payload',
    'lint_payload',
  ],
  'labware-from-spec': [
    'web_search_exa',
    'web_get_contents_exa',
    'vendor_pdf_download',
    'vendor_pdf_extract_text',
    'labware_spec_extract_candidate',
    'labware_spec_promote_candidate',
    'opentrons_labware_generate_definition',
    'record_search',
    'search_records',
    'schema_get',
    'validate_payload',
    'lint_payload',
    'library_search',
    'platforms_list',
    'platform_get',
  ],
  'material-from-source': [
    'web_search_exa',
    'web_get_contents_exa',
    'vendor_document_extract',
    'materials_search_addable',
    'library_search',
    'ontology_search',
    'chebi_search',
    'chebi_fetch',
    'pubchem_search',
    'record_search',
    'search_records',
    'schema_get',
    'validate_payload',
    'lint_payload',
  ],
} as const satisfies Record<FoundryAcquisitionJobKind, readonly string[]>;

export function toolsForFoundryAcquisitionJob(
  registry: ToolRegistry,
  kind: FoundryAcquisitionJobKind,
): FoundryToolAgentTool[] {
  return registryTools(registry, FOUNDRY_ACQUISITION_TOOL_ALLOWLISTS[kind]);
}

export function registryTools(
  registry: ToolRegistry,
  names: readonly string[],
): FoundryToolAgentTool[] {
  return names.flatMap((name) => {
    const entry = registry.get(name);
    if (!entry) return [];
    return [{
      definition: {
        type: 'function' as const,
        function: {
          name: entry.name,
          description: entry.description,
          parameters: entry.inputSchema,
        },
      },
      handler: async (args: Record<string, unknown>): Promise<ToolExecution> => {
        const start = performance.now();
        try {
          const result = await entry.handler(args);
          const content = result.content
            .map((item) => ('text' in item ? item.text : ''))
            .join('\n');
          return {
            ok: result.isError !== true,
            content,
            durationMs: performance.now() - start,
          };
        } catch (error) {
          return {
            ok: false,
            content: `error: ${error instanceof Error ? error.message : String(error)}`,
            durationMs: performance.now() - start,
          };
        }
      },
    }];
  });
}
