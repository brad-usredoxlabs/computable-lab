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

// ── marker selector map ────────────────────────────────────────
const MARKER_SELECTOR = {
  identity: '[data-testid="chat-clarification-slot-identity"]',
  search:   '[data-testid="clarification-identity-search"]',
  chip:     '[data-testid="clarify-assumed-chip"]',
  value:    '[data-testid="clarify-assumed-value"]',
  approve:  '[data-testid="clarify-assumed-approve"]',
  target:   '[data-testid="clarify-well-target"]',
  targetApprove: '[data-testid="clarify-well-target-approve"]',
  options:  '.chat-clarification-card__options li button',
  param:    '[data-testid="parameter-answer"]',
  paramInput:    '[data-testid="parameter-answer-input"]',
  paramSubmit:   '[data-testid="parameter-answer-submit"]',
  top3:     '[data-testid="clarification-top3-row"]',
  popover:  '[data-testid="clarification-popover"] [role="option"], [data-testid="clarification-popover"] li, [data-testid="clarification-popover"] button',
  numOptions: '.chat-log-clarification-options li button',
}

// ── stub factory ───────────────────────────────────────────────
function stubPage(slotTables) {
  // Build slot array — each slot knows its markers
  const slotList = slotTables.map((st, idx) => ({
    _index: idx,
    _markers: st.markers,
    locator: (sel) => {
      const name = Object.entries(MARKER_SELECTOR).find(([, s]) => s === sel)?.[0]
      const count = (st.markers && st.markers[name]) || 0
      return {
        count: async () => count,
        nth: () => stubElement(count, name, idx),
        first: () => stubElement(count, name, idx),
      }
    },
  }))

  return {
    locator: (sel) => {
      // card-level selectors
      if (sel === '[data-testid="chat-clarification-card"]')
        return stubList([stubCardElement()])
      if (sel === '[data-testid="chat-clarification-slot"]')
        return stubList(slotList)
      // page-wide selectors used by answerSlot
      if (sel === '[data-testid="clarification-identity-search"]') {
        // Return all search inputs across slots
        const hits = slotList.map((s, i) =>
          s._markers.search ? stubElement(1, 'search', i) : null
        ).filter(Boolean)
        return stubList(hits.length > 0 ? hits : [stubElement(0)])
      }
      if (sel === '[data-testid="clarification-popover"] [role="option"], [data-testid="clarification-popover"] li, [data-testid="clarification-popover"] button')
        return stubList([stubPopElement()])
      if (sel === '[data-testid="clarify-assumed-value"]') {
        const hits = slotList.map((s, i) =>
          s._markers.value ? stubElement(1, 'value', i) : null
        ).filter(Boolean)
        return stubList(hits.length > 0 ? hits : [stubElement(0)])
      }
      if (sel === '[data-testid="clarify-assumed-approve"]') {
        const hits = slotList.map((s, i) =>
          s._markers.approve ? stubElement(1, 'approve', i) : null
        ).filter(Boolean)
        return stubList(hits.length > 0 ? hits : [stubElement(0)])
      }
      if (sel === '[data-testid="clarify-well-target"]') {
        const hits = slotList.map((s, i) =>
          s._markers.target ? stubElement(1, 'target', i) : null
        ).filter(Boolean)
        return stubList(hits.length > 0 ? hits : [stubElement(0)])
      }
      if (sel === '[data-testid="clarify-well-target-approve"]') {
        const hits = slotList.map((s, i) =>
          s._markers.targetApprove ? stubElement(1, 'targetApprove', i) : null
        ).filter(Boolean)
        return stubList(hits.length > 0 ? hits : [stubElement(0)])
      }
      if (sel === '[data-testid="clarification-top3-row"]')
        return stubList([stubTop3Element()])
      if (sel === '.chat-log-clarification-options li button')
        return stubList([])
      if (sel === '[data-testid="chat-clarification-submit"]')
        return stubList([stubSubmitElement()])
      if (sel === '[data-testid="parameter-answer"]') {
        const hits = slotList.map((s, i) =>
          s._markers.param ? stubElement(1, 'param', i) : null
        ).filter(Boolean)
        return stubList(hits.length > 0 ? hits : [stubElement(0)])
      }
      if (sel === '[data-testid="parameter-answer-input"]') {
        const hits = slotList.map((s, i) =>
          s._markers.paramInput ? stubElement(1, 'paramInput', i) : null
        ).filter(Boolean)
        return stubList(hits.length > 0 ? hits : [stubElement(0)])
      }
      // Default: empty
      return stubList([stubElement(0)])
    },
    waitForTimeout: async (ms) => {},
  }
}

function stubList(els) {
  return {
    count: async () => els.length,
    nth: (i) => els[i] || stubElement(0),
    first: () => els[0] || stubElement(0),
  }
}

function stubElement(count, name, slotIdx) {
  return {
    count: async () => count,
    click: async () => ({ clicked: name, slot: slotIdx }),
    fill: async (v) => ({ filled: name, value: v, slot: slotIdx }),
    isEnabled: async () => true,
    innerText: async () => name || '',
    nth: (i) => stubElement(count, name, slotIdx),
    first: () => stubElement(count, name, slotIdx),
    locator: () => stubList([stubElement(0)]),
  }
}

function stubCardElement() {
  return { locator: () => stubList([]) }
}

function stubPopElement() {
  return {
    count: async () => 1,
    click: async () => ({ picked: 'match', via: 'popover' }),
    innerText: async () => 'Clofibrate',
    nth: (i) => stubPopElement(),
    first: () => stubPopElement(),
  }
}

function stubTop3Element() {
  return {
    count: async () => 1,
    click: async () => ({ picked: 'match', via: 'top3-row', rows: 1 }),
    innerText: async () => 'Clofibrate',
    nth: (i) => stubTop3Element(),
    first: () => stubTop3Element(),
  }
}

function stubSubmitElement() {
  return {
    count: async () => 1,
    isEnabled: async () => true,
    click: async () => {},
    first: () => stubSubmitElement(),
  }
}

// ── shapes ──────────────────────────────────────────────────────
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

// ── run ──────────────────────────────────────────────────────────
async function run() {
  let failures = 0
  for (const shape of SHAPES) {
    const page = stubPage(shape.slots)
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
