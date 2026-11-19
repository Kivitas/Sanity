/* Sanity — content script for instagram.com
 *
 * Two independent systems:
 *   A. Page-level protection: is this whole page allowed? (route + interface)
 *   B. Message-level protection: which attachments in a chat get covered?
 *
 * Fail closed: content/blocker.css hides the page until this script sets
 * data-sanity-state on <html> to "dm", "auth" or "off".
 *
 * Privacy: this script never reads, stores or sends message text. It only
 * looks at link targets, element types and element sizes.
 */
(() => {
  'use strict';
  if (window.__sanityLoaded) return;
  window.__sanityLoaded = true;

  /* ------------------------------------------------------------------ *
   * RULES — the part most likely to need updating when Instagram changes
   * ------------------------------------------------------------------ */
  const RULES = {
    // Never covered, so signing in always works.
    authPrefixes: ['/accounts/', '/challenge/', '/auth_platform/', '/oauth/'],
    // Candidate for "allowed". Must also pass interface detection.
    dmPrefix: '/direct/',
    // Links to feed content. A card that links to one of these gets covered.
    sharedLinks: [
      { re: /^\/(?:[^/]+\/)?reels?\/[^/]+/, type: 'reel' },
      { re: /^\/share\/reel\//, type: 'reel' },
      { re: /^\/(?:[^/]+\/)?(?:p|tv)\/[^/]+/, type: 'post' },
      { re: /^\/share\/p\//, type: 'post' },
      { re: /^\/stories\//, type: 'story' },
      { re: /^\/s\/[^/]+/, type: 'story' },
    ],
    // Interface detection: one strong signal, or two weak ones.
    strongSignals: [
      '[contenteditable="true"][role="textbox"]',
      'textarea[placeholder]',
      'a[href^="/direct/t/"]',
    ],
    weakSignals: [
      '[aria-label*="essag" i]',
      '[aria-label*="chats" i]',
      '[aria-label*="thread" i]',
      '[role="listitem"]',
    ],
    // Cards with no link: avatar + username header above or below a large image.
    structuralHeuristic: true,
    // Story replies/mentions: thumbnail next to short text that says "story".
    storyWord: /\bstor(y|ies)/i,
  };

  const LABELS = {
    reel: 'Instagram Reel hidden',
    post: 'Instagram post hidden',
    story: 'Story hidden',
  };
  const DEFAULT_MESSAGE = 'Your attention belongs to you.';
  const STATE_ATTR = 'data-sanity-state';
  const COVER_ATTR = 'data-sanity-covered';
  const LABEL_ATTR = 'data-sanity-label';

  const root = document.documentElement;
  const hasStorage = typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.sync;
  let settings = { enabled: true, pausedUntil: 0, customMessage: '', startInMessages: true, showStats: true };
  let settingsLoaded = false;
  let redirecting = false;
  let countedHref = '';
  let stats = { day: '', today: 0, total: 0 };
  let state = null;
  let lastHref = '';
  let dmConfirmed = false;
  let dmPendingSince = 0;
  let scanQueued = false;
  let resumeTimer = null;
  let warned = false;

  /* ------------------------------ A. Page level ------------------------------ */

  const isActive = () => settings.enabled && Date.now() >= (settings.pausedUntil || 0);

  function routeKind(path) {
    if (RULES.authPrefixes.some((p) => path.startsWith(p))) return 'auth';
    if (path.startsWith(RULES.dmPrefix)) return 'dm';
    return 'blocked';
  }

  function interfaceConfirmed() {
    try {
      if (RULES.strongSignals.some((s) => document.querySelector(s))) return true;
      return RULES.weakSignals.filter((s) => document.querySelector(s)).length >= 2;
    } catch (e) {
      return false;
    }
  }

  function evaluate() {
    const path = location.pathname;
    lastHref = location.href;
    let next;
    if (!isActive()) {
      next = 'off';
    } else {
      const kind = routeKind(path);
      if (kind === 'auth') {
        next = 'auth';
      } else if (kind === 'dm') {
        if (!dmConfirmed && interfaceConfirmed()) dmConfirmed = true;
        next = dmConfirmed ? 'dm' : 'blocked';
      } else {
        next = 'blocked';
      }
      if (kind !== 'dm') dmConfirmed = false;
    }
    applyState(next, path);
  }

  function applyState(next, path) {
    const pendingDm = next === 'blocked' && path.startsWith(RULES.dmPrefix);
    if (pendingDm && !dmPendingSince) dmPendingSince = Date.now();
    if (!pendingDm) dmPendingSince = 0;

    if (next !== state) {
      state = next;
      root.setAttribute(STATE_ATTR, next);
    } else if (root.getAttribute(STATE_ATTR) !== next) {
      root.setAttribute(STATE_ATTR, next);
    }

    if (document.body) {
      const shouldInert = next === 'blocked';
      if (document.body.inert !== shouldInert) document.body.inert = shouldInert;
    }

    if (next === 'blocked') {
      showShield(pendingDm);
      stopAllMedia(document);
      if (!pendingDm && settingsLoaded && !redirecting && countedHref !== location.href) {
        countedHref = location.href;
        bumpStats();
      }
    } else {
      hideShield();
      countedHref = '';
    }
    if (next === 'dm') queueScan();
  }

  /* ------------------------------ Shield (Shadow DOM) ------------------------------ */

  let shieldHost = null;
  let shieldParts = null;

  function buildShield() {
    shieldHost = document.createElement('div');
    shieldHost.id = 'sanity-shield';
    shieldHost.setAttribute('role', 'dialog');
    shieldHost.setAttribute('aria-label', 'Sanity');
    shieldHost.style.cssText =
      'all:initial !important;position:fixed !important;inset:0 !important;' +
      'z-index:2147483647 !important;display:block !important;';
    const shadow = shieldHost.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        .wrap { position: fixed; inset: 0; background: #000; color: #fff; display: flex;
          flex-direction: column; align-items: center; justify-content: center; gap: 14px;
          padding: 24px; box-sizing: border-box; text-align: center;
          font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
        .emoji { font-size: 56px; line-height: 1; }
        h1 { margin: 0; font-size: 22px; font-weight: 650; max-width: 520px; text-wrap: balance; }
        p { margin: 0; font-size: 15px; color: #a8a8a8; max-width: 440px; overflow-wrap: anywhere; }
        button { margin-top: 10px; padding: 11px 22px; border-radius: 999px; border: 1px solid #3a3a3a;
          background: #fff; color: #000; font: 600 14px system-ui, sans-serif; cursor: pointer; }
        button:hover { background: #e6e6e6; }
        button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
        .note { font-size: 12px; color: #6f6f6f; }
        .stats { position: absolute; bottom: 22px; left: 0; right: 0; margin: 0 auto; font-size: 12px; color: #6f6f6f; }
        [hidden] { display: none !important; }
      </style>
      <div class="wrap">
        <div class="emoji" aria-hidden="true">😊</div>
        <h1>Protecting your sanity and dopamine baseline</h1>
        <p class="msg"></p>
        <button type="button">Go to messages</button>
        <p class="note" hidden></p>
        <p class="stats" hidden></p>
      </div>`;
    shieldParts = {
      msg: shadow.querySelector('.msg'),
      btn: shadow.querySelector('button'),
      note: shadow.querySelector('.note'),
      stats: shadow.querySelector('.stats'),
    };
    shieldParts.btn.addEventListener('click', () => {
      location.assign('/direct/inbox/');
    });
  }

  function showShield(pendingDm) {
    if (!shieldHost) buildShield();
    const wasHidden = shieldHost.parentNode !== root || shieldHost.style.display === 'none';
    if (shieldHost.parentNode !== root) root.appendChild(shieldHost);
    shieldHost.style.setProperty('display', 'block', 'important');
    const custom = (settings.customMessage || '').trim() || DEFAULT_MESSAGE;
    if (pendingDm) {
      const stuck = Date.now() - dmPendingSince > 6000;
      shieldParts.msg.textContent = 'Opening your messages…';
      shieldParts.btn.hidden = true;
      shieldParts.note.hidden = !stuck;
      shieldParts.note.textContent = stuck
        ? "Sanity can't recognise the messages page, so it is staying covered. Instagram may have changed its layout. Please report this on GitHub."
        : '';
      if (stuck && !warned) {
        warned = true;
        console.warn('[Sanity] /direct/ route but no messaging interface detected. Check RULES.strongSignals in content/instagram.js.');
      }
    } else {
      shieldParts.msg.textContent = custom;
      shieldParts.btn.hidden = false;
      shieldParts.note.hidden = true;
    }
    renderStats(pendingDm);
    // Keyboard users land on the one useful action.
    if (!pendingDm && wasHidden) setTimeout(() => { try { shieldParts.btn.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 0);
  }

  /* ------------------------------ Stats (local only) ------------------------------ */

  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };

  function renderStats(pendingDm) {
    if (!shieldParts) return;
    const n = stats.day === todayKey() ? stats.today : 0;
    const show = settings.showStats && !pendingDm && n > 0;
    shieldParts.stats.hidden = !show;
    if (show) shieldParts.stats.textContent = n === 1 ? 'First save of the day.' : `${n} scrolls skipped today.`;
  }

  function bumpStats() {
    if (!hasStorage) return;
    chrome.storage.local.get({ stats }, (got) => {
      const cur = (got && got.stats) || stats;
      const day = todayKey();
      stats = { day, today: (cur.day === day ? cur.today : 0) + 1, total: (cur.total || 0) + 1 };
      chrome.storage.local.set({ stats });
      renderStats(false);
    });
  }

  function hideShield() {
    if (shieldHost) shieldHost.style.setProperty('display', 'none', 'important');
  }

  /* ------------------------------ Media helpers ------------------------------ */

  function stopMedia(el) {
    try {
      el.muted = true;
      if (!el.paused) el.pause();
    } catch (e) { /* ignore */ }
  }
  function stopAllMedia(scope) {
    scope.querySelectorAll('video, audio').forEach(stopMedia);
  }

  // Anything that tries to play behind the shield or under a cover is stopped.
  document.addEventListener('play', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLMediaElement)) return;
    if (state === 'blocked' || (state === 'dm' && t.closest(`[${COVER_ATTR}]`))) stopMedia(t);
  }, true);

  /* ------------------------------ B. Message level ------------------------------ */

  function classifyLink(a) {
    let url;
    try { url = new URL(a.getAttribute('href'), location.href); } catch (e) { return null; }
    if (!/(^|\.)instagram\.com$/.test(url.hostname)) return null;
    for (const rule of RULES.sharedLinks) if (rule.re.test(url.pathname)) return rule.type;
    return null;
  }

  function cover(el, type, how) {
    if (el.closest(`[${COVER_ATTR}]`)) return;
    el.setAttribute(COVER_ATTR, how);
    el.setAttribute(LABEL_ATTR, LABELS[type] || 'Shared content hidden');
    el.setAttribute('aria-label', (LABELS[type] || 'Shared content hidden') + '. Protecting your sanity and dopamine baseline.');
    el.setAttribute('tabindex', '-1');
    if (getComputedStyle(el).display === 'inline') el.style.setProperty('display', 'inline-block', 'important');
    stopAllMedia(el);
  }

  function uncover(el) {
    el.removeAttribute(COVER_ATTR);
    el.removeAttribute(LABEL_ATTR);
  }

  function scan() {
    scanQueued = false;
    if (state !== 'dm') return;

    // Nodes can be reused: drop link-based covers whose link no longer qualifies.
    document.querySelectorAll(`a[${COVER_ATTR}="link"]`).forEach((a) => {
      if (!classifyLink(a)) uncover(a);
    });

    // 1. Link-based (confident): a card that links to a Reel, post or story.
    document.querySelectorAll('a[href]').forEach((a) => {
      if (a.hasAttribute(COVER_ATTR) || a.closest(`[${COVER_ATTR}]`)) return;
      const type = classifyLink(a);
      if (!type) return;
      const r = a.getBoundingClientRect();
      const isCard = a.querySelector('img, video, canvas') || (r.width >= 100 && r.height >= 100);
      if (isCard) cover(a, type, 'link'); // plain-text links stay as text
    });

    // 2. Structure-based (heuristic): cards and story thumbnails with no link.
    document.querySelectorAll('img, video').forEach((m) => {
      if (m.closest(`[${COVER_ATTR}]`) || m.closest('a[href^="/direct/"]')) return;
      const r = m.getBoundingClientRect();
      if (r.width < 60 || r.height < 90) return;

      // Story reply / mention: thumbnail beside short text mentioning a story.
      let anc = m.parentElement;
      for (let i = 0; anc && anc !== document.body && i < 5; i++, anc = anc.parentElement) {
        const ar = anc.getBoundingClientRect();
        if (ar.height > r.height + 140 || ar.width > r.width + 420) break;
        const text = anc.textContent || '';
        if (text.length < 160 && RULES.storyWord.test(text)) {
          cover(m.parentElement, 'story', 'story');
          return;
        }
      }

      if (!RULES.structuralHeuristic || r.width < 140 || r.height < 140) return;
      // Shared post/Reel card: a small avatar (author) directly above or below the
      // media, inside a container barely wider than the media. A gallery photo has
      // no such header; a sender's avatar sits beside the bubble, not above it.
      anc = m.parentElement;
      for (let i = 0; anc && anc !== document.body && i < 6; i++, anc = anc.parentElement) {
        const ar = anc.getBoundingClientRect();
        if (ar.width > r.width + 48 || ar.height > r.height + 260) break;
        const avatar = Array.from(anc.querySelectorAll('img')).find((s) => {
          if (s === m) return false;
          const sr = s.getBoundingClientRect();
          return sr.width >= 14 && sr.width <= 56 && sr.height >= 14 && sr.height <= 56 &&
            sr.left >= r.left - 4 && sr.right <= r.right + 4 &&
            (sr.bottom <= r.top + 2 || sr.top >= r.bottom - 2);
        });
        if (avatar && (anc.textContent || '').trim()) {
          const reelish = m.tagName === 'VIDEO' || anc.querySelector('svg[aria-label*="reel" i], svg[aria-label*="clip" i]');
          cover(anc, reelish ? 'reel' : 'post', 'card');
          return;
        }
      }
    });
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
  }

  // A covered attachment does nothing when clicked, tapped or activated by keyboard.
  const swallow = (e) => {
    if (state !== 'dm') return;
    const t = e.target instanceof Element ? e.target : null;
    if (t && t.closest(`[${COVER_ATTR}]`)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  ['click', 'auxclick', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend']
    .forEach((type) => window.addEventListener(type, swallow, true));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') swallow(e);
  }, true);

  /* ------------------------------ Watching for change ------------------------------ */

  // Instagram is a single-page app: every navigation mutates the DOM, so the
  // observer notices URL changes before the new page is painted.
  const observer = new MutationObserver(() => {
    if (location.href !== lastHref || state !== 'dm') evaluate();
    else queueScan();
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'src'] });

  window.addEventListener('popstate', evaluate);
  window.addEventListener('hashchange', evaluate);
  window.addEventListener('pageshow', evaluate);
  document.addEventListener('DOMContentLoaded', evaluate);
  document.addEventListener('load', () => { if (state === 'dm') queueScan(); }, true); // images finishing
  setInterval(() => {
    if (location.href !== lastHref || state !== 'dm' || root.getAttribute(STATE_ATTR) !== state) evaluate();
    else queueScan();
  }, 500);

  /* ------------------------------ Settings ------------------------------ */

  function scheduleResume() {
    clearTimeout(resumeTimer);
    const wait = (settings.pausedUntil || 0) - Date.now();
    if (settings.enabled && wait > 0) resumeTimer = setTimeout(evaluate, Math.min(wait + 50, 2147483647));
  }

  if (hasStorage) {
    chrome.storage.local.get({ stats }, (got) => { if (got && got.stats) stats = got.stats; });
    chrome.storage.sync.get(settings, (stored) => {
      if (stored) settings = Object.assign(settings, stored);
      settingsLoaded = true;
      // Opening Instagram lands on your messages instead of the black screen.
      if (isActive() && settings.startInMessages && location.pathname === '/' && window.top === window) {
        redirecting = true;
        location.replace('/direct/inbox/');
        return;
      }
      scheduleResume();
      evaluate();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.stats && changes.stats.newValue) {
        stats = changes.stats.newValue;
        renderStats(!!dmPendingSince);
      }
      if (area !== 'sync') return;
      for (const key of Object.keys(changes)) if (key in settings) settings[key] = changes[key].newValue;
      scheduleResume();
      evaluate();
    });
  }

  evaluate(); // protected from the first moment, before settings load
})();
