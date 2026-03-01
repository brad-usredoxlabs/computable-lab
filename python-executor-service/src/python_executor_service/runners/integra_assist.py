from __future__ import annotations

import os
import time
from datetime import datetime, timezone

from ..models import ExecutionTask, LogEntry, RunnerResult
from ..pylabrobot_bridge import run_integra_task


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class IntegraAssistRunner:
    """Reference INTEGRA runner.

    Backend modes:
    - `simulate` (default): deterministic local simulation.
    - `pylabrobot`: use pylabrobot import + configured command/hook bridge.

    Env flags:
    - INTEGRA_ASSIST_BACKEND=simulate|pylabrobot
    - INTEGRA_ASSIST_SIMULATE=1 forces simulation regardless of backend
    """

    def run(self, task: ExecutionTask) -> RunnerResult:
        backend = os.getenv("INTEGRA_ASSIST_BACKEND", "simulate").strip().lower() or "simulate"
        force_simulate = os.getenv("INTEGRA_ASSIST_SIMULATE", "1") == "1" or bool(task.runtime_parameters.get("simulate"))

        if backend == "pylabrobot" and not force_simulate:
            try:
                return run_integra_task(task)
            except Exception as exc:  # noqa: BLE001
                return RunnerResult(
                    final_status="failed",
                    logs=[
                        LogEntry(
                            message=f"pylabrobot execution failed: {exc}",
                            level="error",
                            code="PYLABROBOT_EXECUTION_FAILED",
                            timestamp=_iso_now(),
                        )
                    ],
                    failure={
                        "code": "PYLABROBOT_EXECUTION_FAILED",
                        "class": "transient",
                        "message": str(exc),
                    },
                )

        sleep_ms = int(os.getenv("INTEGRA_ASSIST_SIM_MS", "300"))
        time.sleep(max(0, sleep_ms) / 1000.0)
        return RunnerResult(
            final_status="completed",
            logs=[
                LogEntry(
                    message=f"Simulated INTEGRA run for {task.robot_plan_id}",
                    level="info",
                    code="SIMULATED_RUN",
                    data={"adapter": task.adapter_id, "taskId": task.task_id, "backend": backend},
                    timestamp=_iso_now(),
                )
            ],
            artifacts=[
                {
                    "role": "telemetry_csv",
                    "uri": f"records/artifacts/{task.execution_run_id}/telemetry.csv",
                }
            ],
            external={"runId": f"sim-{task.task_id}", "rawStatus": "completed"},
        )
