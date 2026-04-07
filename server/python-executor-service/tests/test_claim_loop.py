from __future__ import annotations

import unittest

from python_executor_service.claim_loop import ClaimLoop
from python_executor_service.config import ExecutorConfig
from python_executor_service.models import ExecutionTask, LogEntry, RunnerResult


class FakeClient:
    def __init__(self) -> None:
        self.claimed = False
        self.calls: list[tuple[str, dict]] = []

    def claim_tasks(self):
        if self.claimed:
            return []
        self.claimed = True
        return [
            ExecutionTask(
                task_id="EXT-000001",
                execution_run_id="EXR-000001",
                robot_plan_id="RP-000001",
                adapter_id="integra_assist",
                target_platform="integra_assist",
                contract_version="execution-task/v1",
                runtime_parameters={"simulate": True},
            )
        ]

    def heartbeat(self, task, sequence, progress=None):
        self.calls.append(("heartbeat", {"task": task.task_id, "sequence": sequence, "progress": progress}))
        return {"success": True, "accepted": True}

    def append_logs(self, task, sequence, entries):
        self.calls.append(("logs", {"task": task.task_id, "sequence": sequence, "entries": len(entries)}))
        return {"success": True, "accepted": True}

    def update_status(self, task, sequence, status, failure=None, external=None):
        self.calls.append(("status", {"task": task.task_id, "sequence": sequence, "status": status}))
        return {"success": True, "accepted": True}

    def complete(self, task, sequence, final_status, artifacts=None, measurements=None):
        self.calls.append(("complete", {"task": task.task_id, "sequence": sequence, "final_status": final_status}))
        return {"success": True, "accepted": True}


class FakeRunner:
    def run(self, task):
        return RunnerResult(
            final_status="completed",
            logs=[LogEntry(message="done")],
            artifacts=[{"role": "telemetry_csv", "uri": f"records/artifacts/{task.execution_run_id}/telemetry.csv"}],
        )


class FakeRegistry:
    def get(self, adapter_id):
        if adapter_id != "integra_assist":
            raise KeyError(adapter_id)
        return FakeRunner()


class ClaimLoopTests(unittest.TestCase):
    def test_run_cycle_processes_task(self):
        cfg = ExecutorConfig(
            api_base_url="http://localhost:3001/api",
            executor_id="pyexec-test",
            executor_token="",
            capabilities=["integra_assist"],
            max_tasks=1,
            lease_duration_ms=60000,
            poll_interval_ms=10,
            run_once=True,
        )
        client = FakeClient()
        loop = ClaimLoop(cfg, client=client, registry=FakeRegistry())

        processed = loop.run_cycle()
        self.assertEqual(processed, 1)
        names = [c[0] for c in client.calls]
        self.assertEqual(names, ["heartbeat", "logs", "status", "complete"])


if __name__ == "__main__":
    unittest.main()
