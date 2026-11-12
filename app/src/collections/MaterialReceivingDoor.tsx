/**
 * MaterialReceivingDoor — the /lab materials category "Receive a lot" door.
 *
 * A received lot is created BY a material-receiving attestation, never
 * free-standing (schema/lab/material-receiving.schema.yaml:31). This is a
 * DRAFTING surface only: it relays the scientist's stated facts as the
 * `compose-receiving` intent to the EXISTING /drafts/compile seam (adapter
 * `receiving`, config/drafting/adapters.yaml) and renders the compiled draft
 * (draftId + reviewHash) or the server's own typed refusal. No accept call, no
 * record create — accept is a later leg.
 *
 * Hard rules: the claim rides the RECEIVING_INTENT_SCHEMA vocabulary
 * (additionalProperties:false — no undeclared key is sent); refusal copy is
 * whatever the server returned (diagnostics[].message), never hardcoded; and
 * optional keys are absent-or-value via conditional spread, never
 * present-as-undefined. occurredAt/approximation ride only in the occurrence
 * states the lint pairings allow (known needs occurredAt; approximate needs
 * occurredAt + approximation; unknown carries neither).
 */

import { useState, type FormEvent, type ReactNode } from 'react'
import { apiClient } from '../shared/api/client'

type Status = 'known' | 'approximate' | 'unknown'
type CompileResponse = Awaited<ReturnType<typeof apiClient.compileWorkstateDraft>>
const STATUS_OPTIONS: Status[] = ['known', 'approximate', 'unknown']

function nz(v: string): string | undefined {
  return v.trim().length > 0 ? v.trim() : undefined
}

function Row({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="lab-modal__row">
      <label className="lab-modal__label" htmlFor={id}>{label}</label>
      {children}
    </div>
  )
}

interface TextProps {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  tid: string
  type?: string
  placeholder?: string
}

function Text({ id, label, value, onChange, tid, type, placeholder }: TextProps) {
  return (
    <Row id={id} label={label}>
      <input id={id} type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} data-testid={tid} />
    </Row>
  )
}

function StatusSelect({ id, label, value, onChange, tid }: {
  id: string; label: string; value: Status; onChange: (v: Status) => void; tid: string
}) {
  return (
    <Row id={id} label={label}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as Status)} data-testid={tid}>
        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </Row>
  )
}

export function MaterialReceivingDoor({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [vendor, setVendor] = useState('')
  const [catalogNumber, setCatalogNumber] = useState('')
  const [productLabel, setProductLabel] = useState('')
  const [lotNumber, setLotNumber] = useState('')
  const [receivedByStatus, setReceivedByStatus] = useState<Status>('unknown')
  const [receivedByLabel, setReceivedByLabel] = useState('')
  const [occurredAtStatus, setOccurredAtStatus] = useState<Status>('unknown')
  const [occurredAt, setOccurredAt] = useState('')
  const [approximation, setApproximation] = useState('')
  const [result, setResult] = useState<CompileResponse | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setResult(null)
    setFailure(null)
    setBusy(true)
    const catalog = nz(catalogNumber)
    const product = nz(productLabel)
    const lot = nz(lotNumber)
    const receiver = receivedByStatus === 'unknown' ? undefined : nz(receivedByLabel)
    const statedTime = occurredAtStatus === 'unknown' ? undefined : nz(occurredAt)
    const approx = occurredAtStatus === 'approximate' ? nz(approximation) : undefined
    const claim: Record<string, unknown> = {
      vendor: vendor.trim(),
      receivedByStatus,
      occurredAtStatus,
      ...(catalog !== undefined ? { catalogNumber: catalog } : {}),
      ...(product !== undefined ? { productLabel: product } : {}),
      ...(lot !== undefined ? { lotNumber: lot } : {}),
      ...(receiver !== undefined ? { receivedByLabel: receiver } : {}),
      ...(statedTime !== undefined ? { occurredAt: statedTime } : {}),
      ...(approx !== undefined ? { approximation: approx } : {}),
    }
    try {
      setResult(await apiClient.compileWorkstateDraft({
        adapter: 'receiving',
        intent: { operation: 'compose-receiving', claim },
      }))
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lab-modal__backdrop" role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="lab-modal" role="dialog" aria-modal="true" aria-label="Receive a lot">
        <header className="lab-modal__header">
          <h2>Receive a lot</h2>
          <button type="button" className="lab-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <form className="lab-modal__body" onSubmit={handleSubmit}>
          {failure && (
            <p className="lab-modal__error" data-testid="material-receiving-request-error">{failure}</p>
          )}
          <Text id="recv-vendor" label="Vendor *" value={vendor} onChange={setVendor}
            tid="material-receiving-vendor" placeholder="e.g. Sigma-Aldrich" />
          <Text id="recv-catalog" label="Catalog number" value={catalogNumber}
            onChange={setCatalogNumber} tid="material-receiving-catalog-number" />
          <Text id="recv-product" label="Product label" value={productLabel}
            onChange={setProductLabel} tid="material-receiving-product-label" placeholder="e.g. D6429-500ML" />
          <Text id="recv-lot" label="Lot number" value={lotNumber}
            onChange={setLotNumber} tid="material-receiving-lot-number" />
          <StatusSelect id="recv-received-by-status" label="Received by (status)" value={receivedByStatus}
            onChange={setReceivedByStatus} tid="material-receiving-received-by-status" />
          {receivedByStatus !== 'unknown' && (
            <Text id="recv-received-by-label" label="Received by (name)" value={receivedByLabel}
              onChange={setReceivedByLabel} tid="material-receiving-received-by-label" />
          )}
          <StatusSelect id="recv-occurred-status" label="Arrival date (status)" value={occurredAtStatus}
            onChange={setOccurredAtStatus} tid="material-receiving-occurred-at-status" />
          <Text id="recv-occurred-at" label="Arrival date" value={occurredAt} onChange={setOccurredAt}
            tid="material-receiving-occurred-at" type="date" />
          {occurredAtStatus === 'approximate' && (
            <Text id="recv-approximation" label="How approximate?" value={approximation}
              onChange={setApproximation} tid="material-receiving-approximation" placeholder="e.g. last week" />
          )}
          <p className="lab-modal__hint">
            A lot is received by an attestation. This stages a draft for review — nothing is
            written until it is reviewed and accepted.
          </p>
          {result?.canAccept && (
            <div className="lab-modal__result" data-testid="material-receiving-result">
              <dl>
                <dt>Draft ID</dt>
                <dd data-testid="material-receiving-draft-id">{result.draftId}</dd>
                <dt>Review hash</dt>
                <dd data-testid="material-receiving-review-hash">{result.reviewHash}</dd>
              </dl>
            </div>
          )}
          {result && !result.canAccept && (
            <div className="lab-modal__error" data-testid="material-receiving-refusal">
              <p>The server refused this receiving draft:</p>
              <ul data-testid="material-receiving-diagnostics">
                {result.diagnostics.map((d, i) => <li key={i}>{d.message}</li>)}
              </ul>
            </div>
          )}
          <footer className="lab-modal__footer">
            <button type="button" className="lab-modal__cancel" onClick={onClose}>Close</button>
            <button type="submit" className="lab-modal__primary" disabled={busy}
              data-testid="material-receiving-submit">{busy ? 'Compiling…' : 'Stage draft'}</button>
          </footer>
        </form>
      </div>
    </div>
  )
}
