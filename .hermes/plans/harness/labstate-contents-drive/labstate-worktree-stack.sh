#!/usr/bin/env bash
# L2-LABSTATE-CONTENTS-1 — drive my WORKTREE backend on :3093 (lane-local).
#
# WHY NOT cl-lane-stack.sh: that script hardcodes WT=cl-integration-2 (trunk)
# and my 4 LABSTATE commits are NOT in trunk (verified merge-base). The task
# forbids touching trunk, and the drive must exercise MY fold + MY YAML.
# So I boot MY worktree's server on the lane-2 backend port (3093, currently
# free) with the lane-2 config, the exact boot env cl-lane-stack.sh uses,
# plus LABSTATE_ARM_LOG=1 (the spec §11 per-turn committed-ledger arm-log).
#
# This NEVER touches :3001/:5174 (Brad's stack) or the other lane ports.
# It signals only its own pidfile + :3093.

set -uo pipefail
WT=/mnt/vast/home/brad/git/wt/L2-LABSTATE-CONTENTS-1-lane2-l2t2255
BPORT=3093
LANE_CONFIG=/home/brad/.hermes/cl/lanes/2/lane2-config.yaml
RUN="$WT/.run"
mkdir -p "$RUN"
NODE_BIN=/home/brad/.local/share/mise/installs/node/26.8.1/bin
export PATH="$NODE_BIN:/home/brad/.local/bin:/usr/local/bin:/usr/bin:/bin"

_pid_alive() { [[ -n "${1:-}" ]] && kill -0 "$1" 2>/dev/null; }

# Kill only our own backend (pidfile + :3093 listener).
stop() {
  local f="$RUN/backend.pid"
  if [[ -f "$f" ]]; then
    local p; p="$(cat "$f" 2>/dev/null || true)"
    if _pid_alive "$p"; then kill "$p" 2>/dev/null || true; sleep 1; _pid_alive "$p" && kill -9 "$p" 2>/dev/null || true; fi
    rm -f "$f"
  fi
  if command -v lsof >/dev/null 2>&1; then
    local pids; pids="$(lsof -ti tcp:"$BPORT" -sTCP:LISTEN 2>/dev/null || true)"
    for p in $pids; do _pid_alive "$p" && kill -9 "$p" 2>/dev/null || true; done
  fi
  echo "worktree-labstate backend stopped (port $BPORT)"
}

start() {
  [[ -f "$LANE_CONFIG" ]] || { echo "lane2 config missing: $LANE_CONFIG" >&2; exit 1; }
  ( cd "$WT/server" && APP_BASE_PATH=.. PORT="$BPORT" HOST=0.0.0.0 \
      CL_DATA_DIR="/home/brad/.computable-lab-lane2" \
      CONFIG_PATH="$LANE_CONFIG" \
      CLA_CORPUS_LOCAL_PATH="/home/brad/.computable-lab-lane2/corpus/pairs.lane2.jsonl" \
      LABSTATE_ARM_LOG=1 \
      nohup npx tsx --watch src/server.ts > "$RUN/backend.log" 2>&1 9>&- & echo $! > "$RUN/backend.pid" )
  echo "worktree-labstate backend starting: :$BPORT (pid $(cat "$RUN/backend.pid"))"
  for i in $(seq 1 90); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$BPORT/api/health" 2>/dev/null || echo 000)"
    [[ "$code" == "200" ]] && { echo "backend READY (health $code) after ${i}s"; return 0; }
    sleep 1
  done
  echo "backend did NOT become ready in 90s — see $RUN/backend.log" >&2
  return 1
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  restart) stop; sleep 1; start ;;
  status) code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$BPORT/api/health" 2>/dev/null || echo 000)"; printf 'worktree-labstate :%s http=%s\n' "$BPORT" "$code" ;;
  *) echo "usage: $0 start|stop|restart|status" >&2; exit 2 ;;
esac
