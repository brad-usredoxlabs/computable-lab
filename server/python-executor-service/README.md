# python-executor-service

Reference execution data-plane for `computable-lab` execution tasks.

This service is intentionally swappable. It only speaks the `execution-task` API contract and does not write semantic records directly.

## Features

- Claims tasks from `computable-lab`.
- Executes via adapter-specific runners.
- Sends heartbeat/log/status/complete updates with monotonic sequence IDs.
- Includes `integra_assist` reference runner.
- Supports one-shot mode for CI smoke testing.

## Configuration

Environment variables:

- `CL_API_BASE_URL` (default: `http://localhost:3001/api`)
- `CL_EXECUTOR_ID` (default: `pyexec-01`)
- `CL_EXECUTOR_TOKEN` (required when CL enforces executor auth)
- `CL_EXECUTOR_CAPABILITIES` (comma list, default: `integra_assist`)
- `CL_EXECUTOR_MAX_TASKS` (default: `1`)
- `CL_EXECUTOR_LEASE_MS` (default: `60000`)
- `CL_EXECUTOR_POLL_INTERVAL_MS` (default: `2000`)
- `CL_EXECUTOR_ONCE` (`1` runs one cycle then exits)
- `INTEGRA_ASSIST_SIMULATE` (`1` use deterministic local simulation)
- `INTEGRA_ASSIST_SIM_MS` (default: `300`)
- `INTEGRA_ASSIST_BACKEND` (`simulate` or `pylabrobot`, default `simulate`)
- `PYLABROBOT_REPO_PATH` (optional local repo path added to `sys.path`)
- `INTEGRA_ASSIST_PYLABROBOT_COMMAND` (optional command; receives task JSON on stdin, returns JSON on stdout)
- `INTEGRA_ASSIST_PYLABROBOT_HOOK` (optional `module:function` hook; returns dict payload)
- `INTEGRA_ASSIST_PYLABROBOT_TIMEOUT_S` (default: `120`)
- `CL_REPO_ROOT` (path containing `records/`; default resolves to sibling `computable-lab` repo root)
- `PYALAB_REPO_PATH` (optional `pyalab/src` path)
- `INTEGRA_ASSIST_PYALAB_DECK_NAME` (default: `3 Position Universal Deck`)
- `INTEGRA_ASSIST_PYALAB_PIPETTE_NAME` (default: `VOYAGER EIGHT 125 µl`)
- `INTEGRA_ASSIST_PYALAB_TIP_NAME` (default: `50 125 µl GripTip Non-sterile`)
- `INTEGRA_ASSIST_PYALAB_SLOT_MAP_JSON` (JSON map, e.g. `{\"slot_1\":\"A\",\"slot_2\":\"B\",\"slot_3\":\"C\"}`)
- `INTEGRA_ASSIST_PYALAB_SLOT_LAYOUT_JSON` (JSON map for concrete labware by section)
- `INTEGRA_ASSIST_PYALAB_ROLE_MAP_JSON` (JSON map for fallback role->labware)

## Run

```bash
python -m python_executor_service.main
```

One-shot CI mode:

```bash
CL_EXECUTOR_ONCE=1 python -m python_executor_service.main
```

Example pylabrobot hook mode:

```bash
INTEGRA_ASSIST_BACKEND=pylabrobot \
INTEGRA_ASSIST_SIMULATE=0 \
INTEGRA_ASSIST_PYLABROBOT_HOOK=python_executor_service.pyalab_integra_hook:run_task \
python -m python_executor_service.main
```

By default, when `INTEGRA_ASSIST_BACKEND=pylabrobot` and no hook/command is set, the service uses `python_executor_service.pyalab_integra_hook:run_task`.

Example concrete deck mapping:

```bash
export INTEGRA_ASSIST_PYALAB_SLOT_LAYOUT_JSON='{
  "A": {"labware": "NUNC 96 Well F-Bottom Clear Plate 300 µl"},
  "B": {"labware": "INTEGRA 10 ml Multichannel Reservoir"},
  "C": {"labware": "NUNC 96 Well F-Bottom Clear Plate 300 µl"}
}'
export INTEGRA_ASSIST_PYALAB_ROLE_MAP_JSON='{
  "source": "NUNC 96 Well F-Bottom Clear Plate 300 µl",
  "destination": "NUNC 96 Well F-Bottom Clear Plate 300 µl",
  "reservoir": "INTEGRA 10 ml Multichannel Reservoir"
}'
```

## Test

```bash
python -m unittest discover -s tests -v
```
