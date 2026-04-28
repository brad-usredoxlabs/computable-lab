#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/server"
FRONTEND_DIR="$ROOT_DIR/app"
RUNTIME_DIR="$ROOT_DIR/.run"

BACKEND_PORT="${BACKEND_PORT:-3001}"
FRONTEND_PORT="${FRONTEND_PORT:-5174}"

mkdir -p "$RUNTIME_DIR"

kill_pid_if_running() {
  local pid="$1"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -9 "$pid" 2>/dev/null || true
  fi
}

kill_from_pid_file() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    kill_pid_if_running "$pid"
    rm -f "$pid_file"
  fi
}

kill_by_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      while IFS= read -r pid; do
        [[ -n "$pid" ]] && kill_pid_if_running "$pid"
      done <<< "$pids"
    fi
  fi
}

kill_by_pattern() {
  local pattern="$1"
  local pids
  pids="$(pgrep -f "$pattern" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    while IFS= read -r pid; do
      [[ -n "$pid" ]] && kill_pid_if_running "$pid"
    done <<< "$pids"
  fi
}

# Stop previously launched processes.
kill_from_pid_file "$RUNTIME_DIR/backend.pid"
kill_from_pid_file "$RUNTIME_DIR/frontend.pid"

# Stop by known commands (covers runs started outside this script).
kill_by_pattern "$BACKEND_DIR.*src/server.ts"
kill_by_pattern "$BACKEND_DIR.*dist/server.js"
kill_by_pattern "$FRONTEND_DIR.*vite"

# Also catch stray tsx --watch / node server processes started from any cwd
# (e.g. `npm run dev -w server` in a random terminal leaves these running).
kill_by_pattern "tsx.*src/server\.ts"
kill_by_pattern "node.*dist/server\.js"

# Stop whatever still holds expected ports.
kill_by_port "$BACKEND_PORT"
kill_by_port "$FRONTEND_PORT"

# Give the OS a moment to release file handles before removing locks.
sleep 1

# Remove stale git locks in the workspace cache. Concurrent server instances
# (or a crashed write) can leave these behind and block every subsequent write.
WORKSPACE_ROOT="${CL_WORKSPACE_ROOT:-/tmp/cl-workspaces}"
if [[ -d "$WORKSPACE_ROOT" ]]; then
  find "$WORKSPACE_ROOT" -type f \( -name 'index.lock' -o -name 'HEAD.lock' -o -name 'packed-refs.lock' -o -name 'config.lock' \) -print -delete 2>/dev/null || true
fi

# Start backend (APP_BASE_PATH points to monorepo root so schema/ and records/ resolve).
(
  cd "$BACKEND_DIR"
  APP_BASE_PATH="$ROOT_DIR" nohup npm run dev > "$RUNTIME_DIR/backend.log" 2>&1 &
  echo $! > "$RUNTIME_DIR/backend.pid"
)

# Start frontend.
(
  cd "$FRONTEND_DIR"
  nohup npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" > "$RUNTIME_DIR/frontend.log" 2>&1 &
  echo $! > "$RUNTIME_DIR/frontend.pid"
)

BACKEND_PID="$(cat "$RUNTIME_DIR/backend.pid")"
FRONTEND_PID="$(cat "$RUNTIME_DIR/frontend.pid")"

sleep 1

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "Backend failed to start. See $RUNTIME_DIR/backend.log"
  exit 1
fi

if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
  echo "Frontend failed to start. See $RUNTIME_DIR/frontend.log"
  exit 1
fi

echo "Backend started (PID $BACKEND_PID) on http://localhost:$BACKEND_PORT"
echo "Frontend started (PID $FRONTEND_PID) on http://localhost:$FRONTEND_PORT"
echo "Logs:"
echo "  $RUNTIME_DIR/backend.log"
echo "  $RUNTIME_DIR/frontend.log"
