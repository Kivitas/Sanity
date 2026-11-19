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

Most fixes are small edits to the `RULES` object at the top of `content/instagram.js`:

- `sharedLinks`: URL patterns for Reels, posts and stories
- `strongSignals` / `weakSignals`: selectors that prove the messaging interface is present
- `authPrefixes`: sign-in paths that must never be covered

Navigation hiding lives in `content/blocker.css`.

Guidelines:

- Prefer links, ARIA roles and element types over CSS class names. Instagram's class names are generated and change often.
- Fail closed. If something can't be identified, cover it.
- Never read, store or send message text.
- No new permissions, no network requests, no remote code, no analytics.
- No "reveal" button for covered content.

## Testing

1. In `chrome://extensions` (Developer mode on), click **Load unpacked** and select the folder that contains `manifest.json` (the repo root). Click the reload icon after each change.
2. Run the automated checks:

   ```bash
   node tests/run.js
   ```

3. Check by hand on the real site: the feed, a Reel link, a post link, Explore, a profile, your inbox, a chat with a shared Reel, a chat with a gallery photo, the login page, and the browser back button.

If you change detection, add a matching case to `tests/mock.html` and `tests/run.js`.

## Credit

Sanity is made by kivitas and released under the MIT license. Keep the copyright notice in any copy you share.

Source and issues: https://github.com/kivitas

## Principles

Free forever. Open source. No tracking. No ads or subscriptions. Kind wording, never guilt.
