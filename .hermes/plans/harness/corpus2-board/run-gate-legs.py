#!/usr/bin/env python3
"""Pre-run wrapper: normalise workspace before prompt-2 legs, fail-closed."""
import json
import os
import subprocess
import sys

LEG_ORDER = ("legAB", "leg3", "leg4")
SEED_BOARD = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "seed-board.py")


def plan(seed_board, drivers_dir, api_base, receipt_dir, tmpdir):
    """Return exactly 7 steps in fixed order."""
    steps = [
        {"name": "seed-board",
         "argv": [sys.executable, seed_board, "--seed",
                  "--api-base", api_base]},
        {"name": "verify-board",
         "argv": [sys.executable, seed_board, "--verify",
                  "--api-base", api_base]},
        {"name": "workspace-reset",
         "argv": [sys.executable, seed_board, "--workspace-reset",
                  "--api-base", api_base]},
        {"name": "verify-workspace",
         "argv": [sys.executable, seed_board, "--verify-workspace",
                  "--api-base", api_base]},
    ]
    for leg in LEG_ORDER:
        steps.append({"name": leg,
                      "argv": ["node", os.path.join(drivers_dir, leg + ".cjs")],
                      "env": {**os.environ,
                              "RECEIPT_DIR": receipt_dir,
                              "TMPDIR": tmpdir}})
    return steps


def run(plan, runner=subprocess.run):
    """Execute plan in order, fail-closed on any step failure."""
    for step in plan:
        try:
            result = runner(
                step["argv"],
                capture_output=True, text=True, timeout=120,
                env=step.get("env", os.environ))
        except subprocess.TimeoutExpired:
            print(f"TIMEOUT {step['name']}", file=sys.stderr)
            return 1
        except FileNotFoundError as exc:
            print(f"NOT_FOUND {step['name']}: {exc}", file=sys.stderr)
            return 1

        if result.returncode != 0:
            stderr_tail = result.stderr[-512:] if result.stderr else ""
            print(f"FAILED {step['name']} rc={result.returncode}",
                  file=sys.stderr)
            if stderr_tail:
                print(stderr_tail, file=sys.stderr)
            return 1

        # verify-workspace: also check output markers even on rc==0
        if step["name"] == "verify-workspace":
            combined = result.stdout + result.stderr
            if "UNDECLARED tab id=" in combined:
                print(f"FAILED {step['name']}: undeclared tab detected",
                      file=sys.stderr)
                return 1
            if "all declared" not in combined:
                print(f"FAILED {step['name']}: missing success marker",
                      file=sys.stderr)
                return 1

    return 0


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Pre-run wrapper: workspace reset + gate legs")
    parser.add_argument("--drivers", required=True,
                        help="Directory containing leg*.cjs")
    parser.add_argument("--receipt-dir", required=True,
                        help="Output directory for receipts")
    parser.add_argument("--api-base", default="http://127.0.0.1:3093")
    parser.add_argument("--tmpdir", default="/home/brad/tmp/regate")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print plan JSON, no execution")
    args = parser.parse_args()

    # Validate --drivers exists
    if not os.path.isdir(args.drivers):
        print(f"ERROR: drivers dir not found: {args.drivers}",
              file=sys.stderr)
        sys.exit(2)

    if args.dry_run:
        seed_board = SEED_BOARD
        steps = plan(seed_board, args.drivers, args.api_base,
                      args.receipt_dir, args.tmpdir)
        for s in steps:
            print(json.dumps({"name": s["name"], "argv": s["argv"],
                              "env": s.get("env")}))
        sys.exit(0)

    # Create receipt dir and tmpdir
    os.makedirs(args.receipt_dir, exist_ok=True)
    os.makedirs(args.tmpdir, exist_ok=True)

    seed_board = SEED_BOARD
    steps = plan(seed_board, args.drivers, args.api_base,
                  args.receipt_dir, args.tmpdir)
    rc = run(steps)
    sys.exit(rc)


if __name__ == "__main__":
    main()
