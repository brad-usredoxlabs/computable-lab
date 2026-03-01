from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Optional

from .cl_client import CLClient
from .config import ExecutorConfig
from .models import ExecutionTask
from .runner_registry import RunnerRegistry


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _log(event: str, **fields: object) -> None:
    payload = {"event": event, "at": _iso_now(), **fields}
    print(json.dumps(payload), flush=True)


class ClaimLoop:
    def __init__(self, cfg: ExecutorConfig, client: Optional[CLClient] = None, registry: Optional[RunnerRegistry] = None):
        self.cfg = cfg
        self.client = client or CLClient(cfg)
        self.registry = registry or RunnerRegistry()

    def _process_task(self, task: ExecutionTask) -> None:
        seq = 1
        _log(
            "task_claimed",
            executorId=self.cfg.executor_id,
            taskId=task.task_id,
            executionRunId=task.execution_run_id,
            adapterId=task.adapter_id,
        )

        self.client.heartbeat(task, sequence=seq, progress={"state": "starting"})
        seq += 1

        runner = self.registry.get(task.adapter_id)
        result = runner.run(task)

        if result.logs:
            self.client.append_logs(task, sequence=seq, entries=result.logs)
            seq += 1

        if result.failure:
            self.client.update_status(
                task,
                sequence=seq,
                status="failed",
                failure=result.failure,
                external=result.external,
            )
            seq += 1
        else:
            self.client.update_status(
                task,
                sequence=seq,
                status="running",
                external=result.external,
            )
            seq += 1

        self.client.complete(
            task,
            sequence=seq,
            final_status=result.final_status,
            artifacts=result.artifacts,
            measurements=result.measurements,
        )
        _log(
            "task_completed",
            executorId=self.cfg.executor_id,
            taskId=task.task_id,
            executionRunId=task.execution_run_id,
            finalStatus=result.final_status,
        )

    def run_cycle(self) -> int:
        tasks = self.client.claim_tasks()
        if not tasks:
            _log("idle", executorId=self.cfg.executor_id)
            return 0

        processed = 0
        for task in tasks:
            try:
                self._process_task(task)
                processed += 1
            except Exception as exc:  # noqa: BLE001
                _log(
                    "task_error",
                    executorId=self.cfg.executor_id,
                    taskId=task.task_id,
                    executionRunId=task.execution_run_id,
                    error=str(exc),
                )
                try:
                    self.client.update_status(
                        task,
                        sequence=999999,
                        status="failed",
                        failure={"code": "EXECUTOR_EXCEPTION", "class": "transient", "message": str(exc)},
                    )
                except Exception:
                    pass
        return processed

    def run_forever(self) -> None:
        while True:
            self.run_cycle()
            if self.cfg.run_once:
                return
            time.sleep(max(100, self.cfg.poll_interval_ms) / 1000.0)
