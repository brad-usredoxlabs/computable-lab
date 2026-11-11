# Role binding — what the gate found, which level a binding points at, and why it is not a Brad decision

Source: browser gate `receipts/SUBPROTO-EXPAND-browser-g3-20261111T0755Z` (verdict: **fix**),
findings F2/F3/F4 of `SUBPROTO-EXPAND-browser-g2-20261110T1658Z`, and the earlier honest
`VERDICT: blocked` from `brgate-lb1-g1` ("no protocol in the lane-2 data repo has
`protocolRoles` defined"). Brad asked, 2026-11-11: "explain to me the role issue? this is
something that will be fixed or a decision is needed from me?"

## The three defects (all defects, none of them a policy question)

1. **The page reads roles from the wrong record.** `app/src/graph/BindingMode/RoleBindingPanel.tsx:167`
   prints "No roles defined in the local protocol." when its two role lists are empty. A LOCAL
   protocol declares no roles of its own — it INHERITS them from the universal protocol
   (`inherits_from`); that inheritance is exactly what `buildPlanGraph` was just fixed to resolve
   (merge da149ddd) and what `roleBindingProposal.ts` already walks today (it returns four roles
   for the served planned run). So the panel is rendering the local record's own empty list while
   the server beside it holds the right answer.
2. **Two candidate universes for one entity.** `RoleBindingPanel` renders each material role against
   `materialInstanceList` — physical instances. Served today: `labware-instance` 0, `material-instance`
   0, against `labware` 20, `material` 28, `vendor-product` 2. The binding rows would be empty menus
   even with the roles visible. The proposals endpoint and the panel simply disagree about what a
   bindable thing is.
3. **Wrong id at the mount.** `RoleBindingProposalsPanel` is mounted with the RUN id where the route
   expects the PLANNED-RUN id, so it returns `400 NOT_A_PLANNED_RUN` and never renders (g2 F4).
   That panel is read-only by design (its own header says a candidate is only PROPOSED).

Consequence: no role can be bound anywhere in the app, therefore no local plan is emitted, therefore
every downstream clause in g3 is "UNTESTED — cannot pass" rather than failed. The reviewer said exactly
that instead of guessing, which is why the verdict is trustworthy.

## The one judgement call — RULED, not deferred

**Which level does a binding point at: the declaration (plate type / material concept or vendor
product), or the physical thing (a specific instance, lot, bottle)?**

RULING: **the declaration.** A binding names the thing the protocol declared — a labware
definition/type for a labware role, a `material` concept or a `vendor-product` for a material role.
Resolving that to a physical instance + lot happens at plan expansion, against inventory, where a
lot is supplied by a receipted receiving record. A `material-instance` may appear as an ADDITIONAL
candidate (architect call 2026-11-10, commit c325edf4) but it never replaces the declaration-level
candidates and it never becomes the default.

Why, in the project's own terms:

- The declaration is the only authority that exists at binding time. A protocol says "a source plate"
  and "a medium"; it does not and must not say which bottle.
- The provenance hierarchy is not a preference: concept ≠ formulation ≠ instance ≠ aliquot. Binding
  to an instance collapses two layers at the point where the scientist is expressing intent, and it
  makes binding impossible until someone has physically received stock.
- Today's data makes the alternative unworkable anyway: zero instances, zero lots, 50 catalogue
  records. A design that requires instances cannot be demonstrated at all this week.

**What WOULD need Brad's word:** if the intent is that the scientist chooses the actual bottle/lot at
binding time (binding = physical commitment), that is a different product shape and it contradicts
the layer separation above. Until Brad says so, the ruling above stands and no other work is blocked
by it.

## Consequences for the lane (no new scope)

- Fix 1 and 3 are wiring: read roles from the inherited declaration (the same walk the proposals
  endpoint already does) and mount the proposals panel with the planned-run id. `L2-PROTOCOL-LOCAL-BIND-1`
  owns this seam; no new item is needed.
- Fix 2 is a one-line-of-intent change: the binding rows must offer the endpoint's candidates
  (catalogue level) — the instance list is not a substitute and, empty, it silently reads as
  "nothing to bind".
- The browser gate does not need to be re-scoped: its clauses stay as written; g3's "UNTESTED —
  cannot pass" rows become testable once a role can be bound.
