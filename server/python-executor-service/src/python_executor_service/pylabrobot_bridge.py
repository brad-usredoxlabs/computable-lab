from __future__ import annotations

import importlib
import json
import os
import shlex
import subprocess
import sys
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Dict

from .models import ExecutionTask, LogEntry, RunnerResult


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_pylabrobot_import() -> None:
    repo_path = os.getenv("PYLABROBOT_REPO_PATH", "").strip()
    if repo_path:
        abs_path = os.path.abspath(repo_path)
        if abs_path not in sys.path:
            sys.path.insert(0, abs_path)

    importlib.import_module("pylabrobot")


def _parse_hook_spec(spec: str) -> tuple[str, str]:
    if ":" not in spec:
        raise ValueError("Hook spec must be in module:function format")
    module_name, func_name = spec.split(":", 1)
    module_name = module_name.strip()
    func_name = func_name.strip()
    if not module_name or not func_name:
        raise ValueError("Hook spec must include module and function names")
    return module_name, func_name


def _run_hook(spec: str, task_payload: Dict[str, Any]) -> Dict[str, Any]:
    module_name, func_name = _parse_hook_spec(spec)
    module = importlib.import_module(module_name)
    func = getattr(module, func_name, None)
    if func is None or not callable(func):
        raise RuntimeError(f"Hook function not found or not callable: {spec}")
    result = func(task_payload)
    if not isinstance(result, dict):
        raise RuntimeError("Hook return value must be a dict")
    return result


def _run_command(command: str, task_payload: Dict[str, Any]) -> Dict[str, Any]:
    timeout_s = int(os.getenv("INTEGRA_ASSIST_PYLABROBOT_TIMEOUT_S", "120"))
    proc = subprocess.run(
        shlex.split(command),
        input=json.dumps(task_payload),
        text=True,
        capture_output=True,
        timeout=max(1, timeout_s),
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed ({proc.returncode}): {proc.stderr.strip()}")
    stdout = proc.stdout.strip()
    if not stdout:
        raise RuntimeError("Command returned empty stdout")
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Command stdout was not valid JSON: {stdout[:300]}") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("Command JSON output must be an object")
    return payload


def _coerce_result(payload: Dict[str, Any]) -> RunnerResult:
    final_status = str(payload.get("final_status", "failed"))
    if final_status not in {"completed", "failed", "canceled"}:
        raise RuntimeError(f"Invalid final_status from hook/command: {final_status}")

    logs: list[LogEntry] = []
    for entry in payload.get("logs", []):
        if not isinstance(entry, dict):
            continue
        logs.append(
            LogEntry(
                message=str(entry.get("message", "")),
                level=str(entry.get("level", "info")),
                code=(str(entry["code"]) if "code" in entry and entry["code"] is not None else None),
                data=(entry.get("data") if isinstance(entry.get("data"), dict) else None),
                timestamp=(str(entry["timestamp"]) if "timestamp" in entry and entry["timestamp"] is not None else None),
            )
        )

    artifacts = payload.get("artifacts", [])
    measurements = payload.get("measurements", [])
    failure = payload.get("failure")
    external = payload.get("external")

    return RunnerResult(
        final_status=final_status,
        logs=logs,
        artifacts=artifacts if isinstance(artifacts, list) else [],
        measurements=measurements if isinstance(measurements, list) else [],
        failure=failure if isinstance(failure, dict) else None,
        external=external if isinstance(external, dict) else None,
    )


def run_integra_task(task: ExecutionTask) -> RunnerResult:
    """Run an INTEGRA task via pylabrobot-backed integration.

    Execution mode options:
    - `INTEGRA_ASSIST_PYLABROBOT_COMMAND`: shell command receiving task JSON on stdin.
    - `INTEGRA_ASSIST_PYLABROBOT_HOOK`: python hook in module:function form.

    If neither is configured, defaults to:
    - `python_executor_service.pyalab_integra_hook:run_task`
    """

    _ensure_pylabrobot_import()

    task_payload = asdict(task)
    command = os.getenv("INTEGRA_ASSIST_PYLABROBOT_COMMAND", "").strip()
    hook = os.getenv("INTEGRA_ASSIST_PYLABROBOT_HOOK", "").strip()

    if command:
        return _coerce_result(_run_command(command, task_payload))
    if hook:
        return _coerce_result(_run_hook(hook, task_payload))
    return _coerce_result(_run_hook("python_executor_service.pyalab_integra_hook:run_task", task_payload))


def builtin_test_hook(task_payload: Dict[str, Any]) -> Dict[str, Any]:
    """Deterministic hook for local smoke tests."""

    task_id = str(task_payload.get("task_id", "unknown"))
    run_id = str(task_payload.get("execution_run_id", "unknown"))
    return {
        "final_status": "completed",
        "logs": [
            {
                "message": f"pylabrobot hook executed for {task_id}",
                "level": "info",
                "code": "PYLABROBOT_HOOK",
                "timestamp": _iso_now(),
            }
        ],
        "artifacts": [{"role": "telemetry_csv", "uri": f"records/artifacts/{run_id}/telemetry.csv"}],
        "external": {"runId": f"pylabrobot-{task_id}", "rawStatus": "completed"},
    }
