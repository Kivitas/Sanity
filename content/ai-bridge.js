/* Sanity: explicit-search check, MAIN world (page context).
 *
 * Chrome can run a small language model on this computer (the built-in AI,
 * "LanguageModel"). This file is the only part that calls it, because the
 * model is only exposed to page scripts. It answers one question per search:
 * is this search asking for explicit adult material? Answers are YES, NO, or
 * "unavailable" when the model is not installed or not ready.
 *
 * Nothing is sent over the network. The query is passed here by a message
 * event between this script and content/sites/search.js.
 */
(() => {
  'use strict';
  if (window.__sanityBridge) return;
  window.__sanityBridge = true;

  const OPTIONS = {
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  };
  const SYSTEM = [
    'You are a strict filter for a web search box.',
    'Reply with exactly one word: YES or NO.',
    'Reply YES only when the search text asks for sexual, pornographic, nude or otherwise explicit adult material.',
    'Count slang, misspellings, other languages and coded wording.',
    'Reply NO for everything else, including health, news, relationships, art, anatomy for school and education.',
  ].join(' ');

  // Returns a session only when the model is ready now. It never starts a download.
  async function openSession() {
    const LM = window.LanguageModel;
    if (LM && typeof LM.availability === 'function') {
      const status = await LM.availability(OPTIONS);
      if (status !== 'available') return null;
      return LM.create({ ...OPTIONS, initialPrompts: [{ role: 'system', content: SYSTEM }] });
    }
    const legacy = window.ai && window.ai.languageModel;
    if (legacy && typeof legacy.capabilities === 'function') {
      const caps = await legacy.capabilities();
      if (!caps || caps.available !== 'readily') return null;
      return legacy.create({ systemPrompt: SYSTEM });
    }
    return null;
  }

  async function classify(query) {
    let session = null;
    try {
      session = await openSession();
      if (!session) return 'unavailable';
      const reply = await session.prompt(`Search text: """${String(query).slice(0, 300)}"""`);
      return /^\s*yes\b/i.test(String(reply)) ? 'yes' : 'no';
    } catch (e) {
      return 'unavailable';
    } finally {
      try { if (session && session.destroy) session.destroy(); } catch (e) { /* ignore */ }
    }
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data.__sanity !== 'ask') return;
    const result = await classify(e.data.query);
    window.postMessage({ __sanity: 'answer', id: e.data.id, result }, '*');
  });
})();
