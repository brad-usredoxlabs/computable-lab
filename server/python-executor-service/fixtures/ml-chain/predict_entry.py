def run(ctx):
    """Load the model artifact (pickled dict) and predict y = slope*x + intercept
    for a set of new x values. Consumes the model as an input that is an
    analysis-output-artifact from the training run (chaining)."""
    import pickle

    model = pickle.loads(ctx.input("model").file_bytes())
    slope = model["slope"]
    intercept = model["intercept"]

    preds = ctx.input("new_x").read_rows()
    out = [
        {"x": float(r["x"]), "pred": slope * float(r["x"]) + intercept}
        for r in preds
    ]
    ctx.publish("predictions", out, kind="table")
    ctx.view("predictions", "table", artifact="predictions")