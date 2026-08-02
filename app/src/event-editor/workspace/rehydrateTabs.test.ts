import { describe, expect, it } from 'vitest'
import {
  workspaceTabToOpenTab,
  workspaceTabsToOpenTabs,
} from './rehydrateTabs'
import {
  deckTabId,
  executionTabId,
  recordCreateTabId,
  recordEditTabId,
} from './types'

describe('workspaceTabToOpenTab', () => {
  it('passes through already-top-level entity tabs unchanged', () => {
    const run = { id: 'run:r1', kind: 'run' as const, runId: 'RUN-1', title: 'R' }
    expect(workspaceTabToOpenTab(run)).toEqual(run)
    const proj = { id: 'project:s1', kind: 'project' as const, studyId: 'STU-1', title: 'P' }
    expect(workspaceTabToOpenTab(proj)).toEqual(proj)
  })

  it('drops project-details (the homepage IS the project view) and collection tabs', () => {
    expect(workspaceTabToOpenTab({ id: 'details:s1', kind: 'project-details', title: 'Project' })).toBeNull()
    expect(
      workspaceTabToOpenTab({ id: 'collection:runs', kind: 'collection', collection: 'runs', title: 'Runs' }),
    ).toBeNull()
  })

  it('maps a run-bound deck to a top-level deck tab preserving eventGraph + runId', () => {
    const tab = workspaceTabToOpenTab({
      id: 'tab-deck-EVG-1',
      kind: 'deck',
      eventGraphId: 'EVG-1',
      runId: 'RUN-2',
      title: 'Run 2',
    })
    expect(tab).not.toBeNull()
    expect(tab).toMatchObject({
      id: deckTabId('EVG-1'),
      kind: 'deck',
      eventGraphId: 'EVG-1',
      runId: 'RUN-2',
      title: 'Run 2',
    })
  })

  it('maps pdf/document to their top-level host tab ids', () => {
    expect(workspaceTabToOpenTab({ id: 'p', kind: 'pdf', artifactId: 'ART-1', title: 'PDF' })).toMatchObject({
      id: 'tab-pdf-ART-1',
      kind: 'pdf',
      artifactId: 'ART-1',
    })
    expect(
      workspaceTabToOpenTab({ id: 'd', kind: 'document', artifactId: 'ART-2', title: 'Doc' }),
    ).toMatchObject({
      id: 'tab-doc-ART-2',
      kind: 'document',
      artifactId: 'ART-2',
    })
  })

  it('maps execution to its execution tab id', () => {
    const tab = workspaceTabToOpenTab({
      id: 'exec',
      kind: 'execution',
      eventGraphId: 'EVG-9',
      runId: 'RUN-3',
      title: 'Execute',
    })
    expect(tab).toMatchObject({
      id: executionTabId('EVG-9'),
      kind: 'execution',
      eventGraphId: 'EVG-9',
      runId: 'RUN-3',
    })
  })

  it('maps record-edit to its top-level id', () => {
    const tab = workspaceTabToOpenTab({
      id: 'rec',
      kind: 'record-edit',
      recordId: 'REC-1',
      recordKind: 'protocol',
      title: 'Edit',
    })
    expect(tab).toMatchObject({
      id: recordEditTabId('REC-1'),
      kind: 'record-edit',
      recordId: 'REC-1',
      recordKind: 'protocol',
    })
  })

  it('maps record-create (run under an experiment) preserving experimentId', () => {
    const tab = workspaceTabToOpenTab({
      id: 'create:run',
      kind: 'record-create',
      nodeType: 'run',
      experimentId: 'EXP-1',
      studyId: 'STU-1',
      title: 'New run',
    })
    expect(tab).toMatchObject({
      id: recordCreateTabId('run', 'EXP-1'),
      kind: 'record-create',
      nodeType: 'run',
      experimentId: 'EXP-1',
    })
  })

  it('drops a fresh unsaved deck canvas (empty eventGraphId has no host route)', () => {
    expect(
      workspaceTabToOpenTab({
        id: 'tab-deck-new-RUN-1',
        kind: 'deck',
        eventGraphId: '',
        runId: 'RUN-1',
        title: 'R1',
      }),
    ).toBeNull()
  })

  it('workspaceTabsToOpenTabs drops nulls and keeps order', () => {
    const result = workspaceTabsToOpenTabs([
      { id: 'details:s1', kind: 'project-details', title: 'Project' },
      { id: 'tab-deck-EVG-1', kind: 'deck', eventGraphId: 'EVG-1', title: 'Deck' },
      { id: 'c', kind: 'collection', collection: 'runs', title: 'Runs' },
    ])
    expect(result.map((t) => t.kind)).toEqual(['deck'])
  })
})
