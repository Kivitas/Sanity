/* Sanity adapter: Google, Bing and DuckDuckGo.
 *
 * 1. Links to Reels, YouTube Shorts, TikToks, posts and stories show the cover
 *    where the result appears (the whole result, not just the link).
 * 2. Explicit searches show the cover instead of results. "Explicit" is judged
 *    by an AI model that runs on this device (Chrome's built-in model, see
 *    content/ai-bridge.js). No word lists. The query never leaves the browser.
 *    If the model is not available, Sanity cannot judge the query and says so
 *    in Settings.
 */
(() => {
  'use strict';
  const S = window.Sanity;

  const SEARCH = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com)$/;
  const RESULTS = '.MjjYud, .g, .b_algo, article, [data-hveid]';
  const BACK = { label: 'Go back', action: () => { if (history.length > 1) history.back(); else location.assign('https://www.google.com/'); } };

  // The query text, only on result pages of the three engines.
  function searchQuery(loc) {
    const ddg = /(^|\.)duckduckgo\.com$/.test(loc.hostname);
    const resultsPage = ddg ? loc.pathname === '/' || loc.pathname.startsWith('/html') : loc.pathname === '/search';
    if (!resultsPage) return '';
    return (new URL(loc.href).searchParams.get('q') || '').trim();
  }

  /* ------------------------------ Explicit-query checks ------------------------------ */

  const verdicts = new Map(); // query -> 'yes' | 'no' | 'unavailable' (memory only)
  const waiting = new Map();  // query -> [callbacks]
  const askIds = new Map();   // request id -> query
  let seq = 0;

  function remember(query, verdict) {
    if (verdicts.size > 200) verdicts.clear();
    verdicts.set(query, verdict);
    const callbacks = waiting.get(query) || [];
    waiting.delete(query);
    callbacks.forEach((cb) => cb());
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__sanity !== 'answer') return;
    const query = askIds.get(e.data.id);
    if (query === undefined) return;
    askIds.delete(e.data.id);
    remember(query, e.data.result === 'yes' ? 'yes' : e.data.result === 'no' ? 'no' : 'unavailable');
  });

  function ask(query) {
    const id = ++seq;
    askIds.set(id, query);
    window.postMessage({ __sanity: 'ask', id, query }, '*');
    setTimeout(() => {
      if (askIds.get(id) === query) { askIds.delete(id); remember(query, 'unavailable'); }
    }, 3000);
  }

  S.searchVerdict = (query) => verdicts.get(query);

  function decide(loc) {
    const query = searchQuery(loc);
    if (!query) return { state: 'allow' };
    const verdict = verdicts.get(query);
    if (verdict === 'yes') {
      return {
        state: 'block',
        message: 'This search is paused. Try something that helps you grow.',
        button: BACK,
      };
    }
    if (verdict !== undefined) return { state: 'allow' };
    if (!waiting.has(query)) {
      waiting.set(query, []);
      ask(query);
      // The bridge answers when it can. The callback runs the page decision again.
      waiting.get(query).push(() => S.evaluate());
    }
    return { state: 'pending', message: 'Checking your search…', button: false };
  }

  function scan() {
    S.coverLinksIn(document, RESULTS);
  }

  S.register({
    id: 'search',
    matches: (loc) => SEARCH.test(loc.hostname),
    decide,
    scan,
  });
})();
