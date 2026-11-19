# Install Sanity (beginner guide)

**Which folder?** Always pick the folder called `extension`. It's the one with `manifest.json` inside.

## Load it in Chrome (to use it)

1. Unzip `sanity.zip`. You get a folder called `sanity`.
2. Open `sanity` → `extension`.
3. In Chrome, go to `chrome://extensions`.
4. Turn on **Developer mode** (top right).
5. Click **Load unpacked** → select `extension` → **Select Folder**.
6. Click the puzzle icon in the toolbar and pin **Sanity**.

## Pack it into a .crx (optional, for sharing)

1. Go to `chrome://extensions`, turn on **Developer mode**.
2. Click **Pack extension**.
3. Extension root directory: select `extension`.
4. Leave the private key empty the first time.
5. Click **Pack extension**. A `.crx` and a `.pem` appear in the folder above `extension`.

Chrome blocks `.crx` installs outside the Web Store, so use **Load unpacked** to run Sanity.
Keep the `.pem` private. Don't upload it to GitHub.

## Error: "Manifest file is missing or unreadable"

You picked the wrong folder. Choose `extension`, the one with `manifest.json` inside.
