# Model Lifecycle — chained analysis fixture

Proves the full model workflow the analysis surface now supports, end-to-end
through the real `AnalysisRunner` (storage persistence + chaining), using only
the Python standard library (no sklearn/pytorch dependency).

## The workflow

1. **Train** (`train_entry.py`): reads `features` (x,y rows), fits
   `y = slope*x + intercept` by least squares, and **emits the model** as a
   pickled dict via `ctx.publish_file('model', 'model.pkl', kind='model')`.
   The runner persists the bytes to a storage device + mints a `data-reference`
   (never git).
2. **Predict** (`predict_entry.py`): consumes the **model artifact from the
   training run** (an `analysis-output-artifact` input) via
   `ctx.input('model').file_bytes()`, plus new x values, and publishes a
   `predictions` table.
3. **Filter** (`filter_entry.py`): a downstream step that consumes the
   **predictions artifact** (another `analysis-output-artifact` input), keeps
   rows above a `threshold` parameter, sorts them, and publishes `filtered`.

Each step is an immutable `analysis-revision` + `analysis-run`; chaining is by
explicit artifact refs (A06 "use result downstream").

## Fixture data

- `train_data.csv`: x,y rows (exactly `y = 2x + 1`).
- `new_x.csv`: x = [10, 20, 30].

## Known results

| step   | output        | value                                    |
|--------|---------------|------------------------------------------|
| train  | model.pkl     | `{slope: 2.0, intercept: 1.0}` (pickled) |
| predict| predictions   | [{x:10,pred:21},{x:20,pred:41},{x:30,pred:61}] |
| filter | filtered      | pred>40 sorted → [{x:20,pred:41},{x:30,pred:61}] |

## Run it

Covered by `server/src/analysis/modelLifecycle.test.ts` (integration, exercises
the real `AnalysisRunner` + a temp `local-mount` storage device):

```bash
cd server && npx vitest run src/analysis/modelLifecycle.test.ts
```

The fixture scripts also run headless through the SDK CLI if you supply
`--inputs`/`--parameters` JSON and provisioned files.