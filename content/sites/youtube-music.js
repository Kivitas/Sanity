/* Sanity adapter: music.youtube.com
 *
 * Music keeps playing. What is hidden:
 *   - every thumbnail and album or song image (CSS, in content/blocker.css);
 *   - the music video picture. The video keeps playing, so only the audio is
 *     heard; the picture is replaced by the cover.
 */
(() => {
  'use strict';
  const S = window.Sanity;

  S.register({
    id: 'youtube-music',
    keepAudio: true,
    matches: (loc) => loc.hostname === 'music.youtube.com',
    decide: () => ({ state: 'allow' }),
    scan() {
      document.querySelectorAll('video').forEach((v) => {
        const box = v.parentElement || v;
        if (!box.closest('[data-sanity-covered]')) S.cover(box, 'video', 'video');
      });
    },
  });
})();
