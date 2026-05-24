# cl-appliance plate-reader bridge

This document is for developers and AI agents writing code that drives a
real Molecular Devices plate reader through the computable lab appliance
(`cl-appliance`). It describes the HTTP endpoint that bridges
computable-lab's active-read flow to the on-box `plr-instrument-service`,
the request/response contract, and how to configure cla-lab to use it.

For the simulator equivalent (no real hardware), see
[`labos-simulator-profile.md`](./labos-simulator-profile.md).

## What the bridge is

The cl-appliance ships a small FastAPI service called
`plr-instrument-service` that owns the serial connection to the plate
reader and wraps [PyLabRobot](https://github.com/PyLabRobot/pylabrobot).
That service exposes verb-specific endpoints
(`POST /read/fluorescence`, `POST /open`, etc.) whose request shapes
mirror PyLabRobot's API.

cla-lab doesn't speak that shape. Its
`MeasurementActiveControlService.performActiveRead` posts a
*job-shaped* payload (`{adapterId, instrumentRef?, outputPath?,
parameters}`) to a single URL (`$LABOS_GEMINI_READ_URL`) and expects a
`labos-bridge/v1` envelope back.

The bridge endpoint — `POST /labos/gemini/read` — is the translator.

```
cla-lab backend                 plr-instrument-service           plate reader
─────────────────               ─────────────────────────         ────────────
performActiveRead(...)
       │
       │  POST /labos/gemini/read
       │  {adapterId, parameters, outputPath?}
       ▼
                              /labos/gemini/read handler
                                       │
                                       │ PlateReader.read_fluorescence(...)
                                       ▼
                              PyLabRobot Gemini EM backend
                                       │
                                       │ SpectraMax serial protocol
                                       ▼
                                                              Reader fires lamp,
                                                              returns 96 RFU values
                                       ▲
                                       │
                              CSV written to outputPath
                              (gemini_csv format)
       ▲
       │  200 OK
       │  {contractVersion: "labos-bridge/v1",
       │   adapterId, operation, result: {rawDataPath, parserId}}
       │
performActiveRead returns
```

The CSV lands inside cla-lab's records workspace, so the existing
`gemini_csv` parser ingests it the same way it would a simulator
output.

## Configuration in cla-lab

Set one env var when starting `cla-lab-backend` on an appliance:

```bash
LABOS_GEMINI_READ_URL=http://127.0.0.1:8765/labos/gemini/read
```

`8765` is the port `plr-instrument-service` binds to (loopback only).
On the appliance this var is wired into `/etc/cla/cla-lab.env` by the
cl-appliance Ansible role; in dev contexts where you're calling a
remote appliance, point at that host's IP.

No token is needed — the bridge is loopback-only and trusts the local
backend. The `LABOS_GEMINI_API_TOKEN` knob that
`MeasurementActiveControlService` honors is accepted (sent as
`Authorization: Bearer <token>`) but the bridge ignores it today.

Leave `LABOS_SIMULATE_GEMINI` unset (or `0`); otherwise cla-lab takes
the simulator path and the bridge is never called.

## Request contract

```http
POST /labos/gemini/read HTTP/1.1
Content-Type: application/json

{
  "adapterId": "molecular_devices_gemini",
  "outputPath": "records/inbox/measurement_2026-05-24T17-03-00Z.csv",
  "parameters": {
    "mode": "fluorescence",
    "wavelengthNm": 528,
    "excitationWavelengthNm": 485,
    "plateResource": "Cor_96_wellplate_360ul_Fb"
  }
}
```

### Required fields

| Field | Type | Notes |
|---|---|---|
| `adapterId` | `"molecular_devices_gemini"` | Other values get a 400. The bridge currently serves only this one adapter; other Molecular Devices models would mount at a parallel path. |
| `parameters.mode` | `"fluorescence"` | Luminescence and absorbance are accepted by the schema but return **501** today. |
| `parameters.wavelengthNm` | `int` | Emission wavelength for fluorescence. |

### Optional fields

| Field | Type | Default | Notes |
|---|---|---|---|
| `outputPath` | `string` | auto-generated `records/inbox/gemini_<utc-timestamp>.csv` | Relative paths resolve under the records-workspace root (see "Output paths" below). Absolute paths are honored as-is. |
| `parameters.excitationWavelengthNm` | `int` | `wavelengthNm - 43` (typical Stokes shift) | Override to set the excitation explicitly. The fallback is a stub; once cla-lab's compiler emits explicit excitation params, drop the fallback. |
| `parameters.plateResource` | `string` | `"Cor_96_wellplate_360ul_Fb"` | Name of any callable in `pylabrobot.resources` that returns a `Plate`. Not currently driven by cla-lab — pinned 96-well until cla-lab learns to pass plate identity through. |
| `parameters.integrationMs` | `int` | (ignored) | Accepted for forward compatibility with cla-lab's compiler output; the Gemini EM backend in PyLabRobot doesn't expose integration time on the fluorescence path. |
| `parameters.simulate` | `bool` | `false` | If `true`, cla-lab uses its own simulator path BEFORE reaching the bridge; the bridge does not implement its own simulator. |
| `instrumentRef`, `labwareInstanceRef`, `eventGraphRef`, etc. | passthrough | — | Accepted at the top level so cla-lab can include them; the bridge ignores them today but forwards-compatible. |

## Response contract

On success (`200 OK`):

```json
{
  "contractVersion": "labos-bridge/v1",
  "adapterId": "molecular_devices_gemini",
  "operation": "active_read",
  "result": {
    "rawDataPath": "records/inbox/measurement_2026-05-24T17-03-00Z.csv",
    "parserId": "gemini_csv",
    "status": "completed"
  }
}
```

This matches the `geminiActiveReadV1Schema` in cla-lab's
`server/src/execution/sidecar/BridgeContracts.ts` and will pass strict
mode (`LABOS_SIDECAR_CONTRACT_STRICT=1`).

`result.rawDataPath` is the **same path the caller supplied** when an
`outputPath` was given. When `outputPath` was omitted, the bridge
generates a timestamped path and returns it. Either way, cla-lab uses
this value as `rawData.path` on the created `measurement` record.

`result.parserId` is always `"gemini_csv"`. cla-lab honors this over its
adapter-default `defaultParserId` if both are set.

## Output paths

`outputPath` is resolved against the **records-workspace root**, which
the bridge picks up from the env var `CLA_LABOS_OUTPUT_ROOT` (default
`/var/lib/computable-lab/workspaces/main`). On the appliance, this is
the local working clone of the records repo, so the file ends up at
e.g.:

```
/var/lib/computable-lab/workspaces/main/records/inbox/<file>.csv
```

…which cla-lab's git adapter then commits and pushes.

If the parent directory doesn't exist, the bridge creates it.
File and directory ownership are `plr:clalab` mode `0664/02775`
(setgid), so cla-lab (running as `clalab`) has read access for the git
commit + parser.

Absolute paths bypass the root resolution and write wherever you say
they should. Useful in tests; not what cla-lab sends in production.

## CSV format

The bridge writes a `gemini_csv` file matching the
`server/src/measurement/parsers/fixtures/gemini_sample.csv` fixture:

```csv
Well,RFU,Wavelength,Read
A1,1234.5,528,Endpoint
A2,1198.7,528,Endpoint
A3,1212.0,528,Endpoint
...
H12,987.2,528,Endpoint
```

- One row per well.
- `Well` is the standard plate label (A1..H12 for 96-well).
- `RFU` is the raw fluorescence reading.
- `Wavelength` is the emission wavelength used.
- `Read` is `Endpoint` (only mode currently emitted; kinetic / spectrum
  modes are not implemented yet).

Wells where PyLabRobot returned `null` or `NaN` (out-of-range,
saturated, or empty plate) are **omitted** from the CSV. So a real read
on a partially-filled plate yields fewer than 96 rows. The
`gemini_csv` parser should be robust to this — it already is in the
fixture-driven tests.

## End-to-end example

From the appliance (loopback):

```bash
# 1. Make sure the reader is initialized.
curl -sS -X POST http://127.0.0.1:8765/setup
# → {"status":"ready"}

# 2. Trigger an active read via the bridge.
curl -sS -X POST http://127.0.0.1:8765/labos/gemini/read \
  -H "Content-Type: application/json" \
  -d '{
    "adapterId": "molecular_devices_gemini",
    "outputPath": "records/inbox/demo.csv",
    "parameters": {"mode": "fluorescence", "wavelengthNm": 528}
  }'
# → {"contractVersion":"labos-bridge/v1",
#    "adapterId":"molecular_devices_gemini",
#    "operation":"active_read",
#    "result":{"rawDataPath":"records/inbox/demo.csv",
#              "parserId":"gemini_csv","status":"completed"}}

# 3. See the file.
ls -la /var/lib/computable-lab/workspaces/main/records/inbox/demo.csv
head -5 /var/lib/computable-lab/workspaces/main/records/inbox/demo.csv
```

The equivalent cla-lab flow:

1. User (or AI) creates an `InstrumentApplianceJob` artifact targeting
   the Gemini EM with a fluorescence read.
2. User clicks Execute on the AI-suggested job in the chat panel.
3. `useAiChat.executeInstrumentApplianceJob` posts the job to the cla-lab
   backend's `POST /measurements/appliance-jobs/execute`.
4. `MeasurementHandlers` calls `performActiveRead(request)`.
5. With `LABOS_GEMINI_READ_URL` set, the service POSTs to the bridge.
6. The bridge drives the reader, writes the CSV, returns the envelope.
7. cla-lab ingests the CSV via the `gemini_csv` parser and writes a
   `measurement` record.
8. The records repo's next autoPush carries the new measurement (and
   the CSV in `records/inbox/`) to the remote.

## Error responses

| HTTP | Shape | When |
|---|---|---|
| `400` | `{"detail": "<msg>"}` | `adapterId` isn't `molecular_devices_gemini`; `parameters` malformed; `wavelengthNm` missing or non-integer; `plateResource` unknown. |
| `409` | `{"detail": "Instrument not set up; POST /setup first."}` | The reader's serial port hasn't been opened. The bridge does **not** auto-`setup` (so it never blocks on hardware init for a stateless POST); the caller — or operations — must hit `/setup` first. On the appliance, `/setup` is one of the first things to run after the reader is plugged in; subsequent reads share the session. |
| `501` | `{"detail": "mode=<x> not implemented..."}` | Mode is `luminescence` or `absorbance`. Bridge translates these later; today only `fluorescence` lands. |
| `500` | `{"detail": "Could not write CSV at <path>: <err>"}` | Filesystem issue — usually permissions on the records workspace, or `CLA_LABOS_OUTPUT_ROOT` pointing somewhere the service can't reach. See "Permissions" below. |
| `500` | other | PyLabRobot raised — e.g. serial-port timeout, hardware error. Check `plr-instrument-service` journal on the appliance. |

## Permissions and namespace

The bridge writes inside cla-lab's records workspace, which is owned
by the `clalab` user. The `plr` user (which runs the service) must:

1. Be a supplementary member of the `clalab` group. The appliance's
   Ansible role sets this in `/etc/group` AND in the service unit's
   `SupplementaryGroups=` directive (the latter is required — systemd
   replaces, doesn't merge, the user's group list).
2. Have `ReadWritePaths=` covering `/var/lib/computable-lab` in the
   systemd unit (the service runs with `ProtectSystem=strict`).
3. Be able to traverse `workspaces/main/` — the role chmods it to
   `0750` (cla-lab creates it `0700` by default).

If you're running the bridge somewhere other than the appliance, you
need to replicate this setup or override `CLA_LABOS_OUTPUT_ROOT` to a
path the service user controls.

## Verifying the bridge

From cla-lab's perspective, the appliance is reachable when:

```bash
curl -sf http://<host>:8765/health
# → {"ready":true,...,"instrument_model":"spectramax-gemini-em"}
```

`ready: true` means the serial port is open. If the service is up but
`ready: false`, the bridge will return 409 — POST `/setup` first.

To confirm the bridge endpoint exists (without firing a read):

```bash
curl -sS -X POST http://<host>:8765/labos/gemini/read \
  -H "Content-Type: application/json" \
  -d '{"adapterId":"nope"}'
# → 400 {"detail":"Unsupported adapterId 'nope'..."}
```

A 400 from a bad request is good news; it means the route is mounted.
A 404 would mean the service is on an old version without the bridge.

Watch the journal:

```bash
ssh ansible@<appliance> 'sudo journalctl -u plr-instrument-service -f'
```

## What this bridge does NOT do (yet)

- **Luminescence / absorbance modes.** Return 501 today. To add, mirror
  the fluorescence branch with calls to `read_luminescence` /
  (unsupported on the Gemini EM in PyLabRobot for absorbance).
- **Kinetic reads / spectra / wellscans.** Use the underlying
  `plr-instrument-service` endpoints (`/experimental/...`) directly
  until the bridge grows them. cla-lab doesn't emit these today.
- **Partial-plate reads.** The bridge always reads the full plate.
  cla-lab can constrain which wells get analysed downstream, but the
  reader fires on the whole carriage.
- **Plate identity from the event-graph.** The bridge defaults to a
  96-well Corning plate. When cla-lab learns to pass plate identity in
  `parameters.plateResource`, the bridge already accepts it — but
  there's no upstream emitter yet.
- **Async / streamed reads.** The endpoint is synchronous and blocks
  until the read completes (~10–60 s depending on settings). cla-lab's
  60-second sidecar fetch timeout governs the upper bound.

## Source

- Bridge implementation:
  `services/plr-instrument-service/plr_instrument_service/labos_bridge.py`
  in [brad-usredoxlabs/cl-appliance](https://github.com/brad-usredoxlabs/cl-appliance).
- Handler wiring:
  `services/plr-instrument-service/plr_instrument_service/app.py`
  (look for `@app.post("/labos/gemini/read")`).
- Ansible role that installs and configures it: `roles/plr-instrument-service/`
  and `roles/computable-lab/` (for the env-var wiring and the records-
  workspace permissions).
- ADR that picked this shape over a separate sidecar service or an
  upstream cla-lab change: not yet written; tracked in the cl-appliance
  plan that motivated the work.
