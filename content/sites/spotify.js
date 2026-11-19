/* Sanity adapter: open.spotify.com (Spotify Web Player).
 *
 * Music keeps playing. What is hidden:
 *   - every album, playlist, artist and song picture (CSS, content/blocker.css);
 *   - video loops such as Spotify's Canvas, so only the sound is left.
 */
(() => {
  'use strict';
  const S = window.Sanity;

  S.register({
    id: 'spotify',
    keepAudio: true,
    matches: (loc) => loc.hostname === 'open.spotify.com',
    decide: () => ({ state: 'allow' }),
    scan() {
      document.querySelectorAll('video').forEach((v) => {
        const box = v.parentElement || v;
        if (!box.closest('[data-sanity-covered]')) S.cover(box, 'video', 'video');
      });
    },
  });
})();
