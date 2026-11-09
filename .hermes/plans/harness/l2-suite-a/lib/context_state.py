"""The held session's deck state — the LAYER-(a) ghost-mount equivalent.

What this is: in the browser leg (layer (b), orch-owned), an accepted AI
proposal MOUNTS AS GHOSTS on the editor state (DeckSurfaceChat's
onProposalDrafted seam → useDeckGhostMount): events ghosted, a placement per
resolved labware offer, the well-state snapshot accumulated — and the NEXT
turn's surfaceContext carries that state (labwares / eventSummary /
wellStateSnapshot / counts). Layer (a) is write-free (OQ1: zero run writes;
no accept/apply/promote route is ever called), so the driver reproduces that
client-side accumulation LOCALLY and rides it request-injected on
context.labwares (the FREEFORM probe-injection point,
AgentOrchestrator.ts:1306 `context?.labwares`) — exactly the seam OQ1
sanctioned. The server never sees a write; it sees the deck the product's
ghost mount would show the scientist.

What this is NOT: a second source of truth for well semantics. Well RANGE
expansion (B1:H6 → 30 wells) is the compiler's (expandWellTokens); the
accumulated state stores only the delivered event's own `details.wells`
(server result pass-through, never re-derived here — B3). The P7 expected
set ("all wells that contain materials") is the UNION of the material wells
the delivered events of P2-P6 actually carried — read from THIS state, never
a literal.

Byte-stability (B5): the conversation-key identity fields (runId,
eventGraphId, platformId, variantId, vocabPackId) never change across turns;
only the ghost-mounted volatile fields change, and only when a turn
delivered a draft — exactly the product's own post-accept behavior.
"""


def _ref_label(material):
    """Structural pass-through of a delivered materials[] ref's label —
    mint.label / curie string. No vocabulary introduced."""
    if not isinstance(material, dict):
        return None
    ref = material.get("ref")
    if not isinstance(ref, dict):
        return None
    mint = ref.get("mint")
    if isinstance(mint, dict) and mint.get("label"):
        return str(mint["label"])
    if isinstance(ref.get("curie"), str):
        return ref["curie"]
    if isinstance(ref.get("label"), str):
        return ref["label"]
    return None


def _event_materials(event):
    out = []
    for m in (event.get("materials") or []):
        label = _ref_label(m)
        if label is None:
            continue
        entry = {"label": label}
        vol = m.get("volume")
        if isinstance(vol, dict) and isinstance(vol.get("value"), (int, float)):
            entry["volume_uL"] = vol["value"]
        out.append(entry)
    return out


def _event_wells(event):
    d = event.get("details") or {}
    w = d.get("wells")
    if isinstance(w, list):
        return [x for x in w if isinstance(x, str)]
    if isinstance(w, str):
        return [w]
    if isinstance(d.get("well"), str):
        return [d["well"]]
    return []


def _event_summary_line(event):
    """Mirror app/src/types/events.getEventSummary's display shape closely
    enough for the prompt channel (structural pass-through of the event's own
    fields; the server joins these into the [Deck events] block)."""
    verb = str(event.get("verb") or event.get("event_type") or "event")
    wells = _event_wells(event)
    if len(wells) == 0:
        well_str = ""
    elif len(wells) == 1:
        well_str = "(%s)" % wells[0]
    elif len(wells) <= 6:
        well_str = "(%s)" % ", ".join(wells)
    else:
        well_str = "(%d wells)" % len(wells)
    mats = _event_materials(event)
    label = mats[0]["label"] if mats else ""
    vol = ""
    if mats and "volume_uL" in mats[0]:
        vol = "%s uL" % mats[0]["volume_uL"]
    pieces = [p for p in (verb, label, vol, well_str) if p]
    return " ".join(pieces)


class AccumulatedDeckState:
    def __init__(self, preseed=None):
        # --single debug aid (OQ2): pre-placed plate ids for request-injected
        # deck state; the held --all session starts from the empty deck.
        self.labwares = []
        self.events = []
        self.well_state = {}  # (labwareId, well) -> {label, volume_uL, eventCount}
        self.placement_count = 0
        self._ghost_seq = 0
        self.turn_index = 0
        if preseed:
            for i, lid in enumerate(preseed):
                self.labwares.append(
                    {"labwareId": lid, "labwareType": "plate",
                     "name": "Plate %d" % (i + 1)})
                self.placement_count += 1

    # -- ghost-mount absorption ------------------------------------------------

    def absorb(self, result, frames):
        result = result or {}
        # 1) a placement per resolved labware offer / concrete addition
        #    (useDeckGhostMount contract: "a placement per resolved labware
        #    offer") — labwareId = the record id (the browser ghosts a
        #    PLACEMENT OF THE EXISTING record from this channel).
        for offer in (result.get("resolvedLabwares") or []):
            if not isinstance(offer, dict):
                continue
            rid = offer.get("recordId")
            if not isinstance(rid, str) or any(l["labwareId"] == rid
                                               for l in self.labwares):
                continue
            self.labwares.append({
                "labwareId": rid,
                "labwareType": str(offer.get("title") or offer.get("hint") or rid),
                "name": str(offer.get("title") or offer.get("hint") or rid),
            })
            self.placement_count += 1
        for add in (result.get("labwareAdditions") or []):
            if not isinstance(add, dict):
                continue
            rid = add.get("recordId")
            if not isinstance(rid, str) or any(l["labwareId"] == rid
                                               for l in self.labwares):
                continue
            self.labwares.append({
                "labwareId": rid,
                "labwareType": str(add.get("reason") or rid),
                "name": str(add.get("reason") or rid),
            })
            self.placement_count += 1
        # 2) generic labware requirements ghost as preview labware entries
        #    (the browser ghosts a placeholder; the id is harness-minted,
        #    deterministic per run — data pass-through of the requirement's
        #    own handle/classCurie, zero vocabulary).
        for req in (result.get("labwareRequirements") or []):
            if not isinstance(req, dict):
                continue
            self._ghost_seq += 1
            lid = "GHST-labware-%d" % self._ghost_seq
            name = req.get("handle") or req.get("classCurie") or ("ghost-labware-%d" % self._ghost_seq)
            self.labwares.append({
                "labwareId": lid,
                "labwareType": str(name),
                "name": str(name),
            })
            self.placement_count += 1
        # 3) events ghosted: the summary line + the well-state accumulation.
        #    l2t1705 harness fidelity (OQ-1 ruling, decisions/
        #    WELLSET-RESOLVER-1-oq-rulings-l2t1705.md): the PRODUCT binds an
        #    add_material's labware through the resolvedLabwares OFFER channel
        #    (details.labwareId stays absent on those events — receipts
        #    20261027T192830Z prompt-3: 42 wells, labwareId None; the browser
        #    ghosts the same way). The accumulation read ONLY
        #    details.labwareId, so the P7 expected union was vacuously [].
        #    Mirror the browser's binding: when this turn resolved EXACTLY ONE
        #    labware, material events lacking a details binding ride that
        #    offer. Zero or several resolved labware this turn -> the binding
        #    is ambiguous -> skip (never-guess), same conservatism as the
        #    product. Expectations files stay untouched (no-weaken).
        bound = self.resolved_ids(result)
        fallback_lid = bound[0] if len(bound) == 1 else None
        for ev in (result.get("events") or []):
            if not isinstance(ev, dict):
                continue
            self.events.append(ev)
            self._accumulate_wells(ev, fallback_lid=fallback_lid)
        # a deck_layout done carries no deck state change (the client applies
        # it to the editor; the probe's harness-owned identity stays put).

    def _accumulate_wells(self, ev, fallback_lid=None):
        verb = str(ev.get("verb") or ev.get("event_type") or "")
        # material-bearing verbs only for the COMPUTED set (P7: "all wells
        # that CONTAIN MATERIALS"): a mix event's wells do not add material.
        if verb not in ("add_material", "multi_dispense", "dispense"):
            return
        d = ev.get("details") or {}
        lid = d.get("labwareId")
        if not isinstance(lid, str):
            # harness fidelity l2t1705: ride the turn's unique resolved-labware
            # offer when the event carries no details binding (see absorb()).
            lid = fallback_lid
        if not isinstance(lid, str):
            return
        mats = _event_materials(ev)
        for w in _event_wells(ev):
            key = (lid, w)
            slot = self.well_state.setdefault(
                key, {"labwareId": lid, "materials": [], "totalVolume_uL": 0.0,
                      "eventCount": 0})
            slot["eventCount"] += 1
            for m in mats:
                slot["materials"].append(m)
                if "volume_uL" in m:
                    slot["totalVolume_uL"] += m["volume_uL"]

    # -- views -----------------------------------------------------------------

    def deck_ids(self):
        return [l["labwareId"] for l in self.labwares]

    @staticmethod
    def resolved_ids(result):
        out = []
        result = result or {}
        for offer in (result.get("resolvedLabwares") or []):
            if isinstance(offer, dict) and isinstance(offer.get("recordId"), str):
                out.append(offer["recordId"])
        for add in (result.get("labwareAdditions") or []):
            if isinstance(add, dict) and isinstance(add.get("recordId"), str):
                out.append(add["recordId"])
        return out

    def material_wells(self):
        """The union of wells containing materials this run (P7's expected
        set — computed, never a literal; B3)."""
        return sorted({w for (_lid, w) in self.well_state})

    def begin_turn(self):
        """B5: advance the DRIVEN-turn ordinal (0 = first driven turn) and
        return the ordinal this turn holds. Called once per driven prompt so
        the held-thread key evidence indexes to ITS turn. A blocked-by (not
        driven) dependent prompt never calls this — it is downgraded, not
        driven — so the ordinal counts actual driven turns, not prompt
        numbers. (Advc cycle-1 D3: turn_index was initialised to 0 and never
        incremented, so every key_evidence entry stamped prompt_idx:0.)"""
        idx = self.turn_index
        self.turn_index += 1
        return idx

    def well_state_snapshot(self):
        # app-side shape (EditorContext.wellStateSnapshot): the labware name
        # rides the summary; harvested=false (nothing is harvested here).
        name_of = {l["labwareId"]: l.get("name") or l["labwareId"]
                   for l in self.labwares}
        out = []
        for (lid, w), slot in sorted(self.well_state.items()):
            out.append({
                "labwareId": lid,
                "labwareName": name_of.get(lid, lid),
                "wellId": w,
                "totalVolume_uL": slot["totalVolume_uL"],
                "materials": slot["materials"],
                "eventCount": slot["eventCount"],
                "harvested": False,
            })
        return out

    def event_summary(self):
        if not self.events:
            return "No events yet."
        # DeckSurfaceChat: the last 20, joined by '; '
        return "; ".join(_event_summary_line(e) for e in self.events[-20:])

    def surface_context(self, event_graph_id, run_id, platform_id, variant_id,
                        vocab_pack_id, available_verbs):
        """The DeckSurfaceChat.tsx:63-83 surfaceContext — same fields, same
        key order (the byte-stable wire shape the driver mirrors; OQ4
        ruling: capture the real request body the merged client sends).

        NOTE: the merged deck surface does NOT send wellStateSnapshot — its
        field set is exactly the 11 above. The driver keeps the well state
        INTERNAL (P7's computed union + B5 evidence); a server that cannot
        honor P7's "all wells that contain materials" from the channels the
        product actually sends is an architect finding (OQ4 standing
        default), pinned RED, not a harness addition of a field the product
        never drives. well_state_snapshot() is retained for receipts."""
        return {
            "eventGraphId": event_graph_id,
            "runId": run_id,
            "platformId": platform_id,
            "variantId": variant_id,
            "vocabPackId": vocab_pack_id,
            "placementCount": self.placement_count,
            "eventCount": len(self.events),
            "labwares": list(self.labwares),
            "eventSummary": self.event_summary(),
            "availableVerbs": list(available_verbs),
            "selection": None,
        }
