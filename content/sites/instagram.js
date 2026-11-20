/* Sanity adapter: instagram.com
 *
 * Page level: only the messages route, and only once the messaging interface
 * is found, is allowed. Notifications and follow requests are shown as they
 * are. Everything else gets the cover.
 * Message level, inside a chat:
 *   - shared Reels, posts and stories are covered (by link, by the card's
 *     username overlay, or by a story word beside a thumbnail);
 *   - profile pictures are replaced with a smiley;
 *   - photos, one-time photos and videos, and voice notes are left alone.
 */
(() => {
  'use strict';
  const S = window.Sanity;

  const IG = /(^|\.)instagram\.com$/;
  const RULES = {
    authPrefixes: ['/accounts/', '/challenge/', '/auth_platform/', '/oauth/'],
    // Notifications and follow requests: shown as they are, like sign-in pages.
    activityPrefixes: ['/accounts/activity', '/notifications'],
    dmPrefix: '/direct/',
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
    storyWord: /\bstor(y|ies)/i,
  };

  const COVERED = `[${S.attrs.COVER_ATTR}]`;
  const DM_BUTTON = { label: 'Go to messages', action: () => location.assign('/direct/inbox/') };

  function routeKind(path) {
    if (RULES.activityPrefixes.some((p) => path.startsWith(p))) return 'activity';
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

  let dmConfirmed = false;
  let warned = false;

  function decide(loc) {
    const kind = routeKind(loc.pathname);
    if (kind === 'auth' || kind === 'activity') { dmConfirmed = false; return { state: 'auth' }; }
    if (kind === 'dm') {
      if (!dmConfirmed && interfaceConfirmed()) dmConfirmed = true;
      if (dmConfirmed) return { state: 'allow' };
      if (!warned) {
        setTimeout(() => {
          if (!dmConfirmed && S.state === 'pending' && !warned) {
            warned = true;
            console.warn('[Sanity] /direct/ route but no messaging interface detected. Check RULES.strongSignals in content/sites/instagram.js.');
          }
        }, 6000);
      }
      return {
        state: 'pending',
        message: 'Opening your messages…',
        button: false,
        stuckNote: "Sanity can't recognise the messages page, so it is staying covered. Instagram may have changed its layout. Please report this on GitHub.",
      };
    }
    dmConfirmed = false;
    return { state: 'block', button: DM_BUTTON };
  }

  /* ------------------------------ Shapes ------------------------------ */

  const isAvatarSized = (r) => r.width >= 20 && r.width <= 120 && r.height >= 20 && r.height <= 120 &&
    Math.abs(r.width - r.height) <= 6;

  // A small round picture sitting inside the top part of a big media frame:
  // the username header of a shared Reel or post.
  function avatarOverlapsTop(media, r) {
    let anc = media.parentElement;
    for (let i = 0; anc && anc !== document.body && i < 4; i++, anc = anc.parentElement) {
      const hit = Array.from(anc.querySelectorAll('img')).find((s) => {
        if (s === media) return false;
        const sr = s.getBoundingClientRect();
        return isAvatarSized(sr) && sr.width <= 56 &&
          sr.left >= r.left - 2 && sr.right <= r.right + 2 &&
          sr.top >= r.top - 4 && sr.bottom <= r.top + r.height * 0.4;
      });
      if (hit) return anc;
    }
    return null;
  }

  // The card around a media frame: widen while the parent is still just the card.
  function cardAround(media, r) {
    let node = media;
    for (let i = 0; node.parentElement && i < 5; i++) {
      const pr = node.parentElement.getBoundingClientRect();
      if (pr.width > r.width + 24 || pr.height > r.height + 90) break;
      node = node.parentElement;
    }
    return node;
  }

  /* ------------------------------ Scan ------------------------------ */

  function scan() {
    S.dropStaleLinkCovers();

    // 1. Link-based (confident): an anchor to a Reel, post or story that is a card.
    document.querySelectorAll('a[href]').forEach((a) => {
      if (a.closest(COVERED)) return;
      const type = S.classifyLink(a);
      if (!type) return;
      const r = a.getBoundingClientRect();
      const isCard = a.querySelector('img, video, canvas') || (r.width >= 100 && r.height >= 100);
      if (isCard) S.cover(a, type, 'link', a); // plain-text links stay as text
    });

    // 2. Shape-based media: Reels, posts and story thumbnails with no link.
    document.querySelectorAll('img, video').forEach((m) => {
      if (m.closest(COVERED)) return;
      const r = m.getBoundingClientRect();
      if (r.width < 60 || r.height < 90) return;

      // Story reply or mention: a thumbnail beside short text that mentions a story.
      let anc = m.parentElement;
      for (let i = 0; anc && anc !== document.body && i < 5; i++, anc = anc.parentElement) {
        const ar = anc.getBoundingClientRect();
        if (ar.height > r.height + 140) break; // stay within this message row
        const text = anc.textContent || '';
        if (text.length < 160 && RULES.storyWord.test(text)) {
          S.cover(m.parentElement, 'story', 'story');
          return;
        }
      }

      // Reel or post card: the username header overlays the top of a tall video or photo.
      if (r.width >= 120 && r.height >= Math.max(200, r.width * 1.3)) {
        if (avatarOverlapsTop(m, r)) {
          const reelish = m.tagName === 'VIDEO' || m.closest('[aria-label*="reel" i]');
          S.cover(cardAround(m, r), reelish ? 'reel' : 'post', 'card');
          return;
        }
      }

      // Shared card with the author above or below the media, inside a container
      // barely wider than the media. A friend's photo has no such header: a
      // sender's avatar sits beside the bubble, not above it.
      if (r.width < 140 || r.height < 140) return;
      anc = m.parentElement;
      for (let i = 0; anc && anc !== document.body && i < 6; i++, anc = anc.parentElement) {
        const ar = anc.getBoundingClientRect();
        if (ar.width > r.width + 48 || ar.height > r.height + 260) break;
        const avatar = Array.from(anc.querySelectorAll('img')).find((s) => {
          if (s === m) return false;
          const sr = s.getBoundingClientRect();
          return isAvatarSized(sr) && sr.width <= 56 &&
            sr.left >= r.left - 4 && sr.right <= r.right + 4 &&
            (sr.bottom <= r.top + 2 || sr.top >= r.bottom - 2);
        });
        if (avatar && (anc.textContent || '').trim()) {
          const reelish = m.tagName === 'VIDEO' || anc.querySelector('svg[aria-label*="reel" i], svg[aria-label*="clip" i]');
          S.cover(anc, reelish ? 'reel' : 'post', 'card');
          return;
        }
      }
    });

    // 3. Profile pictures (chat list, Notes row, message headers): smiley instead.
    document.querySelectorAll('img').forEach((img) => {
      const inCover = img.closest(COVERED);
      const want = !inCover && isAvatarSized(img.getBoundingClientRect());
      if (want) img.setAttribute('data-sanity-avatar', '');
      else if (img.hasAttribute('data-sanity-avatar')) img.removeAttribute('data-sanity-avatar');
    });
  }

  /* ------------------------------ Settings ------------------------------ */

  // Opening instagram.com lands on your messages instead of the black screen.
  function onSettings(sanity) {
    const s = sanity.settings;
    if (s.enabled && s.startInMessages && location.pathname === '/' && window.top === window) {
      location.replace('/direct/inbox/');
    }
  }

  S.register({
    id: 'instagram',
    matches: (loc) => IG.test(loc.hostname),
    decide,
    scan,
    onSettings,
  });
})();
