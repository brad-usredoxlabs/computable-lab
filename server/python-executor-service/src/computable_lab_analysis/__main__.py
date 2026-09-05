"""CLI entry point for computable_lab_analysis.

Executes an analysis entry script headlessly:

    python3 -m computable_lab_analysis run <entry.py> --inputs <json> [--input-dir <dir>]

where ``--inputs`` is a JSON object mapping input name -> {dataKind, (inline|path)}
and ``--input-dir`` is an optional directory the runner provisioned with input
files. On success prints the output manifest as JSON to stdout; on failure
writes a JSON error to stderr and exits non-zero.
"""
from __future__ import annotations

import json
import sys
from typing import Any, Dict, Optional

from .ctx import Context, run


def main(argv: Optional[list[str]] = None) -> int:
    args = list(argv if argv is not None else sys.argv[1:])
    if len(args) >= 1 and args[0] == "run":
        args = args[1:]

    if not args or args[0] in ("-h", "--help"):
        print("usage: python3 -m computable_lab_analysis run <entry.py> --inputs <json> --parameters <json> [--input-dir <dir>]")
        return 0

    entry = args[0]
    inputs_json: Optional[str] = None
    parameters_json: Optional[str] = None
    input_dir: Optional[str] = None
    i = 1
    while i < len(args):
        if args[i] == "--inputs" and i + 1 < len(args):
            inputs_json = args[i + 1]
            i += 2
        elif args[i] == "--parameters" and i + 1 < len(args):
            parameters_json = args[i + 1]
            i += 2
        elif args[i] == "--input-dir" and i + 1 < len(args):
            input_dir = args[i + 1]
            i += 2
        else:
            i += 1

    inputs: Dict[str, Any] = {}
    if inputs_json:
        try:
            inputs = json.loads(inputs_json)
        except json.JSONDecodeError as e:
            print(json.dumps({"ok": False, "error": f"invalid --inputs JSON: {e}"}), file=sys.stderr)
            return 2

    parameters: Dict[str, Any] = {}
    if parameters_json:
        try:
            parameters = json.loads(parameters_json)
        except json.JSONDecodeError as e:
            print(json.dumps({"ok": False, "error": f"invalid --parameters JSON: {e}"}), file=sys.stderr)
            return 2

    ctx = Context(inputs=inputs, parameters=parameters, input_dir=input_dir)
    try:
        run(entry, ctx)
    except Exception as e:  # noqa: BLE001 — surface any failure to the runner
        print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"}), file=sys.stderr)
        return 1

    manifest = ctx.manifest().to_dict()
    print(json.dumps({"ok": True, "manifest": manifest}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())