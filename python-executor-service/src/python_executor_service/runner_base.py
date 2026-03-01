from __future__ import annotations

from typing import Protocol

from .models import ExecutionTask, RunnerResult


class TaskRunner(Protocol):
    def run(self, task: ExecutionTask) -> RunnerResult:
        ...
