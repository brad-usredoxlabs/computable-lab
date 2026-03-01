from __future__ import annotations

import os
import sys
import types
import unittest

from python_executor_service.models import ExecutionTask
from python_executor_service.runners.integra_assist import IntegraAssistRunner


class IntegraRunnerTests(unittest.TestCase):
    def setUp(self) -> None:
        self._env_backup = dict(os.environ)

    def tearDown(self) -> None:
        os.environ.clear()
        os.environ.update(self._env_backup)
        if "pylabrobot" in sys.modules:
            del sys.modules["pylabrobot"]

    def _task(self) -> ExecutionTask:
        return ExecutionTask(
            task_id="EXT-000001",
            execution_run_id="EXR-000001",
            robot_plan_id="RP-000001",
            adapter_id="integra_assist",
            target_platform="integra_assist",
            contract_version="execution-task/v1",
            runtime_parameters={},
        )

    def test_simulate_default(self):
        os.environ["INTEGRA_ASSIST_BACKEND"] = "simulate"
        os.environ["INTEGRA_ASSIST_SIMULATE"] = "1"
        result = IntegraAssistRunner().run(self._task())
        self.assertEqual(result.final_status, "completed")
        self.assertTrue(any(log.code == "SIMULATED_RUN" for log in result.logs))

    def test_pylabrobot_hook_path(self):
        # Inject fake pylabrobot module to satisfy import.
        sys.modules["pylabrobot"] = types.ModuleType("pylabrobot")

        os.environ["INTEGRA_ASSIST_BACKEND"] = "pylabrobot"
        os.environ["INTEGRA_ASSIST_SIMULATE"] = "0"
        os.environ["INTEGRA_ASSIST_PYLABROBOT_HOOK"] = "python_executor_service.pylabrobot_bridge:builtin_test_hook"

        result = IntegraAssistRunner().run(self._task())
        self.assertEqual(result.final_status, "completed")
        self.assertTrue(any(log.code == "PYLABROBOT_HOOK" for log in result.logs))
        self.assertEqual(result.external.get("rawStatus"), "completed")


if __name__ == "__main__":
    unittest.main()
