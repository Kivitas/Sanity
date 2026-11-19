# Contributing to Sanity

Thanks for helping. Instagram changes its website often, so fixes for breakage are the most valuable contribution.

## Reporting a bug

Please include:

- Your Chrome version and Sanity version
- The page it happened on (the path only, for example `/direct/t/…`)
- What you expected and what happened
- A screenshot, with names and message text blurred or cropped out

Never paste message contents or account details into an issue.

## Fixing a layout change

Each site has its own small file in `content/sites/`:

- `instagram.js`: the messages route, the interface check (`RULES.strongSignals`), and the Reel, post, story, avatar and card rules
- `youtube.js`, `youtube-music.js`, `spotify.js`, `tiktok.js`, `whatsapp.js`, `search.js`: the pages that are blocked or allowed, and the elements to cover
- `core.js`: the shared link rules (`LINK_RULES`) that spot Reels, Shorts, TikToks, posts and stories, and the shared cover screen
- `blocker.css`: the look of covers and the fail-closed hiding

Guidelines:

- Prefer links, ARIA roles, element types and tag names over generated class names. Class names change often.
- Fail closed. If something can't be identified and it is clearly feed content, cover it. If it might be a friend's message, leave it visible.
- Never read, store or send message text, search text or browsing history.
- No new permissions, no network requests, no remote code, no analytics.
- No "reveal" button for covered content.
- Keep the motivational lines kind. Don't attribute a quote to a real person unless you are sure of the source.

## Testing

```bash
npm install
npm test
```

`tests/run.js` loads the extension (the repo root) in Chromium and checks it against the mock pages in `tests/fixtures`. If you change detection, add a fixture for the case and a check in `tests/run.js`.

The mock pages are not the real sites. Also check by hand on the real site: the feed, a Reel or Short link, a post link, a profile, your inbox, a chat with a shared Reel, a chat with a photo from a friend, a chat with a one-time photo, a voice note, the login page, and the browser back button.

## Credit

Sanity is made by kivitas and released under the MIT license. Keep the copyright notice in any copy you share.

Source and issues: https://github.com/kivitas

## Principles

Free forever. Open source. No tracking. No ads or subscriptions. Kind wording, never guilt.
