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
