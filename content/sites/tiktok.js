/* Sanity adapter: tiktok.com
 *
 * Like Instagram: only messages (and sign-in pages) are allowed. The For You
 * feed, videos, profiles and search are covered. Shared TikToks in other
 * places are covered by the shared link rules in content/core.js.
 */
(() => {
  'use strict';
  const S = window.Sanity;

  const TT = /(^|\.)tiktok\.com$/;
  const AUTH = ['/login', '/signup', '/passport', '/legal'];
  const BACK = {
    label: 'Go back',
    action: () => { if (history.length > 1) history.back(); else location.assign('https://www.tiktok.com/messages'); },
  };

  function decide(loc) {
    const p = loc.pathname;
    if (AUTH.some((a) => p.startsWith(a))) return { state: 'auth' };
    if (p === '/messages' || p.startsWith('/messages/')) return { state: 'allow' };
    return { state: 'block', button: BACK };
  }

  function scan() {
    S.coverLinksIn(document, 'li, [role="listitem"], [role="row"], [data-e2e="chat-list-item"]');
  }

  S.register({
    id: 'tiktok',
    matches: (loc) => TT.test(loc.hostname),
    decide,
    scan,
  });
})();
