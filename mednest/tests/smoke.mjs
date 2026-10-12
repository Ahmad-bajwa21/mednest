// Headless smoke test: stub browser globals, seed data, render every screen,
// and assert no runtime errors are thrown.
import { pathToFileURL } from 'node:url';

const PID = 'p1', D1 = 'd1', D2 = 'd2', D3 = 'd3';
const seed = {
  profiles: [{ id: PID, name: 'Ammi', relation: 'Mother', birthYear: '1962', sex: 'F', bloodGroup: 'O+', allergies: 'penicillin', color: '#0F766E', createdAt: '2026-01-01' }],
  documents: [
    { id: D1, profileId: PID, type: 'Lab report', docDate: '2026-03-01', doctor: 'Dr. Khan', followUp: '2026-10-15' },
    { id: D2, profileId: PID, type: 'Lab report', docDate: '2026-06-01', doctor: 'Dr. Khan' },
    { id: D3, profileId: PID, type: 'Prescription', docDate: '2026-09-01', doctor: 'Dr. Ali' },
  ],
  medicines: [{ id: 'm1', profileId: PID, documentId: D3, name: 'Metformin', dose: '500 mg', times: ['Morning', 'Night'], durationDays: '30', startDate: '2026-09-01', active: true }],
  results: [
    { id: 'r1', profileId: PID, documentId: D1, docDate: '2026-03-01', test: 'HbA1c', value: '6.5', unit: '%', rangeLow: '', rangeHigh: '5.7' },
    { id: 'r2', profileId: PID, documentId: D2, docDate: '2026-06-01', test: 'HbA1c', value: '6.8', unit: '%', rangeLow: '', rangeHigh: '5.7' },
    { id: 'r3', profileId: PID, documentId: D3, docDate: '2026-09-01', test: 'HbA1c', value: '7.2', unit: '%', rangeLow: '', rangeHigh: '5.7' },
  ],
};

// ---- stubs ----
const store = new Map();
store.set('mednest.v1', JSON.stringify(seed));
store.set('mednest.onboarded', '1');
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

let lastHTML = '';
const elStub = () => ({
  set innerHTML(v) { lastHTML = v; }, get innerHTML() { return lastHTML; },
  querySelectorAll: () => [], querySelector: () => null,
  addEventListener: () => {}, classList: { add() {}, remove() {}, toggle() {} },
});
const appEl = elStub();
globalThis.document = {
  querySelector: (s) => (s === '#app' ? appEl : null),
  createElement: () => ({ click() {}, set href(v) {}, set download(v) {} }),
};
globalThis.window = { addEventListener: (ev, fn) => { if (ev === 'hashchange') globalThis.__hashchange = fn; }, scrollTo: () => {}, print: () => {}, __draft: null };
// make window properties also global (code uses window.__doc etc)
globalThis.location = { hash: '' };
globalThis.Blob = class { constructor(a) { this.size = (a?.[0] || '').length; } };
URL.createObjectURL = () => 'blob:x';
globalThis.alert = () => {}; globalThis.confirm = () => true; globalThis.prompt = () => 'DELETE';

// proxy window.* reads/writes to globalThis so `window.__doc = x` and `window.__doc` work
globalThis.window = new Proxy(globalThis.window, {
  get: (t, p) => (p in t ? t[p] : globalThis['__win_' + String(p)]),
  set: (t, p, v) => { if (p === '__hashchange') globalThis.__hashchange = v; globalThis['__win_' + String(p)] = v; return true; },
});

const modUrl = process.argv[2] ? pathToFileURL(process.argv[2]).href : new URL('../app.js', import.meta.url).href;
await import(modUrl); // runs route() once (renders profiles)

const routes = [
  ['#/welcome', 'welcome'],
  ['#/', 'profiles'],
  ['#/settings', 'settings'],
  ['#/import', 'import'],
  ['#/health-info', 'health info'],
  ['#/profile/new', 'new profile form'],
  [`#/profile/${PID}`, 'overview'],
  [`#/profile/${PID}/edit`, 'edit'],
  [`#/profile/${PID}/add`, 'add document'],
  [`#/profile/${PID}/timeline`, 'timeline'],
  [`#/profile/${PID}/meds`, 'meds'],
  [`#/profile/${PID}/ask`, 'ask'],
  [`#/profile/${PID}/summary`, 'summary'],
  [`#/profile/${PID}/share`, 'share'],
  [`#/profile/${PID}/doc/${D1}`, 'doc detail'],
];

let pass = 0, fail = 0;
for (const [hash, label] of routes) {
  try {
    globalThis.location.hash = hash;
    globalThis.__hashchange();
    const ok = typeof lastHTML === 'string' && lastHTML.length > 0;
    if (!ok) throw new Error('empty render');
    console.log(`✅ ${label.padEnd(16)} rendered (${lastHTML.length} chars)`);
    pass++;
  } catch (e) {
    console.log(`❌ ${label.padEnd(16)} ${e.message}`);
    fail++;
  }
}

// spot-check content expectations
const checks = [];
globalThis.location.hash = `#/profile/${PID}`;
globalThis.__hashchange();
checks.push(['overview shows rising HbA1c note', /HbA1c has risen across the last 3 readings \(6\.5, 6\.8, 7\.2\)/.test(lastHTML)]);
checks.push(['overview shows out-of-range warn', /pill warn/.test(lastHTML)]);
checks.push(['summary built with age', /\d+ years, F/.test(lastHTML)]);
checks.push(['coming up shows Metformin times', /8:00, 21:00/.test(lastHTML)]);
globalThis.location.hash = `#/profile/${PID}/doc/${D1}`;
globalThis.__hashchange();
checks.push(['doc detail "in simple words"', /Your HbA1c is 6\.5/.test(lastHTML)]);

console.log('\n--- content checks ---');
for (const [label, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${label}`); ok ? pass++ : fail++; }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
