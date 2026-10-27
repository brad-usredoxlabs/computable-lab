#!/usr/bin/env python3
"""L2-SUITE-A — stdin/stdout CLI over the driver's python verdict re-encode
(lib/verdict.py). Same contract as lib/honest-cli.ts (the node bridge over
server/src/ai/honestOutcome.ts):

  stdin:  {"result": <AgentResult-ish>, "context": {"deckIds": [...], "resolvedIds": [...]}}
  stdout: "events-bound" | "cards" | "honest-failure" on success
  exit 1: the silent shape or the unbound raw-label shape (the helper's throw
          contract; the delivered-channel dump rides stderr)

Used by the pinned vitest parity pin (server/src/ai/
L2SuiteA.honestOutcome.parity.test.ts) to assert the python re-encode
classifies the SAME five fixtures identically to the committed TS helper —
drift between driver and helper is a defect.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from verdict import HonestOutcomeError, classify  # noqa: E402


def main():
    try:
        doc = json.load(sys.stdin)
    except Exception as e:
        sys.stderr.write("verdict-cli: bad stdin JSON: %s\n" % e)
        return 2
    result = doc.get("result") or {}
    context = doc.get("context")
    try:
        verdict = classify(result, context)
    except HonestOutcomeError as e:
        sys.stderr.write(str(e) + "\n")
        return 1
    sys.stdout.write(verdict + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
