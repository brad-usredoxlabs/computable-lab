from __future__ import annotations

import os
import sys
import tempfile
import types
import unittest
from enum import Enum
from pathlib import Path

from python_executor_service.pyalab_integra_hook import run_task


class _FakeLabware:
    def __init__(self, name: str, display_name: str = ""):
        self.name = name
        self.display_name = display_name

    def load_xml(self):
        return object()


class _FakeDeck:
    def __init__(self, name: str):
        self.name = name


class _FakeDeckPosition:
    def __init__(self, name: str, orientation):
        self.name = name
        self.orientation = orientation

    def __hash__(self):
        return hash((self.name, self.orientation))

    def __eq__(self, other):
        return isinstance(other, _FakeDeckPosition) and self.name == other.name and self.orientation == other.orientation


class _FakeDeckLayout:
    def __init__(self, deck, labware, name=""):
        self.deck = deck
        self.labware = labware
        self.name = name


class _FakeOrientation(Enum):
    A1_NW_CORNER = "Landscape"
    A1_SW_CORNER = "Portrait"


class _FakePipette:
    def __init__(self, name: str):
        self.name = name


class _FakeTip:
    def __init__(self, name: str):
        self.name = name


class _FakeProgram:
    def __init__(self, **kwargs):
        self.kwargs = kwargs

    def save_program(self, file_path: Path):
        file_path.write_text("<AssistConfig />", encoding="utf-8")


class PyalabHookTests(unittest.TestCase):
    def setUp(self) -> None:
        self._env_backup = dict(os.environ)
        self._tmp = tempfile.TemporaryDirectory()
        self.repo_root = Path(self._tmp.name)

        fake = types.ModuleType("pyalab")
        fake.Deck = _FakeDeck
        fake.DeckLayout = _FakeDeckLayout
        fake.DeckPosition = _FakeDeckPosition
        fake.LabwareOrientation = _FakeOrientation
        fake.Pipette = _FakePipette
        fake.Tip = _FakeTip
        fake.Plate = _FakeLabware
        fake.Reservoir = _FakeLabware
        fake.Tubeholder = _FakeLabware
        fake.Program = _FakeProgram
        sys.modules["pyalab"] = fake

    def tearDown(self) -> None:
        os.environ.clear()
        os.environ.update(self._env_backup)
        self._tmp.cleanup()
        if "pyalab" in sys.modules:
            del sys.modules["pyalab"]

    def test_run_task_generates_mapped_assist_config(self):
        artifact_dir = self.repo_root / "records" / "robot-artifact" / "integra_assist"
        artifact_dir.mkdir(parents=True, exist_ok=True)
        artifact = artifact_dir / "RP-000001.xml"
        artifact.write_text(
            """<?xml version="1.0" encoding="UTF-8"?>
<VialabProtocol id="RP-000001" name="demo">
  <Deck>
    <Slot id="slot_1" labwareRole="source" orientation="landscape" />
    <Slot id="slot_2" labwareRole="destination" orientation="portrait" />
  </Deck>
  <Steps />
</VialabProtocol>
""",
            encoding="utf-8",
        )

        os.environ["CL_REPO_ROOT"] = str(self.repo_root)
        os.environ["INTEGRA_ASSIST_PYALAB_SLOT_LAYOUT_JSON"] = '{"A":{"labware":"Plate A"},"B":{"labware":"Plate B"}}'

        result = run_task(
            {
                "task_id": "EXT-000001",
                "execution_run_id": "EXR-000001",
                "robot_plan_id": "RP-000001",
                "artifact_refs": [{"role": "integra_vialab_xml", "uri": "records/robot-artifact/integra_assist/RP-000001.xml"}],
            }
        )

        self.assertEqual(result["final_status"], "completed")
        artifact = result["artifacts"][0]["uri"]
        mapped_path = self.repo_root / artifact
        self.assertTrue(mapped_path.exists())
        self.assertIn("PYALAB_DECK_MAPPED", [log.get("code") for log in result.get("logs", [])])


if __name__ == "__main__":
    unittest.main()
