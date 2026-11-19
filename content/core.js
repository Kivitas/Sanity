/* Sanity core. Shared by every site adapter (content/sites/*.js).
 *
 * Each adapter registers itself with Sanity.register({...}). The core then:
 *   - sets data-sanity-site on <html> (the CSS uses it to hide pages until the
 *     first decision, on sites that fail closed);
 *   - asks the adapter for a decision (allow / block / pending / auth / off);
 *   - shows the calm cover screen with a rotating motivational line;
 *   - runs the adapter's scan() to cover shared Reels, Shorts, TikToks, avatars
 *     and similar content, as they appear on the page.
 *
 * Privacy: nothing here reads, stores or sends message or page text. The core
 * looks only at link targets, element types, sizes and positions.
 */
(() => {
  'use strict';
  const S = (window.Sanity = window.Sanity || {});
  if (S.loaded) return;
  S.loaded = true;
  S.sites = [];
  S.active = null;

  const root = document.documentElement;
  const hasStorage = typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.sync;

  const DEFAULT_SETTINGS = {
    enabled: true, pausedUntil: 0, customMessage: '', startInMessages: true, showStats: true,
  };
  const DEFAULT_TITLE = 'Protecting your sanity and dopamine baseline';
  const DEFAULT_MESSAGE = 'Your attention belongs to you.';
  const STATE_ATTR = 'data-sanity-state';
  const SITE_ATTR = 'data-sanity-site';
  const COVER_ATTR = 'data-sanity-covered';
  const LABEL_ATTR = 'data-sanity-label';
  const QUOTE_ATTR = 'data-sanity-quote';
  const BY_ATTR = 'data-sanity-by';

  S.settings = { ...DEFAULT_SETTINGS };
  S.stats = { day: '', today: 0, total: 0 };
  S.attrs = { STATE_ATTR, SITE_ATTR, COVER_ATTR, LABEL_ATTR, QUOTE_ATTR, BY_ATTR };

  const LABELS = {
    reel: 'Reel hidden',
    post: 'Post hidden',
    story: 'Story hidden',
    short: 'YouTube Short hidden',
    tiktok: 'TikTok hidden',
    video: 'Video hidden',
    result: 'Result hidden',
    avatar: '',
  };

  /* ------------------------------ Registry ------------------------------ */

  // adapter = { id, matches(url) -> bool, decide(url) -> {state, ...},
  //             scan(), keepAudio?, button?, onSettings?(S), homeUrl? }
  S.register = (adapter) => { S.sites.push(adapter); };

  S.isActive = () => S.settings.enabled && Date.now() >= (S.settings.pausedUntil || 0);

  /* ------------------------------ Link rules ------------------------------ */

  // One list for every platform. Matching is on host and path only.
  const IG = /(^|\.)instagram\.com$/;
  const YT = /(^|\.)youtube\.com$/;
  const TT = /(^|\.)tiktok\.com$/;
  const LINK_RULES = [
    { host: IG, path: /^\/(?:[^/]+\/)?reels?\/[^/]+/, type: 'reel' },
    { host: IG, path: /^\/share\/reel\//, type: 'reel' },
    { host: IG, path: /^\/(?:[^/]+\/)?(?:p|tv)\/[^/]+/, type: 'post' },
    { host: IG, path: /^\/share\/p\//, type: 'post' },
    { host: IG, path: /^\/stories\//, type: 'story' },
    { host: IG, path: /^\/s\/[^/]+/, type: 'story' },
    { host: YT, path: /^\/shorts(\/|$)/, type: 'short' },
    { host: TT, path: /^\/(?:@[^/]+\/)?(?:video|photo)\/\d+/, type: 'tiktok' },
    { host: TT, path: /^\/(?:t|v)\/[^/]+/, type: 'tiktok' },
    { host: /^vm\.tiktok\.com$/, path: /.*/, type: 'tiktok' },
  ];

  // Search engines wrap results in redirects. Look through them.
  function unwrapRedirect(url) {
    const isGoogle = /(^|\.)google\./.test(url.hostname) && url.pathname === '/url';
    const isDdg = /(^|\.)duckduckgo\.com$/.test(url.hostname) && url.pathname.startsWith('/l/');
    const target = isGoogle ? url.searchParams.get('q') : isDdg ? url.searchParams.get('uddg') : null;
    if (!target) return url;
    try { return new URL(target); } catch (e) { return url; }
  }

  // Returns 'reel' | 'post' | 'story' | 'short' | 'tiktok' | null for a URL string.
  S.classifyUrl = (href, base) => {
    let url;
    try { url = unwrapRedirect(new URL(href, base || location.href)); } catch (e) { return null; }
    for (const rule of LINK_RULES) {
      if (rule.host.test(url.hostname) && rule.path.test(url.pathname)) return rule.type;
    }
    return null;
  };

  S.classifyLink = (a) => {
    const href = a.getAttribute('href');
    if (!href) return null;
    return S.classifyUrl(href, location.href);
  };

  /* ------------------------------ Shield (Shadow DOM) ------------------------------ */

  let shieldHost = null;
  let shieldParts = null;
  let quoteTimer = null;
  let shownQuote = '';
  let focusedOnce = false;

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
        .quote { margin: 0; font-size: 17px; line-height: 1.5; color: #e6e6e6; max-width: 480px;
          text-wrap: balance; min-height: 3em; transition: opacity .6s ease; }
        .quote.fade { opacity: 0; }
        .msg { margin: 0; font-size: 14px; color: #a8a8a8; max-width: 440px; overflow-wrap: anywhere; }
        button { margin-top: 10px; padding: 11px 22px; border-radius: 999px; border: 1px solid #3a3a3a;
          background: #fff; color: #000; font: 600 14px system-ui, sans-serif; cursor: pointer; }
        button:hover { background: #e6e6e6; }
        button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
        .note { margin: 0; font-size: 12px; color: #8f8f8f; max-width: 440px; }
        .stats { position: absolute; bottom: 22px; left: 0; right: 0; margin: 0 auto; font-size: 12px; color: #6f6f6f; }
        [hidden] { display: none !important; }
        @media (prefers-reduced-motion: reduce) { .quote { transition: none; } }
      </style>
      <div class="wrap">
        <div class="emoji" aria-hidden="true">😊</div>
        <h1 class="title"></h1>
        <p class="quote" aria-live="polite"></p>
        <p class="msg" hidden></p>
        <button type="button" hidden></button>
        <p class="note" hidden></p>
        <p class="stats" hidden></p>
      </div>`;
    shieldParts = {
      title: shadow.querySelector('.title'),
      quote: shadow.querySelector('.quote'),
      msg: shadow.querySelector('.msg'),
      btn: shadow.querySelector('button'),
      note: shadow.querySelector('.note'),
      stats: shadow.querySelector('.stats'),
    };
    shieldParts.btn.addEventListener('click', () => {
      const action = shieldParts.btn.__action;
      if (action) action();
    });
  }

  function setQuote(fade) {
    const next = S.randomQuote(shownQuote);
    shownQuote = next;
    if (!fade) { shieldParts.quote.textContent = next; return; }
    shieldParts.quote.classList.add('fade');
    setTimeout(() => {
      shieldParts.quote.textContent = next;
      shieldParts.quote.classList.remove('fade');
    }, 600);
  }

  function showShield(next) {
    if (!shieldHost) buildShield();
    const wasHidden = shieldHost.parentNode !== root || shieldHost.style.display === 'none';
    if (shieldHost.parentNode !== root) root.appendChild(shieldHost);
    shieldHost.style.setProperty('display', 'block', 'important');

    shieldParts.title.textContent = next.title || DEFAULT_TITLE;
    if (!shieldParts.quote.textContent) setQuote(false);
    const custom = (S.settings.customMessage || '').trim();
    const msg = next.message || (next.state === 'block' ? custom || DEFAULT_MESSAGE : '');
    shieldParts.msg.textContent = msg;
    shieldParts.msg.hidden = !msg;

    const btn = next.button === undefined ? S.active && S.active.button : next.button;
    shieldParts.btn.hidden = !btn;
    if (btn) {
      shieldParts.btn.textContent = btn.label;
      shieldParts.btn.__action = btn.action;
    }
    shieldParts.note.textContent = next.note || '';
    shieldParts.note.hidden = !next.note;
    renderStats(next.state === 'pending');

    if (!quoteTimer) quoteTimer = setInterval(() => setQuote(true), 9000);
    if (btn && wasHidden && !focusedOnce) {
      focusedOnce = true;
      setTimeout(() => { try { shieldParts.btn.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 0);
    }
  }

  function hideShield() {
    if (shieldHost) shieldHost.style.setProperty('display', 'none', 'important');
    if (quoteTimer) { clearInterval(quoteTimer); quoteTimer = null; }
    focusedOnce = false;
  }

  /* ------------------------------ Stats (local only) ------------------------------ */

  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };

  function renderStats(pending) {
    if (!shieldParts) return;
    const n = S.stats.day === todayKey() ? S.stats.today : 0;
    const show = S.settings.showStats && !pending && n > 0;
    shieldParts.stats.hidden = !show;
    if (show) shieldParts.stats.textContent = n === 1 ? 'First save of the day.' : `${n} scrolls skipped today.`;
  }

  function bumpStats() {
    if (!hasStorage) return;
    chrome.storage.local.get({ stats: S.stats }, (got) => {
      const cur = (got && got.stats) || S.stats;
      const day = todayKey();
      S.stats = { day, today: (cur.day === day ? cur.today : 0) + 1, total: (cur.total || 0) + 1 };
      chrome.storage.local.set({ stats: S.stats });
      renderStats(false);
    });
  }

  /* ------------------------------ Media ------------------------------ */

  // Pause and mute. Sites that keep audio playing (YouTube Music) set keepAudio.
  function quietMedia(el) {
    try {
      if (S.active && S.active.keepAudio) return;
      el.muted = true;
      if (!el.paused) el.pause();
    } catch (e) { /* ignore */ }
  }
  S.pauseAll = (scope) => scope.querySelectorAll('video, audio').forEach(quietMedia);

  /* ------------------------------ Covers ------------------------------ */

  // by: 'link' | 'card' | 'story' | 'video' | 'shelf' | 'overlay' | 'avatar'
  S.cover = (el, type, by, anchor) => {
    if (!el) return;
    // Already covered (by this or an outer item): keep the same card and quote.
    if (el.hasAttribute(COVER_ATTR) || (el.parentElement && el.parentElement.closest(`[${COVER_ATTR}]`))) return;
    const label = LABELS[type] || 'Shared content hidden';
    el.setAttribute(COVER_ATTR, by);
    el.setAttribute(BY_ATTR, by);
    el.setAttribute(LABEL_ATTR, label);
    el.setAttribute(QUOTE_ATTR, S.randomQuote(''));
    el.setAttribute('aria-label', `${label}. ${S.randomQuote('')}`);
    el.setAttribute('tabindex', '-1');
    el.__sanityAnchor = anchor || null;
    if (getComputedStyle(el).display === 'inline') el.style.setProperty('display', 'inline-block', 'important');
    el.querySelectorAll('video, audio').forEach(quietMedia);
    if (el.matches && el.matches('video, audio')) quietMedia(el);
  };

  S.uncover = (el) => {
    el.removeAttribute(COVER_ATTR);
    el.removeAttribute(BY_ATTR);
    el.removeAttribute(LABEL_ATTR);
    el.removeAttribute(QUOTE_ATTR);
    el.removeAttribute('tabindex');
    el.__sanityAnchor = null;
  };

  // The nearest ancestor that looks like one result / message / card. Falls back to el.
  S.containerFor = (el, selectors, maxUp = 6) => {
    let node = el;
    for (let i = 0; node && node !== document.body && i < maxUp; i++, node = node.parentElement) {
      if (node.matches && node.matches(selectors)) return node;
    }
    return el;
  };

  // Link covers are kept only while their link still qualifies. React and
  // friends reuse DOM nodes, so a node can point at a different link later.
  S.dropStaleLinkCovers = () => {
    document.querySelectorAll(`[${COVER_ATTR}="link"]`).forEach((el) => {
      const a = el.__sanityAnchor;
      if (!a || !a.isConnected || !S.classifyLink(a)) S.uncover(el);
    });
  };

  // Cover every link to a Reel, Short, TikTok, post or story. containerSelectors
  // picks the card to hide (the whole result or message), not just the link.
  S.coverLinksIn = (scope, containerSelectors) => {
    S.dropStaleLinkCovers();
    scope.querySelectorAll('a[href]').forEach((a) => {
      if (a.closest(`[${COVER_ATTR}]`)) return;
      const type = S.classifyLink(a);
      if (!type) return;
      const box = containerSelectors ? S.containerFor(a, containerSelectors) : a;
      S.cover(box, type, 'link', a);
    });
  };

  /* ------------------------------ Click and key guard ------------------------------ */

  // A covered item does nothing when clicked, tapped or activated by keyboard.
  const swallow = (e) => {
    if (!S.state || (S.state !== 'allow')) return;
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

  // Anything that starts playing behind a full-page cover is stopped.
  document.addEventListener('play', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLMediaElement)) return;
    if (S.state === 'block' || S.state === 'pending' || (S.state === 'allow' && t.closest(`[${COVER_ATTR}]`))) quietMedia(t);
  }, true);

  /* ------------------------------ Evaluate and apply ------------------------------ */

  let lastState = null;
  let lastHref = '';
  let countedHref = '';
  let scanQueued = false;
  let resumeTimer = null;
  let pendingSince = 0;

  S.state = null;

  S.evaluate = () => {
    lastHref = location.href;
    const site = S.active;
    if (!site) return;
    let next;
    if (!S.isActive()) next = { state: 'off' };
    else next = site.decide(location) || { state: 'allow' };

    if (next.state === 'pending') {
      if (!pendingSince) pendingSince = Date.now();
      if (Date.now() - pendingSince > 6000 && !next.note && next.stuckNote) next.note = next.stuckNote;
    } else pendingSince = 0;

    apply(next);
  };

  function apply(next) {
    const st = next.state;
    S.state = st;
    if (st !== lastState) { lastState = st; root.setAttribute(STATE_ATTR, st); }
    else if (root.getAttribute(STATE_ATTR) !== st) root.setAttribute(STATE_ATTR, st);

    const shouldInert = st === 'block' || st === 'pending';
    if (document.body && document.body.inert !== shouldInert) document.body.inert = shouldInert;

    if (st === 'block' || st === 'pending') {
      showShield(next);
      if (st === 'block') {
        S.pauseAll(document);
        if (S.active.countable !== false && settingsLoaded() && countedHref !== location.href) {
          countedHref = location.href;
          bumpStats();
        }
      }
    } else {
      hideShield();
      countedHref = '';
    }
    if (st === 'allow') S.queueScan();
  }

  const settingsLoaded = () => S.settingsReady === true;

  S.scan = () => {
    scanQueued = false;
    if (S.state !== 'allow' || !S.active || !S.active.scan) return;
    try { S.active.scan(); } catch (e) { console.warn("[Sanity] scan failed; check the selectors in content/sites/", e); }
  };

  S.queueScan = () => {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(S.scan);
  };

  function scheduleResume() {
    clearTimeout(resumeTimer);
    const wait = (S.settings.pausedUntil || 0) - Date.now();
    if (S.settings.enabled && wait > 0) resumeTimer = setTimeout(S.evaluate, Math.min(wait + 50, 2147483647));
  }

  /* ------------------------------ Start ------------------------------ */

  S.start = () => {
    S.active = S.sites.find((s) => s.matches(location)) || null;
    if (!S.active) return;
    root.setAttribute(SITE_ATTR, S.active.id);

    const onMutate = () => {
      if (location.href !== lastHref || S.state === 'pending' || S.state === null) S.evaluate();
      else S.queueScan();
    };
    new MutationObserver(onMutate).observe(root, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'src'],
    });
    window.addEventListener('popstate', S.evaluate);
    window.addEventListener('hashchange', S.evaluate);
    window.addEventListener('pageshow', S.evaluate);
    window.addEventListener('yt-navigate-finish', S.evaluate);
    document.addEventListener('DOMContentLoaded', S.evaluate);
    document.addEventListener('load', () => { if (S.state === 'allow') S.queueScan(); }, true);
    setInterval(() => {
      if (location.href !== lastHref || S.state !== 'allow' || root.getAttribute(STATE_ATTR) !== S.state) S.evaluate();
      else S.queueScan();
    }, 500);

    if (hasStorage) {
      chrome.storage.local.get({ stats: S.stats }, (got) => { if (got && got.stats) S.stats = got.stats; });
      chrome.storage.sync.get(S.settings, (stored) => {
        if (stored) S.settings = Object.assign(S.settings, stored);
        S.settingsReady = true;
        if (S.active.onSettings) S.active.onSettings(S);
        scheduleResume();
        S.evaluate();
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.stats && changes.stats.newValue) {
          S.stats = changes.stats.newValue;
          renderStats(S.state === 'pending');
        }
        if (area !== 'sync') return;
        for (const key of Object.keys(changes)) if (key in S.settings) S.settings[key] = changes[key].newValue;
        scheduleResume();
        S.evaluate();
      });
    }
    S.evaluate(); // protected from the first moment, before settings load
  };

  S.todayKey = todayKey;
})();
