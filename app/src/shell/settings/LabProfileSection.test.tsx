/**
 * LabProfileSection — renders label + namespace + ontology prefix + chips
 * from a mocked lab profile.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { apiClient } from '../../shared/api/client'
import { LabProfileSection } from './LabProfileSection'

const MOCK = {
  profile: {
    version: 1,
    profile: {
      label: "Brad's bead-basher microbiome lab",
      namespace: { baseUri: 'http://usredoxlabs.com/records/', prefix: 'redoxlabs' },
      ontologyNamespace: 'cf',
      instruments: [{ label: 'Generic qPCR Instrument', ref: { kind: 'record' as const, id: 'INSTDEF-GENERIC-QPCR', type: 'instrument-definition' } }],
      protocols: [{ label: 'PBS Wash', ref: { kind: 'record' as const, id: 'prt-seed-pbs-wash', type: 'protocol' } }],
      reagents: [{ label: 'PBS pH 7.4', ref: { kind: 'record' as const, id: 'mat-seed-pbs-ph74', type: 'material' } }],
    },
  },
}

describe('LabProfileSection', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'getLabProfile').mockResolvedValue(MOCK as never)
  })

  it('renders the label + namespace + ontology prefix', async () => {
    render(<LabProfileSection />)
    expect(await screen.findByTestId('lab-profile-label')).toHaveTextContent("Brad's bead-basher microbiome lab")
    expect(screen.getByText('redoxlabs')).toBeDefined()
    expect(screen.getAllByText('cf').length).toBeGreaterThan(0)
  })

  it('renders chips for instruments / protocols / reagents', async () => {
    render(<LabProfileSection />)
    expect(await screen.findByText('Generic qPCR Instrument')).toBeDefined()
    expect(screen.getByText('PBS Wash')).toBeDefined()
    expect(screen.getByText('PBS pH 7.4')).toBeDefined()
  })
})