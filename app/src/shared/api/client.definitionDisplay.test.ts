/**
 * L2-P1-RETURN-LEG-1 u5advcfix (F3): the REAL apiClient.getLabwareDefinitionDisplay
 * is pinned to its seam contract. Both consumer suites (ProposedGraphModal,
 * useAiChat) re-implement the method inside `vi.mock` factories, so a mutant
 * real method (`if (definitionId) return definitionId`) stays green in both.
 * This file imports the REAL apiClient and stubs ONLY the transport —
 * `vi.spyOn(apiClient, 'listRecordsByKind')` resolving with a record shaped
 * like records/seed/labware-definition/lbw-def-generic-96-well-plate.yaml
 * (payload.id + payload.display_name). No DOM needed (jsdom is the app
 * workspace default; the import only reads localStorage via base.ts).
 *
 * Seam contract (a name is never invented — the id itself is the fallback):
 *   1. a hit resolves to the record's display_name;
 *   2. a miss (no record carries the id) resolves to the definitionId itself;
 *   3. an empty display_name resolves to the definitionId itself.
 *
 * RED (mutant evidence): with `if (definitionId) return definitionId` applied
 * to the real method, leg 1 fails (id returned where the stored name is
 * expected) — the mutant is caught by this file alone.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import type { RecordEnvelope } from '../../types/kernel'

const DEFINITION_ID = 'generic/96_well_plate@v1'

/** A labware-definition record shaped like the seed record (payload.id + payload.display_name). */
function plateRecord(displayName: string | undefined): RecordEnvelope {
  return {
    recordId: 'lbw-def-generic-96-well-plate',
    schemaId: 'labware-definition',
    payload: {
      id: DEFINITION_ID,
      ...(displayName === undefined ? {} : { display_name: displayName }),
    },
  }
}

describe('apiClient.getLabwareDefinitionDisplay — the REAL seam, transport-stubbed only (u5advcfix F3)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('a hit resolves to the record store display_name (the single authority, read through listRecordsByKind)', async () => {
    const listRecordsByKind = vi
      .spyOn(apiClient, 'listRecordsByKind')
      .mockResolvedValue({ records: [plateRecord('Generic 96-Well Plate')], total: 1 })
    const display = await apiClient.getLabwareDefinitionDisplay(DEFINITION_ID)
    expect(display).toBe('Generic 96-Well Plate')
    // Transport is the ONE stub: the method reads the labware-definition kind.
    expect(listRecordsByKind).toHaveBeenCalledWith('labware-definition', 200)
  })

  it('a miss (no record carries the id) resolves to the definitionId itself — never a fabricated name', async () => {
    vi.spyOn(apiClient, 'listRecordsByKind').mockResolvedValue({ records: [], total: 0 })
    await expect(apiClient.getLabwareDefinitionDisplay('vendor/unknown_plate@v9')).resolves.toBe('vendor/unknown_plate@v9')
  })

  it('an empty display_name resolves to the definitionId itself (present-but-empty is not a name)', async () => {
    vi.spyOn(apiClient, 'listRecordsByKind').mockResolvedValue({ records: [plateRecord('')], total: 1 })
    await expect(apiClient.getLabwareDefinitionDisplay(DEFINITION_ID)).resolves.toBe(DEFINITION_ID)
  })
})
