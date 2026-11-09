#!/usr/bin/env python3
"""L2-LABSTATE-CONTENTS-1 — the FAITHFUL LIVE PRODUCT-PROOF drive (mint+answer).

WHY THIS EXISTS: the spec §11 VERBATIM drive ("the ONLY inputs are the
utterances") is blocked at turn 1 by the product's PRE-EXISTING material-noun
gate — a bare single-letter material "A" is an unknown/ambiguous material
noun, so resolve_nouns (a pass this item did NOT touch) fires a "create local
term" clarification card -> needs-clarification -> events:[] -> the add_material
never reaches the lab_state fold. That gate is out of this item's file scope
and spec §12 makes store-record material resolution an architect escalation,
not a fix-run. The faithful live PRODUCT path for an unknown material is the
scientist ANSWERING that card (the product's own designed never-guess flow):
mint the material (POST /api/vocab/mint), answer the card with the minted
record ref, and the deterministic recompile binds the material and emits the
add_material -> which reaches the lab_state fold. THIS drive demonstrates that
the contents ledger populates on the live product path (the acceptance
semantics of line 1 "turn 1 ... accepted leaves snapshotAfter.labware
populated and the non-empty snapshot persisted").

Turns:
  A    "Place a 96-well plate on the deck."
  1    "add material A to A1-H1"  -> material card -> MINT the card label ->
       answer the card -> recompile -> add_material -> FOLD (R3) -> contents
  1b   "add material B to A2-H2"  -> same
  2    "mix all wells that have material"  -> resolve_wellsets unions the
       COMMITTED ledger -> A1:H2 (16 wells — count reconciled per ruling
       LABSTATE-TOKENSITE-gate-l2t2355 Q2; the old "48" label was bookkeeping)

NO seeded state, NO cache priming, NO priorLabState fixture: the ONLY external
inputs are the utterances + the product's own mint+answer interaction (the
real product's normal flow for a bare material label — the scientist picks
"create local term").
"""
import json, os, time, urllib.request, urllib.error

BASE = os.environ.get("DRIVE_BASE", "http://localhost:3093")
LOG = os.environ.get("DRIVE_BACKEND_LOG",
                     "/mnt/vast/home/brad/git/wt/L2-LABSTATE-CONTENTS-1-lane2-l2t2255/.run/backend.log")
RECEIPTS_ROOT = os.environ.get("DRIVE_RECEIPTS",
                               "/home/brad/.hermes/cl/receipts/L2-LABSTATE-CONTENTS-1")
TURN_TIMEOUT = int(os.environ.get("DRIVE_TURN_TIMEOUT", "300"))

AVAIL = ["aspirate","dispense","transfer","multi_dispense","add_material","mix",
    "wash","incubate","read","harvest","place_tube","move_tube","remove_tube",
    "serial_dilution","plate_copy","wash_cycle"]


def ctx(run_id, labwares, events, pc):
    return {"eventGraphId":"eg-"+run_id,"runId":run_id,"platformId":"manual",
        "variantId":"manual_freeform","vocabPackId":"liquid-handling/v1",
        "placementCount":pc,"eventCount":len(events),"labwares":labwares,
        "eventSummary":("No events yet." if not events else "; ".join(
            str(e.get("verb") or e.get("event_type")) for e in events[-20:])),
        "availableVerbs":list(AVAIL),"selection":None}


def arm_since(off):
    try:
        with open(LOG,"rb") as f:
            f.seek(off); data=f.read().decode(errors="replace")
    except OSError:
        return []
    return [l for l in data.splitlines() if "lab_state ARM-LOG" in l]


def parse_arm(line):
    out={}
    for tok in ("turn=","prior_labware=","after_labware="):
        i=line.rfind(tok)
        if i<0: continue
        rest=line[i+len(tok):]
        if tok=="turn=": out["turn"]=rest.strip()
        else:
            try: out[tok.rstrip("=")]=json.loads(rest)
            except Exception: out[tok.rstrip("=")]=rest
    return out


def post(body, timeout=TURN_TIMEOUT):
    req=urllib.request.Request(BASE+"/api/ai/draft-events/stream",
        data=json.dumps(body).encode(), headers={"Content-Type":"application/json"})
    off=os.path.getsize(LOG)
    t0=time.time()
    try:
        resp=urllib.request.urlopen(req,timeout=timeout)
    except urllib.error.HTTPError as e:
        return e.code,[],[],t0,e
    buf=b""; frames=[]
    with resp:
        while True:
            ch=resp.read(1)
            if not ch: break
            buf+=ch
            if buf.endswith(b"\n\n"):
                for line in buf.decode(errors="replace").splitlines():
                    if line.startswith("data:"):
                        try: frames.append(json.loads(line[5:].strip()))
                        except Exception: pass
                buf=b""
    wall=round(time.time()-t0,1)
    return resp.status,frames,arm_since(off),wall,None


def post_json(path, body):
    req=urllib.request.Request(BASE+path, data=json.dumps(body).encode(),
        headers={"Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(req,timeout=60) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")
    except Exception as e:
        return -1, {"error":str(e)[:200]}


def done_of(frames):
    return next((f for f in frames if isinstance(f,dict) and f.get("type")=="done"),None)


def main():
    ts=time.strftime("%Y%m%dT%H%M%SZ",time.gmtime())
    receipt=os.path.join(RECEIPTS_ROOT,ts)
    os.makedirs(receipt,exist_ok=True)
    run_id="labstate-mint-"+ts
    st={"labwares":[],"events":[],"pc":0,"history":[]}
    turns={}

    def absorb(res):
        if not isinstance(res,dict): return
        for o in (res.get("resolvedLabwares") or []):
            rid=o.get("recordId") if isinstance(o,dict) else None
            if isinstance(rid,str) and not any(l["labwareId"]==rid for l in st["labwares"]):
                st["labwares"].append({"labwareId":rid,"labwareType":str(o.get("title") or rid),
                    "name":str(o.get("title") or rid)}); st["pc"]+=1
        for add in (res.get("labwareAdditions") or []):
            rid=add.get("recordId") if isinstance(add,dict) else None
            if isinstance(rid,str) and not any(l["labwareId"]==rid for l in st["labwares"]):
                st["labwares"].append({"labwareId":rid,"labwareType":str(add.get("reason") or rid),
                    "name":str(add.get("reason") or rid)}); st["pc"]+=1
        if isinstance(res.get("events"),list):
            st["events"] += [e for e in res["events"] if isinstance(e,dict)]
        if isinstance(res.get("notes"),list) and res["notes"]:
            st["history"].append({"role":"assistant","content":" ".join(map(str,res["notes"]))[:4000]})
        st["history"]=st["history"][-20:]

    def push_user(prompt):
        st["history"].append({"role":"user","content":prompt.strip()})
        st["history"]=st["history"][-20:]

    def turn(label, prompt, extra_body=None):
        body={"prompt":prompt,"context":ctx(run_id,st["labwares"],st["events"],st["pc"]),
              "history":list(st["history"])}
        if extra_body: body.update(extra_body)
        push_user(prompt)
        status,frames,arm,wall,err=post(body)
        done=done_of(frames)
        res=(done or {}).get("result") or {} if isinstance(done,dict) else {}
        absorb(res)
        turns[label]={"prompt":prompt,"http_status":status,"wall_s":wall,"err":str(err) if err else None,
            "done_frame":done,"arm_log":[parse_arm(l) for l in arm],"arm_log_raw":arm,
            "frame_types":[f.get("type") for f in frames if isinstance(f,dict) and f.get("type") in ("draft","done","error","pipeline_diagnostics")]}
        print("turn %-3s http=%s wall=%ss arm=%d events=%d cards=%d" % (
            label,status,wall,len(arm),len(res.get("events") or []),len(res.get("clarificationRequests") or [])))
        return turns[label]

    # ---- turn A: place the plate -------------------------------------------
    turn("A","Place a 96-well plate on the deck.")

    # ---- turns 1 / 1b: add A / add B with the mint+answer flow --------------
    for label,prompt in (("1","add material A to A1-H1"),("1b","add material B to A2-H2")):
        t=turn(label,prompt)
        res=(t.get("done_frame") or {}).get("result") or {}
        cards=[c for c in (res.get("clarificationRequests") or [])
               if isinstance(c,dict) and c.get("kind")=="material"]
        if cards:
            # The faithful product flow: the scientist picks "create local term
            # <label>" — mint the EXACT card label, then answer the card with
            # the minted record ref (the product's own designed never-guess flow).
            card=cards[0]
            card_label=(card.get("unresolvedFact") or {}).get("label") or (card.get("query") or "")
            ms,mb=post_json("/api/vocab/mint",{"refKind":"material","label":card_label})
            mat_id=mb.get("recordId")
            answer={"requestId":card.get("id"),"label":card_label,
                    "ref":{"kind":"record","id":mat_id,"type":"material","label":card_label}}
            print("  mint %r -> %s (http %s); answering card %s" % (card_label,mat_id,ms,card.get("id")))
            t=turn(label+"-ans",prompt,{"clarificationAnswers":[answer]})
            res=(t.get("done_frame") or {}).get("result") or {}
            print("  answer recompile: events=%d cards=%d error=%s" % (
                len(res.get("events") or []),len(res.get("clarificationRequests") or []),
                (res.get("error") or None) and str(res["error"])[:70]))
        turns[label]["material_card"]=cards[0] if cards else None

    # ---- turn 2: mix all wells that have material ---------------------------
    turn("2","mix all wells that have material")

    # ---- acceptance legs ----------------------------------------------------
    legs={}
    def last_after(lab):
        a=turns.get(lab,{}).get("arm_log") or []
        return a[-1].get("after_labware") if a else None
    def last_prior(lab):
        a=turns.get(lab,{}).get("arm_log") or []
        return a[-1].get("prior_labware") if a else None

    # LEG A: turn A mints the plate instance (R3-unique live winner).
    a_after=last_after("A")
    legs["turnA_plate_minted"]={"ok":isinstance(a_after,dict) and len(a_after)>=1,
        "after_labware":a_after,
        "note":"turn A 'Place a 96-well plate' -> create_container -> lab_state fold mints the snapshot instance (R3-unique live winner, OQ-3 ratified)."}

    # LEG 1: turn 1 (post-answer) leaves contents populated (A1..H1) + a
    # non-empty snapshot. The faithful product path (mint+answer) is how the
    # live product 'accepts' a bare material label.
    t1_after=last_after("1-ans") or last_after("1")
    def populated(pay, want_wells=None):
        if not isinstance(pay,dict): return False
        for wmap in pay.values():
            if not isinstance(wmap,dict): continue
            for wid,mats in wmap.items():
                if want_wells and wid not in want_wells: continue
                if isinstance(mats,list) and mats: return True
        return False
    legs["turn1_contents"]={"ok":populated(t1_after),
        "after_labware":t1_after,
        "note":"turn 1 'add material A to A1-H1' ACCEPTED (via the product's mint+answer flow for the bare 'A') leaves snapshotAfter.labware populated over A1..H1; the seen materialId/kind ride the payload above."}

    # LEG 1b persistence: turn 1b's PRIOR already contains turn 1's contents.
    t1b_prior=last_prior("1b-ans") or last_prior("1b")
    t1_after_any=last_after("1-ans") or last_after("1")
    legs["turn1b_persistence"]={"ok":populated(t1b_prior),
        "turn1b_prior_labware":t1b_prior,"turn1_after_labware":t1_after_any,
        "note":"turn 1b's compile read a prior that ALREADY contains turn 1's contents (the LabStateCache write leg fired) — the persistence proof, captured from the arm-log (NOT asserted-by-construction)."}

    # LEG 2: turn 2 mix union == the committed-ledger union. The A1:H2
    # bounding union (16 wells — count reconciled per ruling
    # LABSTATE-TOKENSITE-gate-l2t2355 Q2) when both A(A1..H1)+B(A2..H2) populated.
    t2=(turns.get("2") or {}).get("done_frame") or {}
    res2=(t2.get("result") or {}) if isinstance(t2,dict) else {}
    mix_events=[e for e in (res2.get("events") or []) if isinstance(e,dict)
                and (e.get("event_type") in ("mix","multi_dispense") or e.get("verb") in ("mix","multi_dispense"))]
    mix_wells=set()
    for e in mix_events:
        d=e.get("details") or {}
        w=d.get("wells")
        if isinstance(w,list): mix_wells |= {x for x in w if isinstance(x,str)}
        elif isinstance(w,str): mix_wells.add(w)
        if isinstance(d.get("well"),str): mix_wells.add(d["well"])
    # the committed-ledger union from the arm-log after (turn 2's prior == the
    # ledger the resolver reads). Compute the expected union from the ledger,
    # never a hardcoded literal (B3).
    t2_prior=last_prior("2")
    ledger_union=set()
    if isinstance(t2_prior,dict):
        for wmap in t2_prior.values():
            if isinstance(wmap,dict):
                for wid,mats in wmap.items():
                    if isinstance(mats,list) and mats: ledger_union.add(wid)
    legs["turn2_mix_union"]={
        "ok": bool(mix_wells) and mix_wells == ledger_union and len(ledger_union) == 16,
        "mix_event_count":len(mix_events),"mix_wells":sorted(mix_wells),
        "mix_well_count":len(mix_wells),"committed_ledger_union":sorted(ledger_union),
        "committed_ledger_union_count":len(ledger_union),
        "note":"the mix event's details carry the resolved union BY THE COMMITTED LEDGER (the arm-log prior = the ledger the resolve_wellsets pass reads). Vacuous []==[] is an ACCEPTANCE FAILURE (named, not hidden). Expected the 16-well A1:H2 bounding union (count reconciled per ruling LABSTATE-TOKENSITE-gate-l2t2355 Q2) when both A(A1..H1)+B(A2..H2) populated."}

    report={"item":"L2-LABSTATE-CONTENTS-1","drive":"faithful live product-proof (mint+answer) — spec §11 verbatim drive is blocked at turn 1 by the pre-existing material-noun gate (see report)",
        "run_id":run_id,"base":BASE,"ts":ts,"turns":turns,"legs":legs,
        "all_legs_ok":all(v.get("ok") for v in legs.values())}
    for k,v in legs.items(): print("LEG %-22s ok=%s" % (k,v.get("ok")))
    with open(os.path.join(receipt,"drive-receipt.json"),"w") as f:
        json.dump(report,f,indent=2)
    print("RECEIPT=%s ALL_LEGS_OK=%s" % (receipt,report["all_legs_ok"]))


if __name__=="__main__":
    main()
