from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_repo_root() -> Path:
    # .../computable-lab/python-executor-service/src/python_executor_service/pyalab_integra_hook.py
    return Path(__file__).resolve().parents[4]


def _ensure_pyalab_import() -> None:
    explicit = os.getenv("PYALAB_REPO_PATH", "").strip()
    if explicit:
        path = Path(explicit).expanduser().resolve()
        if str(path) not in sys.path:
            sys.path.insert(0, str(path))
        return

    candidates = [
        _default_repo_root().parent / "pyalab" / "src",  # /codex-cl/pyalab -> ../pyalab symlink target
        _default_repo_root().parent.parent / "pyalab" / "src",  # /home/brad/git/pyalab/src
    ]
    for candidate in candidates:
        if candidate.exists() and str(candidate) not in sys.path:
            sys.path.insert(0, str(candidate))
            break


def _load_json_env(name: str, default: dict[str, Any]) -> dict[str, Any]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError(f"{name} must be a JSON object")
    return parsed


def _resolve_repo_root() -> Path:
    raw = os.getenv("CL_REPO_ROOT", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return _default_repo_root()


def _resolve_artifact_path(uri: str, repo_root: Path) -> Path:
    path = Path(uri)
    if path.is_absolute() and path.exists():
        return path
    rel = Path(uri.lstrip("/"))
    candidate = (repo_root / rel).resolve()
    if candidate.exists():
        return candidate
    raise FileNotFoundError(f"Robot-plan artifact not found: uri={uri}, resolved={candidate}")


def _extract_slots(xml_path: Path) -> list[dict[str, str]]:
    root = ET.fromstring(xml_path.read_text(encoding="utf-8"))
    if root.tag != "VialabProtocol":
        raise ValueError(f"Expected VialabProtocol root, got: {root.tag}")

    slots: list[dict[str, str]] = []
    for slot in root.findall("./Deck/Slot"):
        slot_id = slot.attrib.get("id", "").strip()
        role = slot.attrib.get("labwareRole", "").strip()
        orientation = slot.attrib.get("orientation", "landscape").strip().lower()
        if not slot_id:
            continue
        slots.append({"id": slot_id, "role": role, "orientation": orientation})
    if not slots:
        raise ValueError(f"No deck slots found in {xml_path}")
    return slots


def _normalize_section_name(slot_id: str, slot_map: dict[str, str]) -> str:
    candidate = slot_map.get(slot_id, slot_id)
    normalized = candidate.strip().upper()
    aliases = {
        "SLOT_1": "A",
        "SLOT_2": "B",
        "SLOT_3": "C",
        "SLOT_4": "D",
        "1": "A",
        "2": "B",
        "3": "C",
        "4": "D",
    }
    normalized = aliases.get(normalized, normalized)
    if normalized not in {"A", "B", "C", "D"}:
        raise ValueError(f"Unsupported slot mapping '{slot_id}' -> '{normalized}'. Expected A/B/C/D")
    return normalized


def _orientation_to_pyalab(orientation: str) -> str:
    o = orientation.strip().lower()
    if o == "portrait":
        return "A1_SW_CORNER"
    return "A1_NW_CORNER"


def _pick_labware_name(slot_section: str, role: str, slot_cfg: dict[str, Any], role_cfg: dict[str, Any]) -> str:
    section_cfg = slot_cfg.get(slot_section)
    if isinstance(section_cfg, dict):
        v = section_cfg.get("labware")
        if isinstance(v, str) and v.strip():
            return v.strip()
    if isinstance(section_cfg, str) and section_cfg.strip():
        return section_cfg.strip()

    if role:
        rv = role_cfg.get(role)
        if isinstance(rv, str) and rv.strip():
            return rv.strip()

    raise ValueError(
        f"No labware mapping for section '{slot_section}' (role='{role}'). "
        "Provide INTEGRA_ASSIST_PYALAB_SLOT_LAYOUT_JSON and/or INTEGRA_ASSIST_PYALAB_ROLE_MAP_JSON"
    )


def _build_program_from_slots(slots: list[dict[str, str]], robot_plan_id: str):
    _ensure_pyalab_import()

    from pyalab import Deck  # type: ignore
    from pyalab import DeckLayout  # type: ignore
    from pyalab import DeckPosition  # type: ignore
    from pyalab import LabwareOrientation  # type: ignore
    from pyalab import Pipette  # type: ignore
    from pyalab import Plate  # type: ignore
    from pyalab import Program  # type: ignore
    from pyalab import Reservoir  # type: ignore
    from pyalab import Tip  # type: ignore
    from pyalab import Tubeholder  # type: ignore

    deck_name = os.getenv("INTEGRA_ASSIST_PYALAB_DECK_NAME", "3 Position Universal Deck")
    pipette_name = os.getenv("INTEGRA_ASSIST_PYALAB_PIPETTE_NAME", "VOYAGER EIGHT 125 µl")
    tip_name = os.getenv("INTEGRA_ASSIST_PYALAB_TIP_NAME", "50 125 µl GripTip Non-sterile")

    slot_map = _load_json_env(
        "INTEGRA_ASSIST_PYALAB_SLOT_MAP_JSON",
        {"slot_1": "A", "slot_2": "B", "slot_3": "C", "slot_4": "D"},
    )
    slot_layout = _load_json_env("INTEGRA_ASSIST_PYALAB_SLOT_LAYOUT_JSON", {})
    role_map = _load_json_env("INTEGRA_ASSIST_PYALAB_ROLE_MAP_JSON", {})

    deck = Deck(name=deck_name)
    labware_by_position: dict[Any, Any] = {}

    for slot in slots:
        section = _normalize_section_name(slot["id"], slot_map)
        orientation_name = _orientation_to_pyalab(slot.get("orientation", "landscape"))
        orientation = getattr(LabwareOrientation, orientation_name)

        labware_name = _pick_labware_name(section, slot.get("role", ""), slot_layout, role_map)

        labware = None
        errors: list[str] = []
        for cls in (Plate, Reservoir, Tubeholder):
            try:
                labware = cls(name=labware_name, display_name=f"{slot.get('role', section)}")
                _ = labware.load_xml()
                break
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{cls.__name__}: {exc}")
                labware = None
        if labware is None:
            raise RuntimeError(f"Could not resolve labware '{labware_name}' in pyalab library: {' | '.join(errors)}")

        position = DeckPosition(name=section, orientation=orientation)
        labware_by_position[position] = labware

    layout = DeckLayout(deck=deck, labware=labware_by_position, name=f"CL mapped layout {robot_plan_id}")
    program = Program(
        deck_layouts=[layout],
        display_name=f"CL {robot_plan_id}",
        description="Generated by python-executor-service pyalab hook",
        pipette=Pipette(name=pipette_name),
        tip=Tip(name=tip_name),
        steps=[],
    )
    return program


def run_task(task_payload: dict[str, Any]) -> dict[str, Any]:
    repo_root = _resolve_repo_root()
    artifact_refs = task_payload.get("artifact_refs", [])
    if not isinstance(artifact_refs, list):
        raise ValueError("task_payload.artifact_refs must be a list")

    xml_uri = ""
    for item in artifact_refs:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role", ""))
        uri = str(item.get("uri", ""))
        if role == "integra_vialab_xml" and uri:
            xml_uri = uri
            break
        if uri.endswith(".xml") and not xml_uri:
            xml_uri = uri
    if not xml_uri:
        raise ValueError("No XML artifact found in task artifact_refs")

    xml_path = _resolve_artifact_path(xml_uri, repo_root)
    slots = _extract_slots(xml_path)

    robot_plan_id = str(task_payload.get("robot_plan_id", "unknown"))
    execution_run_id = str(task_payload.get("execution_run_id", "unknown"))

    program = _build_program_from_slots(slots, robot_plan_id)
    mapped_dir = repo_root / "records" / "robot-artifact" / "integra_assist" / "mapped"
    mapped_dir.mkdir(parents=True, exist_ok=True)
    mapped_path = mapped_dir / f"{robot_plan_id}.assistconfig.xml"
    program.save_program(mapped_path)

    rel_path = str(mapped_path.relative_to(repo_root)).replace("\\", "/")

    return {
        "final_status": "completed",
        "logs": [
            {
                "message": f"Mapped {xml_uri} to pyalab deck and generated AssistConfig",
                "level": "info",
                "code": "PYALAB_DECK_MAPPED",
                "data": {
                    "sourceArtifact": xml_uri,
                    "mappedArtifact": rel_path,
                    "robotPlanId": robot_plan_id,
                    "executionRunId": execution_run_id,
                    "slotsMapped": len(slots),
                },
                "timestamp": _iso_now(),
            }
        ],
        "artifacts": [
            {
                "role": "integra_assist_config",
                "uri": rel_path,
                "mimeType": "application/xml",
            }
        ],
        "external": {"runId": f"pyalab-{execution_run_id}", "rawStatus": "completed"},
    }
