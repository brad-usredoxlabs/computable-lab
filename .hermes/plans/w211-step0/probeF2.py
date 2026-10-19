import json, urllib.request, urllib.error
import yaml

macro = {
  "intentId": "w211-probe-f2-completing",
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
req = urllib.request.Request("http://localhost:3093/api/intent/compile",
    data=json.dumps({"intent": yaml.dump(macro, sort_keys=False)}).encode(),
    headers={"content-type": "application/json", "x-user-id": "USR-BRAD"})
try:
    with urllib.request.urlopen(req, timeout=300) as r:
        out = {"status": r.status, "body": json.loads(r.read().decode())}
except urllib.error.HTTPError as e:
    out = {"status": e.code, "body": json.loads(e.read().decode())}
b = out["body"]
print("status:", out["status"], "outcome:", b.get("outcome"))
print("clarifications:", json.dumps(b.get("clarifications"))[:400])
ta = b.get("terminalArtifacts") or {}
print("terminalArtifacts keys:", sorted(ta.keys()))
for k in sorted(ta.keys()):
    v = ta[k]
    if isinstance(v, list) and k != "events":
        print(f"{k} ({len(v)}):", json.dumps(v)[:700])
print("events:", len(ta.get("events") or []))
open("/mnt/vast/home/brad/git/wt/W211-MACH-1-lane2-l2t1210/.hermes/plans/w211-step0/probeF2-completing.json", "w").write(json.dumps(out, indent=1))
