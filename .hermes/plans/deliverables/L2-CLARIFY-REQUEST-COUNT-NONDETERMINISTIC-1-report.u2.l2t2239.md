# L2-CLARIFY-REQUEST-COUNT-NONDETERMINISTIC-1 — Unit 2 Report
<!-- composer l2t2239, measurement unit 2 -->

## Scope
Unit 2: SAME-THREAD continuation arm. Tests whether re-sending the canonical prompt
inside a thread that already contains turn 1's response produces the multi-slot shape
(2 slots) that D-2 observed.

## Anchors
- Trunk: `30a482ce` (cl/integration-2)
- Prompt: `Add 1uL of 1mM clofibrate in DMSO to wells E2-H5.`
- N=8 per arm (acceptance floor)
- Probe: `.hermes/probes/reqcount-nondet-probe.cjs`

## Arm-A Replication (fresh-thread, unchanged from u1)
Every run: fresh browser, fresh thread, single turn.

| Run | clarCount | domArm | slotCount | streamFrames | requestBodySha256 |
|-----|-----------|--------|-----------|-------------|-------------------|
| 1   | 1         | single | -         | 8           | fcab1657...       |
| 2   | 1         | single | -         | 8           | fcab1657...       |
| 3   | 1         | single | -         | 8           | fcab1657...       |
| 4   | 1         | single | -         | 9           | fcab1657...       |
| 5   | 1         | single | -         | 8           | fcab1657...       |
| 6   | 1         | single | -         | 9           | fcab1657...       |
| 7   | 1         | single | -         | 8           | fcab1657...       |
| 8   | 1         | single | -         | 8           | fcab1657...       |

Distribution: `{"1": 8}` — matches u1 baseline exactly (sha fcab165701cdfc50ac9bc3dda83bf204a5fadc2987d15c69c194ef6d45065e5b).

## Arm-B (continuation — same prompt in same thread)
Turn 1 opens the thread with the canonical prompt, turn 2 re-sends the byte-identical
prompt in that same thread.

| Run | T1 clarCount | T2 clarCount | T1 arm | T2 arm | T1 sha (prefix) | T2 sha (prefix) | threadId |
|-----|-------------|-------------|--------|--------|-----------------|-----------------|----------|
| 1   | 1           | 1           | single | single | fcab1657        | 227ff139        | 813f5a7b-... |
| 2   | 1           | 1           | single | single | fcab1657        | bf58308a        | 40deb6ac-... |
| 3   | 1           | 2           | single | card   | fcab1657        | 227ff139        | 3673369e-... |
| 4   | 1           | 1           | single | single | fcab1657        | 227ff139        | db8be045-... |
| 5   | 1           | 2           | single | card   | fcab1657        | 227ff139        | 8c7269a1-... |
| 6   | 1           | 2           | single | card   | fcab1657        | 227ff139        | 8322898f-... |
| 7   | 1           | 0           | single | none   | fcab1657        | bf58308a        | d123212a-... |
| 8   | 1           | 1           | single | single | fcab1657        | bf58308a        | (null)      |

### Turn 2 distribution
`{"0": 1, "1": 4, "2": 3}`

### POST body SHA comparison
- T1 sha is always `fcab1657...` (fresh-thread baseline)
- T2 sha varies: `227ff139...` (5 runs) or `bf58308a...` (3 runs)
- The thread context changes the POST body (the server includes conversation history)

### Same POST body → different outcomes
Runs with identical T2 POST body sha `227ff139...`:
- Run 1: clarCount=1 (single)
- Run 3: clarCount=2 (card)
- Run 4: clarCount=1 (single)
- Run 5: clarCount=2 (card)
- Run 6: clarCount=2 (card)

3 out of 5 runs with the same POST body produced 2 slots. This confirms server-side
nondeterminism: the LLM produces different clarification counts even given identical
request bodies.

## Field-by-field diffs (T1 vs T2)
Every run shows `requestBodySha256` differs (T1 is fcab1657, T2 varies).
Runs 3, 5, 6 additionally differ in:
- `clarCount`: [1, 2]
- `domArm`: ["single", "card"]
- `domSlotCount`: [null, 2]
- `streamRawLength`: T2 is 2–3x larger

Run 7: T2 produced 0 clarification requests (AI resolved the ambiguity after turn 1 context).

## VERDICT
REPRODUCED — 3 of 8 continuation runs produced 2 clarification requests (2 slots).
The multi-turn thread context is the confound u1 identified: the SAME prompt produces
different slot counts when sent as turn 2 in an existing thread versus turn 1 in a
fresh thread.

## Implications for REGATE
The D-2 observation (same prompt → 1 slot on 4 runs, 2 slots on 1) is explained:
the original D-2 test was multi-turn (journey run 2), which included thread context.
The gate must accept both shapes (single and card) for this prompt, or the fix must
address LLM nondeterminism. This is NOT a product code issue in the probe/card — the
nondeterminism originates from the LLM response variance given thread context.

## Files Changed
- `.hermes/probes/reqcount-nondet-probe.cjs` — added `--arm=continuation` mode
- Raw data: `/tmp/reqcount-u2/reqcount.json` (not committed)

L2-CLARIFY-REQUEST-COUNT-NONDETERMINISTIC-1-u2 UNIT unit DONE 302881e49bdb722d1444ee7b9e4ef2381d10dfa7
