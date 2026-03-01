from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ExecutionTask:
    task_id: str
    execution_run_id: str
    robot_plan_id: str
    adapter_id: str
    target_platform: str
    contract_version: str
    runtime_parameters: Dict[str, Any] = field(default_factory=dict)
    artifact_refs: List[Dict[str, Any]] = field(default_factory=list)
    lease_expires_at: Optional[str] = None


@dataclass
class LogEntry:
    message: str
    level: str = "info"
    code: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    timestamp: Optional[str] = None


@dataclass
class RunnerResult:
    final_status: str  # completed | failed | canceled
    logs: List[LogEntry] = field(default_factory=list)
    artifacts: List[Dict[str, Any]] = field(default_factory=list)
    measurements: List[Dict[str, Any]] = field(default_factory=list)
    failure: Optional[Dict[str, Any]] = None
    external: Optional[Dict[str, Any]] = None
