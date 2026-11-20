/* Sanity adapter: web.whatsapp.com
 *
 * Chats stay readable. A Reel, YouTube Short, TikTok or post that arrives as a
 * link (or as a link preview) is covered where it appears in the chat.
 * Forwarded video files cannot be recognised as Reels, so they are not covered.
 * Profile pictures get a smiley instead of the face.
 */
(() => {
  'use strict';
  const S = window.Sanity;

  // Profile pictures are served from WhatsApp's picture host. Small square
  // pictures are treated as avatars too, but emoji (short alt text that is a
  // pictograph) are left alone.
  const PICTURE_HOST = /(^|\.)whatsapp\.net$/;
  const PICTOGRAPH = /\p{Extended_Pictographic}/u;

  function isProfilePicture(img) {
    const src = img.currentSrc || img.src || '';
    try {
      if (PICTURE_HOST.test(new URL(src).hostname)) return true;
    } catch (e) { /* not a URL (data: or blob:), judge by size */ }
    const r = img.getBoundingClientRect();
    if (r.width < 30 || r.width > 60 || Math.abs(r.width - r.height) > 4) return false;
    const alt = (img.getAttribute('alt') || '').trim();
    return !(alt.length > 0 && alt.length <= 4 && PICTOGRAPH.test(alt));
  }

  function markProfilePictures() {
    document.querySelectorAll('img').forEach((img) => {
      if (isProfilePicture(img)) img.setAttribute('data-sanity-avatar', '');
      else if (img.hasAttribute('data-sanity-avatar')) img.removeAttribute('data-sanity-avatar');
    });
  }

  S.register({
    id: 'whatsapp',
    matches: (loc) => loc.hostname === 'web.whatsapp.com',
    decide: () => ({ state: 'allow' }),
    scan() {
      S.coverLinksIn(document, '[role="row"], [data-id]');
      markProfilePictures();
    },
  });
})();
