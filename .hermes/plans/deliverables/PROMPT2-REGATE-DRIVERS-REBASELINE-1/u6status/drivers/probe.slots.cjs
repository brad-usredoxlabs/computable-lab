// probe.slots.cjs — RED pin for answerAllSlots slot-kind classification.
// Stubs page/locator/count; no Playwright or app required.
//
// Shapes A–E: measured marker tables (advc c1 §4.1)
//   A — LIVE (no request.slot): picker + quantity
//   B — deck/CARD-1 (slot='material'): label+picker + quantity
//   C — wells (slot='targetWells'): label + well-target
//   D — options: numbered-option buttons only
//   E — typed-parameter: parameter-answer input
//
// At d9ca461e (base), shape A MUST throw "unrecognized kind".

const chrome = require('./chrome.cjs')

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
}

let _answerMap = {}
function mkEl(key, si) {
  return {
    count: async () => 1, click: async () => {}, fill: async () => {},
    isEnabled: async () => true,
    innerText: async () => (_answerMap ? Object.values(_answerMap)[0] || 'match' : 'match'),
    nth: () => mkEl(key, si), first: () => mkEl(key, si), locator: () => stubList([]),
  }
}
function stubList(els) {
  return { count: async () => els.length, nth: (i) => els[i] || mkEl('x', -1), first: () => els[0] || mkEl('x', -1) }
}

function buildPage(slotTables, answerMap) {
  _answerMap = answerMap
  const slotEls = slotTables.map((st, si) => ({
    locator: (sel) => {
      const key = Object.keys(MARKERS).find((k) => MARKERS[k] === sel)
      const c = (st.markers && st.markers[key]) || 0
      return stubList(Array.from({ length: c }, () => mkEl(key, si)))
    },
  }))
  function pageAgg(key) {
    return stubList(slotTables.map((st, si) => (st.markers && st.markers[key]) ? mkEl(key, si) : null).filter(Boolean))
  }
  return {
    locator: (sel) => {
      if (sel === '[data-testid="chat-clarification-card"]') return stubList([{}])
      if (sel === '[data-testid="chat-clarification-slot"]') return stubList(slotEls)
      if (sel.includes('clarification-popover')) return stubList([mkEl('popover', -1)])
      if (sel === '[data-testid="chat-clarification-submit"]')
        return stubList([{ count: async () => 1, isEnabled: async () => true, click: async () => {}, first: () => this }])
      const key = Object.keys(MARKERS).find((k) => MARKERS[k] === sel)
      if (key) return pageAgg(key)
      return stubList([])
    },
    waitForTimeout: async () => {},
  }
}

const SHAPES = [
  { name: 'A-LIVE',
    slots: [
      { markers: { search: 1 }, kind: 'identity' },
      { markers: { chip: 1, value: 1, approve: 1 }, kind: 'quantity' },
    ],
    answerMap: { identity: 'Clofibrate', quantity: '1' },
  },
  { name: 'B-CARD1',
    slots: [
      { markers: { identity: 1, search: 1 }, kind: 'identity' },
      { markers: { chip: 1, value: 1, approve: 1 }, kind: 'quantity' },
    ],
    answerMap: { identity: 'Clofibrate', quantity: '1' },
  },
  { name: 'C-WELLS',
    slots: [{ markers: { identity: 1, target: 1, targetApprove: 1 }, kind: 'wells' }],
    answerMap: { wells: 'A1:H12' },
  },
  { name: 'D-OPTIONS',
    slots: [{ markers: { options: 2 }, kind: 'option' }],
    answerMap: { option: 'Material A' },
  },
  { name: 'E-PARAMETER',
    slots: [{ markers: { param: 1, paramInput: 1, paramSubmit: 1 }, kind: 'parameter' }],
    answerMap: { parameter: '10 uL' },
  },
]

async function run() {
  let fail = 0
  for (const shape of SHAPES) {
    try {
      const results = await chrome.answerAllSlots(buildPage(shape.slots, shape.answerMap), shape.answerMap)
      const got = results.map((r) => 'slot' + r.index + ':' + r.kind)
      const exp = shape.slots.map((s, i) => 'slot' + i + ':' + s.kind)
      if (got.length === exp.length && got.every((k, i) => k === exp[i])) {
        console.log('PASS ' + shape.name + ': ' + got.join(', '))
      } else { fail++; console.log('FAIL ' + shape.name + ': expected [' + exp.join(', ') + '] got [' + got.join(', ') + ']') }
    } catch (err) { fail++; console.log('FAIL ' + shape.name + ': ' + err.message) }
  }
  if (fail) { console.log('\n' + fail + ' shape(s) failed'); process.exit(1) }
  console.log('\nAll shapes passed')
}
run().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(1) })
