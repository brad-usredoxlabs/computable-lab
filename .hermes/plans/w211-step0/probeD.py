import json, urllib.request, urllib.error, sys
sys.path.insert(0, "/mnt/vast/home/brad/git/cl-integration-2/node_modules")
import yaml

fx = yaml.safe_load(open("/mnt/vast/home/brad/git/wt/W211-MACH-1-lane2-l2t1210/app/e2e/fixtures/w211-golden/zymo-intent.frozen.yaml"))

def post(path, body, headers=None):
    req = urllib.request.Request(f"http://localhost:3093/api{path}",
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json", "x-user-id": "USR-BRAD", **(headers or {})})
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
        print("   -", str(c.get("reason"))[:70], "|", repr(c.get("label"))[:55], "| arg:", al.get("argument"), "| cands:", cands)
    ta = b.get("terminalArtifacts") or {}
    if ta:
        print("   terminalArtifacts keys:", sorted(ta.keys()))
        print("   labwareAdditions:", json.dumps(ta.get("labwareAdditions"))[:400])
        print("   resolvedLabwares:", json.dumps(ta.get("resolvedLabwares"))[:600])
        print("   gaps:", json.dumps(ta.get("gaps"))[:300])

# Full cycle: (b) pick idiom + (c) mint via the product's own mint route (the same
# POST /vocab/mint {refKind:'material'} ClarificationPicker's resolveMention fires),
# then re-send with the minted idiom answer.
answers = {
    "w211-probe-axis": "probe-answer",
    "Bead Beating Plate": "[[labware:LAB-w211-golden-beadplate-a|Bead Beating Plate A]]",
}
out1 = post("/intent/compile-from-prompt", {"protocolText": fx["protocolText"], "answers": answers})
show("cycle1 (b answered)", out1)
open("/mnt/vast/home/brad/git/wt/W211-MACH-1-lane2-l2t1210/.hermes/plans/w211-step0/probeD-cycle1.json", "w").write(json.dumps(out1, indent=1))

labels = [c.get("label") for c in out1["body"].get("clarifications", []) if c.get("reason") == "unknown-noun"]
minted = {}
for label in labels:
    m = post("/vocab/mint", {"refKind": "material", "label": label})
    print("mint", repr(label), "->", m["status"], json.dumps(m["body"])[:200])
    if m["status"] in (200, 201):
        minted[label] = m["body"].get("recordId") or m["body"].get("record", {}).get("recordId")
    elif m["status"] == 422 and "Record already exists" in str(m["body"].get("message", "")):
        # idempotent dedupe: GET the existing record id back
        q = post("/records?kind=material&limit=300", {})
        for r in q["body"].get("records", []):
            if (r.get("payload") or {}).get("name") == label:
                minted[label] = r["recordId"]
for label, rid in minted.items():
    answers[label] = f"[[material:{rid}|{label}]]"
print("minted:", json.dumps(minted))

out2 = post("/intent/compile-from-prompt", {"protocolText": fx["protocolText"], "answers": answers})
show("cycle2 (all answered)", out2)
open("/mnt/vast/home/brad/git/wt/W211-MACH-1-lane2-l2t1210/.hermes/plans/w211-step0/probeD-cycle2.json", "w").write(json.dumps(out2, indent=1))
