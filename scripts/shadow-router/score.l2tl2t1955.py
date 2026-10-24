#!/usr/bin/env python3
"""PROTO-AI-13 — shadow-router spike verdict scorer (lane 2, worker l2t1955).

Reproducible, deterministic scorer over the append-only paired telemetry written
by the PROTO-AI-12 §4 shadow adapter. NO network, NO LLM — this scores logged ids.

Signed evaluation contract (PROTO-AI-12 pre-registration §2, SIGNED AS WRITTEN by
Brad 2026-10-06T08:52 EDT, decisions/PROTO-AI-12-prereg-approval.md — thresholds
are FIXED and this script hardcodes them from the signed text, never from data):

  - Metrics: overall agreement + protocol_edit-class agreement vs the big model's
    authoritative pick (the big model's emitted intent on the same turn).
  - Thresholds: overall >= 95%; protocol_edit-class >= 98%.
  - Denominators include timeouts, abstentions AND parse-failures (a parse failure
    counts AGAINST; it is never skipped).
  - Minimum sample: >= 500 paired turns with >= 50 protocol_edit turns; fewer =>
    verdict INSUFFICIENT (never PASS).
  - Latency: p95 router-pick <= 2000 ms on appliance-2 CPU.
  - Confusion matrix per intent (4x4 over the four pre-registration intents).

The router classifies over exactly the four pre-registration intents
(event_graph | deck_layout | create_record | protocol_edit). The authoritative
side may carry intents added to the surface AFTER the pre-registration (e.g.
event_shorthand); such turns can never agree by construction. Both readings are
reported: (a) PRIMARY = the signed denominator as written (all paired records,
parse-failures count against); (b) SENSITIVITY = four-intent-restricted
(authoritative turns outside the pre-registered menu excluded). The verdict
follows (a); pre-registration is binding.

Usage: python3 score.l2tl2t1955.py <events.jsonl>
Exit: 0 only when the verdict is PASS and no deviation flags fired;
      non-zero on any deviation flag (threshold miss, sample gate miss,
      latency ceiling miss, or data-integrity anomaly).
"""

import argparse
import hashlib
import json
import math
import statistics
import sys
from collections import Counter

# ---- SIGNED CONTRACT (do not edit; changing these after evidence = re-registration) ----
THRESHOLD_OVERALL = 0.95          # overall agreement >= 95%
THRESHOLD_PROTOCOL_EDIT = 0.98    # protocol_edit-class agreement >= 98%
MIN_PAIRED_TURNS = 500            # >= 500 paired turns
MIN_PROTOCOL_EDIT_TURNS = 50      # with >= 50 protocol_edit turns
P95_LATENCY_MS = 2000             # p95 router-pick <= 2000 ms (Brad 2026-10-06)

# The four intents the router classifies over (PROTO-AI-12 §2 / PROTO-AI-7 enum).
PRE_REG_INTENTS = ("event_graph", "deck_layout", "create_record", "protocol_edit")

# Router pick vocabulary that is NOT one of the four intents:
PARSE_FAILURE = "parse_failure"   # malformed router output; counts AGAINST
TIMEOUT_MARKERS = ("timeout", "router_timeout")  # abstention-by-timeout if logged

CORE_KEYS = ("ts", "correlationId", "routerPick", "authoritativePick",
             "routerModel", "bigModel", "routerLatencyMs", "bigModelLatencyMs")
# errorClass is OPTIONAL in the shipped writer (exactOptionalPropertyTypes: a clean
# pick OMITS the key rather than writing null). Absence is not an anomaly; a
# non-parse pick CARRYING a non-null errorClass, or a parse_failure carrying a
# class other than 'parse', is.
OPTIONAL_KEYS = ("errorClass",)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def percentile_nearest_rank(sorted_vals, pct):
    """Deterministic nearest-rank p{pct}: index ceil(pct/100 * n) - 1 on the sorted list."""
    n = len(sorted_vals)
    if n == 0:
        return None
    rank = max(1, math.ceil(pct / 100.0 * n))
    return sorted_vals[rank - 1]


def load_records(path):
    records = []
    anomalies = []
    seen_ids = Counter()
    with open(path, "r", encoding="utf-8") as f:
        for lineno, raw in enumerate(f, 1):
            line = raw.strip()
            if not line:
                anomalies.append(f"line {lineno}: blank line")
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError as exc:
                anomalies.append(f"line {lineno}: malformed JSON ({exc})")
                continue
            if not isinstance(rec, dict):
                anomalies.append(f"line {lineno}: record is not an object")
                continue
            missing = [k for k in CORE_KEYS if k not in rec]
            if missing:
                anomalies.append(f"line {lineno}: missing keys {missing}")
            ec = rec.get("errorClass", None)
            pick = rec.get("routerPick")
            if pick == PARSE_FAILURE and ec not in (None, "parse"):
                anomalies.append(f"line {lineno}: parse_failure with errorClass {ec!r}")
            if pick not in (PARSE_FAILURE,) + TIMEOUT_MARKERS and ec is not None:
                anomalies.append(f"line {lineno}: clean pick {pick!r} carries errorClass {ec!r}")
            cid = rec.get("correlationId")
            seen_ids[cid] += 1
            records.append((lineno, rec))
    dup_ids = sorted(cid for cid, n in seen_ids.items() if n > 1)
    if dup_ids:
        anomalies.append(f"duplicate correlationIds: {len(dup_ids)} ({', '.join(dup_ids[:10])})")
    return records, anomalies


def classify_router_pick(pick):
    if pick in PRE_REG_INTENTS:
        return "intent"
    if pick == PARSE_FAILURE:
        return "parse_failure"
    if pick in TIMEOUT_MARKERS:
        return "timeout"
    return "abstention_or_other"


def main():
    ap = argparse.ArgumentParser(description="PROTO-AI-13 shadow-router verdict scorer")
    ap.add_argument("events", help="path to the shadow-router events.jsonl snapshot")
    args = ap.parse_args()

    path = args.events
    digest = sha256_file(path)
    records, anomalies = load_records(path)

    n = len(records)
    deviations = list(anomalies)  # data-integrity deviations flag the exit code too

    router_pick_counts = Counter(r["routerPick"] for _, r in records)
    auth_pick_counts = Counter(r["authoritativePick"] for _, r in records)
    error_class_counts = Counter(str(r.get("errorClass")) for _, r in records)
    router_model_counts = Counter(r.get("routerModel") for _, r in records)
    big_model_counts = Counter(r.get("bigModel") for _, r in records)

    ts_values = sorted(r["ts"] for _, r in records)
    ts_min = ts_values[0] if ts_values else None
    ts_max = ts_values[-1] if ts_values else None

    # ---- denominator accounting (signed rule: timeouts/abstentions/parse-failures IN) ----
    class_counts = Counter(classify_router_pick(r["routerPick"]) for _, r in records)
    parse_failures = class_counts["parse_failure"]
    timeouts = class_counts["timeout"]
    abstentions = class_counts["abstention_or_other"]
    parseable = class_counts["intent"]

    # ---- agreement, PRIMARY denominator = all paired records (as signed) ----
    agreements = [r["routerPick"] == r["authoritativePick"] for _, r in records]
    agree_n = sum(agreements)
    overall_rate = (agree_n / n) if n else 0.0

    pe_records = [(ln, r) for ln, r in records if r["authoritativePick"] == "protocol_edit"]
    pe_n = len(pe_records)
    pe_agree = sum(1 for _, r in pe_records if r["routerPick"] == "protocol_edit")
    pe_rate = (pe_agree / pe_n) if pe_n else 0.0

    # ---- SENSITIVITY: four-intent-restricted denominator (labelled, NOT the verdict) ----
    restricted = [(ln, r) for ln, r in records if r["authoritativePick"] in PRE_REG_INTENTS]
    restricted_n = len(restricted)
    restricted_agree = sum(1 for _, r in restricted if r["routerPick"] == r["authoritativePick"])
    restricted_rate = (restricted_agree / restricted_n) if restricted_n else 0.0
    restricted_parse_failures = sum(1 for _, r in restricted if r["routerPick"] == PARSE_FAILURE)
    drift_n = n - restricted_n  # authoritative picks outside the pre-registered menu

    # ---- confusion matrix: rows = authoritative, cols = router ----
    router_cols = list(PRE_REG_INTENTS) + [PARSE_FAILURE]
    extra_router_cols = sorted(set(router_pick_counts) - set(router_cols))
    router_cols += extra_router_cols
    auth_rows = list(PRE_REG_INTENTS) + sorted(set(auth_pick_counts) - set(PRE_REG_INTENTS))
    matrix = Counter()
    for _, r in records:
        matrix[(r["authoritativePick"], r["routerPick"])] += 1

    # ---- latency (router-pick latency; primary population = ALL paired records) ----
    lat_all = sorted(r["routerLatencyMs"] for _, r in records
                     if isinstance(r.get("routerLatencyMs"), (int, float)))
    lat_parseable = sorted(r["routerLatencyMs"] for _, r in records
                           if classify_router_pick(r["routerPick"]) == "intent"
                           and isinstance(r.get("routerLatencyMs"), (int, float)))
    lat_missing = n - len(lat_all)
    if lat_missing:
        deviations.append(f"{lat_missing} records without numeric routerLatencyMs")

    def lat_stats(vals):
        if not vals:
            return None
        return {
            "n": len(vals),
            "median": statistics.median(vals),
            "p95": percentile_nearest_rank(vals, 95),
            "max": max(vals),
        }

    lat_primary = lat_stats(lat_all)
    lat_secondary = lat_stats(lat_parseable)

    # ---- gate + threshold evaluation against the SIGNED numbers ----
    sample_gate_met = n >= MIN_PAIRED_TURNS and pe_n >= MIN_PROTOCOL_EDIT_TURNS
    overall_met = overall_rate >= THRESHOLD_OVERALL
    pe_met = pe_rate >= THRESHOLD_PROTOCOL_EDIT
    latency_met = lat_primary is not None and lat_primary["p95"] <= P95_LATENCY_MS

    if not sample_gate_met:
        verdict = "INSUFFICIENT"
    elif overall_met and pe_met and latency_met:
        verdict = "PASS"
    else:
        verdict = "FAIL"

    if verdict != "PASS":
        deviations.append(f"verdict {verdict}: signed thresholds not met")

    # ================= OUTPUT =================
    W = 78
    print("=" * W)
    print("PROTO-AI-13 shadow-router verdict scorer (l2t1955)")
    print("=" * W)
    print(f"events file            : {path}")
    print(f"events sha256          : {digest}")
    print(f"paired records (n)     : {n}")
    print(f"ts range               : {ts_min} .. {ts_max}")
    print(f"router model(s)        : {dict(sorted(router_model_counts.items()))}")
    print(f"big model(s)           : {dict(sorted(big_model_counts.items()))}")

    print()
    print("-- SIGNED THRESHOLDS (PROTO-AI-12 §2, signed as written 2026-10-06) --")
    print(f"overall agreement      : >= {THRESHOLD_OVERALL:.0%}")
    print(f"protocol_edit agreement: >= {THRESHOLD_PROTOCOL_EDIT:.0%}")
    print(f"minimum sample         : >= {MIN_PAIRED_TURNS} paired turns with >= {MIN_PROTOCOL_EDIT_TURNS} protocol_edit")
    print(f"latency ceiling        : p95 router-pick <= {P95_LATENCY_MS} ms")
    print(f"denominator rule       : timeouts/abstentions/parse-failures INCLUDED (parse failure counts AGAINST)")

    print()
    print("-- SAMPLE GATE --")
    print(f"paired turns           : {n} (need >= {MIN_PAIRED_TURNS}) -> {'MET' if n >= MIN_PAIRED_TURNS else 'NOT MET'}")
    print(f"protocol_edit turns    : {pe_n} (need >= {MIN_PROTOCOL_EDIT_TURNS}) -> {'MET' if pe_n >= MIN_PROTOCOL_EDIT_TURNS else 'NOT MET'}")
    print(f"sample gate            : {'MET' if sample_gate_met else 'NOT MET'}")

    print()
    print("-- PICK DISTRIBUTIONS --")
    print("routerPick:")
    for k, v in sorted(router_pick_counts.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {k:<20} {v:>4}  ({v / n:.2%})" if n else f"  {k:<20} {v:>4}")
    print("authoritativePick:")
    for k, v in sorted(auth_pick_counts.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {k:<20} {v:>4}  ({v / n:.2%})" if n else f"  {k:<20} {v:>4}")
    print("errorClass:")
    for k, v in sorted(error_class_counts.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {k:<20} {v:>4}")

    print()
    print("-- DENOMINATOR ACCOUNTING (primary = all paired records, as signed) --")
    print(f"  total in denominator : {n}")
    print(f"  parse-failures       : {parse_failures}  (count AGAINST)")
    print(f"  timeouts             : {timeouts}")
    print(f"  abstentions/other    : {abstentions}")
    print(f"  parseable intent picks: {parseable}")

    print()
    print("-- AGREEMENT (PRIMARY, signed denominator) --")
    print(f"  overall              : {agree_n}/{n} = {overall_rate:.2%}  (threshold >= {THRESHOLD_OVERALL:.0%}) -> {'MET' if overall_met else 'NOT MET'}")
    print(f"  protocol_edit-class  : {pe_agree}/{pe_n} = {pe_rate:.2%}  (threshold >= {THRESHOLD_PROTOCOL_EDIT:.0%}) -> {'MET' if pe_met else 'NOT MET'}")
    nonpe_agree = agree_n - pe_agree
    print(f"  (non-protocol_edit authoritative turns: {nonpe_agree}/{n - pe_n} agree)")

    print()
    print("-- SENSITIVITY (four-intent-restricted denominator; NOT the verdict) --")
    print(f"  authoritative turns outside the pre-registered menu: {drift_n}")
    print(f"  restricted denominator : {restricted_n} (authoritativePick in {list(PRE_REG_INTENTS)})")
    print(f"  restricted agreement   : {restricted_agree}/{restricted_n} = {restricted_rate:.2%}")
    print(f"  restricted parse-failures: {restricted_parse_failures}")

    print()
    print("-- CONFUSION MATRIX (rows = authoritativePick, cols = routerPick) --")
    col_w = max(len(c) for c in router_cols) + 2
    header = "auth \\ router".ljust(20) + "".join(c.rjust(col_w) for c in router_cols) + "  row total"
    print(header)
    print("-" * len(header))
    for row in auth_rows:
        cells = "".join(str(matrix.get((row, col), 0)).rjust(col_w) for col in router_cols)
        row_total = sum(matrix.get((row, col), 0) for col in router_cols)
        marker = "  <- post-prereg intent (router cannot pick it)" if row not in PRE_REG_INTENTS else ""
        print(f"{row:<20}{cells}{row_total:>{col_w}}{marker}")
    col_totals = "".join(str(sum(matrix.get((row, col), 0) for row in auth_rows)).rjust(col_w) for col in router_cols)
    print(f"{'col total':<20}{col_totals}{n:>{col_w}}")
    print("4x4 pre-registration submatrix (four intents x four intents) diagonal sum: "
          f"{sum(matrix.get((i, i), 0) for i in PRE_REG_INTENTS)}")

    print()
    print("-- ROUTER PICK LATENCY (routerLatencyMs) --")
    if lat_primary is None:
        print("  primary population   : EMPTY (no records with numeric routerLatencyMs)")
        print("    median / p95 / max : n/a")
    else:
        print(f"  primary population   : ALL {lat_primary['n']} paired records (parse-failures included, per the signed denominator rule)")
        print(f"    median / p95 / max : {lat_primary['median']} / {lat_primary['p95']} / {lat_primary['max']} ms")
    if lat_secondary is None:
        print("  secondary population : EMPTY (no parseable intent picks)")
        print("    median / p95 / max : n/a")
    else:
        print(f"  secondary population : {lat_secondary['n']} parseable intent picks only")
        print(f"    median / p95 / max : {lat_secondary['median']} / {lat_secondary['p95']} / {lat_secondary['max']} ms")
    print(f"  ceiling              : p95 <= {P95_LATENCY_MS} ms (primary) -> {'MET' if latency_met else 'NOT MET'}")
    print("  p95 method           : nearest-rank on sorted values, index ceil(0.95*n)-1")

    print()
    print("-- VERDICT --")
    print(f"  VERDICT: {verdict}")
    print(f"  (follows the PRIMARY signed denominator; sample gate {'MET' if sample_gate_met else 'NOT MET'}; "
          f"overall {'MET' if overall_met else 'NOT MET'}; protocol_edit {'MET' if pe_met else 'NOT MET'}; "
          f"latency {'MET' if latency_met else 'NOT MET'})")

    print()
    print("-- DEVIATION FLAGS --")
    if deviations:
        for d in deviations:
            print(f"  FLAG: {d}")
    else:
        print("  none")

    exit_code = 0 if not deviations else 1
    print()
    print(f"exit code: {exit_code}")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
