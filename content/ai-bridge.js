/* Sanity: on-device judgement for search results, MAIN world (page context).
 *
 * Chrome can run a small language model on this computer (the built-in AI,
 * "LanguageModel"). Only page scripts can reach it, so this file runs in the
 * page's own world and answers questions sent by content/sites/search.js:
 *   - kind "query": is this search asking for explicit adult material?
 *   - kind "text":  does this search result's text describe explicit material?
 *   - kind "image": does this picture show nudity or sexual content?
 * Each answer is YES, NO, or "unavailable" (the model is not installed or not
 * ready). Nothing is sent over the network. Text and pictures are passed here
 * by a message event, handled in memory, and never stored.
 *
 * There are no word lists. The model judges meaning in context.
 */
(() => {
  'use strict';
  if (window.__sanityBridge) return;
  window.__sanityBridge = true;

  const TEXT_OPTIONS = {
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  };
  const IMAGE_OPTIONS = {
    expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  };
  const TEXT_SYSTEM = [
    'You are a strict filter for a web search box and its results.',
    'Reply with exactly one word: YES or NO.',
    'Reply YES only when the text asks for, offers, or describes sexual, pornographic, nude or otherwise explicit adult material.',
    'Judge the meaning in context, in any language, including slang, misspellings and coded wording.',
    'Reply NO for everything else, including health, news, relationships, art, and education.',
  ].join(' ');
  const IMAGE_SYSTEM = [
    'You check pictures for a web search filter.',
    'Reply with exactly one word: YES or NO.',
    'Reply YES when the picture shows nudity, sexual content, or pornography, including partial nudity or sexual acts.',
    'Reply NO for everything else, including ordinary clothing, swimwear, sport, food, animals, scenery, and medical or art images that are not sexual.',
  ].join(' ');

  const sessions = {}; // kind -> session (reused; one per kind)

  async function openSession(kind) {
    if (sessions[kind]) return sessions[kind];
    const LM = window.LanguageModel;
    if (LM && typeof LM.availability === 'function') {
      const options = kind === 'image' ? IMAGE_OPTIONS : TEXT_OPTIONS;
      const status = await LM.availability(options);
      if (status !== 'available') return null;
      sessions[kind] = await LM.create({
        ...options,
        initialPrompts: [{ role: 'system', content: kind === 'image' ? IMAGE_SYSTEM : TEXT_SYSTEM }],
      });
      return sessions[kind];
    }
    // Older Chrome builds: text only. It never starts a model download.
    const legacy = window.ai && window.ai.languageModel;
    if (kind !== 'image' && legacy && typeof legacy.capabilities === 'function') {
      const caps = await legacy.capabilities();
      if (!caps || caps.available !== 'readily') return null;
      sessions[kind] = await legacy.create({ systemPrompt: TEXT_SYSTEM });
      return sessions[kind];
    }
    return null;
  }

  // data: URL to an ImageBitmap, without fetch (page CSP can block fetch of data:).
  function bitmapFromDataUrl(dataUrl) {
    const comma = dataUrl.indexOf(',');
    const header = dataUrl.slice(0, comma);
    if (!/^data:image\/(png|jpeg|jpg|gif|webp);base64$/i.test(header)) throw new Error('unsupported image');
    const bytes = Uint8Array.from(atob(dataUrl.slice(comma + 1)), (c) => c.charCodeAt(0));
    return createImageBitmap(new Blob([bytes], { type: header.slice(5, header.indexOf(';')) }));
  }

  async function judge(request) {
    try {
      if (request.kind === 'image') {
        const session = await openSession('image');
        if (!session) return 'unavailable';
        const bitmap = await bitmapFromDataUrl(request.image);
        const reply = await session.prompt([{
          role: 'user',
          content: [
            { type: 'text', value: 'Does this picture show nudity or explicit sexual content?' },
            { type: 'image', value: bitmap },
          ],
        }]);
        if (bitmap.close) bitmap.close();
        return /^\s*yes\b/i.test(String(reply)) ? 'yes' : 'no';
      }
      const session = await openSession('text');
      if (!session) return 'unavailable';
      const label = request.kind === 'query' ? 'Search text' : 'Result text';
      const reply = await session.prompt(`${label}: """${String(request.text).slice(0, 600)}"""`);
      return /^\s*yes\b/i.test(String(reply)) ? 'yes' : 'no';
    } catch (e) {
      // Drop a broken session so the next question starts fresh.
      Object.keys(sessions).forEach((k) => { sessions[k] = null; });
      return 'unavailable';
    }
  }

  // One question at a time: the model is slow, and pages send many at once.
  let chain = Promise.resolve();
  function enqueue(request) {
    const run = chain.then(() => judge(request));
    chain = run.catch(() => {});
    return run;
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data.__sanity !== 'ask') return;
    const result = await enqueue(e.data);
    window.postMessage({ __sanity: 'answer', id: e.data.id, result }, '*');
  });
})();
