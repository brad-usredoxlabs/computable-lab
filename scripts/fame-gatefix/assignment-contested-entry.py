"""FAME-4 entry: area-% over the DECLARED ELIGIBLE set, published as data.

Pure revision-side compute (R-1): reads ONLY declared run parameters + the
consumed frozen peak_table artifact, via the shipped ctx SDK output discipline
(publish / metric / view / log). No new SDK module; no server change; no TS.

Policy inputs are all DECLARED parameters (parameterSchema DATA on the revision
record, spec §5):
  - assignments[]: transcribed 1:1 from the gc-method compound_assignments
    entries {label, compound_ref, expected_rt_min, rt_window_min,
    assignment_state}. The entry never re-derives qualification: it compares
    each entry's assignment_state against the DECLARED eligible_states by
    equality. The states vocabulary is FAME-3's merged schema declaration
    (schema/lab/gc-method.schema.yaml:196-198) — referenced by the RUN's
    frozen parameter DATA, never re-declared or branched on by name here.
  - eligible_states[]: opaque string array (NO enum in this script; the
    state-gate distinction — which declared states join the eligible set — is
    the run's data).
  - exclude_overlapped / exclude_saturated: whether rows carrying the shipped
    peak_integration OVERLAP_SHARED_BASELINE / UNRECOVERABLE_SATURATED flags
    join the eligible denominator (declared default: excluded -> named bucket).
  - null_area_policy: the ONLY accepted value is 'unresolved' — null
    area_pa_min rows are retained as unresolved area, never zero-filled.
  - admitted_compound_refs (OPTIONAL): the declared class-membership ref-list
    (R-2 / OQ-2 default). A pure DECLARED DATA array of admitted compound_ref
    CURIEs. Absent/None = no class filter (every entry admitted). NO HTTP /
    ontology dereference from the executor — membership is compared against the
    transcribed compound_ref id by equality, which is the entire rule. An entry
    whose compound_ref is not admitted is claimant-excluded exactly like a
    non-eligible-state entry (its peak lands in the named claimant_excluded
    bucket, never silently dropped).

Match semantics ride the shipped declared vocabulary (quantification.py):
inclusive window rt_target - rt_window <= rt <= rt_target + rt_window
(:243-247); one row claimed by two targets -> declared-ORDER precedence
(earlier declared entry claims it, quantified ONCE) + named
TARGET_WINDOW_OVERLAP warning, never a silent overwrite (:838); a target that
quantifies no row (window held none, or the shared row went to an earlier
target) is the named TARGET_UNMATCHED warning — "loudness is data" (:899-904);
MORE THAN ONE row in one target's window -> loud CODE_AMBIGUOUS_PEAK_MATCH,
no nearest-RT rescue (:635-642), the same declared failure class the shipped
quantifier raises.

DENOMINATOR (R4): math.fsum of the eligible rows' area_pa_min, published with
contributing peak refs and EVERY excluded/unresolved area retained in named
buckets (unmatched | claimant_excluded | overlap_excluded | saturated_
excluded | null_area). The retained-area identity holds by construction:
  denominator + sum(bucket areas) == fsum(all non-null peak_table areas)
(null-area rows are COUNTED as unresolved, never zero-filled, never dropped.)

Zero/compromised denominator (peak_integration.py:1007-1025 precedent — when
any accepted peak's area is null or the total is zero, every row's percent is
null + the reason code rides the output): the analyte_summary is PUBLISHED
anyway with denominator null + a named reason code and area_percent null on
every row — an explicit non-result, not an absent artifact and not a
fabricated 0.000%.
"""
from __future__ import annotations

import hashlib
import json
import math
from typing import Any, Dict, List, Optional, Tuple

# Shipped peak-table flag vocabulary (peak_integration.py:88-94) — the
# observables the declared exclusion switches key off. They are DATA values on
# the consumed artifact's flags column; the ONLY assignment-state comparisons
# in this script are against the DECLARED eligible_states parameter.
FLAG_OVERLAP = "OVERLAP_SHARED_BASELINE"
FLAG_SATURATED = "UNRECOVERABLE_SATURATED"

# FAME-8 GATEFIX2 D1 — CONTESTED_CLAIM: a row-data flag (NOT a shipped peak_table
# flag) for contested-claim visibility. When two declared assignment entries
# claim the SAME peak row (TARGET_WINDOW_OVERLAP), the earlier-declared entry
# wins by declared-order precedence and is quantified ONCE; the losing claim was
# previously SILENT (it never reached the assignment_results table). It is now
# appended to the WINNER row's flags as a machine-readable, pipe-separated flag —
# ONE per losing claim on that row:
#   CONTESTED_CLAIM:<losing label>|<losing compound_ref id>|<losing assignment_state>
# e.g. CONTESTED_CLAIM:Methyl hexanoate (6:0 FAME) - FAME-2 standard peak 1 (tentative)|CHEBI:143577|provisional
# Pure row data: it changes NO attribution / area / percent / bucket / eligibility
# (the only flags-driven observables are FLAG_OVERLAP / FLAG_SATURATED, which this
# flag never equals).
# CONTRACT (machine-readable, ENFORCED): exactly 3 pipe-separated fields,
# positionally parseable — (1) losing label, (2) losing compound_ref id,
# (3) losing assignment_state — and NO field may contain '|'. The label is FREE
# operator text: the revision's parameterSchema declares only
# {type: string, minLength: 1} for it (no pipe-free constraint), so the
# precondition is ENFORCED at the emission point, not assumed — a losing claim
# whose label, compound_ref id, or assignment_state contains '|' REJECTS the
# run with CODE_PARAM_INVALID naming the offending entry + field (the same
# declared failure class the script uses for invalid parameters). No silent
# escape or mutation of the declared value is ever written into a flag.
# (GATEFIX3 Defect 2: replaces the GATEFIX2 prose "the FAME-2 declared labels
# are pipe-free" — an unvalidated assumption the parameterSchema did not back.)

# Declared reason codes for the zero/compromised denominator non-result —
# module-style REASON_* constants with UNDEFINED_* values, the shipped
# precedent (peak_integration.py:88-93: REASON_ZERO_TOTAL =
# "UNDEFINED_ZERO_TOTAL"; quantification.py CODE_* codes). NOT ontology enums;
# NO FAME-5 comparison outcome vocabulary.
REASON_EMPTY_ELIGIBLE_SET = "UNDEFINED_EMPTY_ELIGIBLE_SET"
REASON_NO_ELIGIBLE_AREA = "UNDEFINED_NO_ELIGIBLE_AREA"
REASON_ELIGIBLE_AREA_NULL = "UNDEFINED_ELIGIBLE_AREA_NULL"
REASON_ZERO_ELIGIBLE_TOTAL = "UNDEFINED_ZERO_ELIGIBLE_TOTAL"
CODE_PARAM_INVALID = "CODE_PARAM_INVALID"
CODE_AMBIGUOUS_PEAK_MATCH = "CODE_AMBIGUOUS_PEAK_MATCH"
CODE_PEAK_TABLE_INVALID = "CODE_PEAK_TABLE_INVALID"

# The ONLY accepted null-area policy value (spec §5: nulls MUST be excluded
# from the denominator and counted as unresolved, never zero-filled).
NULL_AREA_POLICY = "unresolved"

# Named excluded/unresolved buckets (spec §5 R4). Order = the row's
# classification priority: a row lands in exactly ONE bucket, so the
# retained-area identity is exact.
BUCKET_NULL_AREA = "null_area"
# state-agnostic name for the claimant-excluded bucket: the row's only claimant
# is an entry that is NOT admitted by the run's declared eligibility (either
# its assignment_state is not in the declared eligible_states, or its
# compound_ref is not admitted by the optional declared class-membership
# ref-list). Named claimant-agnostically so the entry bakes NO state or
# compound term of its own (bait #5); the transcribed state + ref are echoed in
# the assignment_state / assigned_ref columns (data), which is how a
# claimant-excluded analyte stays "visible per-row".
BUCKET_CLAIMANT_EXCLUDED = "claimant_excluded"
BUCKET_OVERLAP = "overlap_excluded"
BUCKET_SATURATED = "saturated_excluded"
BUCKET_UNMATCHED = "unmatched"
# When the denominator is published as a null non-result, the eligible rows'
# area cannot be expressed as a percent — it is retained in this named bucket
# so the retained-area identity stays exact (nothing vanishes from the
# artifact; the denominator's contribution is 0.0 in that case).
BUCKET_ELIGIBLE_RETAINED = "eligible_retained"

HONESTY = (
    "area_percent is the share of the DECLARED ELIGIBLE SET's total area "
    "(denominator_pa_min), NOT 'all fatty acids': excluded and unresolved area "
    "is retained in the named buckets (excluded_buckets) and excluded rows are "
    "never zero-filled or split; coeluting (overlap-flagged) peaks are never "
    "apportioned between compounds. FID area-% is a relative area ratio over "
    "the eligible set only — it is not a mass fraction and implies no "
    "calibration."
)


class EntryError(Exception):
    """A declared failure: named code + loud message -> a failed run."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


def _is_number(v: Any) -> bool:
    return (
        isinstance(v, (int, float))
        and not isinstance(v, bool)
        and v == v
        and v not in (float("inf"), float("-inf"))
    )


def _window_contains(rt: Any, rt_target: float, rt_window: float) -> bool:
    # quantification.py:243-247 verbatim semantics: inclusive window.
    if not _is_number(rt):
        return False
    return rt_target - rt_window <= float(rt) <= rt_target + rt_window


def _load_rows(name: str, inline: Any, path: Optional[str]) -> List[Dict[str, Any]]:
    """Read the frozen peak_table rows DIRECTLY from the inline payload.

    ctx.DatasetHandle.read_rows() returns [] for a dict inlineValue
    (ctx.py:64-70 — the inlineValue is {columns, rows}, not a list of rows);
    the runner provisions an inline artifact as `inline: art.inlineValue`
    (analysisRunner.ts:193-195). We read handle.inline first, then the
    provisioned file (the data-reference branch), then fail loudly. We NEVER
    call read_rows() on an inline artifact.
    """
    if isinstance(inline, dict) and isinstance(inline.get("rows"), list):
        return [dict(r) for r in inline["rows"] if isinstance(r, dict)]
    if isinstance(inline, list):
        return [dict(r) for r in inline if isinstance(r, dict)]
    if path:
        text = open(path, "r", encoding="utf-8").read()
        data = json.loads(text)
        if isinstance(data, dict) and isinstance(data.get("rows"), list):
            return [dict(r) for r in data["rows"] if isinstance(r, dict)]
        if isinstance(data, list):
            return [dict(r) for r in data if isinstance(r, dict)]
    raise EntryError(
        CODE_PEAK_TABLE_INVALID,
        f"input '{name}' is not a readable peak_table (no inline rows and no provisioned file)",
    )


def _params_digest(params: Dict[str, Any]) -> str:
    # peak_integration.py:292-296 EXACT formula — the freeze witness.
    return hashlib.sha256(
        json.dumps(params, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _validate_parameters(params: Dict[str, Any]) -> None:
    assignments = params.get("assignments")
    if not isinstance(assignments, list) or len(assignments) < 1:
        raise EntryError(
            CODE_PARAM_INVALID,
            "parameter 'assignments' must be a non-empty array (transcribed 1:1 from the method's compound_assignments)",
        )
    for i, a in enumerate(assignments):
        if not isinstance(a, dict):
            raise EntryError(CODE_PARAM_INVALID, f"assignments[{i}] must be an object")
        if not isinstance(a.get("label"), str) or not a.get("label"):
            raise EntryError(CODE_PARAM_INVALID, f"assignments[{i}].label must be a non-empty string")
        ref = a.get("compound_ref")
        if (
            not isinstance(ref, dict)
            or ref.get("kind") != "ontology"
            or not isinstance(ref.get("id"), str)
            or not ref.get("id")
        ):
            raise EntryError(
                CODE_PARAM_INVALID,
                f"assignments[{i}].compound_ref must be an ontology ref {{kind:'ontology', id:<CURIE>}}",
            )
        if "expected_rt_min" not in a or not _is_number(a.get("expected_rt_min")) or float(a["expected_rt_min"]) < 0:
            raise EntryError(CODE_PARAM_INVALID, f"assignments[{i}].expected_rt_min must be a number >= 0")
        if "rt_window_min" not in a or not _is_number(a.get("rt_window_min")) or float(a["rt_window_min"]) <= 0:
            raise EntryError(CODE_PARAM_INVALID, f"assignments[{i}].rt_window_min must be a number > 0")
        if not isinstance(a.get("assignment_state"), str) or not a.get("assignment_state"):
            raise EntryError(CODE_PARAM_INVALID, f"assignments[{i}].assignment_state must be a non-empty string")
    eligible = params.get("eligible_states")
    if not isinstance(eligible, list) or len(eligible) < 1 or not all(isinstance(s, str) and s for s in eligible):
        raise EntryError(
            CODE_PARAM_INVALID,
            "parameter 'eligible_states' must be a non-empty array of strings "
            "(opaque — the states vocabulary is the method schema's, declared per run)",
        )
    for flag in ("exclude_overlapped", "exclude_saturated"):
        if not isinstance(params.get(flag), bool):
            raise EntryError(CODE_PARAM_INVALID, f"parameter '{flag}' must be a boolean")
    # optional declared class-membership ref-list (R-2 / OQ-2 default): a pure
    # DECLARED DATA list of admitted compound_ref CURIEs. Absent/empty = no
    # class filter (every entry admitted). NO HTTP / ontology dereference from
    # the executor — membership is compared against the transcribed ref id by
    # equality, which is the entire rule.
    admitted = params.get("admitted_compound_refs")
    if admitted is not None:
        if not isinstance(admitted, list) or not all(isinstance(c, str) and c for c in admitted):
            raise EntryError(
                CODE_PARAM_INVALID,
                "parameter 'admitted_compound_refs' must be an array of compound_ref CURIE strings when present",
            )
    if params.get("null_area_policy") != NULL_AREA_POLICY:
        raise EntryError(
            CODE_PARAM_INVALID,
            f"parameter 'null_area_policy' must be '{NULL_AREA_POLICY}' — null area is "
            "retained as unresolved, never zero-filled",
        )
    # D3: the consumed-artifact record id (spec §9 W3). The entry cannot read
    # the record id from the SDK (for an inline input provisionInputs builds
    # the spec without a meta / record id — analysisRunner.ts:195,
    # DatasetHandle.meta == {}), so the id is a DECLARED run parameter: the
    # run's own payload.inputs.peak_table.id, echoed 1:1 by the operator so
    # the frozen parameters + params_digest + consumed artifact are bound in
    # one durable record (the effective_parameters artifact). Optional; when
    # present it must be a non-empty string of the record-id form.
    car = params.get("consumed_artifact_ref")
    if car is not None and (not isinstance(car, str) or not car):
        raise EntryError(
            CODE_PARAM_INVALID,
            "parameter 'consumed_artifact_ref' must be a non-empty string "
            "(the consumed artifact's record id, e.g. 'AOUT-000041') when present",
        )


def _col(name: str, typ: str, units: Optional[str], definition: str) -> Dict[str, Any]:
    c: Dict[str, Any] = {"name": name, "type": typ, "units": units, "definition": definition}
    return c


def run(ctx) -> None:  # noqa: ANN001 — ctx is the SDK Context (ctx.py:223)
    params = ctx.parameters
    _validate_parameters(params)
    digest = _params_digest(params)

    eligible_states = set(params["eligible_states"])
    assignments: List[Dict[str, Any]] = params["assignments"]
    # Eligibility = DECLARED-PARAMETER comparisons ONLY. This script never
    # names a state or compound term of its own — the string comparisons are
    # (a) entry.assignment_state against the run's declared eligible_states
    # and (b) entry.compound_ref.id against the run's optional declared
    # admitted_compound_refs ref-list (R-2: pure declared data, no HTTP /
    # ontology dereference from the executor; bait #5b discipline).
    admitted_raw = params.get("admitted_compound_refs")
    admitted_set: Optional[set] = None if admitted_raw is None else set(admitted_raw)
    def _admitted(a: Dict[str, Any]) -> bool:
        if a["assignment_state"] not in eligible_states:
            return False
        if admitted_set is not None and a["compound_ref"]["id"] not in admitted_set:
            return False
        return True
    eligible_by_idx = [_admitted(a) for a in assignments]

    table = ctx.input("peak_table")
    rows = _load_rows("peak_table", table.inline, table.path)
    if not rows:
        raise EntryError(CODE_PEAK_TABLE_INVALID, "peak_table input carries zero rows")
    # 1-based peak indices as the table declares them (the peak column is
    # 1-based per its own definition).
    peaks: List[Tuple[int, Dict[str, Any]]] = []
    for r in rows:
        pk = r.get("peak")
        peaks.append((pk if isinstance(pk, int) and not isinstance(pk, bool) else len(peaks) + 1, r))
    n_rows = len(peaks)
    ctx.log(
        f"fame4: consumed peak_table with {n_rows} row(s) from input 'peak_table' "
        f"(frozen artifact bytes; the compute is count-agnostic)",
        level="info",
    )

    # ---- target -> rows in its declared window (shipped semantics) --------
    windows: List[Tuple[int, List[int]]] = []
    for ti, a in enumerate(assignments):
        t_rt = float(a["expected_rt_min"])
        t_win = float(a["rt_window_min"])
        in_win = [i for i, (_pk, r) in enumerate(peaks) if _window_contains(r.get("rt_min"), t_rt, t_win)]
        windows.append((ti, in_win))
        if len(in_win) > 1:
            rts = ", ".join(repr(peaks[i][1].get("rt_min")) for i in in_win[:2])
            raise EntryError(
                CODE_AMBIGUOUS_PEAK_MATCH,
                f"assignment {ti} '{a['label']}' (window [{t_rt - t_win}, {t_rt + t_win}] min) "
                f"matches MULTIPLE peak_table rows ({len(in_win)}; rts {rts}) — no nearest-RT rescue",
            )
    # One row claimed by two targets -> declared-ORDER precedence: the earlier
    # declared entry claims it, quantified ONCE, named TARGET_WINDOW_OVERLAP.
    claimant: Dict[int, int] = {}
    for ti, in_win in windows:
        for i in in_win:
            if i in claimant:
                earlier = claimant[i]
                if earlier != ti:
                    # FAME-8 GATEFIX2 D1 (+ GATEFIX3 Defect 2): make the losing
                    # claim machine-readable ROW DATA — append a CONTESTED_CLAIM
                    # flag (contract: the FLAG_* block above) to the WINNER
                    # row's flags, one per losing claim. Pure row data: no
                    # attribution / area / percent / bucket / eligibility
                    # changes (this flag != FLAG_OVERLAP / FLAG_SATURATED).
                    # The 3-field pipe contract is ENFORCED HERE (not assumed):
                    # the parameterSchema declares the label as free text
                    # ({type: string, minLength: 1}), so a '|' in ANY field of
                    # the losing claim would make the flag positionally
                    # unparseable — reject the run naming the offender instead
                    # of silently escaping/mutating the declared value.
                    _loser = assignments[ti]
                    for _field_name, _field_val in (
                        ("label", _loser["label"]),
                        ("compound_ref.id", _loser["compound_ref"]["id"]),
                        ("assignment_state", _loser["assignment_state"]),
                    ):
                        if "|" in str(_field_val):
                            raise EntryError(
                                CODE_PARAM_INVALID,
                                "assignment "
                                f"{ti} ('{_loser['label']}') field '{_field_name}' "
                                f"(value {str(_field_val)!r}) contains '|' — the CONTESTED_CLAIM flag "
                                f"is a 3-field pipe-separated contract (label|compound_ref id|assignment_state) "
                                f"and a pipe in any field would make it positionally unparseable "
                                f"(peak row {peaks[i][0]} is contested between assignment {earlier} "
                                f"and assignment {ti}); rewrite the declared entry value without a pipe",
                            )
                    _winner_row = peaks[i][1]
                    _wf = _winner_row.get("flags")
                    _wf = _wf if isinstance(_wf, list) else []
                    _wf = list(_wf)  # fresh list — never alias the source row's flags
                    _wf.append(
                        "CONTESTED_CLAIM:{}|{}|{}".format(
                            _loser["label"],
                            _loser["compound_ref"]["id"],
                            _loser["assignment_state"],
                        )
                    )
                    _winner_row["flags"] = _wf
                    ctx.log(
                        f"fame4: peak row {peaks[i][0]} (rt {peaks[i][1].get('rt_min')!r}) is inside both "
                        f"assignment {earlier} ('{assignments[earlier]['label']}') and assignment {ti} "
                        f"('{assignments[ti]['label']}') — declared-order precedence: the row stays with "
                        f"assignment {earlier} and is quantified ONCE",
                        level="warning",
                        code="TARGET_WINDOW_OVERLAP",
                    )
            else:
                claimant[i] = ti
    # A target quantifies a row only when it is that row's claimant.
    def _quantifies(ti: int) -> List[int]:
        return [i for i, (pk, _r) in enumerate(peaks) if claimant.get(i) == ti]

    # Targets that quantified NOTHING — named, loud (loudness is data):
    # either the window held no peak, or the shared row went to an earlier
    # declared target under the precedence rule.
    unquantified = [ti for ti, _w in windows if not _quantifies(ti)]
    if unquantified:
        detail = []
        for ti in unquantified:
            _w = windows[ti][1]
            why = "window held no peak" if not _w else "the in-window row went to an earlier-named target under declared-order precedence"
            detail.append(f"{ti} ('{assignments[ti]['label']}', state {assignments[ti]['assignment_state']}) — {why}")
        ctx.log(
            "fame4: declared assignment(s) quantified no peak row: " + "; ".join(detail) +
            " — the unmatched targets are data, not a silent drop",
            level="warning",
            code="TARGET_UNMATCHED",
        )

    # ---- per-row classification (one row -> exactly one bucket) ----------
    buckets: List[Dict[str, Any]] = []

    def _add_bucket(name: str, area_f: Optional[float], pk: int) -> None:
        for b in buckets:
            if b["bucket"] == name:
                b["peak_count"] += 1
                b["peaks"].append(pk)
                if area_f is not None:
                    b["area_pa_min"] = math.fsum([b["area_pa_min"], area_f])
                return
        buckets.append(
            {
                "bucket": name,
                "peak_count": 1,
                "peaks": [pk],
                "area_pa_min": 0.0 if area_f is None else math.fsum([area_f]),
            }
        )

    result_rows: List[Dict[str, Any]] = []
    eligible_area_rows: List[Tuple[int, Optional[float]]] = []  # (peak, area)
    for i, (pk, r) in enumerate(peaks):
        area = r.get("area_pa_min")
        area_f: Optional[float] = float(area) if _is_number(area) else None
        flags = r.get("flags")
        flags = flags if isinstance(flags, list) else []
        is_overlap = FLAG_OVERLAP in flags
        is_sat = FLAG_SATURATED in flags
        claimed_by: Optional[int] = claimant.get(i)
        # ELIGIBLE (spec §5): the row uniquely matches an assignment entry
        # whose state is in the declared eligible_states AND the row passes
        # the declared exclusion switches (a flagged row never joins the
        # denominator when its switch excludes it — coeluting peaks are never
        # split).
        switch_blocked = (params["exclude_overlapped"] and is_overlap) or (
            params["exclude_saturated"] and is_sat
        )
        eligible = (
            claimed_by is not None
            and eligible_by_idx[claimed_by]
            and not switch_blocked
        )
        bucket: Optional[str] = None
        if eligible:
            eligible_area_rows.append((pk, area_f))
        else:
            # classification priority (one row, one bucket — the retained-area
            # identity stays exact): a null area is UNRESOLVED first (never
            # zero-filled, even on an eligible row), then the claimant gate (the
            # row's only claimant is a non-eligible entry — state-gate or
            # class-membership-gate, echoed per-row in assignment_state +
            # assigned_ref),
            # then the declared exclusion switches on the shipped flag
            # observables (a flagged row that matched an eligible entry), then
            # plain unmatched.
            if area_f is None:
                bucket = BUCKET_NULL_AREA
            elif claimed_by is not None and not switch_blocked:
                bucket = BUCKET_CLAIMANT_EXCLUDED
            elif params["exclude_overlapped"] and is_overlap:
                bucket = BUCKET_OVERLAP
            elif params["exclude_saturated"] and is_sat:
                bucket = BUCKET_SATURATED
            else:
                bucket = BUCKET_UNMATCHED
            _add_bucket(bucket, area_f, pk)
        result_rows.append(
            {
                "peak": pk,
                "rt_min": r.get("rt_min"),
                "assigned_label": assignments[claimed_by]["label"] if claimed_by is not None else None,
                "assigned_ref": assignments[claimed_by]["compound_ref"]["id"] if claimed_by is not None else None,
                "assignment_state": assignments[claimed_by]["assignment_state"] if claimed_by is not None else None,
                "eligible": eligible,
                "bucket": bucket,
                "area_pa_min": area_f,
                "area_percent": None,  # filled once the denominator is known
                "flags": flags,
            }
        )

    # ---- denominator + null-with-reason (peak_integration :1007-1025) ----
    denominator: Optional[float] = None
    reason: Optional[str] = None
    any_eligible_entry = any(eligible_by_idx)
    if not any_eligible_entry:
        reason = REASON_EMPTY_ELIGIBLE_SET
    elif not eligible_area_rows:
        reason = REASON_NO_ELIGIBLE_AREA
    elif any(a is None for _pk, a in eligible_area_rows):
        # shipped precedent: when ANY accepted peak's area is null, the
        # percent is undefined on EVERY row — the denominator is published
        # null + the reason, never a partial fraction.
        reason = REASON_ELIGIBLE_AREA_NULL
    else:
        denominator = math.fsum(a for _pk, a in eligible_area_rows)
        if denominator == 0.0:
            reason = REASON_ZERO_ELIGIBLE_TOTAL

    contributing = [pk for pk, a in eligible_area_rows if a is not None]
    # Null non-result leg: the eligible rows' area cannot be expressed as a
    # percent — retain it in a NAMED bucket so the retained-area identity is
    # exact (nothing vanishes; the denominator contributes 0.0 in that case).
    if reason is not None:
        for rr, (pk, area_f) in zip(
            [x for x in result_rows if x["eligible"]], eligible_area_rows
        ):
            rr["bucket"] = BUCKET_ELIGIBLE_RETAINED
            _add_bucket(BUCKET_ELIGIBLE_RETAINED, area_f, pk)
    # area_percent over the ELIGIBLE SET ONLY (R4): null when the row is
    # non-eligible or the denominator is null/compromised — never fabricated.
    for rr in result_rows:
        if rr["eligible"] and denominator is not None and rr["area_pa_min"] is not None:
            rr["area_percent"] = rr["area_pa_min"] / denominator * 100.0
        else:
            rr["area_percent"] = None

    excluded_peak_count = sum(
        1
        for rr in result_rows
        if rr["bucket"] is not None and rr["bucket"] != BUCKET_ELIGIBLE_RETAINED
    )
    excluded_area_total = math.fsum(
        b["area_pa_min"] for b in buckets if b["bucket"] != BUCKET_ELIGIBLE_RETAINED
    )
    null_area_count = sum(1 for rr in result_rows if rr["area_pa_min"] is None)
    table_total = math.fsum(r.get("area_pa_min") for _pk, r in peaks if _is_number(r.get("area_pa_min")))
    # retained-area identity (W5 witness): denominator + EVERY named bucket's
    # retained area (excluded_* AND eligible_retained) == fsum of ALL non-null
    # peak_table areas (nothing vanishes). eligible_retained is present only
    # on the null non-result leg, where the denominator contributes 0.0.
    all_bucket_area = math.fsum(b["area_pa_min"] for b in buckets)
    identity_holds = math.isclose(
        (denominator or 0.0) + all_bucket_area, table_total, rel_tol=0.0, abs_tol=1e-9
    )
    if reason is not None:
        ctx.log(
            f"fame4: analyte_summary is a declared NON-RESULT — denominator null, reason {reason}; "
            "area_percent is null on every row and no percentage is fabricated",
            level="warning",
            code=reason,
        )

    # ---- publish (shipped ctx output discipline: publish + metric + view) --
    ar_defs = {
        "peak": "1-based peak index as carried by the consumed peak_table",
        "assigned_label": "the claiming assignment's label (transcribed from the method) — null when no assignment's window held this row",
        "assigned_ref": "the claiming assignment's compound_ref id (FAME-LOCAL CURIE) — echoed verbatim; null when unclaimed",
        "assignment_state": "the claiming assignment's state as transcribed from the method entry — echoed, never re-derived",
        "eligible": "true when the claiming assignment is admitted by the run's declared eligibility (state in eligible_states AND, when declared, compound_ref in admitted_compound_refs) and the row passes the declared exclusion switches",
        "bucket": "named excluded/unresolved bucket for a non-eligible row (" + " | ".join([BUCKET_NULL_AREA, BUCKET_CLAIMANT_EXCLUDED, BUCKET_OVERLAP, BUCKET_SATURATED, BUCKET_UNMATCHED, BUCKET_ELIGIBLE_RETAINED]) + "); null for an eligible row on a resolved denominator",
        "area_pa_min": "the row's area as carried by the frozen peak_table (null = unresolved, never zero-filled)",
        "area_percent": "share of the declared eligible set's total area; null when the row is non-eligible or the denominator is null/compromised",
    }
    ctx.publish(
        "assignment_results",
        {
            "columns": [
                _col("peak", "integer", None, ar_defs["peak"]),
                _col("rt_min", "number", "min", "rt as carried by the frozen peak_table"),
                _col("assigned_label", "string", None, ar_defs["assigned_label"]),
                _col("assigned_ref", "string", None, ar_defs["assigned_ref"]),
                _col("assignment_state", "string", None, ar_defs["assignment_state"]),
                _col("eligible", "boolean", None, ar_defs["eligible"]),
                _col("bucket", "string", None, ar_defs["bucket"]),
                _col("area_pa_min", "number", "pA*min", ar_defs["area_pa_min"]),
                _col("area_percent", "number", "% of eligible-set total", ar_defs["area_percent"]),
                _col("flags", "string[]", None, "the row's flags as carried by the frozen peak_table (shipped reason codes) +, on a winner row under declared-order TARGET_WINDOW_OVERLAP precedence, one CONTESTED_CLAIM:<label>|<compound_ref id>|<assignment_state> flag per losing claim (FAME-8 GATEFIX2 D1: the previously-silent manual pick is now visible per-row). CONTRACT (GATEFIX3 Defect 2): the CONTESTED_CLAIM flag is EXACTLY 3 pipe-separated fields — (1) losing label, (2) losing compound_ref id, (3) losing assignment_state — and NO field may contain '|'; the label is free operator text (the parameterSchema declares only {type: string, minLength: 1}), so the entry ENFORCES this at the emission point and rejects the run with CODE_PARAM_INVALID naming the offending entry + field rather than silently escaping or mutating a declared value"),
            ],
            "rows": result_rows,
        },
        kind="table",
        schema={
            "description": (
                "Peak-level assignment results: each consumed peak_table row with its claiming assignment "
                "(or none), eligibility, named exclusion bucket, area, and area-% over the declared "
                "eligible set. " + HONESTY
            )
        },
    )

    # Per-assignment contributed area is derived PER ROW from the row-level
    # ``eligible`` flag (D1: an assignment whose claimed row lands in a named
    # exclusion bucket is NOT credited as an analyte share even when the
    # assignment entry itself is admitted — eligibility is a property of the
    # row, not of the entry). result_rows is index-aligned with peaks (both
    # are built in the same enumerate(peaks) loop), so row i's eligibility is
    # result_rows[i]["eligible"]. Only rows the per-row classifier marked
    # eligible contribute; a claimed row in any named exclusion bucket
    # (overlap / saturated / claimant / null_area / unmatched) contributes
    # nothing and its area is retained exactly once in excluded_buckets (R4).
    contributed_by_idx: Dict[int, float] = {}
    for i, rr in enumerate(result_rows):
        ti = claimant.get(i)
        if ti is not None and rr["eligible"] and rr["area_pa_min"] is not None:
            contributed_by_idx[ti] = math.fsum([contributed_by_idx.get(ti, 0.0), rr["area_pa_min"]])

    sm_rows: List[Dict[str, Any]] = []
    for ti, a in enumerate(assignments):
        claimed_i = _quantifies(ti)
        claimed = [peaks[i][0] for i in claimed_i]
        admitted = eligible_by_idx[ti]
        # D1: the assignment's contributed area + area_percent are null
        # whenever the denominator is null/compromised OR any of its claimed
        # rows is not row-level eligible (e.g. it landed in a named exclusion
        # bucket). The excluded area is NOT re-credited as an analyte share —
        # it is retained in excluded_buckets, counted exactly once.
        all_rows_eligible = bool(claimed_i) and all(result_rows[i]["eligible"] for i in claimed_i)
        contributed: Optional[float] = None
        if admitted and all_rows_eligible and denominator is not None:
            contributed = contributed_by_idx.get(ti)
        pct: Optional[float] = None
        if (
            denominator is not None
            and contributed is not None
            and all_rows_eligible
        ):
            pct = contributed / denominator * 100.0
        sm_rows.append(
            {
                "assignment_index": ti,
                "label": a["label"],
                "compound_ref": a["compound_ref"]["id"],
                "assignment_state": a["assignment_state"],
                "admitted": admitted,
                "claimed_peak_refs": claimed,
                "contributed_area_pa_min": contributed,
                "area_percent": pct,
            }
        )
    # retained-bucket rows — R4: excluded/unresolved area retained IN the
    # artifact, named (never counted away).
    for b in buckets:
        sm_rows.append(
            {
                "assignment_index": None,
                "label": f"bucket:{b['bucket']}",
                "compound_ref": None,
                "assignment_state": None,
                "admitted": None,
                "claimed_peak_refs": b["peaks"],
                "contributed_area_pa_min": b["area_pa_min"],
                "area_percent": None,
            }
        )
    ctx.publish(
        "analyte_summary",
        {
            "columns": [
                _col("assignment_index", "integer", None, "0-based index into the run's declared assignments; null for retained-bucket rows"),
                _col("label", "string", None, "the assignment's label (transcribed from the method) or 'bucket:<name>'"),
                _col("compound_ref", "string", None, "the assignment's compound_ref id (FAME-LOCAL CURIE) — echoed verbatim; null for bucket rows"),
                _col("assignment_state", "string", None, "the assignment's state as transcribed from the method entry — echoed, never re-derived; null for bucket rows"),
                _col("admitted", "boolean", None, "whether this entry is admitted by the run's DECLARED eligibility — its assignment_state is in eligible_states AND (when declared) its compound_ref is in admitted_compound_refs; null for bucket rows"),
                _col("claimed_peak_refs", "string[]", None, "1-based peak indices uniquely matched into this assignment's declared window (or the bucket's member peak indices)"),
                _col("contributed_area_pa_min", "number", "pA*min", "the assignment's share of the eligible denominator (null when non-eligible, unmatched, or area null); the bucket's retained area for bucket rows"),
                _col("area_percent", "number", "% of eligible-set total", "the assignment's share of the eligible denominator as a percent; null on every row when the denominator is null/compromised"),
            ],
            "rows": sm_rows,
            "denominator_pa_min": denominator,
            "denominator_reason": reason,
            "contributing_peak_refs": contributing,
            "eligible_peak_count": len(contributing),
            "excluded_peak_count": excluded_peak_count,
            "unresolved_area_pa_min": excluded_area_total,
            "unresolved_null_area_peak_count": null_area_count,
            "excluded_buckets": buckets,
            "identity_holds": identity_holds,
            "params_digest": digest,
        },
        kind="table",
        schema={"description": "Analyte summary: area-% over the DECLARED ELIGIBLE set. " + HONESTY},
    )

    # D3: the consumed-artifact record id, as the operator declared it (the
    # run payload's inputs.peak_table.id, echoed 1:1). Read from params here
    # (the validated value) — not from a helper-local.
    consumed_artifact_ref = params.get("consumed_artifact_ref")
    ctx.publish(
        "effective_parameters",
        {
            "columns": [
                _col("params", "string", None, "the frozen run parameters (canonical JSON)"),
                _col("params_digest", "string", None, "freeze witness — sha256 of the canonicalized parameters (peak_integration.py:292 formula)"),
                _col("consumed_input", "string", None, "the input name this compute consumed the frozen peak_table from"),
                _col("consumed_artifact_ref", "string", None, "the consumed artifact's RECORD ID (the run payload's inputs.peak_table.id) — the durable binding of the frozen parameters + params_digest to the exact frozen artifact they were computed from (spec §9 W3); null when the operator did not declare it"),
            ],
            "rows": [
                {
                    "params": params,
                    "params_digest": digest,
                    "consumed_input": "peak_table",
                    "consumed_artifact_ref": consumed_artifact_ref,
                }
            ],
        },
        kind="table",
        schema={"description": "Frozen run parameters + the params_digest freeze witness + the consumed input name + the consumed artifact record id (spec §9 W3)."},
    )

    ctx.metric("eligible_peak_count", len(contributing), label="eligible peak rows with non-null area contributing the denominator")
    ctx.metric("denominator_pa_min", denominator, unit="pA*min", label="fsum of the eligible rows' area_pa_min; null + named reason on an empty/compromised set")
    ctx.metric("excluded_peak_count", excluded_peak_count, label="peak rows retained in named excluded/unresolved buckets")
    ctx.metric("unresolved_area_pa_min", excluded_area_total, unit="pA*min", label="sum of the named buckets' measurable retained area")
    ctx.metric("params_digest", digest, label="freeze witness — sha256 of canonicalized run parameters")
    ctx.metric("identity_holds", identity_holds, label="denominator + excluded buckets == fsum(all non-null table areas)")
    if reason is not None:
        ctx.metric("denominator_reason", reason, label="named reason code for the null denominator")

    ctx.view("assignment_results_view", "table", artifact="assignment_results")
    ctx.view("analyte_summary_view", "table", artifact="analyte_summary")
    ctx.view("effective_parameters_view", "table", artifact="effective_parameters")
