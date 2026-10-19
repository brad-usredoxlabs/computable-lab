import json, urllib.request, urllib.error

API = "http://localhost:3193/api"
HDRS = {"content-type": "application/json", "x-user-id": "USR-LOCAL-ADMIN"}

def http(method, path, body=None):
    req = urllib.request.Request(API + path, method=method,
        data=(json.dumps(body).encode() if body is not None else None), headers=HDRS)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: return e.code, json.loads(raw)
        except Exception: return e.code, {"raw": raw[:400]}

import subprocess
fx = json.loads(subprocess.run(["node", "--input-type=module", "-e",
  "import {parse} from 'yaml'; import {readFileSync} from 'fs';"
  "process.stdout.write(JSON.stringify(parse(readFileSync('app/e2e/fixtures/w211-golden/zymo-intent.frozen.yaml','utf8'))))"],
  capture_output=True, text=True, cwd="/mnt/vast/home/brad/git/wt/W211-MACH-1-lane2-l2t1210").stdout)

# Seed the golden rows GET-first (idempotent).
for row in fx["seedPlan"]["seededLabware"]:
    s,_ = http("GET", f"/records/{row['recordId']}")
    if s != 200:
        s,b = http("POST", "/records", {"schemaId":"https://computable-lab.com/schema/computable-lab/labware.schema.yaml",
            "payload":{"kind":"labware","recordId":row["recordId"],"name":row["name"],"labwareType":"plate","aliases":[row["name"].lower().replace(' ','_'), row["name"].lower()]},
            "message":"W211-MACH-1 golden harness: seed row"})
        print("seed", row["recordId"], s)
for row in fx["seedPlan"]["seededMaterials"]:
    s,_ = http("GET", f"/records/{row['recordId']}")
    if s != 200:
        payload = {"kind":"material","id":row["recordId"],"domain":"reagent","name":row["name"]}
        if row.get("synonyms"): payload["synonyms"]=[s2.strip() for s2 in row["synonyms"].split(",")]
        s,b = http("POST", "/records", {"schemaId":"https://computable-lab.com/schema/computable-lab/material.schema.yaml","payload":payload,"message":"W211-MACH-1 golden harness: seed row"})
        print("seed", row["recordId"], s, json.dumps(b)[:120])

# Zero-match guard for the class-(c) noun.
s, listing = http("GET", "/records?kind=material&limit=500")
names = [ (r.get("payload") or r).get("name") for r in listing.get("records", []) ]
nonce = next(z["noun"] for z in fx["seedPlan"]["zeroMatchNouns"])
print("zero-match guard:", nonce, "present?" , nonce in names)

# TARGETED CHECK 1: fixture protocolText, no answers -> ask arm.
st1, b1 = http("POST", "/intent/compile-from-prompt", {"protocolText": fx["protocolText"]})
print("CHECK1 status:", st1, "keys:", sorted(b1.keys()))

# TARGETED CHECK 2: same body + the class-(b) idiomatic answer (seed id) -> the (b) fact must be GONE.
b_label = fx["plantedFacts"][0]["wire"]["label"]
b_seed = next(r for r in fx["seedPlan"]["seededLabware"] if r["recordId"].endswith("beadplate-a"))
answers = {b_label: f"[[labware:{b_seed['recordId']}|{b_seed['name']}]]"}
st2, b2 = http("POST", "/intent/compile-from-prompt", {"protocolText": fx["protocolText"], "answers": answers})
print("CHECK2 status:", st2, "keys:", sorted(b2.keys()))
for c in (b2.get("clarifications") or []):
    al = c.get("actionLocation") or {}
    print("   fact:", c.get("reason"), "|", repr(c.get("label"))[:60], "| arg:", al.get("argument"))
open("/mnt/vast/home/brad/git/wt/W211-MACH-1-lane2-l2t1210/.hermes/plans/w211-step0/targeted-3193-check2.json","w").write(json.dumps({"status":st2,"body":b2}, indent=1))
