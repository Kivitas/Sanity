/* Sanity adapter: youtube.com (not YouTube Music).
 *
 * Everything on YouTube stays usable except Shorts:
 *   - the Shorts page (/shorts/...) is covered;
 *   - Shorts cards and Shorts shelves are covered wherever they appear (home,
 *     search, subscriptions, channels). The Shorts entry in the sidebar is removed.
 * Regular videos, search, comments, playlists and subscriptions are untouched.
 */
(() => {
  'use strict';
  const S = window.Sanity;

  const YT = /(^|\.)youtube\.com$/;
  const SHORT_CARDS = [
    'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-grid-video-renderer',
    'ytd-compact-video-renderer', 'ytd-reel-item-renderer', 'ytd-playlist-video-renderer',
    'ytd-rich-grid-slim-media',
    'ytd-compact-radio-renderer', 'ytd-search-pyv-renderer',
  ].join(', ');
  const SHORT_SHELVES = 'ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts], ytd-shorts, ytd-reel-video-renderer';
  const HOME = { label: 'Go to YouTube home', action: () => location.assign('https://www.youtube.com/') };

  function decide(loc) {
    if (/^\/shorts(\/|$)/.test(loc.pathname)) {
      return {
        state: 'block',
        message: 'YouTube Shorts are paused. Your videos and subscriptions are still here.',
        button: HOME,
      };
    }
    return { state: 'allow' };
  }

  function scan() {
    S.coverLinksIn(document, SHORT_CARDS);
    document.querySelectorAll(SHORT_SHELVES).forEach((el) => {
      if (!el.closest('[data-sanity-covered]')) S.cover(el, 'short', 'shelf');
    });
  }

  S.register({
    id: 'youtube',
    matches: (loc) => YT.test(loc.hostname) && !loc.hostname.startsWith('music.'),
    decide,
    scan,
  });
})();
