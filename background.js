/* Sanity service worker: toolbar badge, pause timer, welcome page, shortcut.
   It never touches page content and makes no network requests. */
'use strict';

const DEFAULTS = { enabled: true, pausedUntil: 0 };
const INBOX = 'https://www.instagram.com/direct/inbox/';

async function refresh() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  const paused = s.enabled && Date.now() < (s.pausedUntil || 0);
  if (!s.enabled) {
    await chrome.action.setBadgeText({ text: 'OFF' });
    await chrome.action.setBadgeBackgroundColor({ color: '#6b6b6b' });
    await chrome.action.setTitle({ title: 'Sanity is off' });
  } else if (paused) {
    await chrome.action.setBadgeText({ text: 'II' });
    await chrome.action.setBadgeBackgroundColor({ color: '#f5b83d' });
    await chrome.action.setTitle({ title: 'Sanity is paused' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: 'Sanity: messages only' });
  }
  if (paused) chrome.alarms.create('resume', { when: s.pausedUntil + 500 });
  else chrome.alarms.clear('resume');
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/options.html?welcome=1') });
  }
  refresh();
});
chrome.runtime.onStartup.addListener(refresh);
chrome.alarms.onAlarm.addListener(refresh);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && ('enabled' in changes || 'pausedUntil' in changes)) refresh();
});
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-messages') chrome.tabs.create({ url: INBOX });
});

/* Explicit-image check: search engines serve thumbnails from a few image hosts.
 * A content script cannot read those bytes across sites, so the service worker
 * fetches them for the on-device check. Only these image hosts are allowed, and
 * only Sanity's own content scripts may ask. Nothing is stored.
 */
const IMAGE_HOSTS = [/(^|\.)gstatic\.com$/, /(^|\.)bing\.net$/, /(^|\.)bing\.com$/, /(^|\.)duckduckgo\.com$/];
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'sanity-fetch-image') return false;
  if (!sender || sender.id !== chrome.runtime.id) { sendResponse({ ok: false }); return false; }
  let url;
  try { url = new URL(msg.url); } catch (e) { sendResponse({ ok: false }); return false; }
  if (url.protocol !== 'https:' || !IMAGE_HOSTS.some((re) => re.test(url.hostname))) {
    sendResponse({ ok: false });
    return false;
  }
  fetch(url.href, { credentials: 'omit', redirect: 'follow' })
    .then(async (res) => {
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !/^image\/(png|jpeg|gif|webp)$/.test(type)) throw new Error('not an image');
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('too large');
      sendResponse({ ok: true, dataUrl: `data:${type};base64,${toBase64(buffer)}` });
    })
    .catch(() => sendResponse({ ok: false }));
  return true; // answer asynchronously
});
