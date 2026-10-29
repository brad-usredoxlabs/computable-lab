/**
 * GC-13 (leg C) — GcProvenancePanel: the "full context" view for an analysis
 * artifact. Renders the gcProvenance chain hop by hop — each resolved hop a
 * link to /record/:recordId (the existing generic host), each fact read
 * VERBATIM from the payload (engine provenance = the ACTUAL engine/version,
 * 'approximate' stays 'approximate'). Unresolved/failed hops render LOUD
 * arms (the record id + the failure), never a silent skip; the optional
 * measurement-context hop renders its honest named gap arm when absent
 * (GAP-1).
 *
 * Data, not chrome: the hop table and fact labels are gcProvenance.ts (the
 * spec's D2 hop map as a data table). This file only renders.
 */
import { useEffect, useState } from 'react'
import { entryFacts, hopFacts, standardsFacts, walkProvenanceChain, MEASUREMENT_CONTEXT_GAP_TEXT, type ChainHop, type ProvenanceChain, type ProvenanceRef } from './gcProvenance'

function HopRow({ hop }: { hop: ChainHop }) {
  const facts = hop.payload !== null ? hopFacts(hop) : []
  return (
    <li className={`gc-prov__hop${hop.error ? ' gc-prov__hop--error' : ''}${hop.absent ? ' gc-prov__hop--absent' : ''}`}>
      <span className="gc-prov__hop-name">{hop.spec.name}</span>
      <span className="gc-prov__hop-kind">({hop.spec.kind})</span>
      {hop.ref !== null ? (
        <a className="gc-prov__hop-link" href={`/record/${encodeURIComponent(hop.ref.id)}`} data-testid={`gc-prov-hop-${hop.spec.kind}`}>
          {hop.ref.label ?? hop.ref.id}
        </a>
      ) : (
        <span className="gc-prov__hop-absent" data-testid={`gc-prov-hop-absent-${hop.spec.kind}`}>
          {hop.absent ? 'not linked (named gap)' : 'unresolved'}
        </span>
      )}
      {hop.error !== null ? (
        <span className="gc-prov__hop-error" data-testid={`gc-prov-hop-error-${hop.spec.kind}`}>
          {hop.error}
        </span>
      ) : null}
      <ul className="gc-prov__facts">
        {facts.map((f, i) => (
          <li key={`${f.label}-${i}`} data-testid={`gc-prov-fact-${hop.spec.kind}-${f.label.replace(/[^a-z0-9]+/gi, '-')}`}>
            <span className="gc-prov__fact-label">{f.label}</span>
            <span className="gc-prov__fact-value">{f.value}</span>
          </li>
        ))}
      </ul>
    </li>
  )
}

export function GcProvenancePanel({ artifactRef, isenId, onClosed }: { artifactRef: ProvenanceRef; isenId?: string; onClosed?: () => void }) {
  const [chain, setChain] = useState<ProvenanceChain | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setChain(null)
    setError(null)
    void walkProvenanceChain(artifactRef, isenId)
      .then((c) => {
        if (!cancelled) setChain(c)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [artifactRef.id, isenId])

  const runHop = chain?.hops.find((h) => h.spec.kind === 'analysis-run') ?? null
  const runParameters =
    runHop !== null && runHop.payload !== null
      ? (runHop.payload['parameters'] as Record<string, unknown> | undefined)
      : undefined
  const standards =
    runParameters !== undefined && runParameters !== null ? standardsFacts(runParameters) : []
  const entryFactsList = chain !== null ? entryFacts(chain.artifactPayload) : []

  return (
    <div className="gc-prov" data-testid="gc-provenance">
      <div className="gc-prov__header">
        <h3>Full provenance — {artifactRef.label ?? artifactRef.id}</h3>
        {onClosed !== undefined ? (
          <button type="button" onClick={onClosed} data-testid="gc-prov-close">
            close
          </button>
        ) : null}
      </div>
      {error !== null ? (
        <p className="gc-prov__error" data-testid="gc-prov-error">
          {error}
        </p>
      ) : null}
      {chain !== null ? (
        <ol className="gc-prov__chain">
          <li className="gc-prov__hop gc-prov__hop--entry">
            <span className="gc-prov__hop-name">artifact (entry)</span>
            <span className="gc-prov__hop-kind">(analysis-output-artifact)</span>
            <a
              className="gc-prov__hop-link"
              href={`/record/${encodeURIComponent(chain.artifactRef.id)}`}
              data-testid="gc-prov-hop-entry"
            >
              {String(chain.artifactPayload['name'] ?? chain.artifactRef.id)}
            </a>
            <ul className="gc-prov__facts">
              {typeof chain.artifactPayload['dataKind'] === 'string' ? (
                <li data-testid="gc-prov-fact-entry-dataKind">
                  <span className="gc-prov__fact-label">dataKind</span>
                  <span className="gc-prov__fact-value">{String(chain.artifactPayload['dataKind'])}</span>
                </li>
              ) : null}
              {/* D2 item 10 / G4: the calibration-model facts (equation,
                  statistic, fit_points incl. the honest null
                  relative_residual arm) — read VERBATIM from the entry
                  artifact's inlineValue; a non-calibration artifact
                  renders none. */}
              {entryFactsList.map((f) => (
                <li key={`entry-${f.label}`} data-testid={`gc-prov-fact-entry-${f.label.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')}`}>
                  <span className="gc-prov__fact-label">{f.label}</span>
                  <span className="gc-prov__fact-value">{f.value}</span>
                </li>
              ))}
            </ul>
          </li>
          {chain.hops.map((hop) => (
            <HopRow key={hop.spec.kind} hop={hop} />
          ))}
          <li className="gc-prov__terminal" data-testid="gc-prov-terminal">
            {chain.contentHash !== null ? (
              <span>
                resolves to contentHash{' '}
                <code data-testid="gc-prov-content-hash">{chain.contentHash}</code>
                {chain.dataRefId !== null ? (
                  <>
                    {' '}via{' '}
                    <a href={`/record/${encodeURIComponent(chain.dataRefId)}`}>{chain.dataRefId}</a>
                  </>
                ) : null}
              </span>
            ) : (
              <span className="gc-prov__terminal-gap">
                chain does not reach a frozen input data reference — the contentHash terminal is unresolved (named gap, not an error)
              </span>
            )}
          </li>
        </ol>
      ) : null}
      {/* G4: the standards list — the FROZEN run parameters.levels[]
          (the level runs the calibration was built on). Read verbatim
          from the run payload; an absent/frozen-less run renders the
          honest named arm, never an invented list. */}
      {chain !== null ? (
        standards.length > 0 ? (
          <section className="gc-prov__standards" data-testid="gc-prov-standards">
            <h4>
              Standards — frozen from the run parameters (levels)
            </h4>
            <table className="gc-prov__standards-table">
              <thead>
                <tr>
                  <th>level</th>
                  <th>compound</th>
                  <th>amount</th>
                  <th>fit</th>
                  <th>required</th>
                </tr>
              </thead>
              <tbody>
                {standards.map((s, i) => (
                  <tr key={`${String(s.level)}-${i}`}>
                    <td>{String(s.level ?? '')}</td>
                    <td>{s.compoundLabel}</td>
                    <td>{s.amount === null || s.amount === undefined ? '—' : String(s.amount)}</td>
                    <td>{s.fit ? 'yes' : 'no'}</td>
                    <td>{s.required ? 'yes' : 'no'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : (
          <section className="gc-prov__standards" data-testid="gc-prov-standards-gap">
            <h4>Standards</h4>
            <p>no frozen levels in the run parameters — no standards list to show (named gap, not an error)</p>
          </section>
        )
      ) : null}
      {chain !== null && chain.hops.some((h) => h.spec.kind === 'measurement-context' && h.absent) ? (
        <p className="gc-prov__gap" data-testid="gc-prov-mctx-gap">
          {MEASUREMENT_CONTEXT_GAP_TEXT}
        </p>
      ) : null}
    </div>
  )
}
