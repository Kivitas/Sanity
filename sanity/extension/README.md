# 😊 Sanity — Instagram for humans, not algorithms.

A free, open-source Chrome extension that turns Instagram on the web into a messaging-only experience.

*Keep the connection. Lose the addiction.*

- Free forever
- Open source
- No tracking or analytics
- No collection of messages or personal data
- No subscriptions or ads
- No algorithmic feeds
- Messaging without doomscrolling

> Sanity protects communication, not consumption.

Sanity is an independent project. It is not affiliated with, endorsed by, or connected to Instagram or Meta.

## What it does

| Instagram feature | With Sanity |
|---|---|
| Direct messages, text, emoji | Visible |
| Photos and videos a friend sends from their camera or gallery | Visible |
| Story replies in DMs (the text) | Visible |
| Shared Reels and posts in a chat | Covered |
| Story thumbnails in a chat | Covered |
| Home feed, Reels, Explore, Stories, profiles, search, notifications | Covered |
| Login and two-factor pages | Never covered |

Anything Sanity doesn't recognise is covered. The black screen says:

> 😊 Protecting your sanity and dopamine baseline

A covered Reel or post in a chat can't be clicked, and there is no "reveal" button.

## Install (step by step)

You don't need to be a developer. You only need Chrome on a computer.

### Option A: Install from the zip (recommended)

1. Unzip `sanity.zip`. You get a folder called `sanity`.
2. Open the `sanity` folder, then open the folder called `extension`. You should see `manifest.json` in it.
3. In Chrome, type `chrome://extensions` in the address bar and press Enter.
4. Turn on **Developer mode** (switch in the top right).
5. Click **Load unpacked**.
6. Select the **`extension`** folder (the one with `manifest.json` inside), then click **Select Folder**.
7. Pin Sanity: click the puzzle icon in Chrome's toolbar, then the pin next to Sanity.
8. Open <https://www.instagram.com/direct/inbox/>.

> **Which folder?** Always choose `extension`, the folder that contains `manifest.json`. Not `sanity`, and not the zip file.

### Option B: Pack into a `.crx` file (optional)

Packing makes a single `.crx` file. Chrome blocks `.crx` files from installing outside the Chrome Web Store, so use Option A to actually run Sanity. A packed file is useful for sharing or archiving.

1. Go to `chrome://extensions` and turn on **Developer mode**.
2. Click **Pack extension**.
3. **Extension root directory:** choose the `extension` folder (the one with `manifest.json`).
4. **Private key file:** leave this empty the first time.
5. Click **Pack extension**. Chrome creates a `.crx` file and a `.pem` file in the folder above `extension`.
6. Keep the `.pem` file private. You need it to sign later updates. Don't upload it to GitHub.

**Error "Manifest file is missing or unreadable"?** You picked the wrong folder. Choose `extension` (the one with `manifest.json` inside), not the outer `sanity` folder or the zip.

### Update to a new version

1. Replace the files in `extension`.
2. Go to `chrome://extensions` and click the reload icon on Sanity.

### Uninstall

`chrome://extensions`, then **Remove** under Sanity.

## Features

- **Start in messages:** opening instagram.com takes you straight to your inbox.
- **Toolbar badge:** blank when on, `II` when paused, `OFF` when off.
- **Shortcut:** Alt+Shift+M opens your messages (change it at `chrome://extensions/shortcuts`).
- **Turn-off PIN:** turning off needs your PIN, and the first try always fails. Set it in Settings.
- **Welcome and settings page:** your own message for the black screen, and toggles for the options above.
- **Today's count:** a small "scrolls skipped today" note, counted on your device only. You can hide or reset it.
- **Light and dark:** the popup and settings follow your system theme.

## Turning it off

Turning Sanity on is instant. Pausing for 10 minutes or turning off takes a 30-second wait first.

Turning off also needs your **PIN**. Set it under Settings. The first try always says "Wrong PIN" and asks if you're sure. The second correct try turns Sanity off. It's a commitment, not a lock: anyone with access to this browser can still remove the extension.

## What it can't do

- It only works in Chrome on a computer. It does nothing in the Instagram phone apps.
- It doesn't block notifications from your browser or operating system.
- You can always disable it from `chrome://extensions`. It's a commitment tool, not a lock.
- Instagram changes its website often, so parts of Sanity will break from time to time. When it can't recognise the messages page, it stays covered and asks you to report it.
- Cards without a recognisable link, and story thumbnails, are detected by layout and by the English word "story". These checks are less reliable than link detection.

## Privacy

- Sanity never reads, stores or sends your messages.
- It looks only at link targets, element types and element sizes, to decide what to cover.
- The only thing saved is your settings (on/off, pause time, your custom message, your count), using Chrome's own extension storage.
- Permissions: `storage`, `alarms` (to end a pause on time), and access to `instagram.com` only. No remote code, no servers.

## How it works

- `content/blocker.css` hides the page by default, so protection starts before any script runs.
- `content/instagram.js` has two independent systems:
  - **Page level:** allows a page only if the URL is under `/direct/` *and* the messaging interface is found. Everything else gets the shield.
  - **Message level:** inside a chat, covers attachments that link to a Reel, post or story.
- `popup/` is the toolbar window: status, open messages, pause, turn off.
- `pages/` is the welcome and settings page.
- `background.js` updates the toolbar badge, ends a pause on time, and handles the shortcut. It never touches page content.

## Tests

`tests/run.js` loads the extension in Chromium and runs it against `tests/mock.html`, a stand-in page served in place of instagram.com. It needs Node.js and Playwright.

```bash
node tests/run.js
```

The mock page is not Instagram. Passing tests show the logic works, not that the selectors match the live site.

## Contributing

Bug reports and fixes for Instagram layout changes are the most useful contributions. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Links

- GitHub: https://github.com/kivitas

## License

[MIT](LICENSE). Copyright (c) 2026 kivitas.

Made by kivitas.
