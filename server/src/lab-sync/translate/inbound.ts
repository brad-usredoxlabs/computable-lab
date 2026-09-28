/**
 * Inbound translator: website domain events -> CL record mutations.
 *
 * The wire payloads are snake_case (order_remote_id, remote_revision...);
 * record payloads are camelCase. This module is the ONLY place allowed to
 * bridge the two — every handler keeps an explicit field mapping, no generic
 * camelCase conversion.
 *
 * Durability protocol per event (append-only intent):
 *   1. Dedupe on event_id against existing lab-sync-event mirrors.
 *   2. Create the LSYN- mirror FIRST with processing.status "pending".
 *   3. Translate (mutate records).
 *   4. Update the mirror LAST with the final status/affected ids — a crash
 *      mid-translation still leaves the event durably mirrored.
 *
 * Controlled vocabulary: an unmapped slug is a HARD STOP (unknown_type),
 * never an invented term (config/lab-sync/mapping.yaml header, principles §5/§9).
 */

import type { RecordEnvelope, RecordStore } from '../../store/types.js'
import type { LabSyncWireEvent, ProcessedEvent } from '../types.js'
import { SCHEMA_IDS } from '../types.js'
import { nextSequentialRecordId } from '../ids.js'
import { type LabSyncMapping, resolveService, resolveMatrix } from './mapping.js'

export interface InboundTranslatorDeps {
  store: RecordStore
  mapping: LabSyncMapping
  now: () => Date
}

type Payload = Record<string, unknown>

function obj(v: unknown): Payload | undefined {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Payload) : undefined
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** Address fields the party schema declares — anything else is dropped. */
const ADDRESS_FIELDS = ['street', 'city', 'region', 'postal', 'country'] as const

interface AddressShape {
  street?: string
  city?: string
  region?: string
  postal?: string
  country?: string
}

function pickAddress(raw: unknown): AddressShape | undefined {
  const src = obj(raw)
  if (!src) return undefined
  const out: AddressShape = {}
  for (const f of ADDRESS_FIELDS) {
    const v = src[f]
    if (typeof v === 'string') out[f] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Deviation, stated plainly: the website has no customer remote id — its
 *  identity IS the email. `email:<email>` becomes the CL source.remoteId and
 *  is the dedupe key for customer lookups. */
function customerRemoteId(email: string): string {
  return `email:${email}`
}

/** Email matching is case-insensitive and whitespace-tolerant: every email
 *  comparison in this module normalizes through here. */
function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Website-assigned customer identity (customer.identity_assigned / verified). */
const WEBSITE_CUSTOMER_ID_PATTERN = /^tyfcus_[0-9a-f]{32}$/

class HandlerError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export class InboundTranslator {
  private readonly store: RecordStore
  private readonly mapping: LabSyncMapping
  private readonly now: () => Date

  constructor(deps: InboundTranslatorDeps) {
    this.store = deps.store
    this.mapping = deps.mapping
    this.now = deps.now
  }

  async process(event: LabSyncWireEvent): Promise<ProcessedEvent> {
    // 1. Dedupe BEFORE anything else: the mirror record is the dedupe anchor.
    const existing = await this.findMirror(event.event_id)
    if (existing) {
      const processing = obj((existing.payload as Payload | undefined)?.processing)
      const affected = Array.isArray(processing?.affectedRecordIds)
        ? (processing.affectedRecordIds as string[])
        : []
      return { status: 'duplicated', affectedRecordIds: affected }
    }

    // 2. Mirror created FIRST, status pending (crash-safe append-only intent).
    const mirrorId = await nextSequentialRecordId(this.store, 'LSYN-')
    const mirrorPayload: Payload = {
      kind: 'lab-sync-event',
      recordId: mirrorId,
      eventId: event.event_id,
      direction: 'inbound',
      eventType: event.type,
      payload: event.payload,
      processing: { status: 'pending', affectedRecordIds: [], processedAt: this.now().toISOString() },
    }
    if (typeof event.cursor === 'number') mirrorPayload.cursor = event.cursor
    if (typeof event.occurred_at === 'string') mirrorPayload.occurredAt = event.occurred_at

    const created = await this.store.create({
      envelope: { recordId: mirrorId, schemaId: SCHEMA_IDS.labSyncEvent, payload: mirrorPayload },
      message: `lab-sync inbound mirror ${event.event_id} (${event.type})`,
    })
    if (!created.success) {
      throw new Error(`failed to mirror inbound event ${event.event_id}: ${created.error ?? 'unknown'}`)
    }

    // 3. Translate.
    let result: ProcessedEvent
    try {
      result = await this.dispatch(event)
    } catch (err) {
      result = {
        status: 'unknown_type',
        affectedRecordIds: [],
        error: err instanceof Error ? err.message : String(err),
      }
    }

    // 4. Finalize the mirror LAST so processing.status is always truthful.
    const finalPayload: Payload = {
      ...mirrorPayload,
      processing: {
        status: result.status,
        affectedRecordIds: result.affectedRecordIds,
        ...(result.error !== undefined ? { error: result.error } : {}),
        processedAt: this.now().toISOString(),
      },
    }
    await this.store.update({
      envelope: { recordId: mirrorId, schemaId: SCHEMA_IDS.labSyncEvent, payload: finalPayload },
      message: `lab-sync inbound processed ${event.event_id}: ${result.status}`,
    })

    return result
  }

  private async findMirror(eventId: string): Promise<RecordEnvelope | null> {
    const mirrors = await this.store.list({ kind: 'lab-sync-event' })
    for (const rec of mirrors) {
      const p = obj(rec.payload)
      if (p && p.kind === 'lab-sync-event' && p.eventId === eventId) return rec
    }
    return null
  }

  private async dispatch(event: LabSyncWireEvent): Promise<ProcessedEvent> {
    switch (event.type) {
      case 'customer.created':
        return this.customerCreated(event.payload)
      case 'customer.updated':
        return this.customerUpdated(event.payload)
      case 'customer.identity_assigned':
        return this.customerIdentityAssigned(event.payload)
      case 'customer.verified':
        return this.customerVerified(event.payload, event.occurred_at)
      case 'order.created':
        return this.orderCreated(event.payload)
      case 'order.updated':
        return this.orderUpdated(event.payload)
      case 'order.cancel_requested':
        return this.orderCancelRequested(event.payload)
      case 'sample.registered':
        return this.sampleRegistered(event.payload)
      case 'sample.shipped':
        return this.sampleShipped(event.payload)
      default:
        // Unknown types are stored verbatim in the mirror, never dropped.
        return { status: 'unknown_type', affectedRecordIds: [] }
    }
  }

  // ---------------------------------------------------------------- customers

  /** Find ALL customers whose email identity matches: source.remoteId derived
   *  from `email:<normalized>` OR a contacts[] email entry that normalizes to
   *  the same address. 0 matches = unknown; >=2 = ambiguous (needs_review). */
  private async findCustomersByEmail(email: string): Promise<RecordEnvelope[]> {
    const customers = await this.store.list({ kind: 'customer' })
    const want = customerRemoteId(normalizeEmail(email))
    const wantEmail = normalizeEmail(email)
    const matches: RecordEnvelope[] = []
    for (const rec of customers) {
      const src = obj(obj(rec.payload)?.source)
      if (src && src.remoteId === want) {
        matches.push(rec)
        continue
      }
      const contacts = obj(rec.payload)?.contacts
      if (Array.isArray(contacts)) {
        for (const c of contacts) {
          const entry = obj(c)
          if (
            entry &&
            entry.channel === 'email' &&
            typeof entry.value === 'string' &&
            normalizeEmail(entry.value) === wantEmail
          ) {
            matches.push(rec)
            break
          }
        }
      }
    }
    return matches
  }

  /** Single-match email lookup: ambiguous matches surface as null at the
   *  call site's hard stop (callers needing ambiguity handling use
   *  findCustomersByEmail directly). */
  private async findCustomerByEmail(email: string): Promise<RecordEnvelope | null> {
    const matches = await this.findCustomersByEmail(email)
    return matches.length === 1 ? (matches[0] as RecordEnvelope) : null
  }

  /** Find customer by website-assigned tyfcus identity: source.remoteId OR
   *  an aliases[].remoteId. */
  private async findCustomerByWebsiteId(websiteId: string): Promise<RecordEnvelope | null> {
    const customers = await this.store.list({ kind: 'customer' })
    for (const rec of customers) {
      const src = obj(obj(rec.payload)?.source)
      if (src && src.remoteId === websiteId) return rec
      const aliases = obj(rec.payload)?.aliases
      if (Array.isArray(aliases)) {
        for (const a of aliases) {
          const entry = obj(a)
          if (entry && entry.remoteId === websiteId) return rec
        }
      }
    }
    return null
  }

  /** Upsert CUST- by email identity. Returns [recordId, mintedNow]. */
  private async upsertCustomer(email: string, name: string | undefined, address: unknown): Promise<[string, boolean]> {
    const existing = await this.findCustomerByEmail(email)
    if (existing) return [existing.recordId, false]

    const recordId = await nextSequentialRecordId(this.store, 'CUST-')
    const payload: Payload = {
      kind: 'customer',
      recordId,
      extends: 'party',
      // name is schema-required; fall back to the email itself if the website
      // never gave one (simplest defensible choice; never fabricate a name).
      name: name ?? email,
      partyType: 'person',
      status: 'active',
      contacts: [{ channel: 'email', value: email }],
      source: { system: this.mapping.sourceSystem, remoteId: customerRemoteId(email) },
    }
    const addr = pickAddress(address)
    if (addr) payload.addresses = [addr]

    const res = await this.store.create({
      envelope: { recordId, schemaId: SCHEMA_IDS.customer, payload },
      message: `lab-sync customer mirror ${customerRemoteId(email)}`,
    })
    if (!res.success) throw new Error(`failed to create customer for ${email}: ${res.error ?? 'unknown'}`)
    return [recordId, true]
  }

  private async customerCreated(payload: Payload): Promise<ProcessedEvent> {
    const cust = obj(payload.customer)
    const email = str(cust?.email)
    if (!email) throw new HandlerError('customer.created payload missing customer.email')
    const [recordId] = await this.upsertCustomer(email, str(cust?.name), cust?.address)
    return { status: 'applied', affectedRecordIds: [recordId] }
  }

  private async customerUpdated(payload: Payload): Promise<ProcessedEvent> {
    const cust = obj(payload.customer)
    const email = str(cust?.email)
    if (!email) throw new HandlerError('customer.updated payload missing customer.email')

    const matches = await this.findCustomersByEmail(email)
    if (matches.length === 0) {
      // Simplest defensible choice: an update for an unknown email is not
      // silently minted — it's the same hard-stop class as an unmapped slug.
      return { status: 'unknown_type', affectedRecordIds: [], error: `unknown customer email ${email}` }
    }
    if (matches.length >= 2) {
      return { status: 'needs_review', affectedRecordIds: [], error: `ambiguous legacy match for ${email}` }
    }
    const existing = matches[0] as RecordEnvelope

    const changes = obj(cust?.changes) ?? {}
    const p = { ...(existing.payload as Payload) }
    const name = str(changes.name)
    if (name) p.name = name
    if ('address' in changes) {
      const addr = pickAddress(changes.address)
      if (addr) p.addresses = [addr]
    }
    const phone = str(changes.phone)
    if (phone) {
      const contacts = Array.isArray(p.contacts) ? [...(p.contacts as Payload[])] : []
      contacts.push({ channel: 'phone', value: phone })
      p.contacts = contacts
    }

    const res = await this.store.update({
      envelope: { recordId: existing.recordId, schemaId: existing.schemaId, payload: p },
      message: `lab-sync customer.updated ${customerRemoteId(email)}`,
    })
    if (!res.success) throw new Error(`failed to update customer ${existing.recordId}: ${res.error ?? 'unknown'}`)
    return { status: 'applied', affectedRecordIds: [existing.recordId] }
  }

  /** Attach the website-assigned tyfcus identity to the email-matched
   *  customer. Unknown email is a hard stop — identity_assigned NEVER mints
   *  a customer. Ambiguous matches need a human, never a coin flip. */
  private async customerIdentityAssigned(payload: Payload): Promise<ProcessedEvent> {
    const customerId = str(payload.customer_id)
    if (!customerId || !WEBSITE_CUSTOMER_ID_PATTERN.test(customerId)) {
      return { status: 'unknown_type', affectedRecordIds: [], error: `malformed customer_id ${customerId ?? '<missing>'} (expected ${WEBSITE_CUSTOMER_ID_PATTERN.source})` }
    }
    const email = str(payload.email)
    if (!email) throw new HandlerError('customer.identity_assigned payload missing email')

    // Already aliased (e.g. remoteId moved to source) — idempotent no-op.
    const aliased = await this.findCustomerByWebsiteId(customerId)
    if (aliased) return { status: 'applied', affectedRecordIds: [aliased.recordId] }

    const matches = await this.findCustomersByEmail(email)
    if (matches.length === 0) {
      return { status: 'unknown_type', affectedRecordIds: [], error: `unknown customer email ${email}` }
    }
    if (matches.length >= 2) {
      return { status: 'needs_review', affectedRecordIds: [], error: `ambiguous legacy match for ${email}` }
    }
    const existing = matches[0] as RecordEnvelope

    // NOTE: a name carried on the event is NOT adopted when the customer has
    // none — identity_assigned grants identity, it does not author profiles.
    const p = { ...(existing.payload as Payload) }
    const aliases = Array.isArray(p.aliases) ? [...(p.aliases as Payload[])] : []
    if (!aliases.some((a) => obj(a)?.remoteId === customerId)) {
      aliases.push({ system: this.mapping.sourceSystem, remoteId: customerId })
      p.aliases = aliases
    }

    const res = await this.store.update({
      envelope: { recordId: existing.recordId, schemaId: existing.schemaId, payload: p },
      message: `lab-sync customer.identity_assigned ${customerId}`,
    })
    if (!res.success) throw new Error(`failed to alias customer ${existing.recordId}: ${res.error ?? 'unknown'}`)
    return { status: 'applied', affectedRecordIds: [existing.recordId] }
  }

  /** Stamp verifiedAt (first write wins). Resolve by tyfcus identity first,
   *  fall back to the single-match email rule. */
  private async customerVerified(payload: Payload, occurredAt?: string): Promise<ProcessedEvent> {
    const customerId = str(payload.customer_id)
    const email = str(payload.email)

    let existing: RecordEnvelope | null = null
    if (customerId) existing = await this.findCustomerByWebsiteId(customerId)
    if (!existing && email) {
      const matches = await this.findCustomersByEmail(email)
      if (matches.length >= 2) {
        return { status: 'needs_review', affectedRecordIds: [], error: `ambiguous legacy match for ${email}` }
      }
      existing = matches[0] ?? null
    }
    if (!existing) {
      return { status: 'unknown_type', affectedRecordIds: [], error: `unknown customer ${customerId ?? email}` }
    }

    const p = { ...(existing.payload as Payload) }
    let mutated = true
    if (p.verifiedAt === undefined) {
      p.verifiedAt = occurredAt ?? this.now().toISOString()
    } else {
      mutated = false // already verified: applied, timestamp unchanged
    }
    if (mutated) {
      const res = await this.store.update({
        envelope: { recordId: existing.recordId, schemaId: existing.schemaId, payload: p },
        message: `lab-sync customer.verified ${customerId ?? customerRemoteId(email ?? '')}`,
      })
      if (!res.success) throw new Error(`failed to verify customer ${existing.recordId}: ${res.error ?? 'unknown'}`)
    }
    return { status: 'applied', affectedRecordIds: [existing.recordId] }
  }

  // ------------------------------------------------------------------- orders

  /** Find order by website remote order reference (tyfored_*). */
  private async findOrderByRemoteId(orderRemoteId: string): Promise<RecordEnvelope | null> {
    const orders = await this.store.list({ kind: 'order' })
    for (const rec of orders) {
      const src = obj(obj(rec.payload)?.source)
      if (src && src.remoteId === orderRemoteId) return rec
    }
    return null
  }

  private async orderCreated(payload: Payload): Promise<ProcessedEvent> {
    const orderRemoteId = str(payload.order_remote_id)
    if (!orderRemoteId) throw new HandlerError('order.created payload missing order_remote_id')

    // Idempotent replay guard beyond event dedupe: same remote order already minted.
    const alreadyMinted = await this.findOrderByRemoteId(orderRemoteId)
    if (alreadyMinted) {
      return { status: 'applied', affectedRecordIds: [alreadyMinted.recordId] }
    }

    const email = str(obj(payload.customer)?.email)
    if (!email) throw new HandlerError('order.created payload missing customer.email')

    const rawLines = Array.isArray(payload.requested_services) ? (payload.requested_services as unknown[]) : []
    if (rawLines.length === 0) throw new HandlerError('order.created payload missing requested_services')

    // Resolve EVERY line through the controlled vocabulary BEFORE minting
    // anything — an unmapped slug is a hard stop with zero side effects.
    interface Line {
      lineId?: string
      serviceCode: string
      matrixTerm?: string
      sampleCount?: number
      requestedReporting?: Payload
    }
    const lines: Line[] = []
    for (const raw of rawLines) {
      const line = obj(raw) ?? {}
      const svcSlug = str(line.service)
      if (!svcSlug) throw new HandlerError('requested_services line missing service slug')
      const svc = resolveService(this.mapping, svcSlug)
      if (!svc) {
        throw new HandlerError(`unmapped service slug ${svcSlug} (add it to config/lab-sync/mapping.yaml)`)
      }
      const out: Line = { serviceCode: svc.code }
      if (line.line_id !== undefined && typeof line.line_id === 'string' && line.line_id.length > 0) out.lineId = line.line_id
      const matrixSlug = str(line.matrix)
      if (matrixSlug !== undefined) {
        const mx = resolveMatrix(this.mapping, matrixSlug)
        if (!mx) {
          throw new HandlerError(`unmapped matrix slug ${matrixSlug} (add it to config/lab-sync/mapping.yaml)`)
        }
        out.matrixTerm = mx.term
      }
      const sc = num(line.sample_count)
      if (sc !== undefined) out.sampleCount = sc
      const rr = obj(line.requested_reporting)
      if (rr) out.requestedReporting = rr
      lines.push(out)
    }

    const affected: string[] = []

    // Customer lookup/create (email is the identity — see customerRemoteId).
    const [customerId, mintedCustomer] = await this.upsertCustomer(
      email,
      str(obj(payload.customer)?.name),
      obj(payload.customer)?.address,
    )
    if (mintedCustomer) affected.push(customerId)

    const placedAt = str(payload.placed_at)
    // datePart from placed_at year (advisory clock fallback: translator clock).
    const year = placedAt ? placedAt.slice(0, 4) : String(this.now().getUTCFullYear())
    const orderId = await nextSequentialRecordId(this.store, 'ORD-', { datePart: `${year}-` })

    const embeddedLines: Payload[] = lines.map((l) => {
      const out: Payload = { service: l.serviceCode }
      if (l.lineId !== undefined) out.lineId = l.lineId
      if (l.matrixTerm !== undefined) out.matrix = l.matrixTerm
      if (l.sampleCount !== undefined) out.sampleCount = l.sampleCount
      if (l.requestedReporting !== undefined) out.requestedReporting = l.requestedReporting
      return out
    })

    const remoteRevision = num(payload.remote_revision)
    const orderPayload: Payload = {
      kind: 'order',
      recordId: orderId,
      extends: 'request',
      requesterRef: { kind: 'record', id: customerId, type: 'customer' },
      customerRef: { kind: 'record', id: customerId, type: 'customer' },
      source: {
        system: this.mapping.sourceSystem,
        remoteId: orderRemoteId,
        ...(remoteRevision !== undefined ? { remoteRevision } : {}),
      },
      lifecycleId: 'tyf-order',
      // Spec deviation stated at the top of specs/lab-sync-api.md: order.created
      // is minted when the order ROW is committed — status pending_payment,
      // payment captured later via order.updated.
      status: 'pending_payment',
      payment: { status: 'pending' },
      requestedServices: embeddedLines,
    }
    if (placedAt !== undefined) orderPayload.requestedAt = placedAt
    const total = num(payload.total_amount)
    if (total !== undefined) orderPayload.totalAmount = total
    const currency = str(payload.currency)
    if (currency !== undefined) orderPayload.currency = currency
    const affiliate = str(payload.affiliate_code)
    if (affiliate !== undefined) orderPayload.affiliateCode = affiliate

    const orderRes = await this.store.create({
      envelope: { recordId: orderId, schemaId: SCHEMA_IDS.order, payload: orderPayload },
      message: `lab-sync order.created ${orderRemoteId}`,
    })
    if (!orderRes.success) throw new Error(`failed to create order ${orderRemoteId}: ${orderRes.error ?? 'unknown'}`)
    affected.push(orderId)

    // One authoritative requested-service record per line.
    // Line numbering derived from the order's own sequence (simplest defensible
    // choice: lines cannot collide because orderNum is unique per order).
    const orderNum = orderId.slice(`ORD-${year}-`.length)
    for (const [i, l] of lines.entries()) {
      const rsvcId = `RSVC-${year}-${orderNum}-${String(i + 1).padStart(2, '0')}`
      const rsvc: Payload = {
        kind: 'requested-service',
        recordId: rsvcId,
        requestRef: { kind: 'record', id: orderId, type: 'order' },
        service: l.serviceCode,
        status: 'requested',
      }
      if (l.lineId !== undefined) rsvc.lineId = l.lineId
      if (l.matrixTerm !== undefined) rsvc.matrix = l.matrixTerm
      if (l.sampleCount !== undefined) rsvc.sampleCount = l.sampleCount
      if (l.requestedReporting !== undefined) rsvc.requestedReporting = l.requestedReporting
      const res = await this.store.create({
        envelope: { recordId: rsvcId, schemaId: SCHEMA_IDS.requestedService, payload: rsvc },
        message: `lab-sync order.created line ${l.lineId ?? i + 1} for ${orderRemoteId}`,
      })
      if (!res.success) throw new Error(`failed to create requested-service ${rsvcId}: ${res.error ?? 'unknown'}`)
      affected.push(rsvcId)
    }

    return { status: 'applied', affectedRecordIds: affected }
  }

  private async orderUpdated(payload: Payload): Promise<ProcessedEvent> {
    const orderRemoteId = str(payload.order_remote_id)
    if (!orderRemoteId) throw new HandlerError('order.updated payload missing order_remote_id')
    const order = await this.findOrderByRemoteId(orderRemoteId)
    if (!order) {
      return { status: 'unknown_type', affectedRecordIds: [], error: `unknown order_remote_id ${orderRemoteId}` }
    }

    const revision = num(payload.remote_revision)
    const current = obj(order.payload)?.source as Payload | undefined
    const currentRev = num(current?.remoteRevision) ?? 0
    if (revision !== undefined && revision <= currentRev) {
      return { status: 'ignored_stale', affectedRecordIds: [order.recordId] }
    }

    // Explicit known-field merge only: status passthrough, payment passthrough,
    // wire `kit` -> record `sampleKit` (website field name differs). Unknown
    // change keys are dropped — the record schema is the contract.
    const changes = { ...(obj(payload.changes) ?? {}) }
    const p = { ...(order.payload as Payload) }

    // Re-ownership: changes.customer_id re-points the order's refs at the
    // tyfcus-aliased customer. It is REMOVED from the working copy before the
    // generic merge so the wire key never lands as a stray record field.
    const reassignCustomerId = str(changes.customer_id)
    if (reassignCustomerId !== undefined) {
      delete changes.customer_id
      const target = await this.findCustomerByWebsiteId(reassignCustomerId)
      if (!target) {
        return {
          status: 'needs_review',
          affectedRecordIds: [order.recordId],
          error: `website identity not yet mirrored: ${reassignCustomerId}`,
        }
      }
      const ref: Payload = { kind: 'record', id: target.recordId, type: 'customer' }
      p.customerRef = ref
      p.requesterRef = ref
    }

    const status = str(changes.status)
    if (status) p.status = status
    const payment = obj(changes.payment)
    if (payment) p.payment = payment
    const kit = obj(changes.kit)
    if (kit) p.sampleKit = kit
    if (revision !== undefined) {
      p.source = { ...(current ?? {}), remoteRevision: revision }
    }

    const res = await this.store.update({
      envelope: { recordId: order.recordId, schemaId: order.schemaId, payload: p },
      message: `lab-sync order.updated ${orderRemoteId} rev ${revision ?? '?'}`,
    })
    if (!res.success) throw new Error(`failed to update order ${order.recordId}: ${res.error ?? 'unknown'}`)
    return { status: 'applied', affectedRecordIds: [order.recordId] }
  }

  private async orderCancelRequested(payload: Payload): Promise<ProcessedEvent> {
    const orderRemoteId = str(payload.order_remote_id)
    if (!orderRemoteId) throw new HandlerError('order.cancel_requested payload missing order_remote_id')
    const order = await this.findOrderByRemoteId(orderRemoteId)
    if (!order) {
      return { status: 'unknown_type', affectedRecordIds: [], error: `unknown order_remote_id ${orderRemoteId}` }
    }

    // Record the REQUEST; do not change status — CL decides whether to honour it.
    const cancel: Payload = {}
    const reason = str(payload.reason)
    if (reason !== undefined) cancel.reason = reason
    const requestedAt = str(payload.requested_at)
    if (requestedAt !== undefined) cancel.requestedAt = requestedAt

    const p = { ...(order.payload as Payload), cancelRequested: cancel }
    const res = await this.store.update({
      envelope: { recordId: order.recordId, schemaId: order.schemaId, payload: p },
      message: `lab-sync order.cancel_requested ${orderRemoteId}`,
    })
    if (!res.success) throw new Error(`failed to update order ${order.recordId}: ${res.error ?? 'unknown'}`)
    return { status: 'applied', affectedRecordIds: [order.recordId] }
  }

  // ------------------------------------------------------------------ samples

  private barcodePattern(): RegExp | undefined {
    const id = this.mapping.identifiers['tyf-barcode']
    return id ? new RegExp(id.pattern) : undefined
  }

  private async findSampleByBarcode(barcode: string): Promise<RecordEnvelope | null> {
    const samples = await this.store.list({ kind: 'sample' })
    for (const rec of samples) {
      const ids = obj(rec.payload)?.identifiers
      if (!Array.isArray(ids)) continue
      for (const id of ids) {
        const i = obj(id)
        if (i && i.system === 'tyf-barcode' && i.value === barcode) return rec
      }
    }
    return null
  }

  private async sampleRegistered(payload: Payload): Promise<ProcessedEvent> {
    const orderRemoteId = str(payload.order_remote_id)
    if (!orderRemoteId) throw new HandlerError('sample.registered payload missing order_remote_id')
    const barcode = str(payload.barcode)
    if (!barcode) throw new HandlerError('sample.registered payload missing barcode')

    const pattern = this.barcodePattern()
    if (!pattern || !pattern.test(barcode)) {
      return { status: 'unknown_type', affectedRecordIds: [], error: `malformed barcode ${barcode} (expected ${pattern?.source ?? 'no tyf-barcode pattern in mapping'})` }
    }

    const order = await this.findOrderByRemoteId(orderRemoteId)
    if (!order) {
      return { status: 'unknown_type', affectedRecordIds: [], error: `unknown order_remote_id ${orderRemoteId}` }
    }

    const descRaw = obj(payload.customer_sample_description) ?? {}
    const customerDescription: Payload = {}
    const typeSlug = str(descRaw.type)
    if (typeSlug !== undefined) {
      const mx = resolveMatrix(this.mapping, typeSlug)
      if (!mx) {
        throw new HandlerError(`unmapped matrix slug ${typeSlug} (add it to config/lab-sync/mapping.yaml)`)
      }
      customerDescription.matrix = mx.term
    }
    const desc = str(descRaw.description)
    if (desc !== undefined) customerDescription.description = desc
    const label = str(descRaw.customer_label)
    if (label !== undefined) customerDescription.customerLabel = label

    const affected: string[] = []

    // Extended identity fields (shared contract): REG always mirrors them;
    // the SAMPLE gains a tyf-sample-id identifier alongside the barcode.
    const sampleId = str(payload.sample_id)
    const lineId = str(payload.line_id)
    const slot = num(payload.slot)

    // 1. The registration record (customer intent, preserved verbatim).
    const regId = await nextSequentialRecordId(this.store, 'REG-')
    const regPayload: Payload = {
      kind: 'sample-registration',
      recordId: regId,
      orderRef: { kind: 'record', id: order.recordId, type: 'order' },
      identifier: { system: 'tyf-barcode', value: barcode },
      registeredAt: str(payload.registered_at) ?? this.now().toISOString(),
    }
    if (Object.keys(customerDescription).length > 0) regPayload.customerDescription = customerDescription
    if (sampleId !== undefined) regPayload.sampleId = sampleId
    if (lineId !== undefined) regPayload.lineId = lineId
    if (slot !== undefined) regPayload.slot = slot
    const regRes = await this.store.create({
      envelope: { recordId: regId, schemaId: SCHEMA_IDS.sampleRegistration, payload: regPayload },
      message: `lab-sync sample.registered ${barcode} for ${orderRemoteId}`,
    })
    if (!regRes.success) throw new Error(`failed to create sample-registration ${barcode}: ${regRes.error ?? 'unknown'}`)
    affected.push(regId)

    // 2. Upsert the SAMPLE: only mint when no sample for THIS order carries
    //    this barcode yet (same barcode on a different order = different tube).
    let sample = await this.findSampleByBarcode(barcode)
    const sampleOrderRef = obj(obj(sample?.payload)?.requestRef)
    if (sample && sampleOrderRef?.id !== order.recordId) sample = null
    if (!sample) {
      const year = String(this.now().getUTCFullYear())
      const smpId = await nextSequentialRecordId(this.store, 'SMP-', { datePart: `${year}-` })
      const identifiers: Payload[] = [{ system: 'tyf-barcode', value: barcode }]
      if (sampleId !== undefined) identifiers.push({ system: 'tyf-sample-id', value: sampleId })
      const smpPayload: Payload = {
        kind: 'sample',
        recordId: smpId,
        requestRef: { kind: 'record', id: order.recordId, type: 'order' },
        identifiers,
        lifecycleId: 'lab-sample',
        status: 'registered',
      }
      if (Object.keys(customerDescription).length > 0) smpPayload.submittedDescription = { ...customerDescription }
      const smpRes = await this.store.create({
        envelope: { recordId: smpId, schemaId: SCHEMA_IDS.sample, payload: smpPayload },
        message: `lab-sync sample minted for ${barcode}`,
      })
      if (!smpRes.success) throw new Error(`failed to create sample ${barcode}: ${smpRes.error ?? 'unknown'}`)
      affected.push(smpId)
      sample = { recordId: smpId, schemaId: SCHEMA_IDS.sample, payload: smpPayload }
    } else if (sampleId !== undefined) {
      // Backfill: a later registration reveals the sample_id the mint lacked.
      const sp = sample.payload as Payload
      const ids = Array.isArray(sp.identifiers) ? [...(sp.identifiers as Payload[])] : []
      if (!ids.some((i) => obj(i)?.system === 'tyf-sample-id')) {
        ids.push({ system: 'tyf-sample-id', value: sampleId })
        const updatedSample: Payload = { ...sp, identifiers: ids }
        const smpUpd = await this.store.update({
          envelope: { recordId: sample.recordId, schemaId: sample.schemaId, payload: updatedSample },
          message: `lab-sync sample.registered backfilled sample_id ${sampleId} on ${sample.recordId}`,
        })
        if (!smpUpd.success) throw new Error(`failed to backfill sample_id on ${sample.recordId}: ${smpUpd.error ?? 'unknown'}`)
        affected.push(sample.recordId)
      }
    }

    // 3. Link the sample on the order; forward-only lifecycle advance.
    const op = { ...(order.payload as Payload) }
    const refs = Array.isArray(op.sampleRefs) ? [...(op.sampleRefs as Payload[])] : []
    const newRef: Payload = { kind: 'record', id: sample.recordId, type: 'sample' }
    if (!refs.some((r) => r.id === sample!.recordId)) {
      refs.push(newRef)
      op.sampleRefs = refs
    }
    if (op.status === 'awaiting_sample') op.status = 'sample_registered'
    const upd = await this.store.update({
      envelope: { recordId: order.recordId, schemaId: order.schemaId, payload: op },
      message: `lab-sync sample.registered linked ${barcode} to ${order.recordId}`,
    })
    if (!upd.success) throw new Error(`failed to link sample on ${order.recordId}: ${upd.error ?? 'unknown'}`)
    affected.push(order.recordId)

    return { status: 'applied', affectedRecordIds: affected }
  }

  private async sampleShipped(payload: Payload): Promise<ProcessedEvent> {
    const barcode = str(payload.barcode)
    let order: RecordEnvelope | null = null
    if (barcode) {
      const sample = await this.findSampleByBarcode(barcode)
      const ref = obj(obj(sample?.payload)?.requestRef)
      if (sample && ref && typeof ref.id === 'string') order = await this.store.get(ref.id)
    }
    if (!order) {
      const orderRemoteId = str(payload.order_remote_id)
      if (orderRemoteId) order = await this.findOrderByRemoteId(orderRemoteId)
    }
    if (!order) {
      return { status: 'unknown_type', affectedRecordIds: [], error: 'sample.shipped references no known order/barcode' }
    }

    // Forward-only: sample_registered -> in_transit. Any other current status
    // means the move would be backward — mirror only, no mutation.
    const p = order.payload as Payload
    if (p.status !== 'sample_registered') {
      return { status: 'applied', affectedRecordIds: [] }
    }
    const op = { ...p, status: 'in_transit' }
    const res = await this.store.update({
      envelope: { recordId: order.recordId, schemaId: order.schemaId, payload: op },
      message: `lab-sync sample.shipped ${barcode ?? ''} -> ${order.recordId} in_transit`,
    })
    if (!res.success) throw new Error(`failed to update order ${order.recordId}: ${res.error ?? 'unknown'}`)
    return { status: 'applied', affectedRecordIds: [order.recordId] }
  }
}
