# GC Area — headless reproducibility fixture

A minimal reproducibility bundle for the analysis surface (spec §13, A03/A15).

## Contents

- `entry.py` — the analysis method (`run(ctx)`): top-hat integration of a trace
  under a user-specified `window` parameter. NO baseline subtraction, NO
  boundary interpolation (disclosed in method notes). Publishes `peak_results`
  (table) + `total_area` (metric) + a `results` view.
- `trace.csv` — the input signal (time, intensity).

## Known results

| window      | area |
|-------------|------|
| [0.5, 2.5]  | 18.0 |
| [1.0, 2.0]  | 14.0 |

## Headless replay (no React app)

```bash
cd fixtures/gc-area
python3 -m computable_lab_analysis run entry.py \
  --inputs '{"trace": {"dataKind": "signal", "path": "trace.csv"}}' \
  --parameters '{"window": [0.5, 2.5]}'
```

Run the reproducibility test suite:

```bash
PYTHONPATH=src python3 -m unittest tests.test_headless_repro -v
```

The trace + entry, replayed exactly as above, reproduce the known areas within
9 decimal places from a fresh Python interpreter (A03) and without any
application service (A15).