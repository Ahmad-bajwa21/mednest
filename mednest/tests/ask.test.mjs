// Unit tests for the safety-critical Ask logic (spec §6.4 Task D).
import { pathToFileURL } from 'node:url';

const PID = 'p1', D1 = 'd1', D3 = 'd3';
const seed = {
  profiles: [{ id: PID, name: 'Ammi', relation: 'Mother', birthYear: '1962', sex: 'F', allergies: 'penicillin', color: '#0F766E' }],
  documents: [
    { id: D1, profileId: PID, type: 'Lab report', docDate: '2026-09-10', doctor: 'Dr. Khan' },
    { id: D3, profileId: PID, type: 'Prescription', docDate: '2026-09-12', doctor: 'Dr. Ali' },
  ],
  medicines: [{ id: 'm1', profileId: PID, documentId: D3, name: 'Metformin', dose: '500 mg', times: ['Morning'], active: true }],
  results: [{ id: 'r1', profileId: PID, documentId: D1, docDate: '2026-09-10', test: 'HbA1c', value: '7.2', unit: '%', rangeHigh: '5.7' }],
};
globalThis.__MEDNEST_TEST__ = true;
const store = new Map([['mednest.v1', JSON.stringify(seed)], ['mednest.onboarded', '1']]);
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const appEl = { set innerHTML(v) {}, querySelectorAll: () => [], querySelector: () => null, addEventListener() {} };
globalThis.document = { querySelector: (s) => (s === '#app' ? appEl : null), createElement: () => ({ click() {} }) };
globalThis.window = { addEventListener() {}, scrollTo() {} };
globalThis.location = { hash: '' };
globalThis.alert = () => {};

const target = process.argv[2] ? pathToFileURL(process.argv[2]).href : new URL('../app.js', import.meta.url).href;
const { askRecords } = await import(target);

let pass = 0, fail = 0;
const t = (label, cond) => { cond ? pass++ : fail++; console.log(`${cond ? '✅' : '❌'} ${label}`); };

// 1. advice-seeking → fixed refusal, no sources
const r1 = askRecords(PID, 'Should I stop this medicine?');
t('advice "should I stop" refused', r1.refusal === true && /can't advise/.test(r1.answer) && r1.sources.length === 0);
const r2 = askRecords(PID, 'Do I have diabetes?');
t('advice "do I have diabetes" refused', r2.refusal === true);
const r3 = askRecords(PID, 'can i double the dose?');
t('advice "can i double dose" refused', r3.refusal === true);

// 2. current medicines → structured answer with source
const r4 = askRecords(PID, 'What are the current medicines?');
t('current medicines answered', /Metformin/.test(r4.answer) && r4.sources.includes(D3) && !r4.refusal);

// 3. latest test value → structured answer with date + source
const r5 = askRecords(PID, 'When was the last sugar test?');
t('last sugar test → HbA1c 7.2', /HbA1c was 7\.2/.test(r5.answer) && /2026/.test(r5.answer) && r5.sources.includes(D1));

// 4. not found
const r6 = askRecords(PID, 'What about my cholesterol xyz?');
t('unknown query → not found or refusal handled', !!r6.answer);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
