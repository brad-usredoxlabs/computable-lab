#!/usr/bin/env python3
"""Check test-prompts/corpus-manifest.yaml against test-prompts/AI-Chat-Corpus2.md.

WHY THIS EXISTS: the manifest promises that every `utterance` is VERBATIM from the canon and that
it was written against a named revision of it. Brad edits the corpus by hand; without this check the
manifest would silently drift and a gate would grade the old words. This is a tripwire, not a
policy engine.

Exit codes: 0 clean · 1 drift found · 2 unreadable input.

Usage: python3 scripts/check-corpus-manifest.py [--repo-root .]
No dependencies beyond PyYAML.
"""
import argparse
import hashlib
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    print("PyYAML is required: python3 -m pip install pyyaml", file=sys.stderr)
    sys.exit(2)

MANIFEST = "test-prompts/corpus-manifest.yaml"
CORPUS = "test-prompts/AI-Chat-Corpus2.md"
REQUIRED = ["id", "title", "utterances", "entry_state", "human_choices",
            "return_expectation", "completed_when", "not_done_if", "evidence_required"]


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    # default to the repo this script lives in, so it works from any cwd (profiles call it by absolute path)
    ap.add_argument("--repo-root", default=str(Path(__file__).resolve().parents[1]))
    root = Path(ap.parse_args().repo_root)
    corpus_path, manifest_path = root / CORPUS, root / MANIFEST
    try:
        corpus = corpus_path.read_text(encoding="utf-8")
        manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        print(f"cannot read input: {exc}", file=sys.stderr)
        return 2

    problems: list[str] = []
    actual_sha = hashlib.sha256(corpus.encode()).hexdigest()
    recorded_sha = str(manifest.get("source_sha256", ""))
    if actual_sha != recorded_sha:
        problems.append(
            f"corpus revision changed: manifest pins {recorded_sha[:16]}…, file is {actual_sha[:16]}… "
            f"— re-verify each utterance, then update source_sha256"
        )

    scenarios = manifest.get("scenarios") or []
    if not scenarios:
        problems.append("manifest declares no scenarios")

    src = norm(corpus)
    seen: set[str] = set()
    for sc in scenarios:
        sid = sc.get("id", "<missing id>")
        if sid in seen:
            problems.append(f"{sid}: duplicate scenario id")
        seen.add(sid)
        for key in REQUIRED:
            if key not in sc:
                problems.append(f"{sid}: missing field {key}")
        for utter in sc.get("utterances") or []:
            if norm(str(utter)) not in src:
                problems.append(f"{sid}: utterance is not verbatim in {CORPUS}: {norm(str(utter))[:90]!r}")
        if len(sc.get("not_done_if") or []) < 3:
            problems.append(f"{sid}: fewer than 3 not_done_if traps (the important half)")
        if len(sc.get("evidence_required") or []) < 2:
            problems.append(f"{sid}: fewer than 2 evidence_required entries")
        cf = sc.get("continues_from")
        if cf is not None and cf not in {s.get("id") for s in scenarios}:
            problems.append(f"{sid}: continues_from names unknown scenario {cf!r}")

    if problems:
        print(f"CORPUS MANIFEST: {len(problems)} problem(s)")
        for p in problems:
            print(f"  - {p}")
        return 1

    print(f"CORPUS MANIFEST: clean — {len(scenarios)} scenarios, all utterances verbatim, sha {actual_sha[:16]}…")
    return 0


if __name__ == "__main__":
    sys.exit(main())
