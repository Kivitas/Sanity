#!/usr/bin/env node
/* Renders the README screenshots from the extension running on the mock pages in
 * tests/fixtures. No real accounts, names or photos are used.
 *   node tests/screenshots.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const FIX = path.join(__dirname, 'fixtures');
const { chromium } = require('playwright');

const SHOTS = [
  { file: 'chat-covers.png', url: 'https://www.instagram.com/direct/t/1/', fixture: 'instagram-dm.html', size: { width: 900, height: 980 }, wait: 600 },
  { file: 'shorts-blocked.png', url: 'https://www.youtube.com/shorts/abc123', fixture: 'youtube-shorts.html', size: { width: 900, height: 620 }, wait: 400 },
  { file: 'youtube-home.png', url: 'https://www.youtube.com/', fixture: 'youtube-home.html', size: { width: 900, height: 420 }, wait: 600 },
];

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanity-shots-'));
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chromium',
    executablePath: process.env.SANITY_CHROME || undefined,
    headless: true,
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--no-sandbox'],
  });
  try {
    await ctx.route(/^https?:\/\//, (route) => {
      const url = route.request().url();
      const shot = SHOTS.find((s) => s.url === url) || SHOTS.find((s) => url.startsWith(s.url.split('/shorts')[0] + '/'));
      if (!shot) return route.abort();
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(FIX, shot.fixture)) });
    });
    for (const s of SHOTS) {
      const page = await ctx.newPage();
      await page.setViewportSize(s.size);
      await page.goto(s.url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(s.wait);
      await page.screenshot({ path: path.join(OUT, s.file), type: 'png' });
      await page.close();
      console.log('wrote', path.join('docs', 'screenshots', s.file));
    }
  } finally {
    await ctx.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
