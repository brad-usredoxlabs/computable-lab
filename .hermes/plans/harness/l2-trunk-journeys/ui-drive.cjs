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

  // ---- attestation bookkeeping ------------------------------------------
  // D1 fix + N4 (prototype-identity snapshot): the counter is REAL, not a
  // literal. The route-registration APIs are wrapped on the live objects
  // BEFORE any other code can run — context.route / context.routeFromHAR /
  // setRequestInterception first (before newPage), then page.route /
  // page.routeFromHAR. What the tripwires ACTUALLY catch (stated honestly,
  // N4 comment-honesty — the pre-N4 wording here overstated it):
  //   * a call that goes THROUGH the wrapped own property on either receiver
  //     (any registration placed after the wrap lands, incl. before page
  //     creation) -> route_handlers_used increments;
  //   * a prototype-chain detour that DELETES the own-property wrapper and
  //     then calls the ORIGINAL resolved off the prototype -> the counter
  //     MISSES it (the original never runs our code), BUT the identity
  //     snapshot below re-checks at receipt time that every resolved method
  //     is still OUR recorded wrapper, so route_api_wrapped flips false and
  //     the python driver grades the journey RED (run-journeys.py
  //     attestation_violations). The snapshot bites the DELETE variant ONLY.
  // Residual gaps, named: (d) the ITEM-CITED no-delete shape —
  // `Object.getPrototypeOf(context).route.call(...)` with the own wrapper
  // left INTACT — is an UNDETECTABLE residual for this tripwire: the own
  // property still resolves to our wrapper, so `recv[meth] === _wrappers[key]`
  // stays true and route_api_wrapped stays TRUE while the ORIGINAL runs
  // (counter 0). No property/identity inspection from node can see that
  // class; the construction ban (ui-drive never CALLS route APIs) + the
  // real-transport ai_request_bodies receipt are the defense for it. The
  // self-check pins this limitation (route_api_wrapped must stay true for
  // the no-delete shape) so the overclaim cannot silently return.
  // (a) the identity check compares against the
  // WRAPPER IDENTITY, not just the _clInterceptionProbe marker, so a forged
  // marker on a foreign function also fails the check; (b) nothing here can
  // catch interception performed OUTSIDE these objects (CDP-level
  // Fetch.enable from injected page code is not observable from node);
  // (c) the snapshot grades at receipt WRITE time — a wrapper restored to
  // ours between the detour and the write hides the counter miss only if
  // the detour also left route_handlers_used consistent, which a real
  // handler cannot do (the handler itself was registered off-protocol).
  const attest = { route_handlers_used: 0, intercepted_paths: [] };
  // N4: the recorded wrapper identities + the live receivers they must still
  // resolve to at receipt time (own property gone => prototype lookup => the
  // ORIGINAL => identity mismatch => route_api_wrapped false).
  const _wrappers = {};
  const _liveReceivers = { context: null, page: null };
  _liveReceivers.context = context;
  const countRoute = (label, target) => {
    for (const meth of ['route', 'routeFromHAR']) {
      const orig = target[meth];
      if (typeof orig !== 'function') continue;
      const wrapper = function (...a) {
        attest.route_handlers_used += 1;
        attest.intercepted_paths.push(label + '.' + meth + ':' + String(a[0]));
        return orig.apply(this, a);
      };
      wrapper._clInterceptionProbe = true;
      target[meth] = wrapper;
      _wrappers[label + '.' + meth] = wrapper;
    }
  };
  // We do not call any of these — we only wrap them so an injected handler
  // is impossible to hide.
  countRoute('context', context);
  if (typeof context.setRequestInterception === 'function') {
    const origSRI = context.setRequestInterception;
    const sriWrapper = function (...a) {
      attest.route_handlers_used += 1;
      attest.intercepted_paths.push('context.setRequestInterception:' + JSON.stringify(a));
      return origSRI.apply(this, a);
    };
    sriWrapper._clInterceptionProbe = true;
    context.setRequestInterception = sriWrapper;
    _wrappers['context.setRequestInterception'] = sriWrapper;
  }
  const page = await context.newPage();
  _liveReceivers.page = page;
  countRoute('page', page);
  // N4 identity snapshot: true ONLY while EVERY wrapped key still resolves
  // (own property first, prototype chain as fallback) to its recorded
  // wrapper. Evaluated at wrap time AND re-evaluated at receipt write time.
  const routeApiWrappedNow = () => {
    for (const key of Object.keys(_wrappers)) {
      const dot = key.indexOf('.');
      const label = key.slice(0, dot);
      const meth = key.slice(dot + 1);
      const recv = _liveReceivers[label];
      if (!recv || recv[meth] !== _wrappers[key]) return false;
    }
    return Object.keys(_wrappers).length > 0;
  };
  attest.route_api_wrapped = routeApiWrappedNow();

  const aiBodies = [];
  const writeBodies = [];
  const jsErrors = [];
  // D3: every clarification request the assistant ANNOUNCES on the wire
  // (threads POST assistant metadata.clarification), with the epoch ms of
  // capture — the driver uses this to detect a RE-ASK: an announcement whose
  // prompt equals an answered request's prompt, captured AFTER that answer.
  const clarificationAnnouncements = [];
  const answerEvents = [];
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    let parsed = null;
    const post = req.postData();
    if (post) { try { parsed = JSON.parse(post); } catch { parsed = { __unparsed__: post.slice(0, 400) }; } }
    const cl = parsed && parsed.message && parsed.message.role === 'assistant'
      && parsed.message.metadata && parsed.message.metadata.clarification;
    if (cl) {
      clarificationAnnouncements.push({
        id: cl.id || null, prompt: cl.prompt || null, query: cl.query || null,
        intentId: (parsed.message.metadata.shorthand || '')
          .match(/intentId:\s*(\S+)/)?.[1] || null,
        captured_at_ms: Date.now(),
      });
    }
    if (url.includes(AI_URL_MARK) && (method === 'POST' || method === 'GET')) {
      if (post && Array.isArray(parsed && parsed.clarificationAnswers)) {
        answerEvents.push({
          requestIds: parsed.clarificationAnswers.map((a) => a && a.requestId).filter(Boolean),
          captured_at_ms: Date.now(),
        });
      }
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
        evidence.turns_before = baseline.turns;  // D7: real baseline, not a dead 0
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
        case 'new_thread':
          // D3 determinism: the deck chat thread PERSISTS across runs (the
          // thread list carried yesterday's unanswered cards into this run,
          // so click_card_first_option could answer a STALE card). Use the
          // product's own affordance — the composer's "New thread" button —
          // to start the journey on a clean thread.
          await page.getByRole('button', { name: 'New thread', exact: true })
            .first().click();
          await page.waitForTimeout(800);
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
          // D3: the card's QUESTION prompt. The client testid suffix is a
          // per-render id, NOT the announced clarification id, and the card
          // innerText leads with the option list — so recover the question
          // from the announcements captured SO FAR whose prompt text rides
          // inside the card's own text. Fall back to the raw card text.
          const cardText = ((await card.innerText().catch(() => '')) || '').trim();
          const annForCard = clarificationAnnouncements.filter(
            (a) => a.prompt && cardText.includes(a.prompt.trim()));
          evidence.answered_prompt = annForCard.length
            ? annForCard[annForCard.length - 1].prompt.trim()
            : cardText.slice(0, 300);
          evidence.answered_card_text_150 = cardText.slice(0, 150);
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
          // D3 (spec J2): the answer turn must be a USER-VISIBLE ANSWER with
          // the SAME intentId, and must not RE-ASK the answered question.
          // Capture the intent cards' intentIds (first pre-answer turn vs the
          // answer turn) for the driver to grade.
          evidence.intent_ids = await page.evaluate((sel) => {
            const root = document.querySelector(sel);
            if (!root) return [];
            return Array.from(root.querySelectorAll('.chat-log-intent-card'))
              .map((c) => (c.textContent.match(/intentId:\s*(\S+)/) || [])[1] || null);
          }, logSelector).catch(() => []);
          // The answered request's identity (testid suffix = clarification id).
          evidence.answered_request_id =
            String(evidence.answered_card_testid).replace(/^chat-log-request-/, '');
          // D3 re-ask, DOM arm: any OTHER clarification card still offering
          // option buttons whose text repeats the ANSWERED prompt — a fresh
          // card re-asking the same question is the loop the old assertion
          // could not see (0257123d reviewer evidence).
          if (evidence.answered_prompt) {
            const key = evidence.answered_prompt.slice(0, 80);
            evidence.reask_new_cards = await page.evaluate(({ sel, ansId, k }) => {
              const cards = Array.from(
                document.querySelectorAll('[data-testid^="chat-log-request-"]'));
              return cards.filter((c) =>
                c.getAttribute('data-testid') !== ('chat-log-request-' + ansId) &&
                c.querySelector('ol.chat-log-clarification-options button') &&
                (c.textContent || '').includes(k)).length;
            }, { sel: logSelector, ansId: evidence.answered_request_id, k: key })
              .catch(() => 0);
          } else {
            evidence.reask_new_cards = 0;
          }
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
    // D1: real runtime counter — incremented by the route/routeFromHAR/
    // setRequestInterception wrappers installed above. Any injected
    // interception handler lands here nonzero; route_api_wrapped proves the
    // instrumentation was live in this exact process.
    route_handlers_used: attest.route_handlers_used,
    attestations: {
      // N4: re-evaluate the identity snapshot AT RECEIPT WRITE TIME — a
      // prototype-chain detour (own wrapper deleted, original called off
      // the prototype) makes the resolved method != the recorded wrapper,
      // flipping route_api_wrapped false even though the counter missed.
      ...(attest, { route_api_wrapped: routeApiWrappedNow() }),
      transport: 'real fetch through vite proxy to the lane backend; zero route handlers registered',
      selection_affordance: journey.selection_affordance || null,
    },
    ai_request_bodies: aiBodies,
    write_request_bodies: writeBodies,
    clarification_announcements: clarificationAnnouncements,
    answer_events: answerEvents,
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
