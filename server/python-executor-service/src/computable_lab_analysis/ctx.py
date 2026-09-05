"""Analysis Context — the object an analysis entry script receives.

``run(ctx)`` gets a Context bound to this run's inputs, parameters, and output
collector. The runner provisions inputs (either inline payloads or paths into a
mounted input dir supplied by the CL runner) before invoking the script.
"""
from __future__ import annotations

import importlib.util
import hashlib
import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Serialization helpers (deterministic)
# ---------------------------------------------------------------------------
def _stable_dict() -> Dict[str, Any]:
    # dicts preserve insertion order; we rely on that for stable JSON output
    return {}


# ---------------------------------------------------------------------------
# DatasetHandle
# ---------------------------------------------------------------------------
@dataclass
class DatasetHandle:
    """A handle to an authorized input dataset.

    ``read_signal()`` returns {"axis": [...], "values": [...]} for signal-like
    inputs; ``read_rows()`` returns a list of dicts for table-like inputs.
    ``path`` is the mounted file path (if the runner provisioned one); scripts
    may also open it directly with ordinary Python.
    """
    name: str
    data_kind: str
    path: Optional[str] = None
    inline: Optional[Any] = None
    meta: Dict[str, Any] = field(default_factory=dict)

    def read_signal(self) -> Dict[str, Any]:
        if self.inline is not None and isinstance(self.inline, dict):
            return self.inline
        if self.path:
            text = Path(self.path).read_text(encoding="utf-8")
            # naive CSV -> points; robust parsing belongs to the runner/readers
            return _csv_signal(text)
        return {"axis": [], "values": []}

    def read_rows(self) -> List[Dict[str, Any]]:
        if self.inline is not None and isinstance(self.inline, list):
            return [dict(r) for r in self.inline]
        if self.path:
            text = Path(self.path).read_text(encoding="utf-8")
            return _parse_rows(text)
        return []

    def file_bytes(self) -> bytes:
        """Return the raw bytes of a file-backed input (model, image, raw file)."""
        if self.path:
            return Path(self.path).read_bytes()
        if self.inline is not None and isinstance(self.inline, (bytes, bytearray)):
            return bytes(self.inline)
        raise RuntimeError(f"input '{self.name}' has no file path or inline bytes")

    @property
    def source_path(self) -> Optional[str]:
        return self.path


def _parse_rows(text: str) -> List[Dict[str, Any]]:
    """Parse rows from either a JSON array/object or a CSV string (auto-detect)."""
    stripped = text.lstrip()
    if stripped.startswith("[") or stripped.startswith("{"):
        try:
            data = json.loads(stripped)
        except json.JSONDecodeError:
            return _csv_rows(text)
        if isinstance(data, list):
            return [dict(r) for r in data if isinstance(r, dict)]
        if isinstance(data, dict):
            # maybe {"rows": [...]} or a columnar object
            for key in ("rows", "data", "values"):
                val = data.get(key)
                if isinstance(val, list) and val and isinstance(val[0], dict):
                    return [dict(r) for r in val]
            return [data]
        return []
    return _csv_rows(text)


def _csv_rows(text: str) -> List[Dict[str, Any]]:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if not lines:
        return []
    header = [h.strip().strip('"') for h in lines[0].split(",")]
    rows: List[Dict[str, Any]] = []
    for line in lines[1:]:
        cells = [c.strip().strip('"') for c in line.split(",")]
        row: Dict[str, Any] = {}
        for i, h in enumerate(header):
            val: Any = cells[i] if i < len(cells) else ""
            # best-effort numeric coercion
            try:
                if "." in val or "e" in val.lower():
                    f = float(val)
                    if f == int(f) and "." not in val:
                        val = int(f)
                    else:
                        val = f
                else:
                    val = int(val)
            except (ValueError, TypeError):
                pass
            row[h] = val
        rows.append(row)
    return rows


def _csv_signal(text: str) -> Dict[str, Any]:
    rows = _csv_rows(text)
    keys = list(rows[0].keys()) if rows else []
    return {
        "axis": [r[keys[0]] for r in rows] if keys else [],
        "values": [r[keys[1]] for r in rows] if len(keys) > 1 else [],
    }


# ---------------------------------------------------------------------------
# Artifact + manifest
# ---------------------------------------------------------------------------
@dataclass
class Artifact:
    name: str
    data_kind: str
    value: Any
    units: Optional[Dict[str, Any]] = None
    schema: Optional[Dict[str, Any]] = None
    # File emission: when set, CL streams this local file to a storage device
    # rather than inlining `value` into a record. {path, sha256, sizeBytes, format}
    blob: Optional[Dict[str, Any]] = None


@dataclass
class View:
    name: str
    renderer: str
    artifact_name: str
    bindings: Dict[str, Any] = field(default_factory=dict)
    options: Dict[str, Any] = field(default_factory=dict)


@dataclass
class OutputManifest:
    """Collected outputs — serializes to a versioned JSON manifest with stable order."""
    version: int = 1
    artifacts: List[Artifact] = field(default_factory=list)
    views: List[View] = field(default_factory=list)
    metrics: List[Dict[str, Any]] = field(default_factory=list)
    logs: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "version": self.version,
            "artifacts": [
                {
                    "name": a.name,
                    "dataKind": a.data_kind,
                    "value": a.value,
                    **({"blob": a.blob} if a.blob else {}),
                    **({"units": a.units} if a.units else {}),
                    **({"schema": a.schema} if a.schema else {}),
                }
                for a in self.artifacts
            ],
            "views": [
                {
                    "name": v.name,
                    "renderer": v.renderer,
                    "artifact": v.artifact_name,
                    "bindings": v.bindings,
                    "options": v.options,
                }
                for v in self.views
            ],
            "metrics": self.metrics,
            "logs": self.logs,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)


# ---------------------------------------------------------------------------
# Context
# ---------------------------------------------------------------------------
class Context:
    def __init__(
        self,
        *,
        inputs: Optional[Dict[str, Dict[str, Any]]] = None,
        parameters: Optional[Dict[str, Any]] = None,
        input_dir: Optional[str] = None,
    ) -> None:
        self._inputs = inputs or {}
        self._parameters = dict(parameters or {})
        self._input_dir = input_dir
        self._manifest = OutputManifest()

    @property
    def parameters(self) -> Dict[str, Any]:
        """Immutable validated parameter mapping."""
        return dict(self._parameters)

    def input(self, name: str) -> DatasetHandle:
        spec = self._inputs.get(name)
        if spec is None:
            raise KeyError(f"input not provided: {name}")
        path: Optional[str] = None
        if spec.get("path"):
            path = spec["path"]
        elif self._input_dir:
            candidate = Path(self._input_dir) / f"{name}.csv"
            if candidate.exists():
                path = str(candidate)
        return DatasetHandle(
            name=name,
            data_kind=str(spec.get("dataKind", "table")),
            path=path,
            inline=spec.get("inline"),
            meta=dict(spec.get("meta", {})),
        )

    def publish(
        self,
        name: str,
        data: Any,
        *,
        kind: str = "table",
        units: Optional[Dict[str, str]] = None,
        schema: Optional[Dict[str, Any]] = None,
    ) -> Artifact:
        artifact = Artifact(name=name, data_kind=kind, value=data, units=units, schema=schema)
        self._manifest.artifacts.append(artifact)
        return artifact

    def publish_file(
        self,
        name: str,
        path: str,
        *,
        kind: str = "binary",
        format: Optional[str] = None,
        units: Optional[Dict[str, str]] = None,
        schema: Optional[Dict[str, Any]] = None,
    ) -> Artifact:
        """Register a file the script wrote as an output artifact.

        kind: model | table | signal | image | binary | ...
        format: joblib | pt | pkl | csv | png | ...
        CL streams the bytes to a storage device (never git) and records a
        data-reference + sha256.
        """
        p = Path(path)
        if not p.exists():
            raise FileNotFoundError(f"publish_file: '{path}' does not exist")
        if not p.is_file():
            raise ValueError(f"publish_file: '{path}' is not a regular file")
        data = p.read_bytes()
        artifact = Artifact(
            name=name,
            data_kind=kind,
            value=p.name,
            units=units,
            schema=schema,
            blob={
                "path": str(p),
                "sha256": hashlib.sha256(data).hexdigest(),
                "sizeBytes": len(data),
                "format": (format or p.suffix.lstrip(".")) or "bin",
            },
        )
        self._manifest.artifacts.append(artifact)
        return artifact

    def metric(self, name: str, value: Any, *, unit: Optional[str] = None, label: Optional[str] = None) -> None:
        self._manifest.metrics.append(
            {
                "name": name,
                "value": value,
                **({"unit": unit} if unit else {}),
                **({"label": label} if label else {}),
            }
        )

    def view(
        self,
        name: str,
        renderer: str,
        *,
        artifact: str,
        bindings: Optional[Dict[str, Any]] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> None:
        self._manifest.views.append(
            View(
                name=name,
                renderer=renderer,
                artifact_name=artifact,
                bindings=bindings or {},
                options=options or {},
            )
        )

    def log(self, message: str, *, level: str = "info", code: Optional[str] = None) -> None:
        self._manifest.logs.append(
            {"message": message, "level": level, **({"code": code} if code else {})}
        )

    def progress(self, message: str, *, fraction: Optional[float] = None) -> None:
        self._manifest.logs.append(
            {"message": message, "level": "progress", **({"fraction": fraction} if fraction is not None else {})}
        )

    def manifest(self) -> OutputManifest:
        return self._manifest


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
def run(entry_path: str, ctx: Context) -> OutputManifest:
    """Import the entry module and call its ``run(ctx)`` exactly once."""
    path = Path(entry_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"entry script not found: {entry_path}")

    module_name = f"_cl_analysis_{abs(hash(str(path)))}"
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load entry script: {entry_path}")
    module = importlib.util.module_from_spec(spec)
    # ensure sibling imports on the entry's directory resolve
    sys.path.insert(0, str(path.parent))
    try:
        spec.loader.exec_module(module)
    finally:
        try:
            sys.path.remove(str(path.parent))
        except ValueError:
            pass

    run_fn = getattr(module, "run", None)
    if not callable(run_fn):
        raise AttributeError(f"entry script must export a callable run(ctx); got: {run_fn!r}")
    result = run_fn(ctx)
    # tolerate a script returning None; require it to have used ctx.publish etc.
    return ctx.manifest()