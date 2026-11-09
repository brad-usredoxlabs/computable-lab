#!/usr/bin/env python3
"""L2-SUITE-B — the sequence-leg classifier's stdin/stdout form (parity-pin
feed #3; mirrors lib/verdict-cli.py's bridge shape).

Stdin:  { "result": <AgentResult-ish done frame>,
          "frames": [<SSE frames>]? ,
          "context": { "recordIds": [...], "engineIds": [...] }? }
stdout: the verdict — "proposal" | "cards" | "honest-failure" — or, on the
        forbidden shapes: nothing on stdout and a NONZERO exit (the
        classifier's throw contract; stderr carries the delivered-channel
        dump).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import sequence_verdict  # noqa: E402


def main() -> int:
    raw = sys.stdin.read()
    try:
        doc = json.loads(raw)
    except Exception as e:  # noqa: BLE001
        sys.stderr.write("sequence-verdict-cli: bad stdin JSON: %s\n" % e)
        return 2
    result = doc.get("result") if isinstance(doc, dict) else None
    frames = doc.get("frames") if isinstance(doc, dict) else None
    context = doc.get("context") if isinstance(doc, dict) else None
    try:
        verdict = sequence_verdict.classify(result, frames, context)
    except sequence_verdict.SequenceLegOutcomeError as e:
        sys.stderr.write(str(e) + "\n")
        return 1
    sys.stdout.write(verdict + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
