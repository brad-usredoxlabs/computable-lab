from __future__ import annotations

import json
import urllib.request
import urllib.error
from typing import Any, Dict, List

from .config import ExecutorConfig
from .models import ExecutionTask, LogEntry


class CLClient:
    def __init__(self, cfg: ExecutorConfig):
        self.cfg = cfg

    def _headers(self) -> Dict[str, str]:
        headers = {"content-type": "application/json"}
        if self.cfg.executor_token:
            headers["authorization"] = f"Bearer {self.cfg.executor_token}"
        return headers

    def _post(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.cfg.api_base_url}{path}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url=url, data=data, method="POST", headers=self._headers())
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {exc.code} {path}: {detail}") from exc

    def claim_tasks(self) -> List[ExecutionTask]:
        payload = {
            "executorId": self.cfg.executor_id,
            "capabilities": self.cfg.capabilities,
            "maxTasks": self.cfg.max_tasks,
            "leaseDurationMs": self.cfg.lease_duration_ms,
        }
        result = self._post("/execution-tasks/claim", payload)
        tasks: List[ExecutionTask] = []
        for item in result.get("tasks", []):
            tasks.append(
                ExecutionTask(
                    task_id=item["taskId"],
                    execution_run_id=item["executionRunId"],
                    robot_plan_id=item["robotPlanId"],
                    adapter_id=item["adapterId"],
                    target_platform=item["targetPlatform"],
                    contract_version=item.get("contractVersion", "execution-task/v1"),
                    runtime_parameters=item.get("runtimeParameters", {}),
                    artifact_refs=item.get("artifactRefs", []),
                    lease_expires_at=item.get("leaseExpiresAt"),
                )
            )
        return tasks

    def heartbeat(self, task: ExecutionTask, sequence: int, progress: Dict[str, Any] | None = None) -> Dict[str, Any]:
        return self._post(
            f"/execution-tasks/{task.task_id}/heartbeat",
            {
                "executorId": self.cfg.executor_id,
                "sequence": sequence,
                "status": "running",
                **({"progress": progress} if progress else {}),
            },
        )

    def append_logs(self, task: ExecutionTask, sequence: int, entries: List[LogEntry]) -> Dict[str, Any]:
        payload_entries: List[Dict[str, Any]] = []
        for entry in entries:
            payload_entries.append(
                {
                    "message": entry.message,
                    "level": entry.level,
                    **({"code": entry.code} if entry.code else {}),
                    **({"data": entry.data} if entry.data is not None else {}),
                    **({"timestamp": entry.timestamp} if entry.timestamp else {}),
                }
            )
        return self._post(
            f"/execution-tasks/{task.task_id}/logs",
            {
                "executorId": self.cfg.executor_id,
                "sequence": sequence,
                "entries": payload_entries,
            },
        )

    def update_status(
        self,
        task: ExecutionTask,
        sequence: int,
        status: str,
        failure: Dict[str, Any] | None = None,
        external: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        return self._post(
            f"/execution-tasks/{task.task_id}/status",
            {
                "executorId": self.cfg.executor_id,
                "sequence": sequence,
                "status": status,
                **({"failure": failure} if failure else {}),
                **({"external": external} if external else {}),
            },
        )

    def complete(
        self,
        task: ExecutionTask,
        sequence: int,
        final_status: str,
        artifacts: List[Dict[str, Any]] | None = None,
        measurements: List[Dict[str, Any]] | None = None,
    ) -> Dict[str, Any]:
        return self._post(
            f"/execution-tasks/{task.task_id}/complete",
            {
                "executorId": self.cfg.executor_id,
                "sequence": sequence,
                "finalStatus": final_status,
                **({"artifacts": artifacts} if artifacts else {}),
                **({"measurements": measurements} if measurements else {}),
            },
        )
