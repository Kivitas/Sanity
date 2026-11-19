# Install Sanity (beginner guide)

**Which folder?** The folder that has `manifest.json` directly inside it. When you unzip or clone this project, that is the top folder.

## Load it in Chrome (to use it)

1. Unzip the download (or clone the repo). You get a folder with `manifest.json` inside.
2. In Chrome, go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** → select that folder → **Select Folder**.
5. Click the puzzle icon in the toolbar and pin **Sanity**.

## Update

Replace the files (or `git pull`), then click the reload icon on Sanity at `chrome://extensions`.

## Pack it into a .crx (optional, for sharing)

1. Go to `chrome://extensions`, turn on **Developer mode**.
2. Click **Pack extension**.
3. Extension root directory: select the folder with `manifest.json`.
4. Leave the private key empty the first time.
5. Click **Pack extension**. A `.crx` and a `.pem` appear in the folder above.

Chrome blocks `.crx` installs outside the Web Store, so use **Load unpacked** to run Sanity.
Keep the `.pem` private. Don't upload it to GitHub.

## Error: "Manifest file is missing or unreadable"

You picked the wrong folder. Choose the folder with `manifest.json` directly inside it.
