// probe.slots.cjs — RED pin for answerAllSlots slot-kind classification.
// Tests against measured marker tables (review §4.1), NOT invented markers.
// Stubs page/locator/count; no Playwright or app required.
//
// Shapes A–E match the five answer-surface types the card renders:
//   A — LIVE (chat-path, no request.slot): picker + quantity
//   B — deck/CARD-1 (request.slot='material'): label+picker + quantity
//   C — wells (request.slot='targetWells'): label + well-target
//   D — options: numbered-option buttons only
//   E — typed-parameter: parameter-answer input
//
// At d9ca461e (base), shape A MUST throw "unrecognized kind" on slot 0.

const chrome = require('./chrome.cjs')

// ── stub page factory ──────────────────────────────────────────
// Each shape provides slotTables: array of { markers: { markerName: count } }
// Markers are keyed by their selector names (simplified keys).
// We also pass the answerMap so stubs know what search value to match.

const MARKERS = {
  identity: '[data-testid="chat-clarification-slot-identity"]',
  search:   '[data-testid="clarification-identity-search"]',
  top3:     '[data-testid="clarification-top3-row"]',
  chip:     '[data-testid="clarify-assumed-chip"]',
  value:    '[data-testid="clarify-assumed-value"]',
  approve:  '[data-testid="clarify-assumed-approve"]',
  target:   '[data-testid="clarify-well-target"]',
  targetApprove: '[data-testid="clarify-well-target-approve"]',
  options:  '.chat-clarification-card__options li button',
  param:    '[data-testid="parameter-answer"]',
  paramInput:    '[data-testid="parameter-answer-input"]',
  paramSubmit:   '[data-testid="parameter-answer-submit"]',
  popover:  '[data-testid="clarification-popover"] [role="option"], [data-testid="clarification-popover"] li, [data-testid="clarification-popover"] button',
  numOpts:  '.chat-log-clarification-options li button',
  submit:   '[data-testid="chat-clarification-submit"]',
}

function stubPage(slotTables, answerMap) {
  const slotList = []
  for (let si = 0; si < slotTables.length; si++) {
    const st = slotTables[si]
    const slotObj = {
      locator: (sel) => {
        const key = Object.keys(MARKERS).find((k) => MARKERS[k] === sel)
        const c = (st.markers && st.markers[key]) || 0
        return stubList(Array.from({ length: c }, () => stubEl(c, key, si, answerMap)))
      },
    }
    slotList.push(slotObj)
  }

  return {
    locator: (sel) => {
      // card
      if (sel === '[data-testid="chat-clarification-card"]') return stubList([{}])
      // slots
      if (sel === '[data-testid="chat-clarification-slot"]') return stubList(slotList)
      // page-wide selectors — aggregate across slots
      if (sel === '[data-testid="clarification-identity-search"]')
        return stubList(aggSlots(slotList, 'search'))
      if (sel === '[data-testid="clarification-top3-row"]')
        return stubList(aggSlots(slotList, 'top3'))
      if (sel === '[data-testid="clarify-assumed-value"]')
        return stubList(aggSlots(slotList, 'value'))
      if (sel === '[data-testid="clarify-assumed-approve"]')
        return stubList(aggSlots(slotList, 'approve'))
      if (sel === '[data-testid="clarify-well-target"]')
        return stubList(aggSlots(slotList, 'target'))
      if (sel === '[data-testid="clarify-well-target-approve"]')
        return stubList(aggSlots(slotList, 'targetApprove'))
      if (sel === '[data-testid="clarification-popover"] [role="option"], [data-testid="clarification-popover"] li, [data-testid="clarification-popover"] button')
        return stubList([stubPopEl(answerMap)])
      if (sel === '.chat-log-clarification-options li button')
        return stubList([])
      if (sel === '[data-testid="chat-clarification-submit"]')
        return stubList([stubSubmitEl()])
      if (sel === '[data-testid="parameter-answer"]')
        return stubList(aggSlots(slotList, 'param'))
      if (sel === '[data-testid="parameter-answer-input"]')
        return stubList(aggSlots(slotList, 'paramInput'))
      if (sel === '[data-testid="parameter-answer-submit"]')
        return stubList(aggSlots(slotList, 'paramSubmit'))
      // default: empty
      return stubList([])
    },
    waitForTimeout: async () => {},
  }
}

function aggSlots(slotList, key) {
  const hits = []
  slotList.forEach((s, i) => {
    const m = s.locator(MARKERS[key])
    // We need to count — but m is our stubList, just check markers
    if ((slotList[i].locator(MARKERS[key]) || {}).count) {} // side effect already handled
  })
  // Build from markers directly
  return slotList.map((s, i) => {
    const m = s._markers || (slotTables_ && slotTables_[i] && slotTables_[i].markers) || {}
    return m[key] ? stubEl(1, key, i, answerMap_) : null
  }).filter(Boolean)
}

// Simpler approach: build stubs directly from marker data
let slotTables_ = [], answerMap_
function buildPage(slotTables, answerMap) {
  slotTables_ = slotTables
  answerMap_ = answerMap

  const slotElements = slotTables.map((st, si) => ({
    locator: (sel) => {
      const key = Object.keys(MARKERS).find((k) => MARKERS[k] === sel)
      const c = (st.markers && st.markers[key]) || 0
      return stubList(Array.from({ length: c }, () => mkEl(key, si)))
    },
  }))

  // page-level aggregates
  function pageAgg(key) {
    const els = []
    slotTables.forEach((st, si) => {
      if (st.markers && st.markers[key]) els.push(mkEl(key, si))
    })
    return stubList(els)
  }

  return {
    locator: (sel) => {
      if (sel === '[data-testid="chat-clarification-card"]') return stubList([{}])
      if (sel === '[data-testid="chat-clarification-slot"]') return stubList(slotElements)
      // Popover is a page-wide portal — always available when picker exists
      if (sel === '[data-testid="clarification-popover"] [role="option"], [data-testid="clarification-popover"] li, [data-testid="clarification-popover"] button')
        return stubList([stubPopEl()])
      const key = Object.keys(MARKERS).find((k) => MARKERS[k] === sel)
      if (key) return pageAgg(key)
      return stubList([])
    },
    waitForTimeout: async () => {},
  }
}

function stubList(els) {
  return {
    count: async () => els.length,
    nth: (i) => els[i] || mkEl('_empty', -1),
    first: () => els[0] || mkEl('_empty', -1),
  }
}

function mkEl(key, si) {
  return {
    count: async () => 1,
    click: async () => {},
    fill: async (v) => {},
    isEnabled: async () => true,
    innerText: async () => {
      // Return the search value so matching works
      if (answerMap_ && typeof answerMap_ === 'object') {
        const keys = Object.keys(answerMap_)
        if (keys.length > 0) return answerMap_[keys[0]] || 'match'
      }
      return 'match'
    },
    nth: () => mkEl(key, si),
    first: () => mkEl(key, si),
    locator: () => stubList([]),
  }
}

function stubPopEl(map) {
  return {
    count: async () => 1,
    click: async () => {},
    innerText: async () => 'Clofibrate',
    nth: () => stubPopEl(map),
    first: () => stubPopEl(map),
  }
}

function stubSubmitEl() {
  return {
    count: async () => 1,
    isEnabled: async () => true,
    click: async () => {},
    first: () => stubSubmitEl(),
  }
}

// ── shapes (measured tables from review §4.1) ──────────────────
const SHAPES = [
  {
    name: 'A-LIVE',
    slots: [
      { markers: { search: 1 }, kind: 'identity' },
      { markers: { chip: 1, value: 1, approve: 1 }, kind: 'quantity' },
    ],
    answerMap: { identity: 'Clofibrate', quantity: '1' },
  },
  {
    name: 'B-CARD1',
    slots: [
      { markers: { identity: 1, search: 1 }, kind: 'identity' },
      { markers: { chip: 1, value: 1, approve: 1 }, kind: 'quantity' },
    ],
    answerMap: { identity: 'Clofibrate', quantity: '1' },
  },
  {
    name: 'C-WELLS',
    slots: [
      { markers: { identity: 1, target: 1, targetApprove: 1 }, kind: 'wells' },
    ],
    answerMap: { wells: 'A1:H12' },
  },
  {
    name: 'D-OPTIONS',
    slots: [
      { markers: { options: 2 }, kind: 'option' },
    ],
    answerMap: { option: 'Material A' },
  },
  {
    name: 'E-PARAMETER',
    slots: [
      { markers: { param: 1, paramInput: 1, paramSubmit: 1 }, kind: 'parameter' },
    ],
    answerMap: { parameter: '10 µL' },
  },
]

// ── run ─────────────────────────────────────────────────────────
async function run() {
  let failures = 0
  for (const shape of SHAPES) {
    const page = buildPage(shape.slots, shape.answerMap)
    try {
      const results = await chrome.answerAllSlots(page, shape.answerMap)
      const kinds = results.map((r) => `slot${r.index}:${r.kind}`)
      const expected = shape.slots.map((s, i) => `slot${i}:${s.kind}`)
      const ok = kinds.length === expected.length && kinds.every((k, i) => k === expected[i])
      if (!ok) {
        failures++
        console.log(`FAIL ${shape.name}: expected [${expected.join(', ')}] got [${kinds.join(', ')}]`)
      } else {
        console.log(`PASS ${shape.name}: ${kinds.join(', ')}`)
      }
    } catch (err) {
      failures++
      console.log(`FAIL ${shape.name}: ${err.message}`)
    }
  }
  if (failures > 0) { console.log(`\n${failures} shape(s) failed`); process.exit(1) }
  console.log('\nAll shapes passed')
}

run().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(1) })
