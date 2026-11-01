#!/usr/bin/env python3
"""fake-inference.py — the harness-owned deterministic MODEL-LAYER fake (A1).

A tiny OpenAI-compatible HTTP server that stands in for the sampler. It is
reached ONLY through the lane backend's own inference config (pointed at by
run-journeys.py via the SHIPPED config surface). Every wire stays REAL:
  browser -> :3093 /api/ai/**  (untouched product routes, zero interception)
  backend -> this fake          (real HTTP, OpenAI-compatible protocol)
The browser NEVER intercepts: this server is on the BACKEND side of the wire.

It does ONLY two things (ruling Q-B: canned completions are DATA, not logic):
  1. GET  {base}/models           -> a valid /models list (the probe the
                                     backend runs on config activation).
  2. POST {base}/chat/completions -> a canned completion, looked up as
       journey = the canned block whose `prompt_contains` substring appears
                 in the CURRENT user message first, the whole conversation
                 (history) second — the journey SET is the canned YAML
                 itself (fix4 D3: no hardcoded id tuple in code);
       turn    = 2 if a prior assistant message rides the request (the
                 deterministic turn-2 key on this trunk) or the product's
                 "[Answered clarifications]" marker is present (secondary
                 key), else 1. The receipt log records that SAME resolved
                 turn, `saw_assistant`, and which canned block served (fix4
                 D4 — the pre-fix4 log recomputed the turn from the marker
                 alone and misreported the answer turn).
     The completion body (the agent_intent tool call: event_shorthand with a
     scientist-intent YAML, or protocol_edit with ops) comes VERBATIM from
     canned/completions.yaml. The model writes shorthand/ops only — it never
     writes events (the deterministic compiler owns event-graph expansion).

Usage:  python3 fake-inference.py --port <free-port> --canned <yaml> --log <jsonl>
Exit 0 on clean shutdown. SIGTERM/SIGINT close the server.
"""
import argparse
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MARKER = "[Answered clarifications]"  # the product's turn-2 signal (product contract)
# NOTE (measured 2026-11-01, .convo dump): on this trunk the [Answered
# clarifications] block does NOT ride the MODEL request — the answer turn's
# messages are [system, user(ask), assistant(card), user(answer)]. The
# deterministic turn-2 signal is therefore the presence of a prior ASSISTANT
# message (the ask turn's request has none). The marker is kept as a secondary
# key for surfaces that DO append it.


def load_canned(path):
    import yaml
    with open(path) as fh:
        return yaml.safe_load(fh)


def pick_completion(canned, convo_text, saw_assistant=False, current_text=None):
    """D3 (fix4): the (journey, turn) lookup over the DATA. The JOURNEY SET
    IS THE CANNED YAML — `canned["journeys"].items()` (YAML order), keyed by
    each block's own id; adding a journey = adding a block, no code change
    here (the pre-fix4 version iterated a hardcoded ("J1","J2","J3") tuple
    and a new J4 block never dispatched).

    Matching order: the CURRENT user message first, the whole conversation
    (`convo_text`, history included) second — a thread whose history
    mentions several journey prompts binds to the journey the CURRENT turn
    asks (the pre-fix4 version matched the joined conversation first-match-
    wins, i.e. by id order, not by the current turn).

    The TURN key is unchanged: `saw_assistant` (True iff a prior assistant
    message is in the request) is the deterministic turn-2 signal on this
    trunk; the MARKER is the secondary key. Returns
    (journey_id, spec, matched_in) — matched_in in {'current','history',
    None}; spec is the turn's block dict or None."""
    if not isinstance(convo_text, str):
        return None, None, None
    journeys = (canned or {}).get("journeys") or {}
    if not isinstance(journeys, dict):
        return None, None, None
    is_answer = bool(saw_assistant) or (MARKER in convo_text)

    def lookup(haystack):
        if not isinstance(haystack, str) or not haystack:
            return None, None
        for jid, j in journeys.items():          # D3: the DATA drives the set
            if not isinstance(j, dict):
                continue
            needle = j.get("prompt_contains")
            if needle and needle in haystack:
                spec = j.get("turn2" if is_answer else "turn1")
                if not isinstance(spec, dict) and is_answer:
                    spec = j.get("turn1")        # block declares turn1 only
                if isinstance(spec, dict):
                    return jid, spec
        return None, None

    if isinstance(current_text, str) and current_text:
        jid, spec = lookup(current_text)         # D3: current message first
        if jid is not None:
            return jid, spec, "current"
    jid, spec = lookup(convo_text)               # D3: history second
    if jid is not None:
        return jid, spec, "history"
    return None, None, None


def describe_request(messages, convo_text, saw_assistant, current_text,
                     jid, spec, matched_in, stream, path):
    """D4 (fix4): ONE resolved turn for dispatch AND the receipt logs. The
    pre-fix4 log computed `turn` from the MARKER key alone while dispatch
    used `saw_assistant` — the answer turn (no marker on this trunk's wire)
    was misreported as turn 1. Returns (convo_dump, log_entry); the log
    entry carries the resolved turn variable, `saw_assistant`, the marker
    flag, which phase matched, and the CANNED BLOCK id that served the
    request (None = no canned block matched)."""
    marker = MARKER in (convo_text or "")
    turn = 2 if (bool(saw_assistant) or marker) else 1
    convo_dump = {"messages": messages,
                  "convo_len": len(convo_text or ""),
                  "marker": marker,
                  "n_messages": len(messages)}
    log_entry = {"method": "POST", "path": path, "stream": bool(stream),
                 "turn": turn,                   # the RESOLVED turn (dispatch)
                 "saw_assistant": bool(saw_assistant),  # the turn-2 key
                 "marker": marker,               # secondary key, recorded too
                 "matched_in": matched_in,       # D3: which phase matched
                 "journey_block": jid,           # D4: the block that served
                 "journey_match": bool(spec),
                 "n_messages": len(messages)}
    return convo_dump, log_entry


class FakeHandler(BaseHTTPRequestHandler):
    server_version = "L2TrunkJourneysFake/1"
    canned = None
    model = "l2trunkj-fake"
    log_path = None
    _log_lock = threading.Lock()

    # -- plumbing --------------------------------------------------------
    def log_message(self, fmt, *a):
        sys.stderr.write("[fake-inference] " + (fmt % a) + "\n")

    def _log(self, rec):
        if not self.log_path:
            return
        with self._log_lock:
            with open(self.log_path, "a") as fh:
                fh.write(json.dumps(rec) + "\n")

    def _send_json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        try:
            return json.loads(raw.decode() or "{}")
        except Exception:
            return {"__unparsed__": raw.decode(errors="replace")[:400]}

    # -- routes ----------------------------------------------------------
    def do_GET(self):
        # The probe: normalizeBaseUrl strips trailing '/', so the base is
        # e.g. http://127.0.0.1:PORT/api/v1 and /models is POSTed under it.
        if self.path.endswith("/models"):
            self._send_json({"object": "list",
                             "data": [{"id": self.model,
                                       "object": "model",
                                       "owned_by": "l2-trunk-journeys"}]})
            self._log({"method": "GET", "path": self.path, "route": "models"})
            return
        if self.path.endswith("/health"):
            self._send_json({"status": "ok", "fake": "l2trunkj"})
            return
        self._send_json({"error": "not found"}, 404)

    def do_POST(self):
        if not self.path.endswith("/chat/completions"):
            self._send_json({"error": "not found"}, 404)
            return
        body = self._read_body()
        messages = body.get("messages") or []
        # The journey prompt may ride in HISTORY (turn 2: the answer block is
        # the current user message, the ask is the prior one) — join the whole
        # conversation for the match.
        parts = []
        saw_assistant = False
        for m in messages:
            if not isinstance(m, dict):
                continue
            if m.get("role") == "assistant":
                saw_assistant = True
            c = m.get("content")
            if isinstance(c, str):
                parts.append(c)
            elif isinstance(c, list):
                parts.append(" ".join(x.get("text", "") for x in c
                                       if isinstance(x, dict)))
        convo_text = "\n".join(parts)
        # The CURRENT user message (D3): the last user role message — the
        # dispatch matches on it FIRST (a thread whose history mentions
        # several journey prompts binds by the current turn, not by id
        # order), the joined conversation SECOND.
        current_text = None
        for m in reversed(messages):
            if isinstance(m, dict) and m.get("role") == "user":
                c = m.get("content")
                if isinstance(c, str):
                    current_text = c
                elif isinstance(c, list):
                    current_text = " ".join(x.get("text", "") for x in c
                                            if isinstance(x, dict))
                break
        # Turn key: the answer turn's request carries the assistant's own
        # prior card as a message (the ask turn's does not) — the deterministic
        # signal, since the [Answered clarifications] marker does not ride this
        # trunk's model request. The marker stays a secondary key. D4 (fix4):
        # the resolved turn + which block served is logged from the SAME
        # variables dispatch used (the pre-fix4 log recomputed turn from the
        # MARKER alone and misreported the answer turn).
        jid, spec, matched_in = pick_completion(
            self.canned, convo_text, saw_assistant=saw_assistant,
            current_text=current_text)
        # Dump the conversation + the receipt log entry in one place so the
        # two can never diverge on the turn key (D4). The .convo dump exists
        # so turn keying can be verified: the marker's location is a product
        # contract, and the harness must SEE where it rides.
        convo_dump, log_entry = describe_request(
            messages, convo_text, saw_assistant, current_text,
            jid, spec, matched_in, body.get("stream"), self.path)
        if self.log_path:
            try:
                with open(self.log_path + ".convo", "a") as cfh:
                    cfh.write(json.dumps(convo_dump) + "\n")
            except Exception:
                pass
        self._log(log_entry)
        if spec is None:
            # No canned completion for this prompt: a clean tool-call that
            # proposes NOTHING is the honest answer (never fabricate an event).
            # The journey's assertion will then go RED — an honest failure.
            args = json.dumps({"intent": "unknown"})
        else:
            if spec.get("shorthand") is not None:
                args = json.dumps({"intent": "event_shorthand",
                                   "shorthand": spec["shorthand"]})
            elif spec.get("ops") is not None:
                args = json.dumps({"intent": "protocol_edit", "ops": spec["ops"]})
            else:
                args = json.dumps({"intent": spec.get("intent", "unknown")})
        if body.get("stream"):
            self._stream(args)
        else:
            self._send_json({
                "id": "cmpl-fake-1", "object": "chat.completion", "model": self.model,
                "choices": [{
                    "index": 0,
                    "message": {"role": "assistant", "content": None,
                                "tool_calls": [{
                                    "id": "call_fake_1", "type": "function",
                                    "function": {"name": "agent_intent",
                                                 "arguments": args}}]},
                    "finish_reason": "tool_calls"}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1,
                          "total_tokens": 2},
            })

    def _stream(self, args):
        def sse(obj):
            return ("data: " + json.dumps(obj) + "\n\n").encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        base = {"id": "cmpl-fake-1", "object": "chat.completion.chunk",
                "model": self.model}
        # chunk 1: role
        self.wfile.write(sse({**base, "choices": [{"index": 0,
                            "delta": {"role": "assistant", "content": None},
                            "finish_reason": None}]}))
        # chunk 2: the tool call (name + full arguments in one delta)
        self.wfile.write(sse({**base, "choices": [{"index": 0,
                            "delta": {"tool_calls": [{
                                "index": 0, "id": "call_fake_1",
                                "type": "function",
                                "function": {"name": "agent_intent",
                                             "arguments": args}}]},
                            "finish_reason": None}]}))
        # chunk 3: finish
        self.wfile.write(sse({**base, "choices": [{"index": 0,
                            "delta": {}, "finish_reason": "tool_calls"}]}))
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, required=True)
    ap.add_argument("--canned", required=True)
    ap.add_argument("--log", default=None)
    args = ap.parse_args()

    canned = load_canned(args.canned)
    FakeHandler.canned = canned
    FakeHandler.model = canned.get("model", "l2trunkj-fake")
    FakeHandler.log_path = args.log

    srv = ThreadingHTTPServer(("127.0.0.1", args.port), FakeHandler)
    actual = srv.server_address[1]
    # Print a ready line the driver can poll for; report the ACTUAL bound port
    # (the driver may pass 0 to let the OS pick a free port).
    print("FAKE-READY port=%d canned=%s" % (actual, os.path.basename(args.canned)),
          flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()


if __name__ == "__main__":
    sys.exit(main())
