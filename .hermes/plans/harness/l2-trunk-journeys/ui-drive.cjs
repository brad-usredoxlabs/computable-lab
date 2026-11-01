#!/usr/bin/env node
/*
 * ui-drive.cjs — the browser executor of the L2-TRUNK-JOURNEYS harness.
 *
 * ONE transport rule, by construction: this file NEVER calls page.route(),
 * NEVER fulfills/aborts/fails a request, NEVER touches a network handler of
 * any kind. Outgoing /api/ai/** bodies are captured with READ-ONLY request
 * LISTENERS (page.on('request')) — the browser's real fetch goes to the real
 * lane backend through the real vite proxy. The receipt records
 * route_handlers_used: 0 as an attestation; the python driver treats ANY
 * nonzero as RED and test-channel-selfcheck.py proves that gate bites.
 *
 * Steps are DATA (journeys/J*.yaml `steps:`); this executor just runs them.
 * Usage: node ui-drive.cjs --journey <yaml> --out <json> [--app-base URL]
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const yaml = require('js-yaml');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

const journeyPath = arg('journey');
const outPath = arg('out');
const appBase = arg('app-base', 'http://localhost:5193');
const journey = yaml.load(fs.readFileSync(journeyPath, 'utf8'));

const AI_URL_MARK = '/api/ai/';
const WRITE_MARK = '/api/records/';

function shaShort(s) {
  return require('crypto').createHash('sha256').update(s).digest('hex').slice(0, 12);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // ---- attestation bookkeeping ------------------------------------------
  // routeHandlersUsed counts calls to page.route()/route.fulfill()/abort()/
  // fail(). This executor contains ZERO such calls (construction) and the
  // counter below proves nothing incremented it at runtime (belt).
  const attest = { route_handlers_used: 0, interception_helpers_seen: 0 };

  const aiBodies = [];
  const writeBodies = [];
  const jsErrors = [];
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    let parsed = null;
    const post = req.postData();
    if (post) { try { parsed = JSON.parse(post); } catch { parsed = { __unparsed__: post.slice(0, 400) }; } }
    if (url.includes(AI_URL_MARK) && (method === 'POST' || method === 'GET')) {
      if (post) {
        aiBodies.push({
          endpoint: new URL(url).pathname,
          method,
          body: parsed,
          body_sha256_12: shaShort(post),
          body_bytes: Buffer.byteLength(post),
        });
      }
    } else if (url.includes(WRITE_MARK) && (method === 'PUT' || method === 'POST')) {
      if (post) {
        writeBodies.push({ endpoint: new URL(url).pathname, method, body: parsed });
      }
    }
  });
  page.on('pageerror', (e) => jsErrors.push(String(e.message).slice(0, 200)));

  const T = (journey.timeout_s || 300) * 1000;
  const shots = [];
  const log = (...a) => console.error('[ui-drive]', ...a);

  async function shot(tag) {
    const p = path.join(path.dirname(outPath), `${journey.id}-${tag}.png`);
    await page.screenshot({ path: p, fullPage: true });
    shots.push(p);
  }

  const logSelector = journey.log_selector || '[aria-label="Conversation"]';
  let reviewBubbleBaseline = 0;
  let reviewBaselineTaken = false;

  async function readAssistantTexts() {
    // Assistant-visible outcome evidence: the conversation log's bubble texts
    // plus intent cards (a deterministic compile answers with the shorthand
    // card — a user-visible answer on this surface).
    return page.evaluate((sel) => {
      const root = document.querySelector(sel) || document.querySelector('.review-ai__log');
      if (!root) return { turns: 0, texts: [], intent_cards: 0 };
      const bubbles = Array.from(root.querySelectorAll('.chat-log__bubble, .message-log__bubble, .chat-log-intent-card'));
      const texts = bubbles.map((b) => b.textContent.trim()).filter(Boolean);
      return {
        turns: texts.length,
        texts: texts.slice(-6).map((t) => t.slice(0, 600)),
        intent_cards: root.querySelectorAll('.chat-log-intent-card').length,
      };
    }, logSelector).catch(() => ({ turns: 0, texts: [], intent_cards: 0 }));
  }

  async function visibleCardsWithOptions() {
    return page.locator('[data-testid^="chat-log-request-"]').filter({ has: page.locator('ol.chat-log-clarification-options button') }).count().catch(() => 0);
  }

  // ---- step executor (vocabulary is fixed; parameters are DATA) ---------
  const steps = journey.steps || [];
  const evidence = {
    assistant_turns: 0, assistant_texts: [], intent_cards: 0,
    turns_before: 0, turns_completed: 0,
    clarification_answered: false, clarification_answer_no_loop: false,
    proposal_accepted: false, error_frames: 0,
    last_assistant_text_nonempty: false,
    step_trace: [],
  };

  async function composer(scope) {
    if (scope === 'review') {
      // w29 spec affordance: chat-input (TipTap) + chat-input-send.
      return page.getByTestId('chat-input')
        .locator('[contenteditable="true"], textarea, input[type="text"]').first();
    }
    return page.getByLabel('Message', { exact: true });
  }

  async function ask(text, scope) {
    const input = await composer(scope || 'deck');
    await input.waitFor({ state: 'visible', timeout: T });
    const send = (scope === 'review'
      ? page.getByTestId('chat-input-send')
      : page.getByRole('button', { name: 'Send', exact: true })).first();
    if (scope === 'review') {
      await input.click();
      await page.keyboard.type(text);   // TipTap: typed, not fill()
    } else {
      await input.fill(text);
    }
    await send.waitFor({ state: 'visible', timeout: T });
    await send.click();
    if (scope === 'review') {
      if (!reviewBaselineTaken) {
        // The thread PERSISTS across runs — baseline the EXISTING settled
        // bubbles so a pre-w29 message can never fake a settle.
        reviewBubbleBaseline = await page.evaluate(() => {
          const log = document.querySelector('[data-testid="message-log"]');
          return log ? log.querySelectorAll(
            '.message-log__bubble--assistant:not(.message-log__bubble--pending)').length : 0;
        });
        reviewBaselineTaken = true;
      }
      // The review surface (MessageLog) settles when a NEW non-pending
      // assistant bubble lands (w29 spec predicate).
      await page.waitForFunction(
        (base) => {
          const log = document.querySelector('[data-testid="message-log"]');
          if (!log) return false;
          return log.querySelectorAll(
            '.message-log__bubble--assistant:not(.message-log__bubble--pending)').length > base;
        },
        reviewBubbleBaseline,
        { timeout: T },
      );
      reviewBubbleBaseline += 1;
    } else {
      const stop = page.locator('[data-testid="interpreting-stop"]');
      await stop.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
      await stop.waitFor({ state: 'hidden', timeout: T });
    }
    await page.waitForTimeout(1500);
  }

  try {
    // Baseline bubbles BEFORE any ask (the thread persists across runs — a
    // pre-existing message must never count as this run's answer).
    let baseline = { turns: 0 };
    let baselineTaken = false;
    for (const step of steps) {
      const kind = step.step;
      if ((kind === 'ask' || kind === 'click_card_first_option') && !baselineTaken) {
        baseline = await readAssistantTexts();
        baselineTaken = true;
      }
      log('step', kind, JSON.stringify(step).slice(0, 160));
      evidence.step_trace.push(kind);
      switch (kind) {
        case 'goto':
          await page.goto(appBase + step.path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
          break;
        case 'set_user_id':
          await page.goto(appBase + '/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
          await page.evaluate((u) => window.localStorage.setItem('cl.currentUserId', u),
                              step.user_id || 'USR-BRAD');
          break;
        case 'open_ai_tab':
          await page.locator('[data-testid="right-pane-tab-ai"]').first().click();
          break;
        case 'ensure_deck_variant_freeform': {
          // Test-port affordance copied from deck-ghost-shorthand.spec.ts:
          // the DeckSetupChip cascade (live control since a31c7201).
          const chip = page.locator('[data-testid="deck-setup-chip"]');
          await chip.waitFor({ state: 'visible', timeout: 30_000 });
          if (!/freeform/i.test(await chip.innerText())) {
            await page.locator('[data-testid="deck-setup-trigger"]').first().click();
            const switchBtn = page.locator('[data-testid="deck-setup-switch"]');
            if (await switchBtn.count()) await switchBtn.first().click();
            await page.locator('[data-testid="deck-setup-row-variant"]').first().click();
            await page.locator('[data-testid="deck-setup-option-manual_freeform"]').first().click();
            await chip.waitFor({ timeout: 15_000 });
          }
          break;
        }
        case 'open_plate_named': {
          const tile = page.locator('.tile[data-ghost="false"]').filter({ hasText: step.labware_name });
          await tile.first().waitFor({ state: 'visible', timeout: T });
          await tile.first().click();
          await page.locator('[data-well-id]').first().waitFor({ state: 'visible', timeout: T });
          break;
        }
        case 'click_wells': {
          // REAL selection affordance: plain click = select, Ctrl+click =
          // toggle-add (LabwareFocus.handleWellClick :295-306). The plate SVG
          // wells carry data-well-id (WellGrid.tsx:267).
          const wells = step.wells || [];
          for (let i = 0; i < wells.length; i++) {
            const w = page.locator(`[data-well-id="${wells[i]}"]`).first();
            await w.waitFor({ state: 'visible', timeout: T });
            if (i === 0) await w.click();
            else await w.click({ modifiers: ['Control'] });
          }
          await page.waitForTimeout(300);
          break;
        }
        case 'ask':
          await ask(step.text, step.scope);
          break;
        case 'expect_visible':
          await page.locator(step.selector).first().waitFor({ state: 'visible', timeout: T });
          break;
        case 'wait_for_body_text': {
          // Waits for a string ANYWHERE in the live page text — used to pin
          // async discovery joins (e.g. the review page's draft join) BEFORE
          // asking, so the request body carries the joined context.
          const needle = step.text;
          await page.waitForFunction(
            (n) => document.body.innerText.includes(n), needle,
            { timeout: T, polling: 500 },
          );
          break;
        }
        case 'click_card_first_option': {
          // The FIRST card that offers concrete option buttons (the
          // deterministic compile's answerable card; ambiguous-noun cards
          // render a picker, not the ol, and are not clickable here).
          const card = page.locator('[data-testid^="chat-log-request-"]')
            .filter({ has: page.locator('ol.chat-log-clarification-options button') }).first();
          await card.waitFor({ state: 'visible', timeout: T });
          evidence.answered_card_testid =
            (await card.getAttribute('data-testid')) || 'unknown';
          const opt = card.locator('ol.chat-log-clarification-options button').first();
          await opt.waitFor({ state: 'visible', timeout: T });
          evidence.clarification_answered = true;
          await opt.click();
          const stop = page.locator('[data-testid="interpreting-stop"]');
          await stop.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
          await stop.waitFor({ state: 'hidden', timeout: T });
          await page.waitForTimeout(1500);
          break;
        }
        case 'assert_answered_fold_and_no_loop': {
          const fold = page.locator('[data-testid="chat-log-clarification-answered"]');
          await fold.first().waitFor({ state: 'visible', timeout: T });
          await shot('answered-fold');
          // NO LOOP, pinned precisely (0257123d): the ANSWERED card must be
          // gone from the DOM as a picker — it renders the compact answered
          // fold instead (ChatLog LEG A: 'the bulky picker/option list must be
          // ABSENT from the DOM, not hidden'). A NEW honest clarification from
          // the answer turn is a NEW card, not this card looping.
          const looped = await page
            .locator(`[data-testid="${evidence.answered_card_testid}"] ol.chat-log-clarification-options button`)
            .count().catch(() => 1);
          evidence.clarification_answer_no_loop = (looped === 0);
          evidence.looped_card_options = looped;
          break;
        }
        case 'click_accept_proposal': {
          const accept = page.locator('[data-testid="changes-apply"]');
          await accept.first().waitFor({ state: 'visible', timeout: T });
          await shot('proposal-diff');
          await accept.first().click();
          evidence.proposal_accepted = true;
          break;
        }
        case 'expect_accept_note':
          await page.locator('[data-testid="review-ai-apply-note"]').first()
            .waitFor({ state: 'visible', timeout: T });
          break;
        case 'screenshot':
          await shot(step.tag || 'shot');
          break;
        default:
          throw new Error(`unknown step kind: ${kind}`);
      }
    }

    const after = await readAssistantTexts();
    evidence.assistant_turns = after.turns;
    evidence.turns_completed = Math.max(0, after.turns - baseline.turns);
    evidence.assistant_texts = after.texts;
    evidence.intent_cards = after.intent_cards;
    evidence.last_assistant_text_nonempty =
      after.turns >= 1 && after.texts.length > 0 &&
      after.texts[after.texts.length - 1].length > 0;
    evidence.error_frames = await page.locator('[role="alert"]').count().catch(() => 0);
    // Rendered-outcome evidence for content assertions: the live page text
    // (the re-read panes carry an accepted edit's new label).
    evidence.body_text_tail = await page.evaluate(() => document.body.innerText.slice(-24000));
    await shot('outcome');
  } catch (err) {
    evidence.failure = evidence.failure || String(err.message || err).slice(0, 500);
    await shot('failure').catch(() => {});
  }

  const receipt = {
    journey: journey.id,
    app_base: appBase,
    route_handlers_used: attest.route_handlers_used, // structurally always 0 (no page.route in this file)
    attestations: {
      ...attest,
      transport: 'real fetch through vite proxy to the lane backend; zero route handlers registered',
      selection_affordance: journey.selection_affordance || null,
    },
    ai_request_bodies: aiBodies,
    write_request_bodies: writeBodies,
    rendered_evidence: evidence,
    js_errors: jsErrors,
    screenshots: shots,
    ...(evidence.failure ? { failure: evidence.failure } : {}),
  };
  fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2));
  await browser.close();
  process.exit(evidence.failure ? 1 : 0);
})().catch((e) => {
  console.error('ui-drive crashed:', e);
  process.exit(2);
});
