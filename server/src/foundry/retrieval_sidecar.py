"""Persistent retrieval sidecar for the Fix-it coder's `retrieve` tool.

Spawned once per Fix-it job. Loads the lexical index and warms the neural
reranker (CUDA cross-encoder) a single time, then answers queries over
stdin/stdout so the 2GB+ rerank model is not reloaded per call.

Protocol (newline-delimited JSON):
  - On startup, after warm-up, emits one line: {"ready": true}
    (or {"ready": false, "error": "..."} and exits non-zero).
  - Then, for each request line {"query": str, "top_k": int}, emits one
    response line {"results": [...]} or {"error": "..."}.
  - Exits cleanly on EOF.

Settings (rerank model, device, GPU) are read from the environment by
retrieval.device.resolve_runtime_summary, exactly like the agent-workbench
CLI. EMBED_MODEL is left blank by the caller so candidate retrieval stays
lexical and only the reranker uses the GPU.
"""
from __future__ import annotations

import argparse
import json
import sys


def _emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def main() -> int:
    parser = argparse.ArgumentParser(description="Fix-it retrieval sidecar")
    parser.add_argument("--index-dir", required=True)
    parser.add_argument("--candidate-k", type=int, default=24)
    args = parser.parse_args()

    try:
        from retrieval.device import resolve_runtime_summary
        from retrieval.query import query_index

        runtime = resolve_runtime_summary()
        top_k_default = int(runtime.get("settings", {}).get("rerank_top_k", 8))

        # Warm the reranker so the first real query is fast. The model is
        # cached module-level in retrieval.neural_rerank for the process life.
        query_index(
            args.index_dir,
            "warmup query to load the reranker model",
            candidate_k=args.candidate_k,
            top_k=top_k_default,
            runtime_summary=runtime,
        )
    except Exception as exc:  # noqa: BLE001
        _emit({"ready": False, "error": f"{type(exc).__name__}: {exc}"})
        return 1

    _emit({"ready": True})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            query_text = (request.get("query") or "").strip()
            if not query_text:
                _emit({"error": "empty query"})
                continue
            top_k = int(request.get("top_k") or top_k_default)
            top_k = max(1, min(top_k, 15))
            result = query_index(
                args.index_dir,
                query_text,
                candidate_k=max(top_k * 3, args.candidate_k),
                top_k=top_k,
                runtime_summary=runtime,
            )
            _emit({"results": result.get("results", []), "mode": result.get("retrieval_mode")})
        except Exception as exc:  # noqa: BLE001
            _emit({"error": f"{type(exc).__name__}: {exc}"})

    return 0


if __name__ == "__main__":
    sys.exit(main())
