def run(ctx):
    """Filter the predictions table: keep rows whose predicted value exceeds a
    `threshold` parameter. Downstream step (the "search / sort / filter" leg)."""
    rows = ctx.input("predictions").read_rows()
    threshold = float(ctx.parameters["threshold"])
    kept = [r for r in rows if float(r["pred"]) > threshold]
    kept.sort(key=lambda r: float(r["pred"]))  # sort ascending
    ctx.publish("filtered", kept, kind="table")
    ctx.view("filtered", "table", artifact="filtered")
    ctx.metric("kept_count", len(kept))