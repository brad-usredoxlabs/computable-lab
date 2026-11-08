// probe.slots.cjs — RED pin for answerAllSlots slot-kind classification.
// Stubs page/locator/count; no Playwright or app required.
//
// Shapes A–E: measured marker tables (advc c1 §4.1)
//   A — LIVE (no request.slot): picker + quantity
//   B — deck/CARD-1 (slot='material'): label+picker + quantity
//   C — wells (slot='targetWells'): label + well-target
//   D — options: numbered-option buttons only
//   E — typed-parameter: parameter-answer input
//   F — grouped identity: two slots, each with its own top-3 row, both wanting
//       the same value. Pins slot scoping of pickTop3: a page-wide fallback
//       answers slot1 with slot0's row (M3 mutation, D-6).
//   G — grouped identity: top-3 rows exist but never match, each slot's own
//       numbered-option list does. Pins slot scoping of pickNumberedOption:
//       a page-wide fallback answers slot1 with slot0's option (D-2).
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
  logOptions: '.chat-log-clarification-options li button',
  param:    '[data-testid="parameter-answer"]',
  paramInput:    '[data-testid="parameter-answer-input"]',
  paramSubmit:   '[data-testid="parameter-answer-submit"]',
}

let _answerMap = {}
function mkEl(key, si, text) {
  return {
    count: async () => 1, click: async () => { PICKS.push({ key, si, text: text || Object.values(_answerMap)[0] || 'match' }) }, fill: async () => {},
    isEnabled: async () => true,
    innerText: async () => text || Object.values(_answerMap)[0] || 'match',
    nth: () => mkEl(key, si, text), first: () => mkEl(key, si, text), locator: () => stubList([]),
  }
}
// Every element carries its own text so a fixture can make slot0's row match a
// value that belongs to slot1 — the discriminator for page-wide fallbacks.
const PICKS = []
function stubList(els) {
  return { count: async () => els.length, nth: (i) => els[i] || mkEl('x', -1), first: () => els[0] || mkEl('x', -1) }
}

function buildPage(slotTables, answerMap) {
  _answerMap = answerMap
  PICKS.length = 0
  const slotEls = slotTables.map((st, si) => ({
    locator: (sel) => {
      const key = Object.keys(MARKERS).find((k) => MARKERS[k] === sel)
      const c = (st.markers && st.markers[key]) || 0
      const texts = (st.texts && st.texts[key]) || []
      return stubList(Array.from({ length: c }, (_, j) => mkEl(key, si, texts[j])))
    },
  }))
  function pageAgg(key) {
    return stubList(slotTables.map((st, si) => {
      const c = (st.markers && st.markers[key]) || 0
      if (!c) return null
      const texts = (st.texts && st.texts[key]) || []
      return mkEl(key, si, texts[0])
    }).filter(Boolean))
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
  // M3 pin (D-6): two grouped identity slots, each with its OWN top-3 row, and
  // both want the value "Clofibrate". Slot-scoped code picks slot_i's row for
  // slot_i; a page-wide fallback picks slot0's row for BOTH. Must stay RED if
  // pickTop3's scope is un-threaded.
  { name: 'F-IDENT-SCOPE',
    slots: [
      { markers: { top3: 1 }, texts: { top3: ['Clofibrate (slot0)'] }, kind: 'identity' },
      { markers: { top3: 1 }, texts: { top3: ['Clofibrate (slot1)'] }, kind: 'identity' },
    ],
    answerMap: { identity: 'Clofibrate' },
    expectPicked: ['Clofibrate (slot0)', 'Clofibrate (slot1)'],
  },
  // D-2 pin: top-3 rows are present (so the slot classifies as identity) but
  // never match, leaving pickNumberedOption as the fallback that actually
  // answers. Slot-scoped code picks slot_i's own option; a page-wide fallback
  // picks slot0's option for BOTH. Must stay RED if pickNumberedOption's scope
  // is un-threaded.
  { name: 'G-OPTION-SCOPE',
    slots: [
      { markers: { top3: 1, logOptions: 1 }, texts: { top3: ['(no top-3 match)'], logOptions: ['Clofibrate (slot0)'] }, kind: 'identity' },
      { markers: { top3: 1, logOptions: 1 }, texts: { top3: ['(no top-3 match)'], logOptions: ['Clofibrate (slot1)'] }, kind: 'identity' },
    ],
    answerMap: { identity: 'Clofibrate' },
    expectPicked: ['Clofibrate (slot0)', 'Clofibrate (slot1)'],
  },
]

async function run() {
  let fail = 0
  for (const shape of SHAPES) {
    try {
      const results = await chrome.answerAllSlots(buildPage(shape.slots, shape.answerMap), shape.answerMap)
      const got = results.map((r) => 'slot' + r.index + ':' + r.kind)
      const exp = shape.slots.map((s, i) => 'slot' + i + ':' + s.kind)
      const okKinds = got.length === exp.length && got.every((k, i) => k === exp[i])
      const want = shape.expectPicked
      const okPicks = !want || (results.length === want.length && results.every((r, i) => r.picked === want[i]))
      if (okKinds && okPicks) {
        console.log('PASS ' + shape.name + ': ' + got.join(', ') + (want ? ' picked=' + results.map((r) => r.picked).join('|') : ''))
      } else if (!okKinds) { fail++; console.log('FAIL ' + shape.name + ': expected [' + exp.join(', ') + '] got [' + got.join(', ') + ']') }
      else { fail++; console.log('FAIL ' + shape.name + ': picked [' + results.map((r) => r.picked || '-').join('|') + '] expected [' + want.join('|') + ']') }
    } catch (err) { fail++; console.log('FAIL ' + shape.name + ': ' + err.message) }
  }
  if (fail) { console.log('\n' + fail + ' shape(s) failed'); process.exit(1) }
  console.log('\nAll shapes passed')
}
run().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(1) })
