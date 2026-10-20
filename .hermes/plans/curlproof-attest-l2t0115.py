#!/usr/bin/env python3
"""AS-ATTEST-CURL-PROOF-DEFERRED cleared: the restarted lane-2 backend (:3093)
loaded schema/lab/attestation.schema.yaml AND schema/lab/attestation.lint.yaml."""
import json, urllib.request

BASE = "http://localhost:3093"
SID = "https://computable-lab.com/schema/computable-lab/attestation.schema.yaml"

def post(path, payload):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode(),
                                 headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())

def claim(status):
    return {"claimStatus": status,
            "assertion": {"verb": "received",
                          "about": {"kind": "record", "id": "ENT-1", "label": "entity"}},
            "occurredAtStatus": "unknown"}

def env(status="completed"):
    return {"kind": "attestation", "recordId": "ATT-curlproof1",
            "artifactKind": "attestation-chain", "claims": [claim(status)]}

# 1. schema proof (validate endpoint)
r = post("/api/validate", {"schemaId": SID, "payload": env()})
print("1 VALID envelope    -> valid =", r["valid"])
assert r["valid"] is True, r["errors"]

r = post("/api/validate", {"schemaId": SID, "payload": env("definitely-happened")})
print("2 bogus claimStatus -> valid =", r["valid"], "|", r["errors"][0]["message"][:60])
assert r["valid"] is False

# 2. lint proof (lint endpoint dispatches by payload.kind -> attestation.lint.yaml)
#    'proposed' on an attestation-chain is schema-LEGAL; only the loaded LINT spec rejects it.
r = post("/api/lint", {"payload": env("proposed")})
viols = [v for v in r.get("violations", []) if "proposed" in json.dumps(v).lower()
         or "chain" in json.dumps(v).lower()]
print("3 chain+proposed    -> lint violations =", len(viols))
for v in viols[:3]:
    print("   ", v)
