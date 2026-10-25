import json, urllib.request, urllib.error, sys
sys.path.insert(0, "/mnt/vast/home/brad/git/cl-integration-2/node_modules")
import yaml

fx = yaml.safe_load(open("/mnt/vast/home/brad/git/wt/W211-MACH-1-lane2-l2t1210/app/e2e/fixtures/w211-golden/zymo-intent.frozen.yaml"))
mo = fx["modelOutput"]

# Deterministic route: compile the FROZEN macro directly (no model draw) — this is
# exactly what the replay producer will feed the product compile.
intent_yaml = yaml.dump(mo, sort_keys=False)
req = urllib.request.Request("http://localhost:3093/api/intent/compile",
    data=json.dumps({"intent": intent_yaml}).encode(),
    headers={"content-type": "application/json", "x-user-id": "USR-BRAD"})
try:
    with urllib.request.urlopen(req, timeout=300) as r:
        out = {"status": r.status, "body": json.loads(r.read().decode())}
except urllib.error.HTTPError as e:
    out = {"status": e.code, "body": json.loads(e.read().decode())}
b = out["body"]
print("status:", out["status"], "keys:", sorted(b.keys()))
print("outcome:", b.get("outcome"))
for c in b.get("clarifications", []) or []:
    al = c.get("actionLocation") or {}
    cands = [(cd.get("label"), cd.get("confidence")) for cd in (c.get("candidates") or [])][:4]
    print("   -", str(c.get("reason"))[:75], "|", repr(c.get("label"))[:55], "| arg:", al.get("argument"), "| cands:", cands)
ta = b.get("terminalArtifacts") or {}
print("terminalArtifacts keys:", sorted(ta.keys()))
print("labwareAdditions:", json.dumps(ta.get("labwareAdditions"))[:500])
print("resolvedLabwares:", json.dumps(ta.get("resolvedLabwares"))[:700])
print("gaps:", json.dumps(ta.get("gaps"))[:400])
open("/mnt/vast/home/brad/git/wt/W211-MACH-1-lane2-l2t1210/.hermes/plans/w211-step0/probeE-frozen-compile.json", "w").write(json.dumps(out, indent=1))
