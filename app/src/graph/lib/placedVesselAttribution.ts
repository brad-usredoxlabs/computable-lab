/**
 * placedVesselAttribution — L2-PROMPT1-GHOST-1: the SINGLE vocabulary for
 * the "single placed vessel" attribution rule (L2-SUITE-A-uifix2 FIX2 D2).
 *
 * The rule (one fact, one representation — never two local vocabularies):
 * an event that carries wells but names NO labware attribute to the
 * bench's SOLE placed labware, and ONLY when the placed set holds exactly
 * ONE entry. ZERO placed labwares => nothing to attribute to; MULTIPLE
 * distinct placed labwares => genuinely ambiguous => attribute to NOTHING
 * (never guess). An event WITH an explicit reference self-attributes and
 * is never re-routed (the caller filters those out before consulting
 * this helper — the candidates list is the event's OWN explicit labware
 * references).
 *
 * Consumers:
 *  - eventWellIndex.ts (the DECK tile footprint index — the rule's
 *    original home; behavior stays byte-identical, pinned by its tests);
 *  - eventGraph.ts computeLabwareStates (the Labware-focus grid fill)
 *    and getWellEvents (the same wells' event-history reader —
 *    history-vs-fill consistency).
 *
 * The rule keys off the placed-labware COUNT only: no field-name
 * literals, no domain vocabulary here. The placed set is the caller's
 * committed placements (eventWellIndex's `placedLabwareIds` parameter,
 * the `labwares` map in eventGraph) — the same facts both surfaces
 * already consume, so both pick the SAME vessel for the SAME event set.
 */

/**
 * Resolve the sole placed vessel a reference-less event attributes to.
 *
 * @param explicitRefs  the event's OWN explicit labware references (the
 *                      details' labwareId / source / dest ids). Non-empty
 *                      => the event self-attributes; the placed-vessel
 *                      fallback is FORBIDDEN (never re-route an explicit
 *                      reference) -> null. Non-string entries are
 *                      ignored (the caller passes details fields as-is).
 * @param placedLabwares  the labwares currently placed on the bench
 *                      (the committed placements the caller already
 *                      resolves). Exactly ONE entry => that vessel;
 *                      ZERO or MULTIPLE => null (never guess).
 * @returns the attributed vessel id, or null when the event attributes
 *          to NOTHING (explicit reference, zero placed, or ambiguous).
 */
export function resolvePlacedVesselAttribution(
  explicitRefs: readonly unknown[],
  placedLabwares: readonly unknown[],
): string | null {
  const refs = new Set(
    explicitRefs.filter((id): id is string => typeof id === 'string' && id.length > 0),
  )
  if (refs.size > 0) return null
  const placed = new Set(
    placedLabwares.filter((id): id is string => typeof id === 'string' && id.length > 0),
  )
  if (placed.size !== 1) return null
  const [sole] = placed
  return sole ?? null
}
