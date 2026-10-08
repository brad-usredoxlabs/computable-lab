#!/usr/bin/env node
/**
 * Backfill promoted-protocol titles from their linked vendor-pdf.
 *
 * Promoted protocols (CAN-protocol-*) inherit the extractor's generic draft
 * title ("Quick Reference", "June 2023", "Untitled") when the source
 * vendor-pdf has a good title. This one-off script fixes existing records:
 * for each `protocol` whose title matches the generic set, it resolves
 * `source.ref.id` (type vendor-pdf), loads that record's title, and PUTs the
 * protocol with `{ ...payload, title: <vendor pdf title> }`.
 *
 * SAFETY: reads only unless `--apply` is passed. With --apply it writes via
 * the record PUT API (keeps the index consistent — never hand-edit the YAML).
 *
 * Usage:
 *   node scripts/backfill-protocol-titles.mjs --base http://localhost:3001/api
 *   node scripts/backfill-protocol-titles.mjs --base http://localhost:3001/api --apply
 *
 * Env:
 *   - CL_ADMIN_USER_ID (default USR-LOCAL-ADMIN) — x-user-id header the script
 *     sends so the server resolves a local user (required for mutation).
 */

const GENERIC = /^(quick reference|untitled|unsigned|protocol steps not detected|june \d{4})$/i;

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith('--base='))?.split('=')[1] ?? 'http://localhost:3001/api').replace(/\/$/, '');
const apply = args.includes('--apply');
const adminUserId = process.env.CL_ADMIN_USER_ID ?? 'USR-LOCAL-ADMIN';

async function getJson(path) {
  const res = await fetch(`${base}${path}`, {
    headers: { 'x-user-id': adminUserId, 'content-type': 'application/json' },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

// GET /records/:id returns `{ record: { recordId, schemaId, payload, meta } }`.
function envelopeOf(json) {
  return json?.record ?? json;
}

async function putJson(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'PUT',
    headers: { 'x-user-id': adminUserId, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PUT ${path} -> ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return { ok: true, raw: text }; }
}

function genericTitle(payload) {
  const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
  return title && GENERIC.test(title) ? title : null;
}

function sourceVendorPdfId(payload) {
  const ref = payload?.source?.ref;
  if (ref && ref.kind === 'record' && ref.type === 'vendor-pdf' && typeof ref.id === 'string') return ref.id;
  return null;
}

async function main() {
  const { records } = await getJson('/records?kind=protocol&limit=1000');
  const candidates = records.filter((r) => genericTitle(r.payload));

  console.log(`Found ${records.length} protocol records; ${candidates.length} have a generic title.\n`);

  const changes = [];
  for (const rec of candidates) {
    const vpdfId = sourceVendorPdfId(rec.payload);
    if (!vpdfId) {
      console.log(`SKIP ${rec.recordId} -> no source.ref {type:vendor-pdf}`);
      continue;
    }
    let vpdf;
    try {
      vpdf = envelopeOf(await getJson(`/records/${encodeURIComponent(vpdfId)}`));
    } catch (err) {
      console.log(`SKIP ${rec.recordId} -> source ${vpdfId} unreadable: ${err.message}`);
      continue;
    }
    const newTitle = typeof vpdf.payload?.title === 'string' && vpdf.payload.title.trim()
      ? vpdf.payload.title.trim()
      : null;
    if (!newTitle) {
      console.log(`SKIP ${rec.recordId} -> source ${vpdfId} has no title`);
      continue;
    }
    if (newTitle === rec.payload.title) {
      console.log(`OK   ${rec.recordId} -> already "${newTitle}"`);
      continue;
    }
    changes.push({
      recordId: rec.recordId,
      sourceId: vpdfId,
      oldTitle: rec.payload.title,
      newTitle,
    });
  }

  console.log(`\n--- ${changes.length} record(s) will change ---`);
  for (const c of changes) {
    console.log(`  ${c.recordId}`);
    console.log(`    old: ${c.oldTitle}`);
    console.log(`    new: ${c.newTitle}`);
    console.log(`    src: ${c.sourceId}`);
  }

  if (!apply) {
    console.log('\nDry run — nothing written. Pass --apply to mutate.');
    return;
  }
  if (changes.length === 0) {
    console.log('\nNothing to apply.');
    return;
  }

  console.log('\n--- applying (title only; shortSlug left untouched to avoid a filename rename) ---');
  for (const c of changes) {
    const env = envelopeOf(await getJson(`/records/${encodeURIComponent(c.recordId)}`));
    const nextPayload = { ...env.payload, title: c.newTitle };
    try {
      await putJson(`/records/${encodeURIComponent(c.recordId)}`, {
        payload: nextPayload,
        message: `backfill-protocol-titles: "${c.oldTitle}" -> "${c.newTitle}" (source ${c.sourceId})`,
      });
      console.log(`  UPDATED ${c.recordId}`);
    } catch (err) {
      console.error(`  FAILED ${c.recordId}: ${err.message}`);
    }
  }
  console.log('\nDone.');
  console.log('Verify: GET /records?kind=protocol shows the vendor-pdf titles.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});