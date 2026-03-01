from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass
class ExecutorConfig:
    api_base_url: str = "http://localhost:3001/api"
    executor_id: str = "pyexec-01"
    executor_token: str = ""
    capabilities: list[str] = None  # type: ignore[assignment]
    max_tasks: int = 1
    lease_duration_ms: int = 60_000
    poll_interval_ms: int = 2_000
    run_once: bool = False

    @staticmethod
    def from_env() -> "ExecutorConfig":
        caps_raw = os.getenv("CL_EXECUTOR_CAPABILITIES", "integra_assist")
        caps = [c.strip() for c in caps_raw.split(",") if c.strip()]
        return ExecutorConfig(
            api_base_url=os.getenv("CL_API_BASE_URL", "http://localhost:3001/api").rstrip("/"),
            executor_id=os.getenv("CL_EXECUTOR_ID", "pyexec-01"),
            executor_token=os.getenv("CL_EXECUTOR_TOKEN", ""),
            capabilities=caps,
            max_tasks=int(os.getenv("CL_EXECUTOR_MAX_TASKS", "1")),
            lease_duration_ms=int(os.getenv("CL_EXECUTOR_LEASE_MS", "60000")),
            poll_interval_ms=int(os.getenv("CL_EXECUTOR_POLL_INTERVAL_MS", "2000")),
            run_once=os.getenv("CL_EXECUTOR_ONCE", "0") == "1",
        )
