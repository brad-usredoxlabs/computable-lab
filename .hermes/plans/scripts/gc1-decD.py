#!/usr/bin/env python3
"""GC-1 decoder D — CORRECTED (r2). Fixes gc1-decC's decode bug:

  decC used `for i in range(n16)` with a manual `i += 3` inside the body, which the
  for-iterator ignores -> escape payload slots were kept as points (n = n_slots,
  wrong time axis). decD decodes with an explicit while-loop (4-slot escapes),
  identical semantics to decoder A (independently confirmed by decoder B's
  vectorized mask): escape = slots[i]=32767, slots[i+1]=hi(i16),
  slots[i+2..3]=lo(u32 BE); abs = hi*2**32 + lo; b1<-0, b2<-abs; 4 slots consumed.

Also adds: (1) exact signal spot-checks vs decA JSON (argmax + deciles),
(2) escape-jump audit (|y[e]-y[e-1]| vs median |delta|) to bound residual
uncertainty on the 64-bit absolute-level reading, (3) scipy peak metrics
(FWHM half-height, area above measured baseline) on the CORRECT time axis.
Runs in /tmp/gc1-venv-prove (numpy 2.5.4, scipy 1.18.1). Read-only on NAS.
"""
import struct, sys, json, statistics
import numpy as np
from scipy.signal import find_peaks

def decode(path):
    b = open(path, "rb").read()
    assert b[326] == 3 and b[327:331] == b"1\x008\x00", "not v181"
    off = (struct.unpack_from(">I", b, 264)[0] - 1) * 512
    xmin = struct.unpack_from(">f", b, 282)[0] / 60000.0
    xmax = struct.unpack_from(">f", b, 286)[0] / 60000.0
    intercept, scale = struct.unpack_from(">dd", b, 4724)
    n16 = (len(b) - off) // 2
    slots = struct.unpack_from(f">{n16}h", b, off)
    raw, esc_idx, i = [], [], 0
    b1 = b2 = 0
    while i < n16:
        s = slots[i]
        if s == 32767:
            esc_idx.append(len(raw))
            lo = struct.unpack_from(">I", struct.pack(">hh", slots[i+2], slots[i+3]), 0)[0]
            b1, b2 = 0, slots[i+1] * 4294967296 + lo
            raw.append(b2)
            i += 4
        else:
            b1 += s
            b2 += b1
            raw.append(b2)
            i += 1
    n = len(raw)
    assert n == n16 - 3 * len(esc_idx), "point count mismatch"
    t = np.linspace(xmin, xmax, n)
    y = np.array(raw, dtype=np.float64) * scale + intercept
    return dict(n=n, n_slots=n16, esc=len(esc_idx), esc_idx=esc_idx, xmin=xmin, xmax=xmax,
                scale=scale, intercept=intercept, t=t, y=y, raw=raw)

def main(dirs):
    A = json.load(open("/tmp/gc1-decA.json"))
    out = {}
    for d in dirs:
        r = decode(d + "/FID1A.CH")
        n = r["n"]
        dt_s = (r["xmax"] - r["xmin"]) * 60.0 / (n - 1)
        # exact agreement checks vs decoder A (sequential struct decode)
        amax = int(np.argmax(r["y"]))
        deciles = [int(round(n * k / 10)) for k in range(10)]
        vals = {str(k): float(r["y"][k]) for k in deciles}
        # escape-jump audit
        dabs = np.abs(np.diff(r["y"]))
        med = float(np.median(dabs))
        jumps = [float(max(abs(r["y"][e] - r["y"][e-1]), abs(r["y"][e+1] - r["y"][e])))
                 for e in r["esc_idx"] if 0 < e < n - 1]
        rec = dict(n=n, n_slots=r["n_slots"], esc=r["esc"], xmin=r["xmin"], xmax=r["xmax"],
                   ymin_pa=round(float(r["y"].min()), 3),
                   ymidmin_pa=round(float(np.min(r["y"][: n // 2])), 3),
                   ylast200_pa=round(float(np.median(r["y"][-200:])), 3),
                   first5_pa=[round(float(v), 3) for v in r["y"][:5]],
                   last5_pa=[round(float(v), 3) for v in r["y"][-5:]],
                   scale=r["scale"], intercept=r["intercept"],
                   dt_s=round(dt_s, 6), fs_hz=round(1.0 / dt_s, 3),
                   max_pa=round(float(r["y"].max()), 4), argmax_i=amax,
                   rt_at_argmax=round(float(r["t"][amax]), 6),
                   decile_vals=vals,
                   esc_jump_median_ratio=round(float(np.median(np.array(jumps))) / med, 3),
                   esc_jump_max_ratio=round(float(np.max(np.array(jumps))) / med, 1),
                   esc_jump_max_pa=round(float(np.max(np.array(jumps))), 2),
                   median_abs_delta_pa=round(med, 4))
        # peak metrics on the correct axis
        base = float(np.median(r["y"][:200]))
        thr = base + 0.01 * (float(r["y"].max()) - base)
        idx, _ = find_peaks(r["y"], height=thr, distance=max(1, int(round(0.03 / dt_s))))
        pk = []
        for ip in idx:
            hh = (r["y"][ip] + base) / 2.0
            l, rr = int(ip), int(ip)
            while l > 0 and r["y"][l-1] > hh: l -= 1
            while rr + 1 < n and r["y"][rr+1] > hh: rr += 1
            bl, br = int(ip), int(ip)
            while bl > 0 and r["y"][bl-1] > base: bl -= 1
            while br + 1 < n and r["y"][br+1] > base: br += 1
            fl_l = r["y"][max(0, l - 40):l]; fl_r = r["y"][rr + 1:min(n, rr + 41)]
            fl = np.concatenate([fl_l[fl_l < hh], fl_r[fl_r < hh]])
            base_pk = (float(np.median(fl)) if len(fl) >= 8
                       else float(np.min(np.concatenate([fl_l, fl_r]))) if len(np.concatenate([fl_l, fl_r])) else base)
            bl2, br2 = l, rr
            for _ in range(400):
                if bl2 > 0 and r["y"][bl2 - 1] > base_pk: bl2 -= 1
                else: break
            for _ in range(400):
                if br2 + 1 < n and r["y"][br2 + 1] > base_pk: br2 += 1
                else: break
            area = float(np.trapezoid(np.maximum(r["y"][bl2:br2+1] - base_pk, 0.0), r["t"][bl2:br2+1]))
            pk.append(dict(rt_min=round(float(r["t"][ip]), 4), height_pa=round(float(r["y"][ip]), 1),
                           area_pa_min=round(area, 2), fwhm_min=round(float(r["t"][rr] - r["t"][l]), 4)))
        rec["base_pa"] = round(base, 3)
        rec["min_pa"] = round(float(r["y"].min()), 4)
        rec["peaks"] = pk
        out[d] = rec
        print(f"== {d.split('/')[-1]}: n={n} esc={r['esc']} dt={dt_s*1000:.3f} ms fs={1/dt_s:.1f} Hz "
              f"max={rec['max_pa']} pA @ rt={rec['rt_at_argmax']} min (i={amax})")
        print(f"   esc-jump median {rec['esc_jump_median_ratio']}x median|delta|, max {rec['esc_jump_max_ratio']}x ({rec['esc_jump_max_pa']} pA)")
        for p in pk[:12]:
            print(f"   rt={p['rt_min']:8.4f} min  h={p['height_pa']:12.1f} pA  area={p['area_pa_min']:12.2f} pA*min  FWHM={p['fwhm_min']} min")
    json.dump(out, open("/tmp/gc1-decD.json", "w"), indent=1)
    print("wrote /tmp/gc1-decD.json")

if __name__ == "__main__":
    main(sys.argv[1:] or ["/mnt/vast/gc-fid/machine1/RES35077-4.D",
                          "/mnt/vast/gc-fid/machine1/RES35077-5.D",
                          "/mnt/vast/gc-fid/machine1/20201023-KERRYGOLD.D"])
