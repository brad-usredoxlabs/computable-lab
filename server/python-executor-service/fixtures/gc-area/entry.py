def run(ctx):
    """Integrate a GC trace under a user-specified window.

    Returns the peak area (sum of intensities inside the window) + a table and
    view. Endpoint/baseline conventions are stated here explicitly (spec §8):
    this is top-hat integration with NO baseline subtraction and NO boundary
    interpolation. Method notes must disclose these choices.
    """
    trace = ctx.input("trace").read_signal()
    x = trace["axis"]
    y = trace["values"]

    if not x or not y:
        raise ValueError("Trace must have at least one point.")
    if not (len(x) == len(y)):
        raise ValueError("Trace axis and values must be same length.")

    low, high = ctx.parameters["window"]
    chosen = [(xx, yy) for xx, yy in zip(x, y) if low <= xx <= high]
    if not chosen:
        raise ValueError("Select an interval containing at least one point.")

    area = sum(yy for _, yy in chosen)

    ctx.publish(
        "peak_results",
        [{"start": low, "end": high, "area": area}],
        kind="table",
        units={"start": "min", "end": "min", "area": "a.u.*min"},
    )
    ctx.metric("total_area", area, unit="a.u.*min", label="Area under window")
    ctx.view("results", "table", artifact="peak_results")