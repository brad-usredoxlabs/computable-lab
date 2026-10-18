import json, urllib.request, urllib.error

def http(method, path, body=None, ctype=True):
    headers = {"x-user-id": "USR-BRAD"}
    if body is not None and ctype:
        headers["content-type"] = "application/json"
    req = urllib.request.Request(f"http://localhost:3093/api{path}", method=method,
        data=json.dumps(body).encode() if body is not None else (b"{}" if ctype and method in ("DELETE",) else None),
        headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read().decode()
            try: return {"status": r.status, "body": json.loads(raw)}
            except Exception: return {"status": r.status, "body": raw[:300]}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "body": e.read().decode()[:300]}

env = http("GET", "/records/MAT-magbinding-beads-v211g1-vizl")
meta = (env["body"].get("record") or {}).get("meta") or {}
sha = meta.get("contentSha") or meta.get("commitSha")
d = http("DELETE", f"/records/MAT-magbinding-beads-v211g1-vizl?expectedSha={sha}", body={})
print("delete ->", d["status"], json.dumps(d["body"])[:200])
q = http("GET", "/records?kind=material&limit=300")
names = [(r.get("payload") or {}).get("name") for r in q["body"].get("records", [])]
print("v211g1 present?", any(n and "v211g1" in n for n in names))
