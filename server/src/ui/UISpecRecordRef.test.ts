import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createUISpecLoader } from './index.js'
import { projectRecord } from './EditorProjectionService.js'

const UI = (name: string) => resolve(process.cwd(), '..', 'schema', 'lab', name)

describe('record-ref widget (training-record.ui.yaml)', () => {
  it('loads without spec errors', async () => {
    const loader = createUISpecLoader()
    const content = await readFile(UI('training-record.ui.yaml'), 'utf-8')
    const res = loader.load(content, UI('training-record.ui.yaml'))
    expect(res.validationErrors ?? []).toEqual([])
    expect(res.success).toBe(true)
  })

  it('projects the three ref slots as record-ref with their record kinds', async () => {
    const loader = createUISpecLoader()
    const content = await readFile(UI('training-record.ui.yaml'), 'utf-8')
    const res = loader.load(content, UI('training-record.ui.yaml'))
    const projection = projectRecord(
      res.spec!,
      { kind: 'training-record', id: 'TRR-TEST' },
      res.spec!.schemaId,
      'TRR-TEST',
    )
    const byPath = new Map(projection.slots.map((s) => [s.path, s]))
    expect(byPath.get('$.personRef')!.widget).toBe('record-ref')
    expect(byPath.get('$.personRef')!.refKind).toBe('person')
    expect(byPath.get('$.trainerRef')!.refKind).toBe('person')
    expect(byPath.get('$.trainingMaterialRef')!.refKind).toBe('training-material')
  })
})
