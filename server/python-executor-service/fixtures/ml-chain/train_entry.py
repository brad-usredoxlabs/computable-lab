def run(ctx):
    """Train a simple least-squares linear model y = slope*x + intercept.

    Uses only the standard library (no sklearn/pytorch dependency) so the fixture
    runs in any Python env. Reads a features CSV (x,y columns), fits y = a*x + b,
    and emits the model coefficients as a pickled dict via publish_file.
    """
    import pickle

    rows = ctx.input("features").read_rows()
    xs = [float(r["x"]) for r in rows]
    ys = [float(r["y"]) for r in rows]
    if len(xs) < 2:
        raise ValueError("need at least 2 points to fit a line")

    n = len(xs)
    sx = sum(xs)
    sy = sum(ys)
    sxx = sum(x * x for x in xs)
    sxy = sum(x * y for x, y in zip(xs, ys))
    slope = (n * sxy - sx * sy) / (n * sxx - sx * sx)
    intercept = (sy - slope * sx) / n

    # emit a portable model (dict of coefficients) as a file artifact
    with open("model.pkl", "wb") as f:
        f.write(pickle.dumps({"slope": slope, "intercept": intercept}))

    ctx.publish_file("model", "model.pkl", kind="model", format="pkl")
    ctx.publish("model_summary", [{"slope": slope, "intercept": intercept}], kind="table")
    ctx.metric("slope", slope)