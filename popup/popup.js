/* Sanity popup.
   Turn on: instant.
   Pause 10 min: 30-second cooldown, then confirm.
   Turn off: 30-second cooldown, then your PIN.
   A PIN is a commitment device, not security: anyone with access to this
   browser profile can still remove the extension. */
'use strict';

const COOLDOWN_MS = 30 * 1000;
const CONFIRM_WINDOW_MS = 2 * 60 * 1000;
const PAUSE_MS = 10 * 60 * 1000;
const DEFAULTS = { enabled: true, pausedUntil: 0, showStats: true };

const $ = (id) => document.getElementById(id);
let settings = { ...DEFAULTS };
let stats = { day: '', today: 0, total: 0 };
let cooldown = null; // { action: 'off' | 'pause', start: number }
let pinOpen = false;
let pinState = { pinHash: '', pinTries: 0 };

const isPaused = () => settings.enabled && Date.now() < (settings.pausedUntil || 0);
const isActive = () => settings.enabled && !isPaused();
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function render() {
  const dot = $('dot');
  dot.className = 'dot';
  const today = stats.day === todayKey() ? stats.today : 0;
  if (isActive()) {
    dot.classList.add('on');
    $('statusText').textContent = 'Active';
    $('statusSub').textContent = !settings.showStats ? 'Covering reels, shorts and feeds.' :
      today === 0 ? 'Nothing to skip yet today.' : `${today} scroll${today === 1 ? '' : 's'} skipped today.`;
  } else if (isPaused()) {
    dot.classList.add('paused');
    const left = Math.max(0, settings.pausedUntil - Date.now());
    const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    $('statusText').textContent = 'Paused';
    $('statusSub').textContent = `Back on automatically in ${m}:${String(s).padStart(2, '0')}.`;
  } else {
    $('statusText').textContent = 'Off';
    $('statusSub').textContent = 'Instagram is showing everything.';
  }
  $('activeActions').hidden = !isActive();
  $('onBtn').hidden = isActive();
  $('openDm').className = isActive() ? 'primary wide' : 'wide';

  const inCooldown = !!cooldown && isActive() && !pinOpen;
  $('mainView').hidden = inCooldown || pinOpen;
  $('cooldownView').hidden = !inCooldown;
  $('pinView').hidden = !pinOpen;
  if (inCooldown) renderCooldown();
}

function renderCooldown() {
  const elapsed = Date.now() - cooldown.start;
  const left = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
  if (elapsed > COOLDOWN_MS + CONFIRM_WINDOW_MS) return cancelCooldown();
  const what = cooldown.action === 'pause' ? 'pause for 10 minutes' : 'turn Sanity off';
  $('barFill').style.width = Math.min(100, (elapsed / COOLDOWN_MS) * 100) + '%';
  if (left > 0) {
    $('cooldownText').textContent = `You can ${what} in ${left} second${left === 1 ? '' : 's'}.`;
    $('confirmBtn').hidden = true;
  } else {
    $('cooldownText').textContent = cooldown.action === 'off'
      ? 'Next you will enter your PIN.' : 'Still want to? Your messages work either way.';
    $('confirmBtn').hidden = false;
    $('confirmBtn').textContent = cooldown.action === 'pause' ? 'Yes, pause for 10 minutes' : 'Continue to PIN';
  }
}

function startCooldown(action) {
  cooldown = { action, start: Date.now() };
  chrome.storage.local.set({ cooldown });
  render();
}

function cancelCooldown() {
  cooldown = null;
  chrome.storage.local.remove('cooldown');
  render();
}

function save(patch) {
  settings = { ...settings, ...patch };
  chrome.storage.sync.set(patch);
  render();
}

/* ------------------------------ PIN ------------------------------ */

function openPin() {
  pinOpen = true;
  $('pinInput').value = '';
  if (!pinState.pinHash) {
    $('pinTitle').textContent = 'No PIN is set yet.';
    $('pinMsg').textContent = 'Set one in Settings first. Turning off needs it.';
    $('pinMsg').classList.add('bad');
    $('pinInput').disabled = true;
    $('pinSubmit').hidden = true;
  } else {
    $('pinTitle').textContent = 'Enter your PIN to turn off.';
    $('pinMsg').innerHTML = '&nbsp;';
    $('pinMsg').classList.remove('bad');
    $('pinInput').disabled = false;
    $('pinSubmit').hidden = false;
    setTimeout(() => $('pinInput').focus(), 0);
  }
  render();
}

function closePin() {
  pinOpen = false;
  chrome.storage.local.set({ pinTries: 0 });
  pinState.pinTries = 0;
  render();
}

function pinMessage(text, bad) {
  $('pinMsg').textContent = text;
  $('pinMsg').classList.toggle('bad', !!bad);
}

async function submitPin() {
  const entered = $('pinInput').value.trim();
  if (!entered) return;
  if ((await sha256(entered)) === pinState.pinHash) {
    cooldown = null;
    chrome.storage.local.remove(['cooldown', 'pinTries']);
    pinState.pinTries = 0;
    pinOpen = false;
    save({ enabled: false, pausedUntil: 0 });
  } else {
    pinState.pinTries += 1;
    chrome.storage.local.set({ pinTries: pinState.pinTries });
    $('pinInput').value = '';
    pinMessage('Wrong PIN. Try again.', true);
  }
}

/* ------------------------------ Wiring ------------------------------ */

$('pauseBtn').addEventListener('click', () => startCooldown('pause'));
$('offBtn').addEventListener('click', () => startCooldown('off'));
$('cancelBtn').addEventListener('click', cancelCooldown);
$('confirmBtn').addEventListener('click', () => {
  if (!cooldown || Date.now() - cooldown.start < COOLDOWN_MS) return;
  if (cooldown.action === 'off') {
    cooldown = null;
    chrome.storage.local.remove('cooldown');
    openPin();
    return;
  }
  cooldown = null;
  chrome.storage.local.remove('cooldown');
  save({ enabled: true, pausedUntil: Date.now() + PAUSE_MS });
});
$('pinSubmit').addEventListener('click', submitPin);
$('pinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitPin(); });
$('pinCancel').addEventListener('click', closePin);
$('onBtn').addEventListener('click', () => save({ enabled: true, pausedUntil: 0 }));
$('openDm').addEventListener('click', () => chrome.tabs.create({ url: 'https://www.instagram.com/direct/inbox/' }));
$('settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());

chrome.storage.sync.get(DEFAULTS, (stored) => {
  settings = { ...DEFAULTS, ...stored };
  chrome.storage.local.get({ cooldown: null, stats: null, pinHash: '', pinTries: 0 }, (local) => {
    cooldown = local.cooldown;
    stats = local.stats || stats;
    pinState = { pinHash: local.pinHash, pinTries: local.pinTries };
    render();
    setInterval(render, 500);
  });
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') for (const k of Object.keys(changes)) settings[k] = changes[k].newValue;
  if (area === 'local') {
    if (changes.stats && changes.stats.newValue) stats = changes.stats.newValue;
    if (changes.pinHash) pinState.pinHash = changes.pinHash.newValue || '';
  }
  render();
});
