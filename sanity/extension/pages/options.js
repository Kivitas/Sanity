'use strict';
const $ = (id) => document.getElementById(id);
const DEFAULTS = { customMessage: '', startInMessages: true, showStats: true };
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
let savedTimer = null;

function flashSaved() {
  $('saved').textContent = 'Saved.';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { $('saved').innerHTML = '&nbsp;'; }, 1500);
}
function showStats(stats) {
  const s = stats || { day: '', today: 0, total: 0 };
  $('today').textContent = s.day === todayKey() ? s.today : 0;
  $('total').textContent = s.total || 0;
}

if (new URLSearchParams(location.search).has('welcome')) {
  $('welcome').hidden = false;
  $('title').textContent = 'Welcome to Sanity';
  document.title = 'Welcome to Sanity';
}

chrome.storage.sync.get(DEFAULTS, (s) => {
  $('startInMessages').checked = s.startInMessages;
  $('showStats').checked = s.showStats;
  $('msg').value = s.customMessage || '';
});
chrome.storage.local.get({ stats: null }, (l) => showStats(l.stats));
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.stats) showStats(c.stats.newValue); });

for (const id of ['startInMessages', 'showStats']) {
  $(id).addEventListener('change', (e) => { chrome.storage.sync.set({ [id]: e.target.checked }); flashSaved(); });
}
$('msg').addEventListener('input', (e) => { chrome.storage.sync.set({ customMessage: e.target.value.slice(0, 80) }); flashSaved(); });
$('reset').addEventListener('click', () => chrome.storage.local.set({ stats: { day: todayKey(), today: 0, total: 0 } }));
$('openDm').addEventListener('click', () => chrome.tabs.create({ url: 'https://www.instagram.com/direct/inbox/' }));

/* ------------------------------ Turn-off PIN ------------------------------ */
async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const validPin = (v) => /^\d{4,8}$/.test(v);
function pinStatus(text, bad) { $('pinStatus').textContent = text; $('pinStatus').classList.toggle('bad', !!bad); }
function showPinState(hash) {
  $('pinNoPin').hidden = !!hash;
  $('pinHasPin').hidden = !hash;
}
chrome.storage.local.get({ pinHash: '' }, (l) => showPinState(l.pinHash));
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.pinHash) showPinState(c.pinHash.newValue || ''); });

$('setPin').addEventListener('click', async () => {
  const v = $('newPin').value.trim();
  if (!validPin(v)) return pinStatus('Use 4 to 8 digits.', true);
  chrome.storage.local.set({ pinHash: await sha256(v), pinTries: 0 });
  $('newPin').value = '';
  pinStatus('PIN set. Turning off now asks for it.', false);
});
$('changePinBtn').addEventListener('click', async () => {
  const cur = $('curPin').value.trim(), next = $('changePin').value.trim();
  const { pinHash } = await chrome.storage.local.get({ pinHash: '' });
  if ((await sha256(cur)) !== pinHash) return pinStatus('Current PIN is wrong.', true);
  if (!validPin(next)) return pinStatus('New PIN must be 4 to 8 digits.', true);
  chrome.storage.local.set({ pinHash: await sha256(next) });
  $('curPin').value = ''; $('changePin').value = '';
  pinStatus('PIN changed.', false);
});
$('removePinBtn').addEventListener('click', async () => {
  const cur = $('curPin').value.trim();
  const { pinHash } = await chrome.storage.local.get({ pinHash: '' });
  if ((await sha256(cur)) !== pinHash) return pinStatus('Enter your current PIN to remove it.', true);
  chrome.storage.local.remove(['pinHash', 'pinTries']);
  $('curPin').value = '';
  pinStatus('PIN removed. Turning off no longer needs one.', false);
});
