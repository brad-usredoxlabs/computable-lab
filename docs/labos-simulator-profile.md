# LabOS Simulator Profile

This profile enables deterministic local execution for early LabOS integration without live hardware.

## Environment

Set these variables before starting the backend:

```bash
export LABOS_SIMULATE_ASSIST_PLUS=1
export LABOS_SIMULATE_GEMINI=1
export LABOS_EXECUTION_MAX_RUN_MS=14400000
export LABOS_EXECUTION_STALE_UNKNOWN_MS=1800000
export LABOS_RETRY_MAX_ATTEMPTS=3
export LABOS_WORKER_LEASE_TTL_MS=120000
export LABOS_SIDECAR_CONTRACT_STRICT=1
# Optional per-worker overrides:
# export LABOS_POLLER_LEASE_TTL_MS=120000
# export LABOS_RETRY_WORKER_LEASE_TTL_MS=120000
# export LABOS_INCIDENT_WORKER_LEASE_TTL_MS=120000
```

Bridge contract v1:
- INTEGRA responses should use `contractVersion=labos-bridge/v1` with `adapterId=integra_assist`, `operation=submit|status|cancel`, and `result.runId/result.status`.
- Gemini active-read responses should use `contractVersion=labos-bridge/v1` with `adapterId=molecular_devices_gemini`, `operation=active_read`, and `result.rawDataPath`.

Optional sidecar command overrides:

```bash
export LABOS_SIDECAR_INTEGRA_ASSIST_CMD=echo
export LABOS_SIDECAR_INTEGRA_ASSIST_ARGS="AssistPlus sidecar stub"
export LABOS_SIDECAR_GEMINI_CMD=echo
export LABOS_SIDECAR_GEMINI_ARGS='{"rawDataPath":"records/inbox/gemini.csv"}'
```

Bridge mode for real adapters:

```bash
export LABOS_INTEGRA_ASSIST_SUBMIT_URL=http://assist-sidecar:8080/runs
export LABOS_INTEGRA_ASSIST_BASE_URL=http://assist-sidecar:8080
export LABOS_INTEGRA_ASSIST_STATUS_URL_TEMPLATE=http://assist-sidecar:8080/runs/{runId}
export LABOS_INTEGRA_ASSIST_CANCEL_URL_TEMPLATE=http://assist-sidecar:8080/runs/{runId}/cancel
export LABOS_GEMINI_READ_URL=http://gemini-sidecar:8090/read
```

## Deterministic outputs

- Assist Plus simulation writes execution fixtures to:
  - `records/simulator/assist-plus/<ROBOT_PLAN_ID>.json`
- Gemini simulation writes a raw CSV fixture to:
  - `records/inbox/gemini_simulated.csv` (or caller-provided `outputPath`)

## Preflight validation APIs

- Execution parameter schemas:
  - `GET /execution/parameters/schema`
- Execution parameter validation:
  - `POST /execution/parameters/validate`
- Guarded one-shot orchestration:
  - `POST /execution/orchestrate`
- Recovery reconcile cycle:
  - `POST /execution/recovery/reconcile`
- Worker lease status view:
  - `GET /execution/workers/leases`
- Consolidated operations snapshot:
  - `GET /execution/ops/snapshot`
- Failure runbook:
  - `GET /execution/failure-runbook`
- Sidecar contract manifest/self-test:
  - `GET /execution/sidecar/contracts`
  - `GET /execution/sidecar/contracts/diagnostics`
  - `GET /execution/sidecar/contracts/examples`
  - `POST /execution/sidecar/contracts/self-test`
  - `POST /execution/sidecar/contracts/self-test/persist`
  - `POST /execution/sidecar/contracts/validate`
  - `POST /execution/sidecar/contracts/validate-batch`
  - `POST /execution/sidecar/contracts/gate`
- Incident workflows:
  - `GET /execution/incidents`
  - `POST /execution/incidents/scan`
  - `POST /execution/incidents/:id/ack`
  - `POST /execution/incidents/:id/resolve`
  - `GET /execution/incidents/summary`
  - `GET /execution/incidents/worker/status`
  - `POST /execution/incidents/worker/start`
  - `POST /execution/incidents/worker/takeover`
  - `POST /execution/incidents/worker/stop`
  - `POST /execution/incidents/worker/run-once`
- Manual resolution override:
  - `POST /execution-runs/:id/resolve`
- Retry worker controls:
  - `GET /execution/retry-worker/status`
  - `POST /execution/retry-worker/start`
  - `POST /execution/retry-worker/takeover`
  - `POST /execution/retry-worker/stop`
  - `POST /execution/retry-worker/run-once`
  - `POST /execution/poller/takeover`
- Worker state (`execution-worker-state`) now persists for poller, retry, and incident workers and restores on backend restart.
- Worker starts use a lease guard (`leaseOwner`, `leaseExpiresAt`) to avoid duplicate loops across API/MCP processes, with explicit takeover endpoints when operator-forced transfer is required.
- Adapter health check:
  - `GET /execution/health/adapters?probe=true`
- Active-read schemas:
  - `GET /measurements/active-read/schema`
- Active-read validation:
  - `POST /measurements/active-read/validate`

## MCP equivalents

- `execution_parameter_schema`
- `execution_parameter_validate`
- `execution_orchestrate`
- `execution_recovery_reconcile`
- `execution_failure_runbook`
- `execution_incidents_list`
- `execution_incidents_scan`
- `execution_incident_ack`
- `execution_incident_resolve`
- `execution_incidents_summary`
- `execution_incident_worker_status`
- `execution_incident_worker_start`
- `execution_incident_worker_takeover`
- `execution_incident_worker_stop`
- `execution_incident_worker_run_once`
- `execution_retry_worker_status`
- `execution_retry_worker_start`
- `execution_retry_worker_takeover`
- `execution_retry_worker_stop`
- `execution_retry_worker_run_once`
- `execution_worker_leases`
- `execution_ops_snapshot`
- `execution_sidecar_contracts`
- `execution_sidecar_contract_diagnostics`
- `execution_sidecar_contract_examples`
- `execution_sidecar_contract_self_test`
- `execution_sidecar_contract_self_test_persist`
- `execution_sidecar_contract_validate`
- `execution_sidecar_contract_validate_batch`
- `execution_sidecar_contract_gate`
- `execution_poller_takeover`
- `execution_run_resolve`
- `adapter_health_check`
- `measurement_active_read_schema`
- `measurement_active_read_validate`
