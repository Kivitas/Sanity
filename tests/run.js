#!/usr/bin/env node
/* Sanity test runner.
 *
 * Loads this extension in Chromium (unpacked, from the repo root) and checks it
 * against mock pages in tests/fixtures. The mock pages are NOT the real sites.
 * Passing tests show the logic works. They do not prove the selectors still match
 * the live site.
 *
 *   npm install playwright   (once)
 *   node tests/run.js
 *
 * Set SANITY_CHROME=/path/to/chrome to use a specific Chromium build.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  try {
    ({ chromium } = require(require.resolve('playwright', { paths: [process.env.NODE_PATH || '/opt/node-tools/node_modules'] })));
  } catch (e2) {
    console.error('Playwright is not installed. Run: npm install playwright');
    process.exit(2);
  }
}

// Which mock page answers which URL.
const ROUTES = [
  [/^https:\/\/www\.instagram\.com\/direct\//, 'instagram-dm.html'],
  [/^https:\/\/www\.instagram\.com\/reels\//, 'instagram-dm.html'],
  [/^https:\/\/www\.youtube\.com\/(?!shorts)/, 'youtube-home.html'],
  [/^https:\/\/www\.youtube\.com\/shorts/, 'youtube-shorts.html'],
  [/^https:\/\/music\.youtube\.com\//, 'youtube-music.html'],
  [/^https:\/\/open\.spotify\.com\//, 'spotify.html'],
  [/^https:\/\/www\.tiktok\.com\//, 'tiktok-feed.html'],
  [/^https:\/\/web\.whatsapp\.com\//, 'whatsapp.html'],
  [/^https:\/\/www\.google\.com\/search/, 'google-results.html'],
];

const FAKE_LANGUAGE_MODEL = `
  // Stand-in for Chrome's on-device model. Text: YES when it mentions "explicit".
  // Pictures: YES for the 7 px test picture only. Mirrors the real API shape.
  window.LanguageModel = {
    availability: async () => 'available',
    create: async () => ({
      prompt: async (input) => {
        if (Array.isArray(input)) {
          const img = input[0].content.find((c) => c.type === 'image');
          return img && img.value.width === 7 ? 'YES' : 'NO';
        }
        return /explicit/i.test(input) ? 'YES' : 'NO';
      },
      destroy() {},
    }),
  };`;

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

async function main() {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanity-test-'));
  const ctx = await chromium.launchPersistentContext(userDir, {
    channel: 'chromium',
    executablePath: process.env.SANITY_CHROME || undefined,
    headless: true,
    args: [
      `--disable-extensions-except=${ROOT}`,
      `--load-extension=${ROOT}`,
      '--no-sandbox',
    ],
  });

  try {
    await ctx.route(/^https?:\/\//, async (route) => {
      const url = route.request().url();
      const hit = ROUTES.find(([re]) => re.test(url));
      if (!hit) return route.abort();
      return route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: fs.readFileSync(path.join(FIXTURES, hit[1])),
      });
    });

    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
    const extId = sw.url().split('/')[2];

    async function open(url, { fakeModel = false } = {}) {
      const page = await ctx.newPage();
      if (process.env.SANITY_DEBUG) page.on('console', (m) => console.log('  [console]', m.text()));
      if (fakeModel) await page.addInitScript(FAKE_LANGUAGE_MODEL);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.hasAttribute('data-sanity-site'), null, { timeout: 5000 });
      return page;
    }
    const state = (page) => page.evaluate(() => document.documentElement.getAttribute('data-sanity-state'));
    const covered = (page, sel) => page.evaluate((s) => {
      const el = document.querySelector(s);
      return !!(el && el.closest('[data-sanity-covered]'));
    }, sel);
    const coveredItself = (page, sel) => page.evaluate((s) => {
      const el = document.querySelector(s);
      return !!(el && el.hasAttribute('data-sanity-covered'));
    }, sel);
    const avatar = (page, sel) => page.evaluate((s) => !!document.querySelector(s)?.hasAttribute('data-sanity-avatar'), sel);
    const shieldShown = (page) => page.evaluate(() => {
      const h = document.getElementById('sanity-shield');
      return !!h && h.style.display === 'block';
    });
    const imgContent = (page, sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).content, sel);

    /* ------------------------------ Instagram ------------------------------ */
    {
      const p = await open('https://www.instagram.com/direct/t/1/');
      await p.waitForTimeout(300);
      check('IG: messages route is allowed', (await state(p)) === 'allow', await state(p));
      check('IG: shared Reel card (username overlay) is covered', await coveredItself(p, '#reel-wrap'));
      check('IG: friend video without overlay is NOT covered', !(await covered(p, '#friend-video')));
      check('IG: friend photo with avatar beside it is NOT covered', !(await covered(p, '#friend-photo')));
      check('IG: one-time photo is NOT covered', !(await covered(p, '#one-time')));
      check('IG: audio (voice message) is NOT covered', !(await covered(p, '#voice')));
      check('IG: story thumbnail is covered', await covered(p, '#story-thumb'));
      check('IG: profile picture in Notes row gets smiley', await avatar(p, '#pfp-note'));
      check('IG: profile picture beside a photo gets smiley', await avatar(p, '#pfp-side'));
      check('IG: cover shows a motivational line (quote attribute)',
        ((await p.getAttribute('#reel-wrap', 'data-sanity-quote')) || '').length > 20);
      check('IG: avatar CSS replaces the picture with a smiley',
        (await imgContent(p, '#pfp-note')).includes('svg'));
      check('IG: messages page is not blocked', !(await shieldShown(p)));
      await p.close();
    }
    {
      const p = await open('https://www.instagram.com/reels/');
      await p.waitForTimeout(200);
      check('IG: Reels feed is blocked', (await state(p)) === 'block', await state(p));
      check('IG: block screen is shown on the Reels feed', await shieldShown(p));
      await p.close();
    }

    /* ------------------------------ YouTube ------------------------------ */
    {
      const p = await open('https://www.youtube.com/');
      await p.waitForTimeout(300);
      check('YouTube: home is allowed', (await state(p)) === 'allow', await state(p));
      check('YouTube: Shorts card is covered', await coveredItself(p, '#short-card'));
      check('YouTube: regular video card is NOT covered', !(await covered(p, '#video-card')));
      check('YouTube: Shorts shelf is covered', await coveredItself(p, '#shorts-shelf'));
      check('YouTube: sidebar Shorts entry is removed', (await p.evaluate(() => getComputedStyle(document.getElementById('guide-shorts')).display)) === 'none');
      await p.close();
    }
    {
      const p = await open('https://www.youtube.com/shorts/abc123');
      await p.waitForTimeout(200);
      check('YouTube: Shorts page is blocked', (await state(p)) === 'block', await state(p));
      check('YouTube: Shorts page shows the cover', await shieldShown(p));
      await p.close();
    }

    /* ------------------------------ YouTube Music ------------------------------ */
    {
      const p = await open('https://music.youtube.com/watch?v=abc');
      await p.waitForTimeout(300);
      check('YT Music: thumbnail gets the cover', (await imgContent(p, '#album')).includes('svg'));
      check('YT Music: music video picture is covered', await coveredItself(p, '#song-video'));
      check('YT Music: music keeps playing (no mute on the video)', await p.evaluate(() => {
        const v = document.getElementById('music-video');
        return v && v.muted === true ? 'muted' : 'not muted';
      }).then((r) => r === 'not muted'));
      await p.close();
    }

    /* ------------------------------ Spotify ------------------------------ */
    {
      const p = await open('https://open.spotify.com/playlist/abc');
      await p.waitForTimeout(300);
      check('Spotify: album and playlist art is covered', (await imgContent(p, '#playlist-art')).includes('svg'));
      check('Spotify: background artwork is covered', (await p.evaluate(() => getComputedStyle(document.getElementById('bg')).backgroundImage)) === 'none');
      check('Spotify: looping canvas video is covered', await coveredItself(p, '#canvas-box'));
      await p.close();
    }

    /* ------------------------------ TikTok ------------------------------ */
    {
      const p = await open('https://www.tiktok.com/@creator/video/123456');
      await p.waitForTimeout(200);
      check('TikTok: video page is blocked', (await state(p)) === 'block', await state(p));
      await p.close();
    }
    {
      const p = await open('https://www.tiktok.com/messages');
      await p.waitForTimeout(300);
      check('TikTok: messages are allowed', (await state(p)) === 'allow', await state(p));
      check('TikTok: shared TikTok in a chat is covered', await coveredItself(p, '#chat-item'));
      check('TikTok: plain link is NOT covered', !(await covered(p, '#plain')));
      await p.close();
    }

    /* ------------------------------ WhatsApp ------------------------------ */
    {
      const p = await open('https://web.whatsapp.com/');
      await p.waitForTimeout(300);
      check('WhatsApp: YouTube Short link in a chat is covered', await coveredItself(p, '#short-row'));
      check('WhatsApp: ordinary link is NOT covered', !(await covered(p, '#text-row')));
      await p.close();
    }

    /* ------------------------------ Search engines ------------------------------ */
    {
      const p = await open('https://www.google.com/search?q=cute+cats', { fakeModel: true });
      await p.waitForFunction(() => !!document.querySelector('#img-tile[data-sanity-covered]'), null, { timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(300);
      check('Search: ordinary query is allowed', (await state(p)) === 'allow', await state(p));
      check('Search: TikTok behind a Google redirect is covered', await coveredItself(p, '#redirected-tiktok'));
      check('Search: YouTube Short result is covered', await coveredItself(p, '#shorts-result'));
      check('Search: result whose text means explicit content is covered (in context, no word list)', await coveredItself(p, '#text-explicit'));
      check('Search: explicit picture (Images tab / thumbnail) is covered', await coveredItself(p, '#img-tile'));
      check('Search: ordinary picture is NOT covered', !(await covered(p, '#img-safe')));
      check('Search: ordinary result is NOT covered', !(await covered(p, '#plain-result')));
      await p.close();
    }
    {
      const p = await open('https://www.google.com/search?q=explicit+content', { fakeModel: true });
      await p.waitForFunction(() => document.documentElement.getAttribute('data-sanity-state') === 'block', null, { timeout: 5000 })
        .catch(() => {});
      check('Search: explicit query shows the cover (on-device model says yes)', (await state(p)) === 'block', await state(p));
      await p.close();
    }
    {
      const p = await open('https://www.google.com/search?q=explicit+content');
      await p.waitForTimeout(800);
      check('Search: with no on-device model, results show as usual (cannot judge)', (await state(p)) === 'allow', await state(p));
      await p.close();
    }

    /* ------------------------------ Extension pages ------------------------------ */
    {
      const pop = await ctx.newPage();
      await pop.goto(`chrome-extension://${extId}/popup/popup.html`);
      check('Popup: footer links to github.com/kivitas',
        (await pop.locator('footer a[href="https://github.com/kivitas"]').count()) === 1);
      check('Popup: no "first try" wording', !(await pop.content()).toLowerCase().includes('are you sure'));
      await pop.close();

      const opt = await ctx.newPage();
      await opt.goto(`chrome-extension://${extId}/pages/options.html`);
      check('Options: footer links to github.com/kivitas',
        (await opt.locator('footer a[href="https://github.com/kivitas"]').count()) === 1);
      check('Options: no "first try" wording', !(await opt.content()).toLowerCase().includes('first try'));
      await opt.close();
    }
  } finally {
    await ctx.close();
    fs.rmSync(userDir, { recursive: true, force: true });
  }

  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${!r.ok && r.detail ? `  (${r.detail})` : ''}`);
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
