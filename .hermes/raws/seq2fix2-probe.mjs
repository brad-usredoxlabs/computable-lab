// SEQ2FIX2 LIVE probe (coder-side, NOT the gate): drive /api/ai/assist/stream
// surface=sequences through the REAL thread mechanism on the probe backend
// (:3096, this worktree's code, lane-2 data store). Cap: 2 sends.
// Leg A: empty history + tab request. Leg B: history primed with a prior
// sequence_action proposal turn + the same tab request.
const BASE = 'http://127.0.0.1:3096';

async function shaPair() {
  const out = {};
  for (const id of ['SEQ-827c4175a52a4ef65916eca5', 'ANR-000001']) {
    const res = await fetch(`${BASE}/api/records/${id}`);
    const j = await res.json().catch(() => ({}));
    out[id] = { status: res.status, contentSha: j?.meta?.contentSha ?? j?.record?.meta?.contentSha ?? null, raw: JSON.stringify(j).slice(0, 120) };
  }
  return out;
}

async function send(label, body) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/ai/assist/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const events = text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6));
  const parsed = events.map((e) => { try { return JSON.parse(e); } catch { return { raw: e }; } });
  const types = parsed.map((p) => p.type);
  const statuses = parsed.filter((p) => p.type === 'status').map((p) => p.message);
  const agentActions = parsed.filter((p) => p.type === 'agent_action').map((p) => p.action);
  const diagnostics = parsed.filter((p) => p.type === 'pipeline_diagnostics').flatMap((p) => p.diagnostics ?? []);
  const done = parsed.find((p) => p.type === 'done');
  console.log(`\n=== ${label} (http ${res.status}, ${Date.now() - t0}ms, ${parsed.length} events) ===`);
  console.log('event types:', types.join(','));
  console.log('statuses:');
  for (const s of statuses) console.log('  -', s);
  console.log('agent_action frames:', JSON.stringify(agentActions));
  console.log('diagnostics:', JSON.stringify(diagnostics.map((d) => ({ code: d.code, message: d.message }))));
  console.log('done result:', JSON.stringify({ success: done?.result?.success, notes: done?.result?.notes, sequenceProposal: done?.result?.sequenceProposal ? { operation: done.result.sequenceProposal.operation } : null, error: done?.result?.error ?? null }));
}

const context = {
  labwares: [],
  eventSummary: 'No events yet.',
  vocabPackId: 'general',
  availableVerbs: [],
  records: [
    { id: 'SEQ-827c4175a52a4ef65916eca5', kind: 'sequence', label: 'pUC19 probe' },
    { id: 'ANR-000001', kind: 'analysis-run', label: 'PB-CH-5 review revision' },
  ],
};

console.log('SHA BEFORE:', JSON.stringify(await shaPair(), null, 1));

await send('LEG A: empty history, tab request', {
  prompt: 'switch to the Analysis tab',
  surface: 'sequences',
  context,
});

await send('LEG B: proposal-heavy history, same tab request', {
  prompt: 'switch to the Analysis tab',
  surface: 'sequences',
  context,
  history: [
    { role: 'user', content: 'save this sequence GGATGCCATAG' },
    { role: 'assistant', content: 'Proposal ready for review in the sequence workspace.' },
    { role: 'user', content: 'make it a probe with a 5 prime tail' },
    { role: 'assistant', content: 'Proposal ready for review in the sequence workspace.' },
  ],
});

console.log('\nSHA AFTER:', JSON.stringify(await shaPair(), null, 1));
