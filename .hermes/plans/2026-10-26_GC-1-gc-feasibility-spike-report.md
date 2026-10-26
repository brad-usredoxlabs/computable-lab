# GC-1 Feasibility Spike Report — RESUME RUN r2 (cl-coder, l1t1730)

Date: 2026-10-26 (UTC-04:00) · Worktree: /mnt/vast/home/brad/git/wt/gc-1-lane1-l1t1730 (cl/lane1-gc-1-l1t1730 @ b7a3dd8c, clean, 0 deletions at start and finish)
Brief: /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-26_GC-1-gc-feasibility-spike.md (sections a–f answered verbatim below)
Run mode: prior run built /tmp artifacts then died on an output-token limit with no report. This run INVENTORIED those artifacts, re-ran everything cheaply, found and fixed two bugs in the prior run's peak metrics, and fills the remaining gaps. No product code, no repo edits outside .hermes/plans/, no NAS writes, no model-service touches.

## (a) Inventory — /mnt/vast/gc-fid/machine1/RES35077-4.D

Corpus context (re-verified this run): machine1/ holds **12 .D directories** (RES35077-4.D, RES35077-5.D, 20201023-CANT-BELIEVE.D, 20201023-COUNTRYSIDE-BUTTER.D, 20201023-KERRYGOLD.D, 20201023-WEGMANS-BUTTER.D, 20201024-RESTEK-60-RESTEK-H.D, 20201024-RESTEK-60-WEGMANS.D, 20201024-RESTEK-RESTEK-H.D, 20201025-RESTEK-H-CANT-BELIEVE.D, 20201025-RESTEK-H-COUNTRYSIDE.D, 20201025-RESTEK-H-KERRYGOLD.D) plus 9 `GCFID_CHECKOUT *` dirs (vendor export zips: GCFID_CHECKOUT.S, GC-FID.M, METHODS.REG). **ACQUIRING.TXT is now ABSENT** (it existed at orchestrator claim time 2026-10-25T17:45) → the in-progress-acquisition marker has been removed; all .D present are complete runs. Note: 20201023-WEGMANS-BUTTER.D has NO ACQ.M/DA.M dirs (FID1A.CH 100052B only) — a partial .D; any .D handler must tolerate missing method dirs.

| File | Size | Role hypothesis | Confidence |
|---|---|---|---|
| FID1A.CH | 75,846 B | FID signal: 6,144 B header + 69,702 B body (34,851 int16 slots → 28,812 points after 2,013 four-slot escapes) | **HIGH** — decoded, see (b) |
| RUN.LOG | 4,786 B | UTF-16LE run event log: "Method started 10:08:18 10/23/26", "Instrument running sample Vial 101 (front) 10:08:18", "run completed 10:18:18", inlet-flow 19.3 psi @ 6.37 min and inlet-pres 60.1 psi @ 6.45 min warnings | **HIGH** — read, internally consistent (10 min run ≈ 9.6 min CH) |
| SAMPLE.XML | 548 B | UTF-16LE XML: `<Sample><Name>RES35077-4</Name><Amount>0</Amount><Multiplier>1</Multiplier><Dilution>1</Dilution><ISTD Num="1">0</ISTD></Sample>` — run-table sample fields (multiplier/dilution/ISTD per GC-3) | **HIGH** — read in full |
| SAMPLE.MAC.bak | 300 B | UTF-16LE ChemStation sample macro: `Name SAMPLEINFO / ON ERROR Print "" / SAMPLECALISTD 1,0 / SAMPLECALAMT 0,1,1 / REMOVE SAMPLEINFO` | **HIGH** — read in full |
| ACQ.M/ | dir (8 entries) | Acquisition-method snapshot for this run | **HIGH** (dir role) / per-file below |
| ACQ.M/ACQ.TXT | 1,932 B | UTF-16LE text: "Data File: Z:\GC-FID\MACHINE1\RES35077-4.D", "Acq. Method: **AOAC_FAME_NO_INJECTION.M**", + instrument parameters for the run. Method-name extraction = 1-line parse | **HIGH** — read |
| ACQ.M/INFO.MTH (same in DA.M) | 430 B | UTF-16LE key-value: `CLEARMETHOD / PRERUNPROGRAM 0 / POSTRUNPROGRAM 0 / ENABLEACQUISITION 1 / ENABLEANALYSIS 1 / CUSTOMANALYSIS 0 / COPYMETHOD 0 / SAVEGLPDATA 0 / PRERUNNAME ""` | **HIGH** — read in full |
| ACQ.M/IQ1.MTH (same in DA.M) | 6,850 B | UTF-16LE ChemStation **integration parameters**: `C1CF 10000.0,250.00,2000.0,0,... / C2CF 0.0,0.00,0.0,5,4,0,0,0 / IBCF 2,0.10,0.10 / IFCF 1,0.10,0.10 / DFCF 0,5 / OVCF 260 / V1CF ...` — maps to GC-2 analysis-section settings (slope sensitivity, peak width, area/height reject, timed events). KEY names parseable; key **semantics are vendor-undocumented** | **MEDIUM** — format readable, semantics unknown |
| ACQ.M/I7673.MTH (same in DA.M) | 639 B | Binary .MTH — not text-decodable (tried UTF-16LE/UTF-8) | **LOW** — opaque |
| ACQ.M/INJECTOR.MTH (same in DA.M) | 63 B | Binary .MTH — not text-decodable | **LOW** — opaque |
| ACQ.M/RECALIB.MTH (same in DA.M) | 22 B | UTF-16LE: `CLEARMIX` | **HIGH** — read in full |
| ACQ.M/rpthead.txt (same in DA.M) | 2,808 B | Text but unknown code page (garbled under UTF-8/CP1252) | **LOW** — opaque for now |
| ACQ.M/DAMETHOD.REG (same in DA.M) | 25,722 B | Binary ChemStation "REGISTER FILE" (magic 0x00323302 LE, "REGISTER FILE" string) | **LOW** — opaque |
| DA.M/ | dir (7 entries) | Data-analysis-method snapshot; file set **identical to ACQ.M minus ACQ.TXT**, identical sizes | **MEDIUM** — inferred from names/contents |
| ACQRES.REG | 3,750 B | Binary REGISTER FILE; embedded strings `CHPUserObject`, `CHPList`, `CO...` (per-channel processing results) | **LOW** — opaque |
| SINGLE.B | 1,675 B | Binary REGISTER FILE with a "notused" field | **LOW** — opaque |

## (b) FID1A.CH decode evidence

### Format (v181, reverse-engineered; 3 independent decoders agree)
Header (6,144 B): body starts at `page = u32BE@264` → `offset = (page-1)*512` (= 6,144; page=13). Version marker: `b[326]==3`, `b[327:331]=="1\x008\x00"` → version **181**. Time axis: `t0 = f32BE@282` minutes, `t_end = f32BE@286` minutes, **linear over n points**. Scaling: `intercept = f64BE@4724`, `scale = f64BE@4724+8` → **signal(pA) = raw * scale + intercept**.

Body: little-endian int16 slots, **double-difference encoded** (`b1 += slot; b2 += b1; raw = b2`). **Escape** (4-slot): slot0 = 32767 marker, slot1 = high int16, slots 2–3 = low uint32BE; absolute level `b2 = slot1*2^32 + low` (b1 reset to 0); 4 slots consumed. Verified in raw bytes by all three decoders.

### Time axis (STATED)
| Sample | n points | escapes | t0 (min) | t_end (min) | dt | sampling rate |
|---|---|---|---|---|---|---|
| RES35077-4.D | 28,812 | 2,013 | 0.000214 | 9.604214 | 20.001 ms | **50.0 Hz** |
| RES35077-5.D | 52,216 | 2,185 | 0.000406 | 43.513742 | 50.001 ms | **20.0 Hz** |
| 20201023-KERRYGOLD.D | 48,757 | 858 | 0.000466 | 40.631302 | 50.001 ms | **20.0 Hz** |
| 20201024-RESTEK-60-WEGMANS.D | 72,801 | 545 | ≈0.0004 | 60.668 | 50.001 ms | **20.0 Hz** |

**Units/scaling (STATED):** pA. `scale = 0.0001302083401242271` pA/count, `intercept = 0.0` — the SAME scale value on every file checked (RES4, RES5, KERRY, RESTEK-60-RESTEK-H: identical to all 17 significant digits) → fixed instrument configuration across the corpus (assumption AS-3).

**Time-axis validation:** the linear axis yields EXACTLY round sampling rates (50.000/20.000 Hz) on all 4 files checked. A wrong offset/divisor would not produce round Hz on multiple files of different lengths — this is the strongest single evidence the header reading is correct.

### Peak lists (RT min / height pA / area pA·min / FWHM min)
Heights: all three decoders agree (see tolerance below). Areas: from decoder D (r2, corrected local-baseline trapezoid); FWHM: D.

RES35077-4.D (9.6 min run, 50 Hz; first5 pA = 10.671, 10.758, 10.805, 10.964, 10.872; max 400,112.83 pA @ 4.6074 min):
| RT (min) | height (pA) | area (pA·min) | FWHM (min) |
|---|---|---|---|
| 4.0217 | 24,063.8 | 479.03 | 0.0533 |
| 4.4834 | 286,433.1 | 57,731.04 | 0.2887 |
| 4.4940 | 305,375.4 | 54,704.96 | 0.2847 |
| 4.5024 | 314,598.7 | 53,331.11 | 0.2827 |
| 4.5207–4.5556 (cluster) | 337,731–400,113 | 48–58k each | ≈0.27 |
| 4.6074 | 400,112.8 (max) | — | — |

The 4.48–4.66 min region is a single unresolved envelope of local maxima (56 in A's low-threshold detector; 5 with scipy distance) — expected for a 9.6-min screening run; not 50 distinct peaks (honesty note, AS-5).

RES35077-5.D (43.5 min run, 20 Hz; max 155,916.55 pA @ 8.1247 min):
| RT (min) | height (pA) | FWHM (min) |
|---|---|---|
| 4.9463 | 11,304.0 | 0.1425 (area 635.83) |
| 7.3464 | 73,174.9 | 1.1325 |
| 7.4389 | 82,884.7 | 1.0917 |
| 7.5031 | 89,354.4 | 1.0617 |
| 7.5856 | 96,993.5 | 1.0275 |
| 7.6997 | 108,599.2 | 0.9742 |
| 7.8514 | 122,982.1 | 0.9084 |
| 8.1247 | 155,916.6 (max) | 0.7525 |

Heights rise monotonically 7.35→8.12 min with FWHM > 0.75 min → again one broad unresolved FAME envelope split into local maxima, not resolved peaks (AS-5).

20201023-KERRYGOLD.D (40.6 min run, 20 Hz; max 585,602.82 pA @ 4.5556 min):
| RT (min) | height (pA) | FWHM (min) | area (pA·min) |
|---|---|---|---|
| 4.1156–4.5556 (plateau) | 539,325 → 585,603 (flat-topped) | 0.4967–0.4983 | 275,974–277,298 (CLIPPED — plateau top) |
| 6.6773 | 6,219.2 | 0.04 | 211.36 |

The main peak is **detector-saturated / flat-topped** (all three decoders show a plateau of ~75 near-equal local maxima between 540k–585k pA). Its true area and FWHM are UNRECOVERABLE from the raw data (FWHM clipped at the plateau top = underestimate; area constant across the plateau = artifact of the flat top, not a measurement).

### Cross-decoder agreement (STATED tolerance)
Three decoders: **A** = sequential struct-loop (prior run, /tmp/gc1-decA.py), **B** = vectorized numpy mask (prior run, /tmp/gc1-decB.py), **D** = r2 rewrite of A's semantics + scipy metrics (this run, /tmp/gc1-decD.py). B is independent of A in implementation (vectorized vs sequential struct).
- Point count, escape count, body offset, scale, intercept: **EXACT agreement, all 3 samples** (e.g. RES4: n=28,812, esc=2,013, n_slots=34,851, offset=6,144 in all three).
- Max/min pA: A vs D agree to ≥7 significant figures (400112.83128417586 vs 400112.8313; 155916.55487647327 vs 155916.5549; 585602.8158280236 vs 585602.8158).
- first5/last5 pA: A vs D agree to 3 decimals (RES4 first5: 10.671224514881033 vs 10.671 — identical).
- t_end: A meta 9.604213541666667 vs B 9.60421371459961 → **Δ ≤ 2e-7 min (1e-5 s, endpoint-convention difference)**.
- Peak RTs A vs B (independently implemented): **≤ 0.0097 min (0.58 s)** on co-detected peaks (≤0.01 min / 0.6 s stated tolerance).
- Peak heights on co-detected peaks: **< 0.02% (≤ 60 pA on 300k pA peaks)** between A and B.
- A vs D (same sequential semantics, different code): RT/height agree to 4 decimals on shared peaks.

### Residual uncertainty (honest statement)
1. **No vendor format spec** — the v181 layout is reverse-engineered and triple-cross-checked, but unverified against ChemStation documentation. The round-Hz time-axis result is the strongest available confirmation.
2. **Escape 64-bit absolute**: `slot1*2^32 + u32BE(slots2:3)` unverified against a spec. Escape-jump audit (|level jump at escape| vs median|Δ|): RES4 median 1,764×, max 70,771 pA; RES5 median 1,905×, max 5,996 pA; KERRY median 12,438×, max 40,537 pA — magnitudes are plausible for real level changes, but the reading is an inference, not a proven fact.
3. **KERRY escape tag**: slot1 = 1 on 400/858 escapes (RES4 and RES5: 0/2,013 and 0/2,185 — verified in raw bytes this run). Treated as the high word in all three decoders; the trace decodes smoothly, but the tag≠0 variant's meaning is **unverified**. Any production parser must audit this flag distribution.
4. **Peak tables are local maxima, not vendor integration**: ChemStation's own peak list (its slope-sensitivity/valley rules from IQ1.MTH) will merge/split differently, especially the broad envelopes in RES5 and the saturated KERRY plateau. My tables bound the truth within the stated decoder tolerances, not within ChemStation's.
5. **Screenshot reference route unusable**: vision is DISABLED on my inference endpoint (verified attempt, 400 vision_disabled) → the ChemStation-screenshot RT cross-check could not be executed; the two-decoder route (explicitly allowed by the task text) is the independent reference used instead.
6. **Prior-run artifacts found defective in peak metrics** (not in decode): decA's `area`/`whm` columns are all zeros (unimplemented) and decB's `area` is a constant per file (window-boundary bug, same artifact in all listed peaks). The corrected r2 decoder D is the source of all area/FWHM values above. decA/decB DECODE (points, escapes, scale, offset) verified correct and retained as the cross-check pair.
7. `/tmp/gc1-pyb.whl` is NOT a wheel: it is a **gzip-compressed POSIX tar** of the pybaselines 1.2.1 sdist (unpacked: /tmp/gc1-pyb-real.bin, 1,986,560 B; LICENSE.txt = BSD-3-Clause, author Donald Erb; PKG-INFO metadata extracted). No install was attempted from it; PyPI metadata used for the screen in (d).

## (c) Python environment decision

**Facts (re-verified this run):** `/usr/bin/python3` = Python 3.14.7. numpy and scipy ABSENT on the system interpreter (ModuleNotFoundError). `python3 -m venv` + ensurepip WORK (pip 26.2.1). `uv` NOT on PATH (do not assume). The host-venv python (3.11.16, no pip) is irrelevant to the runner.

**Spike venv (CREATED and PROVEN this run):** /tmp/gc1-venv-prove — `pip list`: numpy **2.5.4**, scipy **1.18.1**, pillow 13.0.0; `import numpy, scipy` OK on 3.14.7 (all decoders D and the metrics ran on it).

**Exact provisioning commands (orchestrator-rerunnable):**
```
/usr/bin/python3 -m venv /home/brad/.computable-lab-lane1/analysis-venv
/home/brad/.computable-lab-lane1/analysis-venv/bin/python -m ensurepip --upgrade
/home/brad/.computable-lab-lane1/analysis-venv/bin/python -m pip install numpy==2.5.4 scipy==1.18.1
# proof:
/home/brad/.computable-lab-lane1/analysis-venv/bin/python -c "import numpy, scipy; print(numpy.__version__, scipy.__version__)"
```
(Spike equivalent at /tmp/gc1-venv-prove executed and passed.) Pinned: **numpy==2.5.4, scipy==1.18.1** — proven importable on /usr/bin/python3 (3.14.7). pybaselines (if adopted per (d)): `pip install pybaselines==1.2.1` (deps numpy>=1.20, scipy>=1.6 — satisfied by the pins; Python >=3.9).

**DECIDED production resolution for `DEFAULT_PYTHON` at server/src/analysis/analysisRunner.ts:27** (decide, not implement):
**Resolution order: (1) config-declared `analysis.python` path from the gitignored config.yaml data (declared, not hardcoded — matches the storageDevices local-mount pattern) → (2) env-var override `CLA_ANALYSIS_PYTHON` (mirrors the existing `CLA_ANALYSIS_SDK_DIR` env-override precedent at :33) → (3) the existing `/usr/bin/python3` constant as last-resort fallback.**
Justification: (i) the constructor already accepts `private readonly python = DEFAULT_PYTHON` (:96) and spawns `this.python` (:193), so this is a pure resolution-order change with zero architectural delta — minimal justified change; (ii) config data, not code, carries the host-specific path per the repo's "things that can be data should be data" rule — each lane/host declares its venv path; (iii) env override gives ops a no-restart escape hatch consistent with the SDK-dir mechanism; (iv) keeping /usr/bin/python3 as fallback preserves current behavior wherever nothing is declared (safe default; GC-5 then provisions the declared venv per this (c) recipe). The venv location is declared per-host (lane 1: /home/brad/.computable-lab-lane1/analysis-venv); /tmp is NOT acceptable for production (tmpfs, wiped on reboot). GC-5 owns the implementation.

## (d) Engine capability matrix (GC-D3 controls list)

Legend: S = supported, A = approximate, U = unsupported, NV = unverified (not tested in spike).

| Control | scipy 1.18.1 baseline | pybaselines 1.2.1 |
|---|---|---|
| Baseline control | A — manual/local baseline, polyfit/interp available; no iterative ChemStation-style correction | **S** — asls/pspline_asls/irsqr/goldindec/mor/loess/quant_reg/penalized_poly (17+ baseline algorithms, `pybaselines.api` + polynomials/spline/morph modules verified in the sdist) |
| Width / slope sensitivity | A — `find_peaks(width=, width_mode=)` constrains width; slope sensitivity per se not expressible | U — no peak concept at all (baseline-fitting library) |
| Area / height reject | A — post-filter peaks by area/height threshold; no iterative reject | U |
| Timed ON/OFF integration windows | A — slice by time interval + integrate (trivial with find_peaks + trapezoid) | U (arrays-only, no integration concept) |
| Peak detection | **S** — `scipy.signal.find_peaks` (height/distance/prominence/width) — used and validated in this spike | U |
| Deconvolution | U — not in scipy.signal for this use case | U |

**Candidate screen (license / maintenance / deps / pluggability):**
- **pybaselines 1.2.1** (derb12, Donald Erb): **BSD-3-Clause**; last release **2025-08-10** (active); Python >=3.9; runtime deps **numpy>=1.20, scipy>=1.6 only** (dev extras not installed); pure-Python, `pybaselines.*` importable modules — **pluggable as a baseline-backend option behind the integration engine**. Screened via the sdist the prior run left at /tmp/gc1-pyb.whl + PyPI metadata (Requires-Dist verified this run).
- **chromatopy 2.0.0** (screened and REJECTED as the pluggable engine): license field EMPTY in PyPI metadata; hard-pinned heavy deps incl. **PyQt5==5.15.11, matplotlib, pandas, scikit-learn, numpy==2.3.2, scipy==1.16.1, rainbow_api** (GUI research tool; input formats are its own HPLC csv / Chromeleon exports; interactive integration presumes ISTD) — not pluggable into a headless runner.
- The brief's other example "chromatographics": **no such package exists on PyPI** (searched this run; only chromatopy matches).

**Verdict:** engine = **scipy-based integration core** (detection + windows + reject, per the GC-2 declarative gc-method record) **with pybaselines as the pluggable advanced-baseline backend** (BSD-3-Clause, 2 deps already in the pinned venv). Timed ON/OFF, width and area/height reject are thin declarative rules over scipy — no new library needed. Deconvolution: unsupported by all screened candidates → out of scope for GC-1; NV if ever required.

## (e) .M parsing verdict

**No full .M parsing is truly needed for GC-1. Default stands: opaque preservation + scientist-entered method data.**
- Readable today (UTF-16LE key-value, zero-risk line parser): `INFO.MTH`, `RECALIB.MTH`, `ACQ.TXT`, `IQ1.MTH` (keys parseable; **semantics vendor-undocumented** → record as imported key-values, scientist-annotated; do NOT invent meaning).
- Opaque (binary or unknown code page): `I7673.MTH`, `INJECTOR.MTH`, `DAMETHOD.REG`, `ACQRES.REG`, `SINGLE.B`, `rpthead.txt`. Preserve bytes; no parsing attempted beyond magic-number identification.
- Only one extraction is worth doing now and is cheap/high-confidence: **method name from ACQ.TXT** ("AOAC_FAME_NO_INJECTION.M") → feeds the GC-3 method-ref field. All of the above can be revisited at GC-2 (gc-method import) with the same data.

## (f) Comparison tolerances + representative trace sizes (GC-10 perf budget)

**Numerical comparison tolerances (for GC-10 overlay/compare):**
- **Peak RT matching:** tolerance **≤ 0.02 min (1.2 s)** — two independent decoders already agree within 0.01 min at 20–50 Hz; 0.02 min leaves 2× headroom while staying well under one sample gap (0.00033–0.00083 min).
- **Height agreement:** **≤ 5%** between integration results (decoders themselves agree < 0.02%; different integration algorithms legitimately differ more); display to 4 decimal places in minutes is sufficient.
- **Area agreement:** **≤ 10%** between integration engines (baseline-estimation dependent; state per-peak, never average).
- **Per-point trace comparison:** **|Δ| ≤ max(1%, 5 pA)** — baseline noise floor measured at median|Δ| ≈ 0.05–0.15 pA, so 5 pA ≈ 30–50× noise; 1% covers detector scale differences.
- **Saturated peaks (e.g. KERRY main peak):** excluded from area comparison until re-injected/attenuated; compare RT and plateau top only. Flag `saturated: true` when the peak is flat-topped (≥ N consecutive points within 0.5% of max, N ≥ 10 samples).

**Representative trace sizes (measured from the 12-run corpus):**
| File | bytes | n points | run length | rate | float64 decode size |
|---|---|---|---|---|---|
| RES35077-4.D (smallest) | 75,846 B | 28,812 | 9.6 min | 50 Hz | 461 KB |
| 20201023-KERRYGOLD.D | 108,806 B | 48,757 | 40.6 min | 20 Hz | 780 KB |
| 20201024-RESTEK-60-WEGMANS.D (largest) | 155,016 B | 72,801 | 60.7 min | 20 Hz | 1,165 KB |
| RES35077-5.D | 123,686 B | 52,216 | 43.5 min | 20 Hz | 835 KB |

Budget guidance for GC-10: full-res decode ≤ 73k points / ~1.2 MB per trace; render at **≤ 4–8k points per trace (visual decimation allowed by the task; analysis stays full-res)**; test the Compare overlay at **4 traces × 72,801 full-res points + decimated render** as the worst case.

## Assumptions
- **AS-L1T1935-GC1-1** — v181 .CH header layout (body page u32BE@264 1-based; version b[326]=3 + "1\x008\x00"; t0/t1 f32BE@282/286 in minutes, linear; scale/intercept f64BE@4724/4724+8; double-difference int16 body; 4-slot absolute escapes) is reverse-engineered, triple-cross-validated, and NOT confirmed against vendor documentation.
- **AS-L1T1935-GC1-2** — escape absolute level = slot1(i16)*2^32 + u32BE(slots 2–3); KERRY's slot1=1 on 400/858 escapes (others 0) treated as the high word; tag≠0 variant's meaning unverified.
- **AS-L1T1935-GC1-3** — signal units are pA; scale 1.302083401242271e-4 pA/count identical on all 4 files checked (fixed instrument config); the .CH header's "units" field is read as pA by decoder A.
- **AS-L1T1935-GC1-4** — ACQ.M = acquisition-method snapshot (incl. ACQ.TXT), DA.M = data-analysis-method snapshot; inferred from names + contents (identical file sets/sizes).
- **AS-L1T1935-GC1-5** — the broad "peak" lists on RES5/KERRY are local maxima over unresolved/saturated envelopes; NOT vendor-integrated peak identities.
- **AS-L1T1935-GC1-6** — screenshot RT cross-check unavailable (vision disabled on my endpoint); two-decoder route used instead, per the task's explicit allowance.
- **AS-L1T1935-GC1-7** — ACQUIRING.TXT was present at claim time and is absent now; treated as "all .D complete", but the in-progress marker rule stays in force for future runs.

## Files touched
- `/home/brad/.hermes/cl/lanes/1/gc-1-report-l1t1730-r2.md` — this report (new)
- worktree `.hermes/plans/2026-10-26_GC-1-gc-feasibility-spike-report-r2.md` — committed copy (new; ONLY worktree change)
- `/tmp/gc1-decC.py`, `/tmp/gc1-decD.py`, `/tmp/gc1-decD.json`, `/tmp/gc1-decA-rerun-r2.log` — r2 throwaway scripts/output (new)
- `/tmp/gc1-pyb-real.bin` — gunzip of prior-run /tmp/gc1-pyb.whl (new; read-only derivation)
- Prior-run artifacts verified in place: /tmp/gc1-decA.py, /tmp/gc1-decA.json, /tmp/gc1-decB.py, /tmp/gc1-decB.json, /tmp/gc1-pyb.whl, /tmp/gc1-venv-prove/ (unmodified)
- NAS: read-only (FID1A.CH ×5 files, method dirs, RUN.LOG, SAMPLE.XML/MAC.bak, header bytes) — zero writes. No product code touched.

## Unresolved / handoff notes
1. KERRY escape tag≠0 variant (400/858) — needs vendor confirmation or a larger corpus sample before production parser freeze.
2. Saturated-peak flagging rule (N points within 0.5% of max) is a proposal for GC-2/GC-10, not yet a lint rule.
3. Screenshot reference route: orchestrator may vision-check the ChemStation screenshots from a vision-capable model to close the last independent-reference gap; the two-decoder tolerances above are self-sufficient for GC-2 design either way.


---
**Errata pointer (GC-6 promotion fold, 2026-10-26):** where the decode PROSE above conflicts with the promoted decoders (slot endianness :35, t0/t_end /60000 divisor, accumulator width), the DECODER CODE is normative — durable canonical copy: `.hermes/plans/scripts/gc1-decD.py`; corrected reading pinned in the GC-6 spec §D2.
