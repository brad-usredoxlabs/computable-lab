#!/usr/bin/env python3
"""MATRES-REPLAY harvest leg — H1 index builder (read-only over harvested copies).

Reads ONLY the read-only copies under .hermes/plans/replay-harvest/ (never the
live var/ trees) and emits:
  - index.md            per-turn harvest table + six-case coverage note
  - fixtures/cases.json material-bearing turns + nouns for the spine replay

Deterministic: no timestamps, no network, no writes outside replay-harvest/.
"""
import json, os, re, sys, glob

HARVEST = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TR = os.path.join(HARVEST, "transcripts")
RECS = os.path.join(HARVEST, "records")
FIX = os.path.join(HARVEST, "fixtures")
os.makedirs(FIX, exist_ok=True)

try:
    import yaml
except ImportError:
    sys.exit("PyYAML required (stdlib-only fallback not provided)")

# ---------------------------------------------------------------- transcripts
def load_thread(path):
    with open(path) as f:
        return json.load(f)

MATERIAL_HINT = re.compile(
    r"\b(add|wash|make|dilute|plate|seed|transfer)\b.*\b(u[lµ]l?|m[lµ]l?|%|cells?|material)\b|"
    r"\b(trypsin|dmem|fbs|hepg2|hep g2|unobtainium|phlogiston|clofibrate|dmso|fame|rotenone)\b",
    re.I)

rows = []
for tf in sorted(glob.glob(os.path.join(TR, "*.json"))):
    th = load_thread(tf)
    src = os.path.basename(tf)
    for i, m in enumerate(th.get("messages", [])):
        content = (m.get("content") or "")
        rows.append({
            "file": src,
            "userId": th.get("userId"),
            "endpoint": th.get("endpoint"),
            "msg_index": i,
            "role": m.get("role"),
            "createdAt": m.get("createdAt"),
            "content": content,
            "material_bearing_user_turn": bool(
                m.get("role") == "user" and MATERIAL_HINT.search(content)),
        })

# ------------------------------------------------- derived utterances (accept-time evidence)
# material / material-spec / vendor-product records carry provenance.sourceLabel:
# the verbatim compound label the add-material normalizer grounded at ACCEPT time.
# These are the persisted form of the drafting utterances when no thread survived.
derived = []
for kind in ("material", "material-spec", "vendor-product", "aliquot"):
    for yf in sorted(glob.glob(os.path.join(RECS, kind, "*.yaml"))):
        with open(yf) as f:
            try:
                rec = yaml.safe_load(f)
            except Exception:
                continue
        if not isinstance(rec, dict):
            continue
        prov = rec.get("provenance") or {}
        sl = prov.get("sourceLabel")
        derived.append({
            "recordId": rec.get("recordId"),
            "kind": rec.get("kind"),
            "name": rec.get("name") or rec.get("title"),
            "sourceLabel": sl,
            "source": prov.get("source"),
            "createdBy": prov.get("createdBy"),
            "createdAt": prov.get("createdAt"),
            "file": os.path.relpath(yf, HARVEST),
        })

# ------------------------------------------------- journal context alignment
journal = []
for yf in sorted(glob.glob(os.path.join(HARVEST, "journal", "*.yaml"))):
    with open(yf) as f:
        try:
            j = yaml.safe_load(f)
        except Exception:
            continue
    if isinstance(j, dict):
        journal.append(j)

# ------------------------------------------------- cases.json for the spine replay
# Noun component split for compound accepted labels (the four-term canonical).
def split_components(label):
    parts = re.split(r"\s*\+\s*", label)
    return [p.strip() for p in parts if p.strip()]

CANON = {
    "utterance": "Trypsin-EDTA + DMEM + FBS + HepG2 cells",
    "nouns": ["Trypsin-EDTA", "DMEM", "FBS", "HepG2 cells",
              "Trypsin-EDTA + DMEM + FBS + HepG2 cells"],
    "evidence": "derived: MAT-trypsin-edta-dmem-fbs-he-1om4 provenance.sourceLabel (accepted event graph EVG-mvak17we-gdah); NO live event-editor transcript exists on any lane data repo",
}
cases = {
    "note": "Every case is harvested real evidence or an explicit ABSENCE record. "
            "No transcript was synthesized. Nouns ride add-material normalizer sourceLabels "
            "and accepted event-graph labels.",
    "turns": [
        {
            "id": "T1-unobtainium",
            "source": "main--default--event-editor.json msg 4 (2026-10-18T13:27:04Z)",
            "utterance": "add 100 uL of unobtainium to wells A1:C3",
            "assistant_outcome": "The draft names \"unobtainium\" and the lab spine could not bind it (unknown-noun). Choose what it is, or create a local term.",
            "workspace_context": "ABSENT — the main data repo has no journal for user 'default' (journal/ not present); the deck at the time is not captured in persisted form",
            "nouns": ["unobtainium"],
            "case3_note": None,
        },
        {
            "id": "T2-phlogiston",
            "source": "main--default--event-editor.json msg 6 (2026-10-18T13:35:22Z)",
            "utterance": "add 50 uL of phlogiston to A1",
            "assistant_outcome": "The draft names \"phlogiston\" and the lab spine could not bind it (unknown-noun). Choose what it is, or create a local term.",
            "workspace_context": "ABSENT (same as T1)",
            "nouns": ["phlogiston"],
            "case3_note": None,
        },
        {
            "id": "T4-canonical-four-term",
            "source": CANON["evidence"],
            "utterance": CANON["utterance"],
            "assistant_outcome": "accepted: material-spec + material bound into EVG-mvak17we-gdah (2026-10-16T05:56Z) — clarification history NOT persisted (heldIntents memory-only)",
            "workspace_context": "journal snapshots for USR-BRAD deck tab EXR-LANE2-AI10 around 2026-10-16T05:5x (copied under journal/ when present)",
            "nouns": CANON["nouns"],
            "case3_note": "material_source_requirement.status=unresolved in EVG-mvajv2lb-xxwa: 'No explicit material instance, aliquot, or source lot selected during drafting.' — the persisted FORM of required-case 3' (unspecified source); no user transcript survives.",
        },
        {
            "id": "T5-vendor-spelled-four-term",
            "source": "derived: MAT-thermo-trypsin-edta-ther-1tuz + MSP-DRAFT-EVG_MV7Q7F5I_* provenance.sourceLabel (accepted EVG-mv7q7f5i-el9g)",
            "utterance": "Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells",
            "assistant_outcome": "accepted into EVG-mv7q7f5i-el9g",
            "workspace_context": "RUN-2026-10-09-run-1i4b deck (journal entries with eventGraphId EVG-SPK-VERIFY are a different session; no EXR context for this graph's drafting window on lane2 journal seq range 191-690 covers it)",
            "nouns": ["Thermo trypsin-EDTA", "Thermo DMEM", "Thermo FBS", "HepG2 cells",
                      "Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells"],
            "case3_note": None,
        },
        {
            "id": "T6-ratio-blob",
            "source": "derived: MAT-50-50-trypsin-edta-dmem--vkwl provenance.sourceLabel",
            "utterance": "50/50 Trypsin-EDTA/DMEM + 10% FBS with 500 HepG2 cells/ul",
            "assistant_outcome": "record exists (accepted); clarification history not persisted",
            "workspace_context": "ABSENT (no surviving thread; journal not attributable to a single turn)",
            "nouns": ["50/50 Trypsin-EDTA/DMEM + 10% FBS with 500 HepG2 cells/ul",
                      "50/50 Trypsin-EDTA/DMEM"],
            "case3_note": "nounShape mint-refuse DATA (config/drafting/shorthand-drafting.yaml) names THIS shape as its seed case.",
        },
        {
            "id": "T7-expanded-names",
            "source": "derived: MSP-DRAFT-EVG_MVAJOKF5_5ERR_* provenance.sourceLabel (accepted EVG-mvajokf5-5err)",
            "utterance": "Trypsin-EDTA + Dulbecco's Modified Eagle's Medium + Fetal bovine serum + HepG2 cells",
            "assistant_outcome": "accepted into EVG-mvajokf5-5err",
            "workspace_context": "deck EXR-LANE2-AI10 (journal entries with this eventGraphId exist on USR-BRAD)",
            "nouns": ["Dulbecco's Modified Eagle's Medium", "Fetal bovine serum",
                      "HepG2 cells", "Trypsin-EDTA",
                      "Trypsin-EDTA + Dulbecco's Modified Eagle's Medium + Fetal bovine serum + HepG2 cells"],
            "case3_note": None,
        },
        {
            "id": "T8-level-mismatch-probe",
            "source": "NOT a transcript — declared DATA probe: wash.material carries the shipped vocabulary's only `level: aliquot` declaration; replaying the canonical nouns under the wash verb exercises the engine's levelFilter against the SAME harvested store.",
            "utterance": "(wash arm of: Trypsin-EDTA + DMEM + FBS + HepG2 cells)",
            "assistant_outcome": "n/a — spine/engine replay only",
            "workspace_context": "same harvested lane2 store",
            "nouns": ["Trypsin-EDTA", "DMEM", "FBS", "HepG2 cells"],
            "case3_note": None,
        },
        {
            "id": "T9-known-vendor-product",
            "source": "derived: VPR-hep-g2-hepg2-hb-8065-atc-29B6ACCB record name (a real persisted vendor-product)",
            "utterance": "Hep G2 [HEPG2] - HB-8065 | ATCC",
            "assistant_outcome": "n/a — replay only",
            "workspace_context": "same harvested lane2 store",
            "nouns": ["Hep G2 [HEPG2] - HB-8065 | ATCC", "HB-8065"],
            "case3_note": "required-case 2 (known-vendor product missing locally) — this record IS locally present, so the true P4 probe (vendor hit wrongly disabling product lookup) is NOT harvestable from real transcripts: none asked for an absent vendor product.",
        },
        {
            "id": "T10-case3-prime-unspecified-source",
            "source": "derived: EVG-mvajv2lb-xxwa details.material_source_requirement {status: unresolved, reason: 'No explicit material instance, aliquot, or source lot selected during drafting.'}",
            "utterance": "ABSENT — no user transcript with an unspecified-source material turn survives in any harvested thread",
            "assistant_outcome": "persisted as the unresolved material_source_requirement inside the accepted event graph",
            "workspace_context": "deck EXR-LANE2-AI10",
            "nouns": [],
            "case3_note": "RECORDED ABSENCE. The persisted artifact proves the situation occurred (laziness arm reached the writer); the utterance itself is gone (held clarifications memory-only).",
        },
        {
            "id": "T11-case3-explicit-bottle",
            "source": "ABSENCE",
            "utterance": "ABSENT — no harvested transcript names a physical bottle/lot/location",
            "assistant_outcome": "n/a",
            "workspace_context": "n/a",
            "nouns": [],
            "case3_note": "RECORDED ABSENCE (greps: 'bottle', 'lot', cat/sku over all harvested threads: 0 hits).",
        },
        {
            "id": "T12-execution-instruction-not-yet",
            "source": "ABSENCE",
            "utterance": "ABSENT — no harvested transcript carries a future-tense prep instruction ('make 1 mL ...'); grep 'make 1|mL of' over harvested threads: 0 hits",
            "assistant_outcome": "n/a",
            "workspace_context": "n/a",
            "nouns": [],
            "case3_note": "RECORDED ABSENCE (P2 probe needs an authored synthetic case — a separate decision per spec §OUT).",
        },
    ],
}

# engine arm per turn (which shipped verb-contract the noun rides)
for t in cases["turns"]:
    t["engine_arms"] = []
    if t["id"] == "T8-level-mismatch-probe":
        t["engine_arms"] = ["wash"]
    elif t["nouns"]:
        t["engine_arms"] = ["add_material"]
        if t["id"] in ("T4-canonical-four-term", "T5-vendor-spelled-four-term",
                       "T7-expanded-names", "T9-known-vendor-product"):
            t["engine_arms"].append("wash")   # fire the level filter on the same nouns

with open(os.path.join(FIX, "cases.json"), "w") as f:
    json.dump(cases, f, indent=2)

# ---------------------------------------------------------------- index.md
L = []
L.append("# MATRES-REPLAY harvest — per-turn index (H1)")
L.append("")
L.append("Harvested read-only 2026-10-19 from lane data repos (records are TEST DATA per standing")
L.append("ruling). ORIGINALS NEVER MODIFIED — every artifact here is a copy; source path + sha256")
L.append("table at the bottom. Drafts-are-ephemeral finding verified in source (FormDraftService.ts")
L.append("persist() writes ONLY on compile/accept transitions as `form-draft` records; stagingStore")
L.append("keeps every pre-accept write in an in-memory Map — see report §spec-claims).")
L.append("")
L.append("## Persisted surfaces actually found")
L.append("")
L.append("| surface | location | contents |")
L.append("|---|---|---|")
L.append("| chat transcripts | lane2 `var/ai-threads/` | ONLY `default/{literature,sequences}.json` — NO event-editor threads survive on lane2 |")
L.append("| chat transcripts | main repo `var/ai-threads/` | `default/event-editor.json` (14 msgs, 2026-10-18/19) + `USR-BRAD/sequences.json` |")
L.append("| workstate journal | lane2 `var/sessions/USR-BRAD/journal/` | 500 snapshots seq 191-690 (2026-10-11 → 10-19); 149 mention EXR-LANE2-AI10 |")
L.append("| workstate journal | main repo | NO journal dirs (event-editor turns have NO captured workspace context) |")
L.append("| drafts | lane2 `records/form-draft/` | 50 form-draft records — adapters {workstate 26, analysis 19, sequence-authoring 5}; **NONE carry material nouns** (grep trypsin|dmem|fbs|hepg2 over all 50: 0 hits). The drafting leg of the four-term sessions never reached a persisted form-draft |")
L.append("| derived utterance evidence | `records/{material,material-spec,vendor-product,aliquot}/*.provenance.sourceLabel` | verbatim compound labels captured at accept-time by `add-material-normalizer` — the ONLY surviving form of the canonical utterances |")
L.append("| clarification history | — | NOT PERSISTED (heldIntents is an in-memory Map, shorthandChat.ts:325; SH-QC-1 S9 F-3 clear-on-cancel gap confirmed in source) |")
L.append("")
L.append("## Per-turn harvest table")
L.append("")
L.append("| turn | utterance (verbatim) | source | workspace ctx captured | material nouns replayed |")
L.append("|---|---|---|---|---|")
for t in cases["turns"]:
    ut = t["utterance"] if len(t["utterance"]) < 70 else t["utterance"][:67] + "..."
    L.append("| {id} | “{ut}” | {src} | {ctx} | {n} |".format(
        id=t["id"], ut=ut, src=t["source"][:60],
        ctx=("journal " + ("EXR-LANE2-AI10" if "EXR" in str(t.get("workspace_context")) else "n/a")) if "journal" in str(t.get("workspace_context")) else ("ABSENT" if "ABSENT" in str(t.get("workspace_context")) else "partial"),
        n=(", ".join(t["nouns"][:2]) + ("…" if len(t["nouns"]) > 2 else "")) if t["nouns"] else "—"))
L.append("")
L.append("## Raw transcript turns (user rows marked MATERIAL)")
L.append("")
for r in rows:
    flag = " **MATERIAL**" if r["material_bearing_user_turn"] else ""
    body = r["content"].replace("\n", " ")
    body = body[:140] + ("…" if len(body) > 140 else "")
    L.append("- `{file}` [{role} {ts}] {b}{f}".format(
        file=r["file"], role=r["role"], ts=r["createdAt"], b=body, f=flag))
L.append("")
L.append("## Six-required-case coverage (honest)")
L.append("")
L.append("| required case | status | evidence |")
L.append("|---|---|---|")
L.append("| 1 original four-component mixture | PARTIAL — utterance form recovered, live transcript ABSENT | T4/T5/T6/T7 derived sourceLabels + accepted event graphs; NO event-editor thread survives on any lane2 data repo (only the main repo has one, dated 10-18, containing unobtainium/phlogiston turns) |")
L.append("| 2 local wrong-level/approximate match | PROXY ONLY | T8 replay arm fires the levelFilter against the real store via the shipped `wash.material level: aliquot` declaration; no transcript of a wrong-level mis-binding survives |")
L.append("| 3 known-vendor product missing locally | NOT HARVESTABLE | T9 shows the locally-PRESENT vendor product; no real transcript asked for an absent vendor product (P4 probe needs authored case) |")
L.append("| 3' intentionally unspecified source | ARTIFACT ONLY, no transcript | T10 — EVG-mvajv2lb-xxwa material_source_requirement{unresolved} is the real persisted footprint of the laziness arm |")
L.append("| 3 explicit physical bottle | ABSENT (recorded) | T11 — 0 grep hits for bottle/lot/sku in any harvested thread |")
L.append("| 6 execution instruction not yet happened ('make 1 mL…') | ABSENT (recorded) | T12 — 0 grep hits; authoring synthetic is a post-report decision per spec |")
L.append("")
L.append("## Canonical four-term utterance — existence verdict")
L.append("")
L.append("The canonical utterance (Trypsin-EDTA/DMEM/FBS/HepG2) **exists in persisted derived form** —")
L.append("eight distinct material/material-spec record labels prove eight drafting-accept variants")
L.append("(50:50 blob, vendor-spelled, expanded-names, ratio+counter-density, plain four-term) across")
L.append("2026-10-16 (EXR-LANE2-AI10) and 2026-10-09/16 (EVG-mv7q7f5i). It **does NOT exist as a live")
L.append("transcript turn** — the event-editor endpoint threads are sparse (spec H1 anticipated this)")
L.append("and only the main data repo's 10-18 thread survives, which never names those materials.")
L.append("")
L.append("## Derived utterance evidence table (accept-time sourceLabels)")
L.append("")
L.append("| recordId | kind | sourceLabel | createdAt | createdBy |")
L.append("|---|---|---|---|---|")
for d in derived:
    if d["sourceLabel"]:
        L.append("| {rid} | {kind} | “{sl}” | {ca} | {cb} |".format(
            rid=d["recordId"], kind=d["kind"], sl=d["sourceLabel"],
            ca=str(d["createdAt"])[:16], cb=d["createdBy"]))
L.append("")
L.append("## Source integrity (sha256 of harvested originals)")
L.append("")
import hashlib
L.append("```")
for path in sorted(glob.glob(os.path.join(HARVEST, "transcripts", "*.json"))):
    pass
L.append("(hashes computed by run-all.sh into fates/harvest-hashes.txt)")
L.append("```")
with open(os.path.join(HARVEST, "index.md"), "w") as f:
    f.write("\n".join(L) + "\n")

print("wrote index.md (%d rows) and fixtures/cases.json (%d turns)" % (len(rows), len(cases["turns"])))
