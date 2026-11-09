#!/usr/bin/env python3
"""RED/GREEN proof for the l2t1705 harness-fidelity fix in
lib/context_state.py (OQ-1 ruling, decisions/
WELLSET-RESOLVER-1-oq-rulings-l2t1705.md).

The product binds an add_material's labware through the resolvedLabwares
OFFER channel (details.labwareId stays absent — receipts
20261027T192830Z prompt-3: 42 wells, labwareId None). The accumulation used
to read ONLY details.labwareId, so P7's expected union was vacuously [].
Pre-fix, leg 1 below FAILS (the shipped shape yields [] — that IS the RED);
post-fix it is 42. Legs 2-4 are the never-guess teeth: they must stay [] /
detail-bound in BOTH worlds (they pin conservatism, not the fix).

Run: python3 .hermes/plans/harness/l2-suite-a/test-offer-bind-selfcheck.py
Exit 0 = all legs pass. Expectations files are NEVER touched by this fix.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.context_state import AccumulatedDeckState  # noqa: E402

SHIPPED_WELLS = ["%s%d" % (c, r) for r in range(1, 7) for c in "BCDEFGH"]  # B1:H6


def main():
    fails = []
    ev = {"verb": "add_material",
          "details": {"wells": list(SHIPPED_WELLS),
                      "materials": [{"label": "DMEM"}]}}

    # leg 1 (the RED->GREEN fix leg): shipped shape — no details.labwareId,
    # exactly ONE resolved offer -> union is non-empty.
    st = AccumulatedDeckState()
    st.absorb({"events": [ev],
               "resolvedLabwares": [{"recordId": "lbw-seed-plate-96-flat",
                                     "title": "plate"}]}, [])
    got = st.material_wells()
    if sorted(got) != sorted(SHIPPED_WELLS):
        fails.append("leg1 offer-bind union: got %d wells, expect %d"
                     % (len(got), len(SHIPPED_WELLS)))

    # leg 2 (never-guess): zero offers this turn -> stays empty.
    st2 = AccumulatedDeckState()
    st2.absorb({"events": [ev], "resolvedLabwares": []}, [])
    if st2.material_wells():
        fails.append("leg2 zero-offer ambiguity must NOT bind: %r"
                     % st2.material_wells()[:3])

    # leg 3 (never-guess): two offers -> binding ambiguous -> skip.
    st3 = AccumulatedDeckState()
    st3.absorb({"events": [ev],
                "resolvedLabwares": [{"recordId": "A"}, {"recordId": "B"}]}, [])
    if st3.material_wells():
        fails.append("leg3 two-offer ambiguity must NOT bind: %r"
                     % st3.material_wells()[:3])

    # leg 4 (byte-stable): a details.labwareId binding still always wins.
    st4 = AccumulatedDeckState()
    st4.absorb({"events": [{"verb": "add_material",
                            "details": {"wells": ["A1"],
                                        "labwareId": "lab-X",
                                        "materials": []}}],
                "resolvedLabwares": [{"recordId": "lab-Y"}]}, [])
    if list(st4.well_state.keys()) != [("lab-X", "A1")]:
        fails.append("leg4 details binding must win: %r"
                     % list(st4.well_state.keys()))

    if fails:
        print("OFFER-BIND SELFCHECK FAIL")
        for f in fails:
            print(" -", f)
        return 1
    print("OFFER-BIND SELFCHECK PASS (4/4: shipped-shape 42-well union, "
          "zero-offer vacuous, two-offer vacuous, details-binding wins)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
