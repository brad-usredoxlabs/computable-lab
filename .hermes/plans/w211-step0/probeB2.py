import json, urllib.request, urllib.error, sys
sys.path.insert(0, "/mnt/vast/home/brad/git/cl-integration-2/node_modules")
import yaml

fx = yaml.safe_load(open("/mnt/vast/home/brad/git/wt/W211-MACH-1-lane2-l2t1210/app/e2e/fixtures/w211-golden/zymo-intent.frozen.yaml"))

def post(body):
    req = urllib.request.Request("http://localhost:3093/api/intent/compile-from-prompt",
        data=json.dumps(body).encode(), headers={"content-type": "application/json", "x-user-id": "USR-BRAD"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return {"status": r.status, "body": json.loads(r.read().decode())}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "body": json.loads(e.read().decode())}

def show(tag, out):
    b = out["body"]
    print(f"== {tag}: status {out['status']} keys {sorted(b.keys())}")
    for c in b.get("clarifications", []):
        al = c.get("actionLocation") or {}
        cands = [(cd.get("label"), cd.get("confidence")) for cd in (c.get("candidates") or [])][:4]
        print("   -", c.get("reason"), "|", repr(c.get("label"))[:55], "| arg:", al.get("argument"), "| cands:", cands)
    ta = b.get("terminalArtifacts") or {}
    if ta:
        print("   terminalArtifacts keys:", sorted(ta.keys()))
        print("   labwareAdditions:", json.dumps(ta.get("labwareAdditions"))[:300])
        print("   resolvedLabwares:", json.dumps(ta.get("resolvedLabwares"))[:400])

# Leg 1: answered draw with a placeholder axis answer (any non-empty answers triggers the compile leg).
out1 = post({"protocolText": fx["protocolText"], "answers": {"w211-probe-axis": "probe-answer"}})
show("answered-draw", out1)
open("/mnt/vast/home/brad/git/wt/W211-MACH-1-lane2-l2t1210/.hermes/plans/w211-step0/probeB-answered.json", "w").write(json.dumps(out1, indent=1))
