#!/usr/bin/env python3
"""Board-gate: assert tooltip payload against board YAML expectations.

After a board reset, probes the E2 well tooltip and asserts it matches
board.expect.e2. Runs tooltip-probe.cjs internally unless --probe-json
is supplied (test injection).

Usage:
    python3 board-gate.py --board <board.yaml> [--probe-json <probe.json>]
"""
import argparse
import json
import os
import subprocess
import sys

try:
    import yaml
except ImportError:
    yaml = None


def _format_volume(volume_uL):
    """Derive the volume display string the same way the product does.

    Product anchor (app/src/graph/lib/eventGraph.ts:1169):
        return `${volume_uL.toFixed(1)} \u00b5L`

    U+00B5 MICRO SIGN (not U+03BC GREEK MU).
    """
    return f"{volume_uL:.1f} \u00b5L"


def load_expect(board_path):
    """Read board.gate_url and board.expect.e2 from the board YAML.

    Returns (gate_url, expect) where expect is dict with keys:
    volume_uL, material, rows, events.
    """
    if yaml is None:
        print("BOARD-GATE FAIL: PyYAML not available", file=sys.stderr)
        sys.exit(2)
    with open(board_path, "r") as f:
        board = yaml.safe_load(f)
    gate_url = board["board"]["gate_url"]
    expect = dict(board["board"]["expect"]["e2"])
    return gate_url, expect


def assert_e2(probe_payload, expect):
    """Assert E2 tooltip data against expectations.

    probe_payload: dict with keys well, tipVolume, tipRows, tipMeta
    expect: dict with keys volume_uL, material, rows, events

    Returns a list of failure strings (empty = pass).
    """
    failures = []

    # --- Volume text ---
    expected_volume = _format_volume(expect["volume_uL"])
    actual_volume = probe_payload.get("tipVolume")
    if actual_volume != expected_volume:
        failures.append(
            f"volume mismatch: expected {expected_volume!r}, got {actual_volume!r}"
        )

    # --- Material row count ---
    expected_rows = expect["rows"]
    actual_rows = len(probe_payload.get("tipRows", []))
    if actual_rows != expected_rows:
        failures.append(
            f"material rows mismatch: expected {expected_rows}, got {actual_rows}"
        )

    # --- Material name (first row) ---
    if probe_payload.get("tipRows"):
        actual_name = probe_payload["tipRows"][0].get("name")
        expected_name = expect["material"]
        if actual_name != expected_name:
            failures.append(
                f"material name mismatch: expected {expected_name!r}, "
                f"got {actual_name!r}"
            )

    # --- Meta event count ---
    expected_events = expect["events"]
    actual_meta = probe_payload.get("tipMeta", "")
    expected_meta = f"{expected_events} event{'s' if expected_events != 1 else ''} applied"
    if actual_meta != expected_meta:
        failures.append(
            f"event count mismatch: expected {expected_meta!r}, got {actual_meta!r}"
        )

    return failures


def _run_probe(gate_url, probe_path):
    """Run tooltip-probe.cjs to generate probe data."""
    probe_script = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "tooltip-probe.cjs")
    out_dir = os.path.dirname(probe_path)
    os.makedirs(out_dir, exist_ok=True)

    result = subprocess.run(
        ["node", probe_script, "--url", gate_url, "--wells", "E2",
         "--out", probe_path],
        capture_output=True, text=True, timeout=120
    )
    if result.returncode != 0:
        print(f"BOARD-GATE FAIL: probe failed rc={result.returncode}",
              file=sys.stderr)
        if result.stderr:
            print(result.stderr[-512:], file=sys.stderr)
        return None
    with open(probe_path, "r") as f:
        return json.load(f)


def main():
    parser = argparse.ArgumentParser(
        description="Board-gate: assert tooltip payload against board expectations"
    )
    parser.add_argument("--board", required=True,
                        help="Path to the board YAML")
    parser.add_argument("--probe-json", default=None,
                        help="Path to probe output JSON (skip browser if given)")
    parser.add_argument("--receipt-dir", default=None,
                        help="Receipt directory for probe output (default: RECEIPT_DIR env)")
    args = parser.parse_args()

    # Load expectations from YAML (fresh read, never cached)
    try:
        gate_url, expect = load_expect(args.board)
    except Exception as exc:
        print(f"BOARD-GATE FAIL: cannot load board YAML: {exc}",
              file=sys.stderr)
        sys.exit(2)

    # Determine probe JSON path
    if args.probe_json:
        probe_path = args.probe_json
    else:
        receipt_dir = args.receipt_dir or os.environ.get("RECEIPT_DIR", "/tmp")
        probe_path = os.path.join(receipt_dir, "tooltip-board-gate.json")

    # Load probe payload
    if args.probe_json:
        try:
            with open(probe_path, "r") as f:
                probe_data = json.load(f)
        except Exception as exc:
            print(f"BOARD-GATE FAIL: cannot load probe JSON: {exc}",
                  file=sys.stderr)
            sys.exit(2)
    else:
        probe_data = _run_probe(gate_url, probe_path)
        if probe_data is None:
            sys.exit(1)

    # Find E2 entry
    e2_entry = None
    for entry in probe_data:
        if entry.get("well") == "E2":
            e2_entry = entry
            break
    if e2_entry is None:
        print("BOARD-GATE FAIL: no E2 entry in probe data", file=sys.stderr)
        sys.exit(1)

    # Run assertions
    failures = assert_e2(e2_entry, expect)
    if failures:
        for reason in failures:
            print(f"BOARD-GATE FAIL {reason}", file=sys.stderr)
        sys.exit(1)

    print("BOARD-GATE PASS")
    sys.exit(0)


if __name__ == "__main__":
    main()
