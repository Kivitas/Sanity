/* Sanity adapter: web.whatsapp.com
 *
 * Chats stay readable. A Reel, YouTube Short, TikTok or post that arrives as a
 * link (or as a link preview) is covered where it appears in the chat.
 * Forwarded video files cannot be recognised as Reels, so they are not covered.
 */
(() => {
  'use strict';
  const S = window.Sanity;

  S.register({
    id: 'whatsapp',
    matches: (loc) => loc.hostname === 'web.whatsapp.com',
    decide: () => ({ state: 'allow' }),
    scan() {
      S.coverLinksIn(document, '[role="row"], [data-id]');
    },
  });
})();
