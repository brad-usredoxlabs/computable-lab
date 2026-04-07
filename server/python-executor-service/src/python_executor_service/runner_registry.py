from __future__ import annotations

from .runner_base import TaskRunner
from .runners.integra_assist import IntegraAssistRunner


class RunnerRegistry:
    def __init__(self) -> None:
        self._runners: dict[str, TaskRunner] = {
            "integra_assist": IntegraAssistRunner(),
        }

    def get(self, adapter_id: str) -> TaskRunner:
        key = adapter_id.strip().lower()
        if key not in self._runners:
            raise KeyError(f"No runner registered for adapter: {adapter_id}")
        return self._runners[key]
