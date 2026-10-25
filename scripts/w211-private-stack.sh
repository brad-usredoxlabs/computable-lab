#!/usr/bin/env bash
# W211-MACH-1 coder self-verification stack (SEAM A proof).
#
# WHY THIS EXISTS: the lane stack (:3093/:5193) is ORCH-OWNED and must never be
# restarted by the coder, and its ai profile is not (yet) repointed at the golden
# replay producer. To prove the golden leg GREEN at tip — and to prove the SEAM A
# config diff actually rewires the producer at its wire boundary — this script
# starts a PRIVATE, coder-owned stack on its own free ports with its own data
# dir, using the exact cl-lane-stack.sh mechanics plus the ai.smallModel override
# documented in README-replay-seam.md. It NEVER signals :3093/:5193/:3001/:5174
# and never kills any process it did not start.
#
#   usage: scripts/w211-private-stack.sh start|stop|status
#
# Ports (all verified free at dispatch): backend 3193, frontend 5293, replay 43117.
set -uo pipefail

WT="$(cd "$(dirname "$0")/.." && pwd)"
RUN="$WT/.run/w211"
BPORT=3193
FPORT=5293
RPORT=43117
DATA_DIR=/home/brad/.computable-lab-lane2-w211
LANE_CONFIG_SRC=/home/brad/.hermes/cl/lanes/2/lane2-config.yaml
CFG="$RUN/config.yaml"
REPLAY_LOG="$RUN/replay-requests.jsonl"

NODE_BIN=/home/brad/.local/share/mise/installs/node/26.8.1/bin
export PATH="$NODE_BIN:/home/brad/.local/bin:/usr/local/bin:/usr/bin:/bin"

_pid_alive() { [[ -n "${1:-}" ]] && kill -0 "$1" 2>/dev/null; }
_kill_pidfile() {
  local f="$1"
  if [[ -f "$f" ]]; then
    local p; p="$(cat "$f" 2>/dev/null || true)"
    if _pid_alive "$p"; then kill "$p" 2>/dev/null || true; sleep 1; _pid_alive "$p" && kill -9 "$p" 2>/dev/null || true; fi
    rm -f "$f"
  fi
}
# Only OUR ports (3193/5293/43117) — never a pattern that could reach a product stack.
_kill_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    for p in $(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true); do _pid_alive "$p" && kill -9 "$p" 2>/dev/null || true; done
  fi
}

write_config() {
  mkdir -p "$RUN"
  # Secret-bearing copy: mode 600, under .run/ (gitignored), NEVER committed.
  # (node + the repo's own `yaml` package: pyyaml is not system-installed.)
  WT="$WT" CFG="$CFG" LANE_CONFIG_SRC="$LANE_CONFIG_SRC" DATA_DIR="$DATA_DIR" RPORT="$RPORT" \
  node --input-type=module -e '
    import { readFileSync, writeFileSync } from "node:fs"
    import { parse, stringify } from "yaml"
    const cfg = parse(readFileSync(process.env.LANE_CONFIG_SRC, "utf8"))
    cfg.server.dataDir = process.env.DATA_DIR
    // Private embedded-git repo: drop the remote git block so the store stays
    // local (validateRepositoryConfig: a non-empty git.url flips mode to remote-git).
    for (const repo of cfg.repositories ?? []) {
      delete repo.git
      repo.mode = "embedded-git"
    }
    // SEAM A (the exact diff README-replay-seam.md asks the orchestrator to apply
    // to the lane profile): the declared smallModel key wins with its own
    // endpoint (IntentCompileFromPromptHandlers.ts:113-121), so the compile-path
    // producer call lands on the harness replay server while every other profile
    // stays put.
    cfg.ai = cfg.ai ?? {}
    cfg.ai.smallModel = {
      baseUrl: `http://127.0.0.1:${process.env.RPORT}/v1`,
      model: "w211-golden-replay",
    }
    writeFileSync(process.env.CFG, stringify(cfg))
  '
  chmod 600 "$CFG"
  mkdir -p "$DATA_DIR"
}

start() {
  write_config
  : > "$REPLAY_LOG"
  # setsid detaches the children from this script's process group so a caller
  # (or a timed-out foreground wrapper) cannot cascade-kill them; they are
  # stopped only via stop() / our own pidfiles.
  ( cd "$WT" && W211_REPLAY_PORT="$RPORT" W211_REPLAY_LOG="$REPLAY_LOG" \
      setsid nohup node app/e2e/fixtures/w211-golden/replay-producer.mjs > "$RUN/replay.log" 2>&1 9>&- & echo $! > "$RUN/replay.pid" )
  ( cd "$WT/server" && APP_BASE_PATH=.. PORT="$BPORT" HOST=127.0.0.1 \
      CL_DATA_DIR="$DATA_DIR" CONFIG_PATH="$CFG" \
      CLA_CORPUS_LOCAL_PATH="$DATA_DIR/corpus/pairs.w211.jsonl" \
      setsid nohup npx tsx src/server.ts > "$RUN/backend.log" 2>&1 9>&- & echo $! > "$RUN/backend.pid" )
  ( cd "$WT/app" && VITE_API_PROXY="http://localhost:$BPORT" VITE_CACHE_DIR="$RUN/vite-cache" \
      setsid nohup npx vite --host 127.0.0.1 --port "$FPORT" > "$RUN/frontend.log" 2>&1 9>&- & echo $! > "$RUN/frontend.pid" )
  echo "w211 private stack starting: replay :$RPORT, backend :$BPORT, frontend :$FPORT (data $DATA_DIR)"
  for i in $(seq 1 90); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$BPORT/api/schemas" 2>/dev/null || echo 000)"
    [[ "$code" == "200" ]] && { echo "w211 private backend READY (http $code) after ${i}s"; return 0; }
    sleep 1
  done
  echo "w211 private backend did NOT become ready in 90s — see $RUN/backend.log" >&2
  return 1
}

stop() {
  _kill_pidfile "$RUN/frontend.pid"
  _kill_pidfile "$RUN/backend.pid"
  _kill_pidfile "$RUN/replay.pid"
  _kill_port "$BPORT"; _kill_port "$FPORT"; _kill_port "$RPORT"
  echo "w211 private stack stopped (ports $BPORT/$FPORT/$RPORT)"
}

status() {
  printf 'replay  :%s http=%s\n' "$RPORT" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$RPORT/replay-health" 2>/dev/null || echo 000)"
  printf 'backend :%s http=%s\n' "$BPORT" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$BPORT/api/schemas" 2>/dev/null || echo 000)"
  printf 'frontend:%s http=%s\n' "$FPORT" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$FPORT/" 2>/dev/null || echo 000)"
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  *) echo "usage: $0 start|stop|status" >&2; exit 2 ;;
esac
