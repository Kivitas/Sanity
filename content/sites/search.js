/* Sanity adapter: Google, Bing and DuckDuckGo.
 *
 * 1. Links to Reels, YouTube Shorts, TikToks, posts and stories show the cover
 *    where the result appears (the whole result, not just the link).
 * 2. Explicit searches show the cover instead of results.
 * 3. Explicit results are covered one by one, judged by meaning in context:
 *      - the search text (on the results page),
 *      - each result's title and snippet,
 *      - each picture on the page (Images tab and thumbnails).
 *    The judging uses Chrome's built-in on-device AI (content/ai-bridge.js).
 *    There are no word lists. Nothing is sent over the network, and no verdict
 *    is stored. Verdicts stay in memory for this tab only.
 *
 * If the on-device AI is not installed, Sanity cannot judge, and shows results
 * as usual. Settings says so.
 */
(() => {
  'use strict';
  const S = window.Sanity;

  const SEARCH = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com)$/;
  const RESULTS = '.MjjYud, .g, .b_algo, article, [data-hveid]';
  const TILES = 'a, [data-id], .isv-r, .ivg-i, [data-hveid], .MjjYud, .g, .b_algo, article, li, div';
  const BACK = { label: 'Go back', action: () => { if (history.length > 1) history.back(); else location.assign('https://www.google.com/'); } };
  const COVER = `[${S.attrs.COVER_ATTR}]`;

  const TIMEOUT_MS = 10000;
  const UNAVAILABLE_TTL = 60 * 1000;     // retry later if the AI was not ready
  const UNREADABLE_TTL = 10 * 60 * 1000; // a picture we cannot read
  const MAX_IN_FLIGHT = 2;

  // The query text, only on result pages of the three engines.
  function searchQuery(loc) {
    const ddg = /(^|\.)duckduckgo\.com$/.test(loc.hostname);
    const resultsPage = ddg ? loc.pathname === '/' || loc.pathname.startsWith('/html') : loc.pathname === '/search';
    if (!resultsPage) return '';
    return (new URL(loc.href).searchParams.get('q') || '').trim();
  }

  /* ------------------------------ Verdicts (memory only) ------------------------------ */

  const verdicts = new Map(); // key -> { v, at }
  const waiting = new Map();  // key -> [callbacks]
  const replies = new Map();  // request id -> { key, resolve, timer }
  const queue = [];
  let active = 0;
  let seq = 0;

  function fresh(key) {
    const hit = verdicts.get(key);
    if (!hit) return undefined;
    const ttl = hit.v === 'unavailable' ? UNAVAILABLE_TTL : hit.v === 'unreadable' ? UNREADABLE_TTL : Infinity;
    if (Date.now() - hit.at > ttl) { verdicts.delete(key); return undefined; }
    return hit.v;
  }

  function remember(key, v) {
    if (verdicts.size > 400) verdicts.clear();
    verdicts.set(key, { v, at: Date.now() });
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__sanity !== 'answer') return;
    const req = replies.get(e.data.id);
    if (!req) return;
    replies.delete(e.data.id);
    clearTimeout(req.timer);
    req.resolve(e.data.result === 'yes' || e.data.result === 'no' ? e.data.result : 'unavailable');
  });

  function askBridge(payload) {
    return new Promise((resolve) => {
      const id = ++seq;
      const timer = setTimeout(() => { replies.delete(id); resolve('unavailable'); }, TIMEOUT_MS);
      replies.set(id, { resolve, timer });
      window.postMessage({ __sanity: 'ask', id, ...payload }, '*');
    });
  }

  function pump() {
    while (active < MAX_IN_FLIGHT && queue.length) {
      const job = queue.shift();
      active++;
      job().finally(() => { active--; pump(); });
    }
  }

  // Ask once per key. onDone(verdict) always runs, so a pending page is never stuck.
  function judge(key, payload, onDone) {
    const known = fresh(key);
    if (known !== undefined) { onDone(known); return; }
    if (waiting.has(key)) { waiting.get(key).push(onDone); return; }
    waiting.set(key, [onDone]);
    queue.push(async () => {
      let verdict;
      try {
        verdict = payload.image ? await readableVerdict(payload) : await askBridge(payload);
      } catch (e) {
        verdict = 'unavailable';
      }
      remember(key, verdict);
      const callbacks = waiting.get(key) || [];
      waiting.delete(key);
      callbacks.forEach((cb) => { try { cb(verdict); } catch (e) { /* keep going */ } });
    });
    pump();
  }

  // Pictures: data: URLs are read directly. Other picture hosts are fetched by the
  // background worker, only for the image hosts it allows.
  async function readableVerdict(payload) {
    let dataUrl = payload.src.startsWith('data:image/') ? payload.src : '';
    if (!dataUrl) {
      try {
        const reply = await chrome.runtime.sendMessage({ type: 'sanity-fetch-image', url: payload.src });
        if (reply && reply.ok) dataUrl = reply.dataUrl;
      } catch (e) { /* no background worker: cannot read */ }
    }
    if (!dataUrl) return 'unreadable';
    return askBridge({ kind: 'image', image: dataUrl });
  }

  /* ------------------------------ Page decision ------------------------------ */

  function decide(loc) {
    const query = searchQuery(loc);
    if (!query) return { state: 'allow' };
    const key = 'q|' + query;
    const verdict = fresh(key);
    if (verdict === 'yes') {
      return {
        state: 'block',
        message: 'This search is paused. Try something that helps you grow.',
        button: BACK,
      };
    }
    if (verdict !== undefined) return { state: 'allow' };
    judge(key, { kind: 'query', text: query }, () => S.evaluate());
    return { state: 'pending', message: 'Checking your search…', button: false };
  }

  /* ------------------------------ Results and pictures ------------------------------ */

  const checkedBox = new WeakMap(); // result -> text key
  const checkedImg = new WeakMap(); // picture -> src

  function checkResult(box) {
    if (box.hasAttribute(S.attrs.COVER_ATTR) || box.closest(COVER)) return;
    const text = (box.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    if (text.length < 4) return;
    const key = 't|' + text.slice(0, 200);
    if (checkedBox.get(box) === key) return;
    checkedBox.set(box, key);
    judge(key, { kind: 'text', text }, (v) => {
      if (v === 'yes') S.cover(box, 'result', 'text');
      S.queueScan();
    });
  }

  function tileFor(img) {
    const tile = S.containerFor(img, TILES, 3);
    return tile === img ? img.parentElement : tile;
  }

  function checkPicture(img) {
    if (img.closest(COVER)) return;
    const r = img.getBoundingClientRect();
    if (r.width < 60 || r.height < 60) return;
    const src = img.currentSrc || img.src;
    if (!src || !/^(https?:|data:image\/)/.test(src)) return;
    if (checkedImg.get(img) === src) return;
    checkedImg.set(img, src);
    const tile = tileFor(img);
    judge('i|' + src.slice(0, 300), { kind: 'image', image: true, src }, (v) => {
      if (v === 'yes' && tile) S.cover(tile, 'result', 'image');
      S.queueScan();
    });
  }

  function scan() {
    S.coverLinksIn(document, RESULTS);
    document.querySelectorAll(RESULTS).forEach(checkResult);
    document.querySelectorAll('img').forEach(checkPicture);
  }

  S.register({
    id: 'search',
    matches: (loc) => SEARCH.test(loc.hostname),
    decide,
    scan,
  });
})();
