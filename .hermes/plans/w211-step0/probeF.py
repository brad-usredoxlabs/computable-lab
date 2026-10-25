import json, urllib.request, urllib.error, sys
sys.path.insert(0, "/mnt/vast/home/brad/git/cl-integration-2/node_modules")
import yaml

# Cleanup: delete the mint residue from probeD so the fixture nonce stays fresh.
def http(method, path, body=None):
    req = urllib.request.Request(f"http://localhost:3093/api{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"content-type": "application/json", "x-user-id": "USR-BRAD"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read().decode()
            try: return {"status": r.status, "body": json.loads(raw)}
            except Exception: return {"status": r.status, "body": raw[:200]}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "body": e.read().decode()[:200]}

d = http("DELETE", "/records/MAT-magbinding-beads-v211g1-vizl")
print("cleanup mint residue ->", d["status"])

# probeF: completing compile (all nouns resolvable) — what deck arms populate?
macro = {
  "intentId": "w211-probe-f-completing",
  "actions": [
    {"action": "transfer", "source": "Sample Plate", "target": "Lysis Plate", "volumeUl": 50},
    {"action": "add_material", "target": "Lysis Plate", "material": "Lysis Solution", "volumeUl": 700},
    {"action": "bead_beat", "labware": "Bead Beating Plate A", "duration": "30 s"},
    {"action": "spin", "labware": "Lysis Plate", "rpm": 3000, "duration": "10 min"},
    {"action": "transfer", "source": "Lysis Plate", "target": "MagBinding Plate", "volumeUl": 500},
    {"action": "add_material", "target": "MagBinding Plate", "material": "MagBinding Beads", "volumeUl": 500},
    {"action": "add_material", "target": "MagBinding Plate", "material": "MagBinding Buffer", "volumeUl": 800},
    {"action": "wash", "labware": "MagBinding Plate", "cycles": 1},
    {"action": "elute", "source": "MagBinding Plate", "target": "Sample Plate", "material": "nuclease-free water", "volumeUl": 100},
    {"action": "incubate", "labware": "Sample Plate", "duration": "30 min", "temperatureC": 37},
    {"action": "read", "labware": "Sample Plate", "mode": "absorbance", "wavelength": "600 nm"},
  ],
}
out = http("POST", "/intent/compile", {"intent": yaml.dump(macro, sort_keys=False)})
b = out["body"]
print("probeF status:", out["status"], "outcome:", b.get("outcome"))
print("clarifications:", json.dumps(b.get("clarifications"))[:300])
ta = b.get("terminalArtifacts") or {}
print("terminalArtifacts keys:", sorted(ta.keys()))
for k in ("resolvedLabwares", "labwareAdditions", "labwareRequirements", "deck", "deckLayout", "resources"):
    if k in ta:
        print(f"{k}: {json.dumps(ta[k])[:600]}")
print("events:", len(ta.get("events") or []))
open("/mnt/vast/home/brad/git/wt/W211-MACH-1-lane2-l2t1210/.hermes/plans/w211-step0/probeF-completing.json", "w").write(json.dumps(out, indent=1))
