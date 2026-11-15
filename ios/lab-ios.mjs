// Drives real iOS Safari in the iOS Simulator (Appium/XCUITest) against the local lab page and
// records, for each picker version and tap method, whether the month arrows work, plus a detailed
// event log that shows WHERE things go wrong (no touch? no click? click but nothing redrawn?).
//
// Taps are real touches through the simulator (Appium nativeWebTap, or XCUITest via accessibility),
// so iOS's own touch -> click handling is exercised.
import { remote } from 'webdriverio';
import fs from 'node:fs';
import { VERSIONS as ALL_VERSIONS } from '../serve.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const OUT = process.env.OUT_DIR || 'ios-results';
const DEVICE = process.env.DEVICE || 'iPhone 17', IOS = process.env.IOS || '26.5';
const VERSIONS = (!process.env.VERSIONS || process.env.VERSIONS === 'all') ? Object.keys(ALL_VERSIONS) : process.env.VERSIONS.split(',').map(s => s.trim()).filter(Boolean);
const QUICK = process.env.QUICK === '1';   // breadth jobs: only the core checks
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const FIELD = { 'hello-date': 'label[for="hello-date"] .dp-field', 'quote-date': '#quote-date ~ .dp-field' };
const NEXT = '.dp-pop:not([hidden]) .dp-nav[aria-label="Next month"]';
const rows = [];
let shotN = 0, WEB;

const OPTS = {
  hostname: '127.0.0.1', port: 4723, path: '/', logLevel: 'warn', connectionRetryTimeout: 900000, connectionRetryCount: 0,
  capabilities: {
    platformName: 'iOS', browserName: 'Safari', 'appium:automationName': 'XCUITest',
    'appium:deviceName': DEVICE, 'appium:platformVersion': IOS,
    ...(process.env.UDID ? { 'appium:udid': process.env.UDID } : {}),
    'appium:nativeWebTap': true,
    'appium:wdaLaunchTimeout': 600000, 'appium:wdaConnectionTimeout': 600000, 'appium:newCommandTimeout': 300,
    'appium:safariInitialUrl': 'about:blank',
    'appium:simulatorStartupTimeout': 300000,   // GitHub's Macs can be slow to finish booting
    'appium:webviewConnectTimeout': 90000,      // ...and slow to expose Safari's page to the debugger
  },
};
// Session start is the flaky part on CI: try up to 3 times.
let driver;
for (let attempt = 1; ; attempt++) {
  try { driver = await remote(OPTS); break; }
  catch (e) { console.log(`session attempt ${attempt} failed: ${e.message.split('\n')[0]}`); if (attempt >= 3) throw e; await sleep(15000); }
}

// ---- in-page instrumentation -------------------------------------------------------------
const INSTRUMENT = () => {
  if (window.__lab) return 'already';
  const t0 = performance.now();
  window.__lab = { log: [], renders: 0 };
  const L = s => window.__lab.log.push(`${String(Math.round(performance.now() - t0)).padStart(5)}ms ${s}`);
  const desc = el => {
    if (!el || !el.closest) return String(el && el.nodeName);
    const h = el.closest('.dp-nav,.dp-field,.dp-day,.dp-pop,h1,label,section,form');
    return h ? (h.getAttribute('aria-label') || (h.className ? '.' + String(h.className).split(' ')[0] : h.tagName)) : el.tagName;
  };
  for (const t of ['touchstart', 'touchend', 'touchcancel', 'pointerdown', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'click', 'dblclick']) {
    document.addEventListener(t, e => {
      const p = (e.changedTouches && e.changedTouches[0]) || e;
      L(`${t.padEnd(13)} ${e.pointerType || ''} @${Math.round(p.clientX)},${Math.round(p.clientY)} -> ${desc(e.target)}${e.target.isConnected ? '' : ' (DETACHED)'}${e.isTrusted ? '' : ' (synthetic)'}`);
    }, true);
  }
  window.addEventListener('error', e => L('PAGE ERROR ' + e.message));
  window.addEventListener('unhandledrejection', e => L('UNHANDLED REJECTION ' + (e.reason && e.reason.message || e.reason)));
  // One "render" = one batch of DOM changes inside the calendar popup.
  new MutationObserver(ms => { if (ms.some(m => m.target.closest && m.target.closest('.dp-pop'))) { window.__lab.renders++; L('calendar redrew'); } })
    .observe(document.body, { subtree: true, childList: true });
  return 'ok';
};
const STATE = () => {
  const pop = document.querySelector('.dp-pop:not([hidden])'), l = window.__lab || { log: [], renders: 0 };
  const s = { open: !!pop, title: pop ? pop.querySelector('.dp-head strong')?.textContent : null, log: l.log.splice(0), renders: l.renders,
    zoom: Math.round(((window.visualViewport && window.visualViewport.scale) || 1) * 100) / 100,
    version: document.querySelector('meta[name="picker-version"]')?.content };
  l.renders = 0;
  if (pop) { const n = pop.querySelector('[aria-label="Next month"]').getBoundingClientRect(); s.next = { x: Math.round(n.left), y: Math.round(n.top), w: Math.round(n.width), h: Math.round(n.height) }; }
  return s;
};
const st = () => driver.execute(STATE);
const monthIndex = t => { const d = new Date(`1 ${t}`); return isNaN(d) ? null : d.getFullYear() * 12 + d.getMonth(); };

async function shot(name) {
  try { await driver.saveScreenshot(`${OUT}/${String(++shotN).padStart(3, '0')}-${name.replace(/[^\w-]+/g, '-')}.png`); } catch (e) { console.log('screenshot failed:', e.message); }
}
async function load(v) {
  await driver.url(`${BASE}/?v=${v}&t=${Date.now()}`);
  await driver.waitUntil(() => driver.execute(() => document.readyState === 'complete' && !!document.querySelector('.dp-field')), { timeout: 30000 });
  await driver.execute(INSTRUMENT);
  const got = await driver.execute(() => document.querySelector('meta[name="picker-version"]')?.content);
  if (got !== v) throw new Error(`expected version ${v}, page says ${got}`);
}
async function centre(sel) { await driver.execute(s => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel); await sleep(700); }
async function tapWeb(sel) { await centre(sel); await (await driver.$(sel)).click(); }
// Tap/double-tap through iOS accessibility at the centre of the button (absolute screen coordinates).
async function tapNative(label, gesture = 'tap') {
  await driver.switchContext('NATIVE_APP');
  try {
    const el = await driver.$(`-ios predicate string:type == "XCUIElementTypeButton" AND label == "${label}"`);
    if (!(await el.isExisting())) throw new Error(`no accessible button "${label}"`);
    const r = await driver.getElementRect(el.elementId), x = r.x + r.width / 2, y = r.y + r.height / 2;
    await driver.execute(gesture === 'double' ? 'mobile: doubleTap' : 'mobile: tap', { x, y });
  } finally { await driver.switchContext(WEB); }
}
function save() {
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ device: DEVICE, ios: IOS, rows }, null, 2));
}
function record(r) {
  rows.push({ device: DEVICE, ios: IOS, ...r });
  console.log(`[${r.version}] ${r.field} | ${r.check}: ${r.before ?? ''} -> ${r.after ?? ''} ${r.pass ? 'PASS' : 'FAIL'} ${r.note || ''}`);
  if (r.events?.length) console.log('    ' + r.events.join('\n    '));
  save();
}

// ---- checks --------------------------------------------------------------------------------
async function arrowCheck(v, field, check, expect, run) {
  await load(v);
  await tapWeb(FIELD[field]); await sleep(800);
  const s0 = await st();
  if (!s0.open) { record({ version: v, field, check, pass: false, note: 'calendar did not open', events: s0.log }); return; }
  let note = '';
  try { await run(); } catch (e) { note = 'ERROR ' + e.message.split('\n')[0]; }
  await sleep(1200);
  const s1 = await st();
  await shot(`${v}-${field}-${check}`);
  const moved = s1.title && s0.title ? monthIndex(s1.title) - monthIndex(s0.title) : null;
  record({ version: v, field, check, before: s0.title, after: s1.open ? s1.title : 'CALENDAR CLOSED', moved, expect,
    pass: s1.open && moved === expect, renders: s1.renders, zoom: s1.zoom, next: s0.next,
    note: [note, s1.zoom !== 1 ? `page zoomed to ${s1.zoom}` : ''].filter(Boolean).join('; '), events: s1.log });
}

async function tapOutsideCheck(v) {
  await load(v);
  await tapWeb(FIELD['hello-date']); await sleep(800);
  await st();
  let note = '';
  try { await tapWeb('#heading'); } catch (e) { note = 'ERROR ' + e.message.split('\n')[0]; }
  await sleep(1000);
  const s = await st();
  await shot(`${v}-tap-outside`);
  record({ version: v, field: 'hello-date', check: 'tap outside closes', after: s.open ? 'still open' : 'closed', pass: !s.open, note, events: s.log });
}

async function layoutCheck(v) {
  await load(v);
  // Open directly on next month (the reserved week) without relying on the arrows.
  await driver.execute(() => { const n = new Date(), d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 20)); document.getElementById('hello-date').value = d.toISOString().slice(0, 10); });
  await tapWeb(FIELD['hello-date']); await sleep(800);
  const m = await driver.execute(() => {
    const pop = document.querySelector('.dp-pop:not([hidden])'); if (!pop) return null;
    const g = pop.querySelector('.dp-grid'), vw = document.documentElement.clientWidth, r = pop.getBoundingClientRect();
    return { busy: pop.querySelectorAll('.dp-day.is-busy').length, gridOverflow: g.scrollWidth - g.clientWidth, left: Math.round(r.left), right: Math.round(r.right), vw };
  });
  await shot(`${v}-layout-reserved-week`);
  const pass = !!m && m.busy === 7 && m.gridOverflow <= 1 && m.left >= 0 && m.right <= m.vw;
  record({ version: v, field: 'hello-date', check: 'reserved week fits on screen', after: m ? `grid overflow ${m.gridOverflow}px, calendar ${m.left}-${m.right} of ${m.vw}` : 'did not open', pass });
}

// ---- run -------------------------------------------------------------------------------------
let harnessError = null;
try {
  WEB = await driver.getContext();
  const ua = await (async () => { await driver.url(`${BASE}/?v=original`); return driver.execute(() => navigator.userAgent); })();
  // Warm-up: the very first tap of a Safari session can be swallowed (touch, but no click). Spend it here.
  await driver.execute(INSTRUMENT); await tapWeb('#intro'); await sleep(1000);
  console.log('warm-up tap events:', JSON.stringify((await st()).log));
  console.log(`Device: ${DEVICE}, iOS ${IOS}\nUser agent: ${ua}\nContexts: ${JSON.stringify(await driver.getContexts())}\nVersions: ${VERSIONS.join(', ')}`);
  for (const v of VERSIONS) {
    const fields = QUICK ? ['hello-date'] : ['hello-date', 'quote-date'];
    for (const field of fields) {
      await arrowCheck(v, field, 'tap Next (screen tap)', 1, () => tapWeb(NEXT));
      await arrowCheck(v, field, 'tap Next (accessibility tap)', 1, async () => { await centre(NEXT); await tapNative('Next month'); });
      if (!QUICK) await arrowCheck(v, field, 'tap Next x3, 1s apart', 3, async () => { for (let i = 0; i < 3; i++) { await tapWeb(NEXT); await sleep(1000); } });
      await arrowCheck(v, field, 'double-tap Next', 2, async () => { await centre(NEXT); await tapNative('Next month', 'double'); });
    }
    await tapOutsideCheck(v);
    await layoutCheck(v);
  }
} catch (e) {
  harnessError = e; console.error('HARNESS ERROR:', e);
  await shot('harness-error');
} finally {
  await driver.deleteSession().catch(() => {});
}

// ---- report ----------------------------------------------------------------------------------
const head = `### ${DEVICE} · iOS ${IOS}\n\n`;
const table = ['| Version | Field | Check | Before | After | Result |', '|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.version} | ${r.field} | ${r.check} | ${r.before ?? ''} | ${r.after ?? ''} | ${r.pass ? '✅' : '❌'}${r.note ? ' ' + r.note : ''} |`)].join('\n');
const md = head + table + (harnessError ? `\n\n**Harness error:** ${String(harnessError.message).split('\n')[0]}` : '') + '\n';
fs.writeFileSync(`${OUT}/results.md`, md);
save();
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
console.log('\n' + md);
// Exploratory: test failures are data, not job failures. Only a broken harness fails the job.
process.exit(harnessError || rows.length === 0 ? 1 : 0);
