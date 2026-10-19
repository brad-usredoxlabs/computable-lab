#!/usr/bin/env node
/**
 * W211-MACH-1 golden harness — the REPLAY PRODUCER (transport-only).
 *
 * WHAT THIS IS: the frozen wire responses of the natural-language producer,
 * served at the producer's OWN wire boundary — the OpenAI-compatible
 * POST /v1/chat/completions the product's InferenceClient calls
 * (server/src/ai/InferenceClient.ts:146). It is the ONLY non-production
 * component in the golden leg. It interprets nothing, binds nothing, resolves
 * nothing: it reads the frozen blocks out of zymo-intent.frozen.yaml and
 * answers with them verbatim. Everything downstream (Ajv parse, normalize,
 * resolve_nouns, the SPINE-3 engine, clarification rendering, answer binding,
 * mint, persistence, recompile, deck review, accept, LPR) runs unchanged in
 * the product server.
 *
 * REQUEST-TYPE DISCRIMINATION (spec PRODUCER REPLACEMENT §): the handler makes
 * exactly two producer calls per round-trip — the branch-questions extraction
 * (intentCompile.ts:460, tools[0] = emit_branch_questions) and the answered
 * scientist-intent draw (intentCompile.ts:244, tools[0] = emit_scientist_intent).
 * Discrimination keys on the REQUEST BODY's own content: the declared tool name
 * in `tools[]` (the wire-format identity of the call), with a documented
 * fallback on the system-message content when no tools are declared (the
 * compileFromSmallLlm plain-text retry arm, intentCompile.ts:296-320 — never
 * reached when the frozen tool-call parses). No fixture noun, label, or
 * obligation name is matched anywhere in this file.
 *
 * EVIDENCE: every served request is appended to the request log named by
 * W211_REPLAY_LOG. The golden leg reads that log back and asserts the producer
 * WAS replaced at its wire boundary (the harness's own process, not the
 * product's). That log is the wiring proof the stack's ai profile points here.
 *
 * RUN FORM (harness-owned ephemeral port; never a product port):
 *   node app/e2e/fixtures/w211-golden/replay-producer.mjs            # default :43117
 *   W211_REPLAY_PORT=43117 W211_REPLAY_LOG=<path> node .../replay-producer.mjs
 */
import { createServer } from 'node:http'
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = process.env.W211_FIXTURE_PATH ?? join(HERE, 'zymo-intent.frozen.yaml')
const PORT = Number(process.env.W211_REPLAY_PORT ?? 43117)
const LOG_PATH = process.env.W211_REPLAY_LOG ?? null

const fixture = parseYaml(readFileSync(FIXTURE_PATH, 'utf-8'))
const branchQuestionsArgs = JSON.stringify(fixture.branchQuestionsOutput ?? { axes: [] })
const intentArgs = JSON.stringify(fixture.modelOutput)
// The plain-text retry arm (intentCompile.ts:296-320) needs the SAME document
// as YAML text. Built from the SAME frozen block (never a second source), so
// both arms agree byte-for-byte on content.
const intentYamlText = stringifyYaml(fixture.modelOutput ?? {})

const sha = (s) => createHash('sha256').update(s).digest('hex')

function logRecord(record) {
  if (!LOG_PATH) return
  mkdirSync(dirname(LOG_PATH), { recursive: true })
  appendFileSync(LOG_PATH, JSON.stringify(record) + '\n')
}

/**
 * Request-type discrimination — request-body content only.
 * 'branch-questions' | 'intent-draw-tool' | 'intent-draw-plaintext' | 'unknown'
 */
function classify(body) {
  const tools = Array.isArray(body?.tools) ? body.tools : []
  const names = tools.map((t) => t?.function?.name).filter((n) => typeof n === 'string')
  if (names.includes('emit_branch_questions')) return 'branch-questions'
  if (names.includes('emit_scientist_intent')) return 'intent-draw-tool'
  // No declared tool: the compile's plain-text retry arm. The system message
  // names which producer asked (the two system prompts are distinct product
  // text: intentCompile.ts:64 vs :444) — read generically, never a noun table.
  const system = (body?.messages ?? [])
    .filter((m) => m?.role === 'system')
    .map((m) => String(m?.content ?? ''))
    .join('\n')
  if (/emit_branch_questions|protocol localizer/i.test(system)) return 'branch-questions'
  if (/scientist-intent/i.test(system)) return 'intent-draw-plaintext'
  return 'unknown'
}

function toolCall(name, argsJson) {
  return {
    choices: [{
      message: {
        content: null,
        tool_calls: [{ id: `call_${sha(argsJson).slice(0, 8)}`, type: 'function', function: { name, arguments: argsJson } }],
      },
      finish_reason: 'tool_calls',
    }],
  }
}

function plainText(text) {
  return { choices: [{ message: { content: text, tool_calls: null }, finish_reason: 'stop' }] }
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/replay-health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, fixture: fixture.fixtureId ?? null, version: fixture.version ?? null }))
    return
  }
  if (req.method !== 'POST' || !String(req.url).endsWith('/chat/completions')) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not_found' }))
    return
  }
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) } catch { /* fall through */ }
    const kind = classify(body)
    let payload
    if (kind === 'branch-questions') payload = toolCall('emit_branch_questions', branchQuestionsArgs)
    else if (kind === 'intent-draw-tool') payload = toolCall('emit_scientist_intent', intentArgs)
    else if (kind === 'intent-draw-plaintext') payload = plainText(intentYamlText)
    else {
      logRecord({ ts: new Date().toISOString(), kind: 'unknown', status: 400 })
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unclassifiable_producer_request' }))
      return
    }
    const text = JSON.stringify(payload)
    logRecord({
      ts: new Date().toISOString(),
      kind,
      model: body?.model ?? null,
      responseSha: sha(text),
      messages: (body?.messages ?? []).length,
    })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(text)
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[w211-replay] serving frozen producer responses on http://127.0.0.1:${PORT}/v1/chat/completions (fixture ${fixture.fixtureId ?? '?'} v${fixture.version ?? '?'}, intent sha ${sha(intentArgs).slice(0, 12)})`)
})
