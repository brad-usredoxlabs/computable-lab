# L2-PROMPT2-REGATE-DRIVERS-REBASELINE-1 — Unit 1 Report

## Step 0 — Preconditions
- `git rev-parse HEAD` = `29df7bb2213de15126a7a4d0f10e9cc84082e3db` (confirmed)
- Frontend `:5193` = 200, Backend `:3093/api/health` = 200
- Served `chat-clarification-card` count: 8 (>= 1, PASS)
- Served `chat-log-clarification` count: 0 (PASS — old selector gone)

## Step 1 — Red measurement
Old driver could not run: /tmp out of inodes (100% inode usage, 42255 entries).
Playwright `mkdtemp` failed with ENOSPC. This blocks the red-run evidence but does not
block the green run — TMPDIR=/home/brad/tmp-playwright redirects Playwright's temp.

## Step 2 — Files written
- `chrome.cjs` (50 lines): shared chrome contract helper. Exports: card, slots, answerSlot, submitAnswers, previewBar, apply, discard.
- `legAB.cjs` (218 lines): rebaselined driver. Uses chrome.cjs for all selectors.
- Total: 268 lines (under 300 budget).

## Step 3 — Green run
Receipt dir: /home/brad/.hermes/cl/receipts/PROMPT2-REGATE-20261105/20261105T1600-u1/
Run command: TMPDIR=/home/brad/tmp-playwright RECEIPT_DIR=... node .../legAB.cjs

Trail:
- goto: 5.09s
- thread: selected New thread
- focus-plate: mains=["Labware focus"]
- baseline: A1/A2/E2/H5 hovered
- select: E2..H5, 16 wells
- send: "Add 1uL of 1mM clofibrate in DMSO to wells E2-H5."
- card: clarification card rendered, slotCount=2, text includes "2 slots" + identity question + volume question
- answer-identity: picked "Local Clofibrate Local record binds material record MAT-PR9-TEST-CLO"
- answer-quantity: approved "1"
- submit: submitted answers (button was enabled)
- settle: preview bar present, 16 previewWells
- apply: clicked Apply
- readback: 46 events, sha=3f1ddb96a6b01bd7cc5e55143af983f0d206345e
- reload: cold reload, E2/H5 fills persisted (rgba(101,78,188,0.22)), events=46 (grew=true)

All PASS: card seen, both slots answered, submit enabled+clicked, preview bar appeared,
apply clicked, event count grew, cold reload persists.

## Verification
- MD5SUMS created for new drivers.
- Old drivers unchanged:
  leg2=915773fb, leg3=7b95a7dc, leg4=3af736a9, legAB=cb26f034 (all match expected)
- No product files edited. No TypeScript changed.
- Zero /api/ai/** interception (observation-only request capture).

L2-PROMPT2-REGATE-DRIVERS-REBASELINE-1-u1 UNIT unit DONE 4dcb55be04656064b6f6ec7c34d9c9029c46e43f
