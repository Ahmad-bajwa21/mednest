// MedNest — complete web app (fully client-side; data stays in this browser,
// matching the native app's "on-device" philosophy). No server, no account.
// The safety logic (symptom triage, red flags, schedules, follow-ups, history) is the
// SAME tested TypeScript the Android app uses, bundled into ./core.js
// (npm run build:web). Document photos are read in the browser (Tesseract OCR) and
// kept in IndexedDB; records live in localStorage.
import * as core from './core.js';

/* ============================== utilities ============================== */
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + Math.random().toString(16).slice(2));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayISO = () => core.localDateIso(new Date());
const nowIso = () => new Date().toISOString();

const RELATIONS = ['Self', 'Mother', 'Father', 'Spouse', 'Child', 'Other'];
const DOC_TYPES = ['Prescription', 'Lab report', 'Scan report', 'Discharge summary', 'Bill', 'Other'];
const TYPE_FROM_AI = { prescription: 'Prescription', lab_report: 'Lab report', scan_report: 'Scan report', discharge_summary: 'Discharge summary', bill: 'Bill', other: 'Other' };
const DOT_COLORS = ['#0F766E', '#1D4ED8', '#9333EA', '#C2410C'];
const TIME_SLOTS = ['Morning', 'Afternoon', 'Evening', 'Night'];
const MAX_PROFILES = 4;
const DISCLAIMER = 'Information only. Not medical advice.';
const STATUS_LABEL = { pending: 'Needs details', active: 'Active', paused: 'Paused', completed: 'Completed', discontinued: 'Stopped' };
const DOSE_LABEL = { upcoming: 'Upcoming', due: 'Due now', taken: 'Taken', skipped: 'Skipped', missed: 'Not marked' };
const DISPOSITION_LABEL = { emergency: 'Emergency care advised', urgent: 'See a doctor today', gp: 'See a GP soon', self_care: 'Watch at home', insufficient: 'Not enough information' };

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d)) return esc(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtMonth(iso) {
  const d = new Date(iso && iso.length === 10 ? iso + 'T00:00:00' : iso);
  return isNaN(d) ? 'Undated' : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
function calcAge(birthYear) {
  const y = parseInt(birthYear, 10);
  return y ? new Date().getFullYear() - y : null;
}
function addDays(iso, n) { return core.addDaysLocal(iso, n); }
function num(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }
const timeLabel = (t) => { const r = core.resolveTime(t); return r ? core.formatTime(r) : t; };

/* ============================== store ============================== */
const KEY = 'mednest.v1';
const FLAG_ONBOARDED = 'mednest.onboarded';
const DATA_VERSION = 2;
let DB = load();
function load() {
  let db = null;
  try { const raw = localStorage.getItem(KEY); if (raw) db = JSON.parse(raw); } catch (_) {}
  return migrate(db || { profiles: [], documents: [], medicines: [], results: [] });
}
// v1 -> v2: medicine status/provenance, dose logs, follow-ups, symptom checks, audit.
function migrate(db) {
  for (const k of ['profiles', 'documents', 'medicines', 'results', 'doseLogs', 'appointments', 'episodes', 'chats', 'audit', 'snoozes']) db[k] ||= [];
  if ((db.version || 1) < 2) {
    for (const m of db.medicines) {
      m.status ||= m.active === false ? 'discontinued' : 'active';
      m.times = Array.isArray(m.times) ? m.times : [];
      m.durationDays = m.durationDays ? parseInt(m.durationDays, 10) || null : null;
      if (m.status === 'active') m.endDate = ''; // v1 stored start+duration (one day long); now derived
      m.confirmedAt ||= m.startDate || todayISO();
      m.source ||= 'manual';
      m.asNeeded = !!m.asNeeded;
    }
    for (const d of db.documents) {
      d.source ||= 'manual';
      if (d.followUp && !db.appointments.some((a) => a.documentId === d.id)) {
        db.appointments.push({ id: uid(), profileId: d.profileId, documentId: d.id, date: d.followUp, time: null, doctor: d.doctor || null, reason: 'Follow-up', sourceText: null, basis: 'manual', status: 'planned', createdAt: nowIso() });
      }
    }
    db.version = DATA_VERSION;
  }
  return db;
}
function save() { localStorage.setItem(KEY, JSON.stringify(DB)); }
function audit(pid, entity, entityId, action, detail) {
  DB.audit.push({ id: uid(), profileId: pid, entity, entityId, action, detail: detail ? JSON.stringify(detail) : null, at: nowIso() });
}

const byProfile = (arr, pid) => arr.filter((x) => x.profileId === pid);
const getProfile = (id) => DB.profiles.find((p) => p.id === id);
const getDoc = (id) => DB.documents.find((d) => d.id === id);
const getMed = (id) => DB.medicines.find((m) => m.id === id);
const medStatus = (m) => core.deriveStatus(m, todayISO());
const activeMeds = (pid) => byProfile(DB.medicines, pid).filter((m) => medStatus(m) === 'active' || medStatus(m) === 'pending');
const careData = (pid) => ({
  documents: byProfile(DB.documents, pid),
  medicines: byProfile(DB.medicines, pid),
  appointments: byProfile(DB.appointments, pid),
  episodes: byProfile(DB.episodes, pid),
  doseLogs: byProfile(DB.doseLogs, pid),
  audit: byProfile(DB.audit, pid),
});

/* ============================== images (IndexedDB) ============================== */
// Original document photos are kept so the patient and doctor can see the real paper.
const IDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error('no-idb'));
    return new Promise((res, rej) => {
      const r = indexedDB.open('mednest-images', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('images');
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('images', mode);
      const req = fn(t.objectStore('images'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  },
  put(id, blob) { return this.tx('readwrite', (s) => s.put(blob, id)); },
  get(id) { return this.tx('readonly', (s) => s.get(id)); },
  del(id) { return this.tx('readwrite', (s) => s.delete(id)).catch(() => {}); },
  clear() { return this.tx('readwrite', (s) => s.clear()).catch(() => {}); },
};
async function hydrateImages() {
  for (const img of app.querySelectorAll('[data-img]')) {
    try { const blob = await IDB.get(img.dataset.img); if (blob) img.src = URL.createObjectURL(blob); } catch (_) {}
  }
}

/* ============================== template summary (spec §5.2) ============================== */
function buildSummary(pid) {
  const p = getProfile(pid);
  const docs = byProfile(DB.documents, pid);
  if (!docs.length) return 'No records yet. Add a document to start this summary.';
  const parts = [];
  const age = calcAge(p.birthYear);
  const sex = p.sex && p.sex !== '-' ? p.sex : '';
  if (age != null) parts.push(`${age} years${sex ? ', ' + sex : ''}.`);
  const meds = activeMeds(pid);
  if (meds.length) {
    const names = meds.slice(0, 2).map((m) => m.name).join(', ');
    parts.push(`${meds.length} active medicine${meds.length > 1 ? 's' : ''}${names ? ' (' + names + ')' : ''}.`);
  }
  const r = sortedResults(pid)[0];
  if (r) parts.push(`Last ${r.test} ${r.value}${r.unit ? ' ' + r.unit : ''} (${fmtDate(r.docDate)}).`);
  if (p.allergies) parts.push(`Allergy: ${p.allergies}.`);
  const next = core.upcomingAppointments(byProfile(DB.appointments, pid), todayISO())[0];
  if (next) parts.push(`Next follow-up ${fmtDate(next.date)}.`);
  return parts.join(' ') || 'Records added.';
}

const sortedResults = (pid) => byProfile(DB.results, pid).slice().sort((a, b) => (b.docDate || '').localeCompare(a.docDate || ''));

function latestResults(pid, n = 3) {
  const res = sortedResults(pid);
  const seen = new Set();
  const out = [];
  for (const r of res) {
    if (seen.has(r.test)) continue;
    seen.add(r.test);
    const prev = res.find((x) => x.test === r.test && x !== r && (x.docDate || '') < (r.docDate || ''));
    let trend = 'same';
    if (prev) { const a = num(r.value), b = num(prev.value); if (a != null && b != null) trend = a > b ? 'up' : a < b ? 'down' : 'same'; }
    const low = num(r.rangeLow), high = num(r.rangeHigh), v = num(r.value);
    const outOfRange = v != null && ((low != null && v < low) || (high != null && v > high));
    out.push({ ...r, trend, outOfRange, prev });
    if (out.length >= n) break;
  }
  return out;
}

/* ============================== pattern notes (spec §7.3) ============================== */
// Code-based detection; never names a disease or suggests treatment.
function patternNotes(pid) {
  const notes = [];
  const res = byProfile(DB.results, pid);
  const tests = [...new Set(res.map((r) => r.test))];
  for (const t of tests) {
    const series = res.filter((r) => r.test === t && num(r.value) != null)
      .sort((a, b) => (a.docDate || '').localeCompare(b.docDate || ''));
    if (series.length >= 3) {
      const vals = series.map((r) => num(r.value));
      const rising = vals.every((v, i) => i === 0 || v > vals[i - 1]);
      const falling = vals.every((v, i) => i === 0 || v < vals[i - 1]);
      if (rising || falling) {
        notes.push({ text: `${t} has ${rising ? 'risen' : 'fallen'} across the last ${vals.length} readings (${vals.join(', ')}).`, sources: series.map((r) => r.documentId) });
      }
    }
    const oor = series.filter((r) => { const v = num(r.value), lo = num(r.rangeLow), hi = num(r.rangeHigh); return v != null && ((lo != null && v < lo) || (hi != null && v > hi)); });
    if (oor.length >= 2) {
      notes.push({ text: `${t} has been outside the report's range in ${oor.length} tests.`, sources: oor.map((r) => r.documentId) });
    }
  }
  const meds = byProfile(DB.medicines, pid);
  const byName = {};
  meds.forEach((m) => (byName[m.name.toLowerCase()] ||= []).push(m));
  for (const [, group] of Object.entries(byName)) {
    const recent = group.filter((m) => m.startDate && m.startDate >= addDays(todayISO(), -365));
    if (recent.length >= 3) {
      notes.push({ text: `${group[0].name} was prescribed ${recent.length} times in the last 12 months.`, sources: recent.map((m) => m.documentId) });
    }
  }
  const activeDocs = activeMeds(pid).map((m) => getDoc(m.documentId)).filter(Boolean);
  const doctors = [...new Set(activeDocs.map((d) => (d.doctor || '').trim().toLowerCase()).filter(Boolean))];
  if (doctors.length >= 3) {
    notes.push({ text: `Active medicines come from ${doctors.length} different doctors.`, sources: activeDocs.map((d) => d.id) });
  }
  // Missed doses: more than 30% of scheduled doses in 14 days not marked taken (spec §7.3).
  const doses = core.pastDoses(byProfile(DB.medicines, pid), byProfile(DB.doseLogs, pid), new Date(), 14);
  if (doses.length >= 6) {
    const notTaken = doses.filter((d) => d.state === 'skipped' || d.state === 'missed').length;
    if (notTaken / doses.length > 0.3) notes.push({ text: `About ${Math.round((notTaken / doses.length) * 100)}% of doses in the last two weeks were skipped or not marked.`, sources: [] });
  }
  return notes.slice(0, 5);
}

/* ============================== Ask: rule-based retrieval (spec §6.4 Task D / §7.4) ============================== */
const ADVICE_RE = /\b(should i|do i have|is it (safe|ok|okay)|can i (stop|start|take|increase|double)|diagnos|what('?s| is) wrong|cure|treat(ment)?|prescribe me|how much should)\b/i;

function askRecords(pid, question) {
  const q = question.trim();
  if (!q) return null;
  if (ADVICE_RE.test(q)) {
    return { refusal: true, answer: "I can't advise on that. I can show you what your records say, and you can discuss it with your doctor. Feeling unwell? Use “Check a symptom” for guided questions and next steps.", sources: [] };
  }
  if (byProfile(DB.documents, pid).length === 0) {
    return { answer: "There are no records for this person yet. Add a document (tap ＋ on the overview), then I can answer questions about it. MedNest only answers from your own documents — it does not give general medical information.", sources: [] };
  }
  const lower = q.toLowerCase();
  if (/\b(current|active|which) medicine|what (medicine|meds)|taking now\b/.test(lower)) {
    const meds = activeMeds(pid);
    return meds.length
      ? { answer: 'Active medicines: ' + meds.map((m) => `${m.name}${m.dose ? ' ' + m.dose : ''}`).join('; ') + '.', sources: [...new Set(meds.map((m) => m.documentId))] }
      : { answer: 'No active medicines are recorded.', sources: [] };
  }
  const res = sortedResults(pid);
  const testHit = res.find((r) => lower.includes(r.test.toLowerCase())) ||
    (/sugar|hba1c|glucose/.test(lower) && res.find((r) => /hba1c|glucose|sugar/i.test(r.test)));
  if ((/last|latest|recent|when/.test(lower)) && testHit) {
    return { answer: `The last ${testHit.test} was ${testHit.value}${testHit.unit ? ' ' + testHit.unit : ''} on ${fmtDate(testHit.docDate)}.`, sources: [testHit.documentId] };
  }
  if (/what changed|this year|trend|pattern/.test(lower)) {
    const notes = patternNotes(pid);
    return notes.length
      ? { answer: notes.map((n) => n.text).join(' '), sources: [...new Set(notes.flatMap((n) => n.sources))] }
      : { answer: 'No notable patterns found yet in the records.', sources: [] };
  }
  const words = lower.split(/\s+/).filter((w) => w.length > 2);
  const scoreText = (t) => words.reduce((s, w) => s + ((t || '').toLowerCase().includes(w) ? 1 : 0), 0);
  const docScores = byProfile(DB.documents, pid).map((d) => {
    const meds = byProfile(DB.medicines, pid).filter((m) => m.documentId === d.id).map((m) => m.name).join(' ');
    const rs = byProfile(DB.results, pid).filter((r) => r.documentId === d.id).map((r) => r.test + ' ' + r.value).join(' ');
    return { d, score: scoreText(`${d.type} ${d.doctor} ${meds} ${rs}`) };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  if (!docScores.length) return { answer: 'I could not find that in the records.', sources: [] };
  const top = docScores[0].d;
  return { answer: `Found in a ${top.type.toLowerCase()} from ${fmtDate(top.docDate)}${top.doctor ? ' (' + top.doctor + ')' : ''}. See the sources below.`, sources: docScores.map((x) => x.d.id) };
}

/* ============================== render helpers ============================== */
function render(html) { app.innerHTML = html; wire(); window.scrollTo(0, 0); }
const go = (route) => { location.hash = route; };
const routeNow = () => route();

function tabsBar(pid, active) {
  const t = (r, icon, label, key) => `<a href="#/profile/${pid}${r}" class="${active === key ? 'on' : ''}"><span class="ti">${icon}</span>${label}</a>`;
  return `<nav class="tabs">${t('', '▦', 'Overview', 'overview')}${t('/history', '≣', 'History', 'history')}${t('/meds', '℞', 'Meds', 'meds')}${t('/assistant', '✚', 'Check', 'assistant')}${t('/ask', '?', 'Ask', 'ask')}</nav>`;
}
const adSlot = () => `<div class="adslot">AD</div>`;
const dotHtml = (c) => `<span class="dot" style="background:${esc(c || DOT_COLORS[0])}"></span>`;
const srcLinks = (pid, ids) => [...new Set(ids)].map((id) => { const d = getDoc(id); return d ? `<a class="inline" href="#/profile/${pid}/doc/${id}">${esc(d.type)}, ${fmtDate(d.docDate)}</a>` : ''; }).filter(Boolean).join(' · ');
const topbar = (back, title, extra = '') => `<div class="topbar"><button class="iconbtn back" data-go="${back}">‹</button><h1>${title}</h1>${extra}</div>`;

/* ============================== onboarding (S2) ============================== */
function screenWelcome() {
  window.__ob = 0;
  renderWelcome();
}
function renderWelcome() {
  const slides = [
    { ico: '📷', t: 'Photograph your papers', b: 'MedNest reads prescriptions and reports, files them for each family member, and sets medicine and follow-up reminders.' },
    { ico: '🔒', t: 'It stays on your device', b: 'No account. No upload. Your health records live only in this browser.' },
    { ico: '🩺', t: 'A helper, not a doctor', b: 'MedNest organises your records and can help you decide when to see a doctor. It does not diagnose, and it never replaces a doctor.' },
  ];
  const i = window.__ob;
  const s = slides[i];
  const last = i === slides.length - 1;
  render(`
    <div class="topbar"><h1></h1>${!last ? '<button class="textbtn" id="skip">Skip</button>' : ''}</div>
    <div class="screen" style="text-align:center">
      <div style="font-size:56px;margin:32px 0 8px">${s.ico}</div>
      <div class="title">${s.t}</div>
      <p class="muted" style="max-width:340px;margin:8px auto">${s.b}</p>
      ${last ? `<label class="row" style="justify-content:center;gap:10px;margin-top:20px;cursor:pointer"><input type="checkbox" id="understand" style="width:auto"/> I understand</label>` : ''}
      <div style="margin:24px 0;color:var(--textMuted)">${slides.map((_, k) => (k === i ? '●' : '○')).join(' ')}</div>
      <button class="btn primary" id="ob-next" ${last ? 'disabled' : ''}>${last ? 'Get started' : 'Next'}</button>
    </div>
  `);
}

/* ============================== profiles ============================== */
function screenProfiles() {
  const list = DB.profiles.map((p) => {
    const meds = activeMeds(p.id);
    const docs = byProfile(DB.documents, p.id);
    const sumLine = !docs.length ? 'No records yet' : meds.length ? `${meds.length} active medicine${meds.length > 1 ? 's' : ''}` : `${docs.length} document${docs.length > 1 ? 's' : ''}`;
    const nextDose = core.todaysDoses(byProfile(DB.medicines, p.id), byProfile(DB.doseLogs, p.id), new Date()).find((d) => d.state === 'upcoming' || d.state === 'due');
    const pend = core.pendingConfirmations(careData(p.id), todayISO()).length;
    const next = nextDose ? `Next: ${nextDose.medicine.name} ${core.formatTime(nextDose.occ.time)}` : 'Next: no reminders today';
    return `<div class="card link" data-go="#/profile/${p.id}"><div class="row grow">${dotHtml(p.color)}<div class="grow"><div class="name">${esc(p.name)} <span class="muted" style="font-weight:400">${esc(p.relation)}</span></div><div class="list-sub truncate">${esc(sumLine)}</div><div class="caption">${esc(next)}${pend ? ` · <span style="color:var(--warn)">${pend} to confirm</span>` : ''}</div></div></div><span class="arrow">›</span></div>`;
  }).join('');
  const addCard = DB.profiles.length < MAX_PROFILES ? `<div class="card link" data-go="#/profile/new"><div class="row grow"><span class="iconbtn" style="pointer-events:none">＋</span><div class="name">Add profile</div></div><span class="arrow">›</span></div>` : '';
  const body = DB.profiles.length
    ? list + addCard + `<div class="counter">${DB.profiles.length} of ${MAX_PROFILES} profiles</div><button class="textbtn" data-go="#/import" style="display:block;margin:4px auto">Import a profile</button>`
    : `<div class="empty"><div class="ico">👪</div><p>Add the first person whose records you want to keep.</p><button class="btn primary" data-go="#/profile/new">Add profile</button><button class="textbtn" data-go="#/import">Import a profile</button></div>`;
  const healthCard = `<div class="card link" data-go="#/health-info"><div class="row grow"><span class="iconbtn" style="pointer-events:none">💬</span><div class="grow"><div class="name">Health Info assistant</div><div class="list-sub">General health questions · runs in your browser, no account</div></div></div><span class="arrow">›</span></div>`;
  render(`<div class="topbar"><h1>MedNest</h1><button class="iconbtn" data-go="#/settings">⚙</button></div><div class="screen">${body}${healthCard}</div>${adSlot()}`);
}

function screenProfileForm(id) {
  const p = id ? getProfile(id) : null;
  const draft = p ? { ...p } : { name: '', relation: '', birthYear: '', sex: '-', bloodGroup: '', allergies: '', color: DOT_COLORS[0] };
  window.__draft = draft;
  render(`
    ${topbar(p ? '#/profile/' + id : '#/', p ? 'Edit profile' : 'New profile')}
    <div class="screen">
      <label class="label">Name *</label><input id="f-name" value="${esc(draft.name)}" placeholder="e.g. Ammi" />
      <label class="label">Relation *</label><div class="chips" id="f-rel">${RELATIONS.map((r) => `<button class="chip ${draft.relation === r ? 'sel' : ''}" data-rel="${r}">${r}</button>`).join('')}</div>
      <div class="row" style="gap:16px"><div class="grow"><label class="label">Birth year</label><input id="f-year" inputmode="numeric" value="${esc(draft.birthYear)}" placeholder="1962" /></div><div><label class="label">Sex</label><div class="chips" id="f-sex">${['F', 'M', '-'].map((s) => `<button class="chip ${draft.sex === s ? 'sel' : ''}" data-sex="${s}">${s}</button>`).join('')}</div></div></div>
      <label class="label">Blood group (optional)</label><input id="f-blood" value="${esc(draft.bloodGroup)}" placeholder="O+" />
      <label class="label">Known allergies (optional)</label><input id="f-allergy" value="${esc(draft.allergies)}" placeholder="penicillin" />
      <label class="label">Colour</label><div class="dotpick" id="f-color">${DOT_COLORS.map((c) => `<span class="d ${draft.color === c ? 'sel' : ''}" data-color="${c}" style="background:${c}"></span>`).join('')}</div>
      <button class="btn primary" id="f-save">Save</button>
      ${p ? `<button class="btn secondary" data-go="#/profile/${id}/share">Share profile</button><button class="btn danger" id="f-del">Delete profile</button>` : ''}
    </div>`);
}

/* ============================== overview / dashboard (S7) ============================== */
function screenOverview(id) {
  const p = getProfile(id);
  if (!p) return go('#/');
  const docs = byProfile(DB.documents, id);
  const results = latestResults(id);
  const notes = patternNotes(id);
  const data = careData(id);
  const pending = core.pendingConfirmations(data, todayISO());
  const doses = core.todaysDoses(data.medicines, data.doseLogs, new Date());
  const appts = core.upcomingAppointments(data.appointments, todayISO()).slice(0, 3);
  const recent = docs.slice().sort((a, b) => (b.docDate || '').localeCompare(a.docDate || '')).slice(0, 3);
  const doseColor = (s) => (s === 'taken' ? 'ok' : s === 'missed' || s === 'due' ? 'warn' : '');

  const pendingHtml = pending.length ? `<h2 class="sec">Pending confirmations (${pending.length})</h2><div class="card" style="border-color:var(--warn)">${pending.slice(0, 4).map((x) => `<div class="link-row" data-go="${x.kind === 'medicine' ? `#/profile/${id}/medicine/${x.id}` : `#/profile/${id}/appointments`}"><div>${esc(x.title)}</div><div class="caption">${esc(x.detail)}</div></div>`).join('<hr class="sep">')}</div>` : '';
  const dosesHtml = doses.length ? doses.slice(0, 6).map((d) => `<div class="row" style="justify-content:space-between"><span>${core.formatTime(d.occ.time)} · ${esc(d.medicine.name)}${d.medicine.dose ? ' ' + esc(d.medicine.dose) : ''}</span><span class="pill ${doseColor(d.state)}">${DOSE_LABEL[d.state]}</span></div>`).join('<hr class="sep">') : '<div class="muted">No doses scheduled today.</div>';
  const apptHtml = appts.length ? appts.map((a) => `<div class="row" style="justify-content:space-between"><span>${esc([a.doctor, a.reason].filter(Boolean).join(' · ') || 'Follow-up')}</span><span class="caption">${fmtDate(a.date)}${a.time ? ' ' + esc(a.time) : ''}</span></div>`).join('<hr class="sep">') : '<div class="muted">Nothing planned.</div>';
  const recentHtml = recent.length ? recent.map((d) => `<div class="row link-row" style="justify-content:space-between" data-go="#/profile/${id}/doc/${d.id}"><span>${esc(d.type)}${d.doctor ? ' · ' + esc(d.doctor) : ''}</span><span class="caption">${fmtDate(d.docDate)}</span></div>`).join('<hr class="sep">') : '<div class="muted">No documents yet.</div>';
  const resHtml = results.length ? results.map((r) => `<div class="row" style="justify-content:space-between"><span>${esc(r.test)}</span><span class="${r.outOfRange ? 'pill warn' : ''}">${esc(r.value)}${r.unit ? ' ' + esc(r.unit) : ''} <span class="trend ${r.trend}">${r.trend === 'up' ? '▲' : r.trend === 'down' ? '▼' : '='}</span></span></div>`).join('<hr class="sep">') : '<div class="muted">No results yet</div>';
  const notesHtml = notes.length ? notes.map((n) => `<div style="margin-bottom:10px">${esc(n.text)}<div class="caption">${srcLinks(id, n.sources)}${n.sources.length ? ' · ' : ''}Discuss with your doctor.</div></div>`).join('') : '<div class="muted">Nothing notable yet.</div>';
  render(`
    <div class="topbar"><button class="iconbtn back" data-go="#/">‹</button>${dotHtml(p.color)}<h1>${esc(p.name)}</h1><button class="iconbtn" data-go="#/profile/${id}/edit">⋮</button></div>
    <div class="screen">
      <h2 class="sec">Summary</h2>
      <div class="card"><div>${esc(buildSummary(id))}</div><div class="caption" style="margin-top:8px">Updated ${fmtDate(todayISO())} · built from ${docs.length} document${docs.length === 1 ? '' : 's'}</div></div>
      ${pendingHtml}
      <h2 class="sec">Today's medicines</h2><div class="card link" data-go="#/profile/${id}/doses"><div class="grow">${dosesHtml}</div><span class="arrow">›</span></div>
      <h2 class="sec">Upcoming appointments</h2><div class="card link" data-go="#/profile/${id}/appointments"><div class="grow">${apptHtml}</div><span class="arrow">›</span></div>
      <h2 class="sec">Health assistant</h2>
      <div class="card link" data-go="#/profile/${id}/assistant" style="border-color:var(--accent)"><div class="grow"><div class="name">Check a symptom</div><div class="list-sub">Answer a few questions and get guidance on what to do next. Not a diagnosis.</div></div><span class="arrow">›</span></div>
      <h2 class="sec">Recent documents</h2><div class="card">${recentHtml}</div>
      <h2 class="sec">Latest results</h2><div class="card">${resHtml}</div>
      <h2 class="sec">Things to notice (${notes.length})</h2><div class="card">${notesHtml}</div>
      <button class="btn secondary" data-go="#/profile/${id}/history">Medical history</button>
      <button class="btn secondary" data-go="#/profile/${id}/summary">Doctor summary</button>
      <div class="disclaimer">${DISCLAIMER}</div>
    </div>
    <button class="fab" data-go="#/profile/${id}/add" aria-label="Add document">＋</button>${tabsBar(id, 'overview')}`);
}

/* ============================== add document: choose (S8) ============================== */
function screenAddDoc(id) {
  if (!getProfile(id)) return go('#/');
  render(`
    ${topbar('#/profile/' + id, 'Add document')}
    <div class="screen">
      <label class="option" for="in-camera"><span class="oico">📷</span><span class="grow"><span class="name">Scan with camera</span><span class="caption" style="display:block">Take a clear photo of the whole page. You can retake it if it is blurry.</span></span></label>
      <input type="file" id="in-camera" accept="image/*" capture="environment" hidden />
      <label class="option" for="in-gallery"><span class="oico">🖼</span><span class="grow"><span class="name">Choose from gallery</span><span class="caption" style="display:block">Photos or a PDF of a prescription or report (up to 5 pages).</span></span></label>
      <input type="file" id="in-gallery" accept="image/*,application/pdf" multiple hidden />
      <div class="option" id="in-manual" role="button"><span class="oico">⌨</span><span class="grow"><span class="name">Enter manually</span><span class="caption" style="display:block">Type the details yourself.</span></span></div>
      <div class="caption" style="margin-top:16px">Photos are read inside this browser. Nothing is uploaded.</div>
    </div>`);
  $('#in-camera').addEventListener('change', (e) => readFiles(id, [...e.target.files], 'camera'));
  $('#in-gallery').addEventListener('change', (e) => readFiles(id, [...e.target.files], 'gallery'));
  $('#in-manual').addEventListener('click', () => { window.__doc = newDraft(id, 'manual'); go(`#/profile/${id}/review`); });
}

function newDraft(pid, source) {
  return { pid, source, type: 'Prescription', docDate: todayISO(), doctor: '', diagnosis: '', meds: [], results: [], followText: '', followDate: '', followConfirmed: false, unsure: [], blobs: [], previews: [], ocrText: '', extraction: null, patientName: null, problem: null };
}

function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some((s) => s.src === src)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src));
    document.head.appendChild(s);
  });
}

// Downscale for storage, and build a grayscale, contrast-stretched copy for OCR.
// Also estimates sharpness (variance of the Laplacian) so a blurry photo can be retaken.
async function prepareImage(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0, w, h);
  const stored = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
  const img = ctx.getImageData(0, 0, w, h); const d = img.data;
  const g = new Float32Array(w * h); let lo = 255, hi = 0;
  for (let i = 0; i < w * h; i++) { const v = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; g[i] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < w * h; i++) { const v = ((g[i] - lo) / range) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; }
  ctx.putImageData(img, 0, 0);
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
    const i = y * w + x; const lap = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
    sum += lap; sum2 += lap * lap; n++;
  }
  const sharpness = n ? sum2 / n - (sum / n) ** 2 : 0;
  return { stored, ocrCanvas: c, sharpness };
}

async function readFiles(pid, files, source) {
  if (!files.length) return;
  const draft = newDraft(pid, source);
  window.__doc = draft;
  const setStatus = (msg) => render(`${topbar('#/profile/' + pid + '/add', 'Reading…')}<div class="screen"><div class="empty"><div class="ico spin">◴</div><p>${esc(msg)}</p><p class="caption">Reading happens in this browser. It can take up to a minute.</p></div></div>`);
  setStatus('Preparing your photo…');
  const texts = []; let blurry = false; let pdf = false;
  try {
    for (const f of files.slice(0, 5)) {
      if (f.type === 'application/pdf') { draft.blobs.push(f); pdf = true; continue; }
      const prep = await prepareImage(f);
      draft.blobs.push(prep.stored);
      draft.previews.push(URL.createObjectURL(prep.stored));
      if (prep.sharpness < 60) blurry = true;
      setStatus('Loading the text reader…');
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
      const { data } = await window.Tesseract.recognize(prep.ocrCanvas, 'eng', {
        logger: (m) => { if (m.status === 'recognizing text') setStatus(`Reading text… ${Math.round((m.progress || 0) * 100)}%`); },
      });
      texts.push(data.text || '');
    }
  } catch (e) {
    draft.problem = 'We could not read this photo automatically. Fill in the details yourself — the photo is saved with the document.';
  }
  draft.ocrText = texts.join('\n\n').trim();
  if (!draft.problem) {
    if (pdf && !draft.ocrText) draft.problem = 'PDF files are saved as they are, but can’t be read automatically yet. Please fill in the details.';
    else if (draft.ocrText.replace(/\s/g, '').length < 12) draft.problem = 'The photo looks blurry or has too little readable text. Please retake it in good light, flat and filling the frame — or fill in the details yourself.';
    else {
      const out = core.readWithRules(draft.ocrText);
      if (out) applyReview(draft, out.review, out.extraction);
      else draft.problem = 'We could not understand this document automatically. Please fill in the details yourself.';
      if (blurry) draft.problem = 'This photo looks a little blurry, so please check everything carefully, or retake it.';
    }
  }
  const target = `#/profile/${pid}/review`;
  if (location.hash === target) routeNow(); // e.g. "Retake photo" from the review screen
  else go(target);
}

function splitRange(range) {
  const m = (range || '').match(/(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/);
  return m ? [m[1], m[2]] : ['', ''];
}

function applyReview(d, r, extraction) {
  const u = [];
  d.type = TYPE_FROM_AI[r.type] || 'Other';
  if (r.date) d.docDate = r.date;
  if (r.dateUnsure) u.push('date');
  d.doctor = r.doctor || '';
  d.diagnosis = r.diagnosisWritten || '';
  d.patientName = r.patientName;
  d.meds = r.medicines.map((m, i) => {
    if (m.nameUnsure) u.push(`med.${i}.name`);
    if (m.doseUnsure) u.push(`med.${i}.dose`);
    if (m.frequencyUnsure) u.push(`med.${i}.freq`);
    return { name: m.name || '', dose: m.dose || '', durationDays: m.durationDays ? String(m.durationDays) : '', times: m.slots, instructions: m.instructions || '', asNeeded: core.parseFrequency(m.frequencyRaw).asNeeded, asWritten: m.frequencyRaw };
  });
  d.results = r.results.map((x, i) => {
    if (x.valueUnsure) u.push(`res.${i}.value`);
    const [lo, hi] = splitRange(x.range);
    return { test: x.test || '', value: x.value || '', unit: x.unit || '', rangeLow: lo, rangeHigh: hi };
  });
  if (r.followUp) {
    d.followText = r.followUp;
    d.followDate = core.proposeFollowUp(r.followUp, r.date, !r.dateUnsure).date || '';
  }
  d.unsure = u;
  d.extraction = extraction;
}

/* ============================== review & confirm (S9) ============================== */
function screenReview(id) {
  const d = window.__doc;
  if (!d || d.pid !== id) return go(`#/profile/${id}/add`);
  const p = getProfile(id);
  const flag = (k) => d.unsure.includes(k);
  const okBtn = (k) => (flag(k) ? `<button class="textbtn okbtn" data-ok="${k}">✓ This is correct</button>` : '');
  const fieldCls = (k) => (flag(k) ? 'uncertain' : '');
  const hint = (k) => (flag(k) ? `<div class="caption warn-text" data-hint="${k}">Please check</div>` : '');
  const mismatch = d.patientName && p.name && !d.patientName.toLowerCase().split(/\s+/).some((w) => w.length > 1 && p.name.toLowerCase().includes(w));
  const medRows = d.meds.map((m, i) => `
    <div class="card">
      <label class="label">Name</label><input class="${fieldCls(`med.${i}.name`)}" data-m="${i}" data-k="name" data-key="med.${i}.name" value="${esc(m.name)}" placeholder="Medicine name" />${hint(`med.${i}.name`)}${okBtn(`med.${i}.name`)}
      <label class="label">Dose</label><input class="${fieldCls(`med.${i}.dose`)}" data-m="${i}" data-k="dose" data-key="med.${i}.dose" value="${esc(m.dose)}" placeholder="e.g. 500 mg" />${hint(`med.${i}.dose`)}${okBtn(`med.${i}.dose`)}
      ${m.asWritten ? `<div class="caption" style="margin-top:8px">Written on the prescription: “${esc(m.asWritten)}”</div>` : ''}
      <div class="chips" style="margin-top:10px"><button class="chip ${!m.asNeeded ? 'sel' : ''}" data-asneeded="${i}" data-v="0">At set times</button><button class="chip ${m.asNeeded ? 'sel' : ''}" data-asneeded="${i}" data-v="1">Only when needed</button></div>
      ${!m.asNeeded ? `<div class="chips ${flag(`med.${i}.freq`) ? 'uncertain-box' : ''}" data-freqbox="med.${i}.freq" style="margin-top:8px">${TIME_SLOTS.map((t) => `<button class="chip ${m.times.includes(t) ? 'sel' : ''}" data-mtime="${i}" data-slot="${t}">${t}</button>`).join('')}</div>` : ''}
      ${flag(`med.${i}.freq`) ? `<div class="caption warn-text" data-hint="med.${i}.freq">Choose the times your doctor wrote.</div>` : ''}${okBtn(`med.${i}.freq`)}
      <div class="row" style="gap:10px"><div class="grow"><label class="label">Days</label><input data-m="${i}" data-k="durationDays" value="${esc(m.durationDays)}" inputmode="numeric" placeholder="e.g. 5" /></div><div class="grow"><label class="label">Instructions</label><input data-m="${i}" data-k="instructions" value="${esc(m.instructions)}" placeholder="after meals" /></div></div>
      ${!m.durationDays ? '<div class="caption">No duration written? Leave empty — reminders continue until you stop them.</div>' : ''}
      <button class="textbtn danger" data-rmmed="${i}">Remove</button>
    </div>`).join('');
  const resRows = d.results.map((r, i) => `<div class="card"><div class="row"><input data-r="${i}" data-k="test" value="${esc(r.test)}" placeholder="Test e.g. HbA1c" class="grow" /><button class="iconbtn" data-rmres="${i}">✕</button></div><div class="row" style="gap:10px;margin-top:8px"><input class="${fieldCls(`res.${i}.value`)}" data-r="${i}" data-k="value" data-key="res.${i}.value" value="${esc(r.value)}" placeholder="Value" /><input data-r="${i}" data-k="unit" value="${esc(r.unit)}" placeholder="Unit" /></div>${hint(`res.${i}.value`)}${okBtn(`res.${i}.value`)}<div class="row" style="gap:10px;margin-top:8px"><input data-r="${i}" data-k="rangeLow" value="${esc(r.rangeLow)}" placeholder="Range low" /><input data-r="${i}" data-k="rangeHigh" value="${esc(r.rangeHigh)}" placeholder="Range high" /></div></div>`).join('');
  const proposal = d.followText ? core.proposeFollowUp(d.followText, d.docDate, !flag('date')) : null;
  render(`
    ${topbar(`#/profile/${id}/add`, d.source === 'manual' ? 'Add document' : 'Check and confirm')}
    <div class="screen">
      ${d.previews.length ? `<div class="thumbs">${d.previews.map((u) => `<img src="${u}" alt="Document page" />`).join('')}</div>` : ''}
      ${d.blobs.some((b) => b.type === 'application/pdf') ? '<div class="caption">PDF attached</div>' : ''}
      ${d.source === 'camera' ? `<label class="textbtn" for="retake" style="display:inline-block">Retake photo</label><input type="file" id="retake" accept="image/*" capture="environment" hidden />` : ''}
      ${d.problem ? `<div class="card" style="border-color:var(--warn);color:var(--warn)">${esc(d.problem)}</div>` : d.source !== 'manual' ? `<div class="caption">Read automatically in your browser. Fields marked “Please check” must be corrected or confirmed against the paper before saving — handwriting is easy to misread.</div>` : ''}
      ${mismatch ? `<div class="card" style="border-color:var(--warn)">This document seems to be for “${esc(d.patientName)}”. It will be saved to ${esc(p.name)}’s record.</div>` : ''}
      <label class="label">Type</label><div class="chips" id="d-type">${DOC_TYPES.map((t) => `<button class="chip ${d.type === t ? 'sel' : ''}" data-dtype="${t}">${t}</button>`).join('')}</div>
      <div class="row" style="gap:16px"><div class="grow"><label class="label">Date</label><input id="d-date" type="date" class="${fieldCls('date')}" data-key="date" value="${esc(d.docDate)}" />${hint('date')}${okBtn('date')}</div><div class="grow"><label class="label">Doctor</label><input id="d-doctor" value="${esc(d.doctor)}" placeholder="Dr. S. Khan" /></div></div>
      <label class="label">Diagnosis (only if written on the document)</label><input id="d-diag" value="${esc(d.diagnosis)}" />
      <h2 class="sec">Medicines</h2>${medRows}<button class="textbtn" id="add-med">＋ Add medicine</button>
      <h2 class="sec">Results</h2>${resRows}<button class="textbtn" id="add-res">＋ Add result</button>
      <h2 class="sec">Follow-up</h2>
      <div class="card">
        <label class="label" style="margin-top:0">As written (optional)</label><input id="f-text" value="${esc(d.followText)}" placeholder="e.g. Review after 7 days" />
        ${proposal ? `<div class="caption" style="margin-top:6px">${esc(proposal.explanation)}</div>` : ''}
        <label class="label">Follow-up date</label><input id="f-date" type="date" value="${esc(d.followDate)}" />
        ${d.followDate ? `<label class="row" style="gap:10px;margin-top:10px;cursor:pointer"><input type="checkbox" id="f-confirm" style="width:auto" ${d.followConfirmed ? 'checked' : ''}/> Confirm this date and set reminders</label>` : d.followText ? '<div class="caption" style="margin-top:6px">No date yet — it will wait under Pending confirmations.</div>' : ''}
      </div>
      <div class="caption warn-text" id="unsure-count" style="margin-top:12px">${d.unsure.length ? `${d.unsure.length} field${d.unsure.length === 1 ? '' : 's'} still need checking.` : ''}</div>
      <button class="btn primary" id="d-save" ${d.unsure.length ? 'disabled' : ''}>Confirm and save</button>
      <button class="textbtn danger" data-go="#/profile/${id}">Discard</button>
    </div>`);
  wireReview(id);
}

function wireReview(id) {
  const d = window.__doc;
  const rerender = () => { const y = window.scrollY; screenReview(id); window.scrollTo(0, y); };
  const resolve = (key) => {
    if (!d.unsure.includes(key)) return;
    d.unsure = d.unsure.filter((k) => k !== key);
    app.querySelector(`[data-key="${key}"]`)?.classList.remove('uncertain');
    app.querySelector(`[data-freqbox="${key}"]`)?.classList.remove('uncertain-box');
    app.querySelector(`[data-hint="${key}"]`)?.remove();
    app.querySelector(`[data-ok="${key}"]`)?.remove();
    $('#unsure-count').textContent = d.unsure.length ? `${d.unsure.length} field${d.unsure.length === 1 ? '' : 's'} still need checking.` : '';
    $('#d-save').disabled = d.unsure.length > 0;
  };
  $('#retake')?.addEventListener('change', (e) => readFiles(id, [...e.target.files], 'camera'));
  $('#d-type').querySelectorAll('[data-dtype]').forEach((b) => b.addEventListener('click', () => { d.type = b.dataset.dtype; selOne($('#d-type'), b); }));
  $('#d-date').addEventListener('input', (e) => { d.docDate = e.target.value; resolve('date'); });
  $('#d-doctor').addEventListener('input', (e) => (d.doctor = e.target.value));
  $('#d-diag').addEventListener('input', (e) => (d.diagnosis = e.target.value));
  app.querySelectorAll('[data-m]').forEach((inp) => inp.addEventListener('input', (e) => { d.meds[inp.dataset.m][inp.dataset.k] = e.target.value; if (inp.dataset.key) resolve(inp.dataset.key); }));
  app.querySelectorAll('[data-r]').forEach((inp) => inp.addEventListener('input', (e) => { d.results[inp.dataset.r][inp.dataset.k] = e.target.value; if (inp.dataset.key) resolve(inp.dataset.key); }));
  app.querySelectorAll('[data-ok]').forEach((b) => b.addEventListener('click', () => resolve(b.dataset.ok)));
  app.querySelectorAll('[data-mtime]').forEach((b) => b.addEventListener('click', () => { const m = d.meds[b.dataset.mtime]; const s = b.dataset.slot; m.times = m.times.includes(s) ? m.times.filter((x) => x !== s) : [...m.times, s]; b.classList.toggle('sel'); resolve(`med.${b.dataset.mtime}.freq`); }));
  app.querySelectorAll('[data-asneeded]').forEach((b) => b.addEventListener('click', () => { const i = b.dataset.asneeded; d.meds[i].asNeeded = b.dataset.v === '1'; if (d.meds[i].asNeeded) d.meds[i].times = []; d.unsure = d.unsure.filter((k) => k !== `med.${i}.freq`); rerender(); }));
  app.querySelectorAll('[data-rmmed]').forEach((b) => b.addEventListener('click', () => {
    const i = +b.dataset.rmmed;
    d.meds.splice(i, 1);
    // Drop this medicine's flags and shift later ones down — never clear them.
    d.unsure = d.unsure.flatMap((k) => { const m = k.match(/^med\.(\d+)\.(.+)$/); if (!m) return [k]; const j = +m[1]; return j === i ? [] : [j > i ? `med.${j - 1}.${m[2]}` : k]; });
    rerender();
  }));
  app.querySelectorAll('[data-rmres]').forEach((b) => b.addEventListener('click', () => {
    const i = +b.dataset.rmres;
    d.results.splice(i, 1);
    d.unsure = d.unsure.flatMap((k) => { const m = k.match(/^res\.(\d+)\.(.+)$/); if (!m) return [k]; const j = +m[1]; return j === i ? [] : [j > i ? `res.${j - 1}.${m[2]}` : k]; });
    rerender();
  }));
  $('#add-med').addEventListener('click', () => { d.meds.push({ name: '', dose: '', durationDays: '', times: [], instructions: '', asNeeded: false, asWritten: null }); rerender(); });
  $('#add-res').addEventListener('click', () => { d.results.push({ test: '', value: '', unit: '', rangeLow: '', rangeHigh: '' }); rerender(); });
  $('#f-text').addEventListener('change', (e) => { d.followText = e.target.value; d.followConfirmed = false; rerender(); });
  $('#f-date').addEventListener('change', (e) => { d.followDate = e.target.value; d.followConfirmed = false; rerender(); });
  $('#f-confirm')?.addEventListener('change', (e) => (d.followConfirmed = e.target.checked));
  $('#d-save').addEventListener('click', () => saveDocument(id, d));
}

async function saveDocument(pid, d) {
  if (d.unsure.length) return flash(`${d.unsure.length} field(s) still need checking.`);
  if (!core.parseLocalDate(d.docDate)) return flash('Please set the document date.');
  const docId = uid();
  const imageIds = [];
  for (const blob of d.blobs) {
    const imgId = uid();
    try { await IDB.put(imgId, blob); imageIds.push(imgId); } catch (_) {}
  }
  const now = nowIso();
  const fromDoc = d.source !== 'manual';
  DB.documents.push({ id: docId, profileId: pid, type: d.type, docDate: d.docDate, doctor: d.doctor.trim(), diagnosisWritten: d.diagnosis.trim() || null, followUp: d.followDate || d.followText || '', source: d.source, imageIds, ocrText: d.ocrText || null, extraction: d.extraction, createdAt: now });
  audit(pid, 'document', docId, 'create', { note: `${d.type} (${d.source})` });
  for (const m of d.meds.filter((x) => x.name.trim())) {
    const med = {
      id: uid(), profileId: pid, documentId: docId, name: m.name.trim(), dose: m.dose.trim() || null,
      times: m.asNeeded ? [] : m.times, durationDays: m.durationDays ? parseInt(m.durationDays, 10) || null : null,
      startDate: d.docDate, endDate: '', instructions: m.instructions.trim() || null, asNeeded: !!m.asNeeded,
      confirmedAt: now, source: fromDoc ? 'document_confirmed' : 'manual', status: 'active', active: true, updatedAt: now,
    };
    if (core.scheduleBlockers(med).length) med.status = 'pending';
    DB.medicines.push(med);
    audit(pid, 'medicine', med.id, 'create', { after: { name: med.name, dose: med.dose, times: med.times, status: med.status } });
  }
  d.results.filter((r) => r.test.trim()).forEach((r) => DB.results.push({ id: uid(), profileId: pid, documentId: docId, docDate: d.docDate, test: r.test.trim(), value: r.value.trim(), unit: r.unit.trim(), rangeLow: r.rangeLow, rangeHigh: r.rangeHigh }));
  if (d.followText.trim() || d.followDate) {
    const basis = !d.followText.trim() ? 'manual' : core.proposeFollowUp(d.followText, d.docDate, true).basis;
    const appt = { id: uid(), profileId: pid, documentId: docId, date: d.followDate || null, time: null, doctor: d.doctor.trim() || null, reason: d.followText.trim() ? `Follow-up: ${d.followText.trim()}` : 'Follow-up', sourceText: d.followText.trim() || null, basis, status: d.followConfirmed && d.followDate ? 'planned' : 'proposed', createdAt: now };
    DB.appointments.push(appt);
    audit(pid, 'appointment', appt.id, 'create', { after: { date: appt.date, status: appt.status } });
  }
  save();
  window.__doc = null;
  go('#/profile/' + pid);
}

/* ============================== document detail (S11) ============================== */
function screenDocDetail(id, docId) {
  const p = getProfile(id); const doc = getDoc(docId);
  if (!p || !doc) return go('#/profile/' + id);
  const meds = byProfile(DB.medicines, id).filter((m) => m.documentId === docId);
  const res = byProfile(DB.results, id).filter((r) => r.documentId === docId);
  const simple = res.length
    ? res.map((r) => { const v = num(r.value), lo = num(r.rangeLow), hi = num(r.rangeHigh); let note = ''; if (v != null && hi != null && v > hi) note = ` This is above the report's range (up to ${r.rangeHigh}).`; else if (v != null && lo != null && v < lo) note = ` This is below the report's range (from ${r.rangeLow}).`; return `Your ${r.test} is ${r.value}${r.unit ? ' ' + r.unit : ''}.${note}`; }).join(' ')
    : meds.length ? `This ${doc.type.toLowerCase()} lists ${meds.length} medicine${meds.length > 1 ? 's' : ''}.` : `A ${doc.type.toLowerCase()} dated ${fmtDate(doc.docDate)}.`;
  const compare = res.map((r) => { const prev = sortedResults(id).find((x) => x.test === r.test && (x.docDate || '') < (doc.docDate || '')); return prev ? `${r.test}: ${prev.value} → ${r.value} (since ${fmtDate(prev.docDate)})` : ''; }).filter(Boolean);
  const images = doc.imageIds || [];
  render(`
    ${topbar(`#/profile/${id}/timeline`, esc(doc.type), '<button class="iconbtn" id="doc-del">🗑</button>')}
    <div class="screen">
      <div class="caption">${fmtDate(doc.docDate)}${doc.doctor ? ' · ' + esc(doc.doctor) : ''}</div>
      <div class="caption">${doc.source && doc.source !== 'manual' ? 'Read automatically, then checked and confirmed by you.' : 'Entered by you.'}</div>
      ${images.length ? `<h2 class="sec">Original document</h2><div class="thumbs big">${images.map((i) => `<img data-img="${i}" alt="Original document page" />`).join('')}</div>` : ''}
      ${doc.diagnosisWritten ? `<div class="card"><div class="caption">Diagnosis written by the doctor</div>${esc(doc.diagnosisWritten)}</div>` : ''}
      <h2 class="sec">In simple words</h2><div class="card">${esc(simple)}</div>
      ${res.length ? `<h2 class="sec">Results</h2><div class="card">${res.map((r) => { const v = num(r.value), lo = num(r.rangeLow), hi = num(r.rangeHigh); const oor = v != null && ((lo != null && v < lo) || (hi != null && v > hi)); return `<div class="row" style="justify-content:space-between"><span>${esc(r.test)}</span><span class="${oor ? 'pill warn' : ''}">${esc(r.value)}${r.unit ? ' ' + esc(r.unit) : ''}</span></div>`; }).join('<hr class="sep">')}</div>` : ''}
      ${meds.length ? `<h2 class="sec">Medicines</h2><div class="card">${meds.map((m) => `<div class="row link-row" style="justify-content:space-between" data-go="#/profile/${id}/medicine/${m.id}"><span>${esc(m.name)} ${esc(m.dose || '')}</span><span class="caption">${(m.times || []).map(timeLabel).join(', ') || (m.asNeeded ? 'when needed' : '—')} ›</span></div>`).join('<hr class="sep">')}</div>` : ''}
      ${compare.length ? `<h2 class="sec">Compared with earlier</h2><div class="card">${compare.map((c) => `<div>${esc(c)}</div>`).join('')}</div>` : ''}
      ${doc.ocrText ? `<details class="card"><summary>Text read from the page</summary><pre class="ocr">${esc(doc.ocrText)}</pre></details>` : ''}
      <div class="disclaimer">${DISCLAIMER}</div>
    </div>`);
  hydrateImages();
}

function screenTimeline(id) {
  const p = getProfile(id);
  if (!p) return go('#/');
  const docs = byProfile(DB.documents, id).slice().sort((a, b) => (b.docDate || '').localeCompare(a.docDate || ''));
  let body;
  if (!docs.length) body = `<div class="empty"><div class="ico">≣</div><p>No documents yet.</p><button class="btn primary" data-go="#/profile/${id}/add">Add document</button></div>`;
  else {
    const groups = {};
    docs.forEach((doc) => { const k = fmtMonth(doc.docDate); (groups[k] ||= []).push(doc); });
    body = Object.entries(groups).map(([month, ds]) => `<h2 class="sec">${esc(month)}</h2>${ds.map((doc) => {
      const meds = byProfile(DB.medicines, id).filter((m) => m.documentId === doc.id);
      const res = byProfile(DB.results, id).filter((r) => r.documentId === doc.id);
      const sub = res.length ? res.map((r) => r.test).join(', ') : `${doc.doctor || 'Doctor'} · ${meds.length} med${meds.length === 1 ? '' : 's'}`;
      return `<div class="card link" data-go="#/profile/${id}/doc/${doc.id}"><div class="grow"><div class="row" style="justify-content:space-between"><span class="name">${fmtDate(doc.docDate)}</span><span class="muted">${esc(doc.type)}</span></div><div class="list-sub truncate">${esc(sub)}</div></div><span class="arrow">›</span></div>`;
    }).join('')}`).join('');
  }
  render(`${topbar(`#/profile/${id}/history`, 'Documents')}<div class="screen">${body}</div>${adSlot()}${tabsBar(id, 'history')}`);
}

/* ============================== medical history (proposal §2/§8) ============================== */
const HISTORY_ICON = { document: '📄', diagnosis: '🩺', medicine_start: '℞', medicine_change: '✎', symptom: '💬', appointment: '📅' };
function screenHistory(id) {
  const p = getProfile(id);
  const entries = core.historyEntries(careData(id));
  const groups = [];
  for (const e of entries) { const m = fmtMonth(e.date.slice(0, 10)); const g = groups.find((x) => x[0] === m); g ? g[1].push(e) : groups.push([m, [e]]); }
  const link = (e) => (e.kind === 'document' || e.kind === 'diagnosis' ? `#/profile/${id}/doc/${e.refId}` : e.kind.startsWith('medicine') ? `#/profile/${id}/medicine/${e.refId}` : e.kind === 'appointment' ? `#/profile/${id}/appointments` : `#/profile/${id}/episode/${e.refId}`);
  const body = entries.length
    ? groups.map(([month, list]) => `<h2 class="sec">${esc(month)}</h2>${list.map((e) => `<div class="card link" data-go="${link(e)}"><div class="row grow" style="align-items:flex-start"><span style="font-size:18px">${HISTORY_ICON[e.kind]}</span><div class="grow"><div class="name">${esc(e.title)}</div>${e.detail ? `<div class="list-sub">${esc(e.detail)}</div>` : ''}<div class="caption">${fmtDate(e.date.slice(0, 10))} · ${esc(e.provenance)}</div></div></div><span class="arrow">›</span></div>`).join('')}`).join('')
    : `<div class="empty"><div class="ico">≣</div><p>Nothing recorded yet. Add a document or check a symptom.</p></div>`;
  render(`
    ${topbar('#/profile/' + id, 'Medical history')}
    <div class="screen">
      ${p.allergies ? `<div class="card" style="border-color:var(--warn)"><div class="caption" style="color:var(--warn)">Allergies</div>${esc(p.allergies)}</div>` : ''}
      <button class="btn secondary" data-go="#/profile/${id}/timeline">All documents</button>
      ${body}
      <div class="disclaimer">${DISCLAIMER}</div>
    </div>${tabsBar(id, 'history')}`);
}

function screenEpisode(id, eid) {
  const e = DB.episodes.find((x) => x.id === eid && x.profileId === id);
  if (!e) return go(`#/profile/${id}/history`);
  const chat = DB.chats.find((c) => c.episodeId === eid);
  render(`
    ${topbar(`#/profile/${id}/history`, 'Symptom check')}
    <div class="screen">
      <div class="caption">${fmtDate(e.createdAt.slice(0, 10))} · Reported by you · rules-based assistant, not a diagnosis</div>
      <div class="card"><div class="name">${esc(DISPOSITION_LABEL[e.disposition] || 'Incomplete')}</div><pre class="ocr">${esc(e.summary || '')}</pre></div>
      ${chat ? `<details class="card"><summary>Full conversation</summary>${chat.transcript.map((t) => `<p><strong>${t.role === 'user' ? 'You' : 'Assistant'}:</strong> ${esc(t.text).replace(/\n/g, '<br>')}</p>`).join('')}</details>` : ''}
      <div class="caption">Engine: ${esc(e.engineVersion)}</div>
    </div>`);
}

/* ============================== symptom assistant (proposal §1, §12) ============================== */
function triageContext(id) {
  const p = getProfile(id);
  return {
    ageYears: calcAge(p.birthYear),
    allergies: p.allergies || null,
    activeMedicines: activeMeds(id).map((m) => `${m.name}${m.dose ? ' ' + m.dose : ''}`),
    priorEpisodes: byProfile(DB.episodes, id).map((e) => ({ protocolId: e.protocolId || '', complaint: e.complaint, date: e.createdAt.slice(0, 10), disposition: e.disposition })),
    now: new Date(),
  };
}
function screenAssistant(id) {
  if (!window.__tri || window.__tri.pid !== id) {
    const s = core.startTriage(triageContext(id));
    window.__tri = { pid: id, state: s.state, bubbles: s.messages.map((m) => ({ role: 'assistant', msg: m })), savedId: null, busy: false };
  }
  renderAssistant(id);
}
function renderAssistant(id) {
  const t = window.__tri;
  const p = getProfile(id);
  const num112 = core.EMERGENCY_NUMBER;
  const bubble = (b) => b.role === 'user'
    ? `<div class="card bubble-user">${esc(b.msg.text)}</div>`
    : `<div class="card ${b.msg.kind === 'emergency' ? 'bubble-emergency' : b.msg.kind === 'summary' ? 'bubble-summary' : 'bubble-bot'}">${b.msg.kind === 'emergency' ? '<div class="name" style="color:var(--danger)">Get help now</div>' : ''}<div class="msg">${esc(b.msg.text).replace(/\n/g, '<br>')}</div>${b.msg.kind === 'emergency' ? `<a class="btn danger" href="tel:${num112}">Call ${num112}</a>` : ''}</div>`;
  const last = [...t.bubbles].reverse().find((b) => b.role === 'assistant')?.msg;
  const quick = !t.state.done && last?.quickReplies?.length ? `<div class="chips" style="margin-top:8px">${last.quickReplies.map((q) => `<button class="chip" data-qr="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : '';
  render(`
    ${topbar('#/profile/' + id, `Symptom check · ${esc(p.name)}`)}
    <div class="screen">
      <div class="card row" style="justify-content:space-between;padding:10px 12px"><span class="caption">Rules-based assistant, not a doctor. Emergency? Call ${num112} now.</span><a class="pill" style="color:var(--danger);border-color:var(--danger);text-decoration:none" href="tel:${num112}">Call ${num112}</a></div>
      ${t.bubbles.map(bubble).join('')}
      ${t.busy ? '<div class="caption">…</div>' : ''}
      ${quick}
      ${t.state.done ? `${t.savedId ? `<div class="caption" style="text-align:center;margin-top:12px">Saved to ${esc(p.name)}’s medical history.</div>` : ''}<button class="btn secondary" id="tri-new">Start a new check</button><button class="textbtn" data-go="#/profile/${id}/history" style="display:block;margin:4px auto">See medical history</button>` : `<div class="row" style="gap:8px;position:sticky;bottom:72px;margin-top:12px"><input id="tri-input" placeholder="Type your answer…" class="grow" autocomplete="off"/><button class="iconbtn" id="tri-send" style="background:var(--accent);color:var(--onAccent)">➤</button></div>`}
      <div class="disclaimer">${esc(core.TRIAGE_DISCLAIMER)}</div>
    </div>${tabsBar(id, 'assistant')}`);
  const send = async (text) => {
    if (!text || !text.trim() || t.busy) return;
    t.busy = true;
    t.bubbles.push({ role: 'user', msg: { kind: 'info', text: text.trim() } });
    renderAssistant(id);
    const r = await core.respond(t.state, text, triageContext(id));
    t.state = r.state;
    t.bubbles.push(...r.messages.map((m) => ({ role: 'assistant', msg: m })));
    t.busy = false;
    if (r.state.done && !t.savedId) t.savedId = saveAssessment(id, r.state, r.messages);
    renderAssistant(id);
    window.scrollTo(0, document.body.scrollHeight);
    $('#tri-input')?.focus();
  };
  $('#tri-send')?.addEventListener('click', () => send($('#tri-input').value));
  $('#tri-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(e.target.value); });
  app.querySelectorAll('[data-qr]').forEach((b) => b.addEventListener('click', () => send(b.dataset.qr)));
  $('#tri-new')?.addEventListener('click', () => { window.__tri = null; screenAssistant(id); });
  if (t.bubbles.length > 1) window.scrollTo(0, document.body.scrollHeight);
}
function saveAssessment(pid, state, messages) {
  const id = uid();
  const summary = state.disposition === 'emergency' ? messages.map((m) => m.text).join('\n') : (() => { const o = core.computeOutcome(state, triageContext(pid)); return `${o.summary}\n\n${o.advice}`; })();
  const protocol = core.PROTOCOLS.find((x) => x.id === state.protocolId);
  const complaint = state.complaint || protocol?.label || 'Symptom check';
  DB.episodes.push({ id, profileId: pid, protocolId: state.protocolId, complaint, answers: state.answers, flags: state.flags, disposition: state.disposition, summary, engineVersion: core.TRIAGE_ENGINE_VERSION, createdAt: nowIso() });
  DB.chats.push({ id: uid(), profileId: pid, episodeId: id, transcript: state.transcript, createdAt: nowIso() });
  audit(pid, 'episode', id, 'create', { note: `${complaint} → ${state.disposition}` });
  save();
  return id;
}

/* ============================== medicines (S12) ============================== */
function medCard(id, m) {
  const st = medStatus(m);
  const needs = (st === 'active' || st === 'pending') && core.scheduleBlockers(m).length > 0;
  const end = core.effectiveEndDate(m);
  return `<div class="card link" data-go="#/profile/${id}/medicine/${m.id}" ${needs ? 'style="border-color:var(--warn)"' : ''}><div class="grow"><div class="row" style="justify-content:space-between"><span class="name">${esc(m.name)} ${esc(m.dose || '')}</span><span class="pill ${needs ? 'warn' : st === 'active' ? 'ok' : ''}">${needs ? 'Needs details' : STATUS_LABEL[st]}</span></div><div class="list-sub">${m.asNeeded ? 'When needed' : (m.times || []).map(timeLabel).join(' · ') || 'No times set'}</div><div class="caption">${end ? 'Until ' + fmtDate(end) : 'No end date'}${m.instructions ? ' · ' + esc(m.instructions) : ''}</div></div><span class="arrow">›</span></div>`;
}
function screenMeds(id) {
  const p = getProfile(id);
  if (!p) return go('#/');
  const all = byProfile(DB.medicines, id);
  const current = all.filter((m) => ['active', 'paused', 'pending'].includes(medStatus(m)));
  const past = all.filter((m) => !current.includes(m));
  render(`${topbar('#/profile/' + id, 'Medicines', `<button class="textbtn" data-go="#/profile/${id}/doses">Doses</button>`)}<div class="screen"><h2 class="sec">Current (${current.length})</h2>${current.length ? current.map((m) => medCard(id, m)).join('') : '<div class="muted">No current medicines</div>'}${past.length ? `<h2 class="sec">Past (${past.length})</h2>${past.map((m) => medCard(id, m)).join('')}` : ''}<div class="disclaimer">${DISCLAIMER}</div></div>${tabsBar(id, 'meds')}`);
}

function screenMedicine(id, mid, editing = false) {
  const m = getMed(mid);
  if (!m || m.profileId !== id) return go(`#/profile/${id}/meds`);
  const st = medStatus(m);
  const blockers = core.scheduleBlockers(m);
  const end = core.effectiveEndDate(m);
  const f = window.__medForm = editing ? (window.__medForm && window.__medForm.id === mid ? window.__medForm : { id: mid, name: m.name, dose: m.dose || '', times: [...m.times], durationDays: m.durationDays ? String(m.durationDays) : '', startDate: m.startDate || '', instructions: m.instructions || '', asNeeded: !!m.asNeeded }) : null;
  const custom = f ? f.times.filter((t) => !TIME_SLOTS.includes(t)) : [];
  render(`
    ${topbar(`#/profile/${id}/meds`, esc(m.name), !editing ? '<button class="textbtn" id="m-edit">Edit</button>' : '')}
    <div class="screen">
      <div class="card">
        <div class="row" style="justify-content:space-between"><span class="name">${STATUS_LABEL[st]}</span><span class="caption">${m.source === 'document_confirmed' ? 'From prescription · confirmed by you' : 'Entered by you'}</span></div>
        <div class="list-sub">${m.asNeeded ? 'Take when needed — no timed reminders.' : (m.times || []).map(timeLabel).join(' · ') || 'No times set'}</div>
        <div class="list-sub">${m.dose ? 'Dose: ' + esc(m.dose) : 'Dose not set'}${m.instructions ? ' · ' + esc(m.instructions) : ''}</div>
        <div class="caption">${m.startDate ? 'From ' + fmtDate(m.startDate) : 'Start date not set'}${end ? ' to ' + fmtDate(end) : ' · No end date written — reminders continue until you stop them'}</div>
        ${m.documentId && getDoc(m.documentId) ? `<a class="inline" href="#/profile/${id}/doc/${m.documentId}">View source document</a>` : ''}
      </div>
      ${blockers.length && (st === 'active' || st === 'pending') ? `<div class="card" style="border-color:var(--warn)"><div class="name" style="color:var(--warn)">Reminders not set yet</div>${blockers.map((b) => `<div class="list-sub">• ${esc(b)}</div>`).join('')}<div class="caption" style="margin-top:6px">Check the prescription or ask your doctor or pharmacist, then add the missing details.</div>${!editing ? '<button class="btn primary" id="m-edit2">Add details</button>' : ''}</div>` : ''}
      ${editing ? `
      <div class="card" style="border-color:var(--accent)">
        <div class="caption">Enter the instructions exactly as your doctor prescribed.</div>
        <label class="label">Name</label><input id="e-name" value="${esc(f.name)}" />
        <label class="label">Dose</label><input id="e-dose" value="${esc(f.dose)}" placeholder="e.g. 500 mg, 1 tablet" />
        <div class="chips" style="margin-top:12px"><button class="chip ${!f.asNeeded ? 'sel' : ''}" data-an="0">At set times</button><button class="chip ${f.asNeeded ? 'sel' : ''}" data-an="1">Only when needed</button></div>
        ${!f.asNeeded ? `<div class="chips" style="margin-top:8px">${TIME_SLOTS.map((t) => `<button class="chip ${f.times.includes(t) ? 'sel' : ''}" data-slot="${t}">${t}</button>`).join('')}${custom.map((t) => `<button class="chip sel" data-rmtime="${t}">${t} ✕</button>`).join('')}</div>
        <div class="row" style="gap:8px;margin-top:8px"><input id="e-time" type="time" class="grow" /><button class="btn secondary" id="e-addtime" style="width:auto;margin:0;padding:0 16px">Add time</button></div>` : ''}
        <div class="row" style="gap:10px"><div class="grow"><label class="label">Start date</label><input id="e-start" type="date" value="${esc(f.startDate)}" /></div><div class="grow"><label class="label">Days</label><input id="e-days" inputmode="numeric" value="${esc(f.durationDays)}" placeholder="empty = no end" /></div></div>
        <label class="label">Instructions</label><input id="e-instr" value="${esc(f.instructions)}" placeholder="e.g. after meals" />
        <button class="btn primary" id="e-save">Save</button><button class="textbtn" id="e-cancel">Cancel</button>
      </div>` : `
      ${st === 'active' ? '<button class="btn secondary" data-st="paused">Pause reminders</button>' : ''}
      ${st === 'paused' ? '<button class="btn primary" data-st="active">Resume</button>' : ''}
      ${['active', 'paused', 'pending'].includes(st) ? '<button class="btn secondary" data-st="completed">Mark course completed</button><button class="btn danger" data-st="discontinued">Stop this medicine</button>' : ''}
      <div class="caption" style="text-align:center;margin-top:8px">Only change or stop a medicine as your doctor advised.</div>`}
      <div class="disclaimer">${DISCLAIMER}</div>
    </div>`);
  const readForm = () => { if (!f) return; f.name = $('#e-name').value; f.dose = $('#e-dose').value; f.startDate = $('#e-start').value; f.durationDays = $('#e-days').value; f.instructions = $('#e-instr').value; };
  $('#m-edit')?.addEventListener('click', () => { window.__medForm = null; screenMedicine(id, mid, true); });
  $('#m-edit2')?.addEventListener('click', () => { window.__medForm = null; screenMedicine(id, mid, true); });
  app.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => {
    const before = m.status; const to = b.dataset.st;
    m.status = to; m.active = to !== 'completed' && to !== 'discontinued'; m.updatedAt = nowIso();
    if (!m.active && !m.endDate) m.endDate = todayISO();
    audit(id, 'medicine', m.id, 'status', { before, after: to }); save(); screenMedicine(id, mid);
  }));
  if (editing) {
    app.querySelectorAll('[data-an]').forEach((b) => b.addEventListener('click', () => { readForm(); f.asNeeded = b.dataset.an === '1'; screenMedicine(id, mid, true); }));
    app.querySelectorAll('[data-slot]').forEach((b) => b.addEventListener('click', () => { readForm(); const s = b.dataset.slot; f.times = f.times.includes(s) ? f.times.filter((x) => x !== s) : [...f.times, s]; screenMedicine(id, mid, true); }));
    app.querySelectorAll('[data-rmtime]').forEach((b) => b.addEventListener('click', () => { readForm(); f.times = f.times.filter((x) => x !== b.dataset.rmtime); screenMedicine(id, mid, true); }));
    $('#e-addtime')?.addEventListener('click', () => { readForm(); const t = core.resolveTime($('#e-time').value || ''); if (!t) return flash('Pick a time first.'); f.times = [...new Set([...f.times, t])]; screenMedicine(id, mid, true); });
    $('#e-cancel').addEventListener('click', () => { window.__medForm = null; screenMedicine(id, mid); });
    $('#e-save').addEventListener('click', () => {
      readForm();
      if (!f.name.trim()) return flash('Please enter the medicine name.');
      if (f.durationDays && !/^\d+$/.test(f.durationDays.trim())) return flash('Days must be a number.');
      const before = { name: m.name, dose: m.dose, times: m.times, durationDays: m.durationDays, startDate: m.startDate, instructions: m.instructions };
      Object.assign(m, { name: f.name.trim(), dose: f.dose.trim() || null, times: f.asNeeded ? [] : f.times, asNeeded: f.asNeeded, durationDays: f.durationDays ? parseInt(f.durationDays, 10) : null, startDate: f.startDate || null, endDate: '', instructions: f.instructions.trim() || null, confirmedAt: nowIso(), updatedAt: nowIso() });
      if (m.status === 'pending') m.status = 'active';
      audit(id, 'medicine', m.id, 'update', { before, after: { name: m.name, dose: m.dose, times: m.times, durationDays: m.durationDays, startDate: m.startDate, instructions: m.instructions } });
      save(); window.__medForm = null; screenMedicine(id, mid);
    });
  }
}

/* ============================== doses (proposal §6) ============================== */
function logDose(pid, medicineId, doseKey, at, status) {
  const before = DB.doseLogs.find((l) => l.doseKey === doseKey);
  if (before) Object.assign(before, { status, loggedAt: nowIso() });
  else DB.doseLogs.push({ id: uid(), profileId: pid, medicineId, doseKey, scheduledAt: new Date(at).toISOString(), status, loggedAt: nowIso() });
  DB.snoozes = DB.snoozes.filter((s) => s.data?.doseKey !== doseKey);
  audit(pid, 'dose', doseKey, before ? 'update' : 'create', { before: before?.status, after: status });
  save();
}
function snoozeDose(pid, alarm) {
  const count = Number(alarm.data?.snoozeCount || 0);
  const next = core.snoozeAlarm(alarm, count, new Date());
  if (!next) return flash('Already snoozed 3 times. Please mark it taken or skipped.');
  DB.snoozes = DB.snoozes.filter((s) => s.id !== next.id).concat([{ ...next, data: { ...next.data, profileId: pid } }]);
  save();
  flash('We’ll remind you again in 15 minutes (while MedNest is open).');
}
function screenDoses(id) {
  const data = careData(id);
  const now = new Date();
  const today = core.todaysDoses(data.medicines, data.doseLogs, now);
  const past = core.pastDoses(data.medicines, data.doseLogs, now).filter((d) => d.occ.date !== todayISO());
  const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  const color = (s) => (s === 'taken' ? 'ok' : s === 'missed' || s === 'due' ? 'warn' : '');
  const row = (d, actions) => `<div class="card"><div class="row" style="justify-content:space-between"><span class="name">${esc(d.medicine.name)}${d.medicine.dose ? ' · ' + esc(d.medicine.dose) : ''}</span><span class="pill ${color(d.state)}">${DOSE_LABEL[d.state]}</span></div><div class="list-sub">${actions ? '' : fmtDate(d.occ.date) + ' · '}${core.formatTime(d.occ.time)}${d.medicine.instructions ? ' · ' + esc(d.medicine.instructions) : ''}</div>
    ${actions && d.state !== 'taken' && d.state !== 'skipped' ? `<div class="row" style="gap:8px"><button class="btn primary" data-dose="${d.occ.key}" data-st="taken">Taken</button><button class="btn secondary" data-dose="${d.occ.key}" data-st="skipped">Skip</button>${d.state === 'due' ? `<button class="btn secondary" data-snooze="${d.occ.key}">Later</button>` : ''}</div>` : ''}
    ${!actions && d.state === 'missed' ? `<div class="row"><button class="textbtn" data-dose="${d.occ.key}" data-st="taken">I took it</button><button class="textbtn" data-dose="${d.occ.key}" data-st="skipped">I skipped it</button></div>` : ''}</div>`;
  const banner = perm === 'granted'
    ? '<div class="caption">Browser reminders are on. On the web they only appear while MedNest is open in a tab; the Android app uses real alarms.</div>'
    : perm === 'unsupported'
      ? '<div class="card" style="border-color:var(--warn)">This browser can’t show reminders. Your schedule is still shown here.</div>'
      : `<div class="card" style="border-color:var(--warn)"><div class="name" style="color:var(--warn)">Reminders are switched off</div><div class="list-sub">MedNest can’t alert you at dose times. Your schedule is still shown here.</div>${perm === 'default' ? '<button class="btn primary" id="perm">Turn on reminders</button>' : '<div class="caption">Notifications are blocked for this site. Allow them in your browser’s site settings.</div>'}</div>`;
  render(`
    ${topbar(`#/profile/${id}/meds`, 'Doses')}
    <div class="screen">
      ${banner}
      <h2 class="sec">Today</h2>${today.length ? today.map((d) => row(d, true)).join('') : '<div class="empty"><div class="ico">℞</div><p>No doses scheduled today.</p></div>'}
      ${past.length ? `<h2 class="sec">Last 14 days</h2>${past.map((d) => row(d, false)).join('')}` : ''}
      <div class="disclaimer">Marking a dose only records what you tell MedNest. ${DISCLAIMER}</div>
    </div>${tabsBar(id, 'meds')}`);
  const all = [...today, ...past];
  app.querySelectorAll('[data-dose]').forEach((b) => b.addEventListener('click', () => { const d = all.find((x) => x.occ.key === b.dataset.dose); logDose(id, d.medicine.id, d.occ.key, d.occ.at, b.dataset.st); screenDoses(id); }));
  app.querySelectorAll('[data-snooze]').forEach((b) => b.addEventListener('click', () => { const d = all.find((x) => x.occ.key === b.dataset.snooze); snoozeDose(id, { id: `dose:${d.occ.key}`, at: d.occ.at, title: `Medicine reminder · ${getProfile(id).name}`, body: core.reminderBody(d.medicine, d.occ.time), category: 'dose', data: { kind: 'dose', medicineId: d.medicine.id, doseKey: d.occ.key, at: d.occ.at, snoozeCount: 0 } }); }));
  $('#perm')?.addEventListener('click', async () => { await Notification.requestPermission(); screenDoses(id); });
}

/* ============================== follow-ups (proposal §7) ============================== */
function screenAppointments(id, editing = null) {
  const appts = byProfile(DB.appointments, id).slice().sort((a, b) => (a.date || '0').localeCompare(b.date || '0'));
  const today = todayISO();
  const proposed = appts.filter((a) => a.status === 'proposed');
  const planned = appts.filter((a) => a.status === 'planned');
  const done = appts.filter((a) => a.status === 'completed' || a.status === 'cancelled').reverse();
  const ed = editing ? (editing === 'new' ? { id: 'new', date: '', time: '', doctor: '', reason: '' } : appts.find((a) => a.id === editing)) : null;
  const editor = () => `<div class="card" style="border-color:var(--accent)"><label class="label" style="margin-top:0">Date</label><input id="a-date" type="date" value="${esc(ed.date || '')}" /><label class="label">Time (optional)</label><input id="a-time" type="time" value="${esc(ed.time || '')}" /><label class="label">Doctor</label><input id="a-doctor" value="${esc(ed.doctor || '')}" /><label class="label">Reason</label><input id="a-reason" value="${esc(ed.reason || '')}" /><button class="btn primary" id="a-save">Confirm date &amp; set reminders</button><button class="textbtn" id="a-cancel">Cancel</button></div>`;
  const basisText = (a) => (a.basis === 'relative_to_document' ? 'Calculated from the document date — please check.' : a.basis === 'written_date' ? 'Date as written on the document — please check.' : 'Please choose the date.');
  render(`
    ${topbar('#/profile/' + id, 'Follow-ups', '<button class="textbtn" data-edit="new">＋ Add</button>')}
    <div class="screen">
      ${editing === 'new' ? editor() : ''}
      ${proposed.length ? '<h2 class="sec">Needs your confirmation</h2>' : ''}
      ${proposed.map((a) => (editing === a.id ? editor() : `<div class="card" style="border-color:var(--warn)"><div class="name">${a.date ? 'Proposed: ' + fmtDate(a.date) : 'Date not clear'}</div>${a.sourceText ? `<div class="list-sub">Document says: “${esc(a.sourceText)}”</div>` : ''}<div class="caption">${basisText(a)}</div><button class="btn primary" data-edit="${a.id}">${a.date ? 'Check and confirm' : 'Choose date'}</button><button class="textbtn" data-ast="${a.id}" data-v="cancelled">Not needed</button></div>`)).join('')}
      <h2 class="sec">Planned</h2>
      ${planned.length || editing === 'new' ? '' : '<div class="empty"><div class="ico">📅</div><p>No follow-ups planned.</p></div>'}
      ${planned.map((a) => (editing === a.id ? editor() : `<div class="card" ${a.date < today ? 'style="border-color:var(--warn)"' : ''}><div class="row" style="justify-content:space-between"><span class="name">${fmtDate(a.date)}${a.time ? ' · ' + esc(a.time) : ''}</span>${a.date < today ? '<span class="pill warn">Date passed</span>' : ''}</div><div class="list-sub">${esc([a.doctor, a.reason].filter(Boolean).join(' · ') || 'Follow-up')}</div><div class="caption">Reminders: the evening before and on the day.</div><div class="row" style="flex-wrap:wrap;gap:0"><button class="textbtn" data-ast="${a.id}" data-v="completed">Mark done</button><button class="textbtn" data-edit="${a.id}">Reschedule</button><button class="textbtn" data-ast="${a.id}" data-v="cancelled">Cancel</button></div></div>`)).join('')}
      ${done.length ? `<h2 class="sec">Past</h2>${done.map((a) => `<div class="card"><div>${fmtDate(a.date)} · ${a.status === 'completed' ? 'Done' : 'Cancelled'}</div><div class="caption">${esc([a.doctor, a.reason].filter(Boolean).join(' · '))}</div></div>`).join('')}` : ''}
      <div class="disclaimer">MedNest reminds you; it does not book appointments. ${DISCLAIMER}</div>
    </div>`);
  app.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => screenAppointments(id, b.dataset.edit)));
  app.querySelectorAll('[data-ast]').forEach((b) => b.addEventListener('click', () => { const a = DB.appointments.find((x) => x.id === b.dataset.ast); const before = a.status; a.status = b.dataset.v; a.updatedAt = nowIso(); audit(id, 'appointment', a.id, 'status', { before, after: a.status }); save(); screenAppointments(id); }));
  $('#a-cancel')?.addEventListener('click', () => screenAppointments(id));
  $('#a-save')?.addEventListener('click', () => {
    const date = $('#a-date').value;
    if (!core.parseLocalDate(date)) return flash('Please choose the date.');
    const patch = { date, time: $('#a-time').value || null, doctor: $('#a-doctor').value.trim() || null, reason: $('#a-reason').value.trim() || null, status: 'planned', updatedAt: nowIso() };
    if (editing === 'new') { const a = { id: uid(), profileId: id, documentId: null, sourceText: null, basis: 'manual', createdAt: nowIso(), ...patch }; DB.appointments.push(a); audit(id, 'appointment', a.id, 'create', { after: patch }); }
    else { const a = DB.appointments.find((x) => x.id === editing); const before = { date: a.date, time: a.time, status: a.status }; Object.assign(a, patch); audit(id, 'appointment', a.id, 'update', { before, after: patch }); }
    save();
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
    screenAppointments(id);
  });
}

/* ============================== ask ============================== */
function screenAsk(id) {
  const p = getProfile(id);
  if (!p) return go('#/');
  window.__chat = window.__chat && window.__chat.pid === id ? window.__chat : { pid: id, log: [] };
  renderAsk(id);
}
function renderAsk(id) {
  const p = getProfile(id);
  const chat = window.__chat;
  const chips = ['Last sugar test?', 'Current medicines?', 'What changed this year?'];
  const logHtml = chat.log.map((m) => m.role === 'user'
    ? `<div class="card" style="margin-left:40px;border-color:var(--accent)"><strong>You:</strong> ${esc(m.text)}</div>`
    : `<div class="card"><div>${esc(m.text)}</div>${m.sources?.length ? `<div class="caption" style="margin-top:6px">Source: ${srcLinks(id, m.sources)}</div>` : ''}</div>`).join('');
  render(`
    ${topbar('#/profile/' + id, 'Ask')}
    <div class="screen">
      ${chat.log.length ? '' : `<div class="card"><div class="caption">I answer only from ${esc(p.name)}'s saved records. To talk through a symptom, use <a class="inline" href="#/profile/${id}/assistant">Check a symptom</a>.</div></div>`}
      ${chat.log.length ? logHtml : `<div class="chips">${chips.map((c) => `<button class="chip" data-ask="${esc(c)}">${esc(c)}</button>`).join('')}<button class="chip" data-go="#/profile/${id}/assistant">Check a symptom →</button></div>`}
      <div class="disclaimer">${DISCLAIMER}</div>
      <div class="row" style="gap:8px;position:sticky;bottom:72px"><input id="ask-input" placeholder="Ask about ${esc(p.name)}…" class="grow"/><button class="iconbtn" id="ask-send" style="background:var(--accent);color:var(--onAccent)">➤</button></div>
    </div>${tabsBar(id, 'ask')}`);
}

/* ============================== doctor summary (S15) ============================== */
function screenSummary(id) {
  const p = getProfile(id);
  if (!p) return go('#/');
  const age = calcAge(p.birthYear);
  const meds = byProfile(DB.medicines, id).filter((m) => ['active', 'paused', 'pending'].includes(medStatus(m)));
  const results = latestResults(id, 6);
  const notes = patternNotes(id);
  const episodes = byProfile(DB.episodes, id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const appts = core.upcomingAppointments(byProfile(DB.appointments, id), todayISO());
  const doses = core.pastDoses(byProfile(DB.medicines, id), byProfile(DB.doseLogs, id), new Date(), 14);
  const taken = doses.filter((d) => d.state === 'taken').length;
  render(`
    ${topbar('#/profile/' + id, 'Doctor summary')}
    <div class="screen">
      <div class="card" id="docsum">
        <div class="name" style="font-size:18px">${esc(p.name)} · ${esc(p.sex || '-')}${age != null ? ' · ' + age : ''}${p.bloodGroup ? ' · ' + esc(p.bloodGroup) : ''}</div>
        <div class="muted">Allergies: ${esc(p.allergies || 'none recorded')}</div>
        <h2 class="sec">Current medicines</h2>${meds.length ? meds.map((m) => `<div>${esc(m.name)} ${esc(m.dose || '')} — ${m.asNeeded ? 'when needed' : (m.times || []).map(timeLabel).join(', ') || '—'}${medStatus(m) !== 'active' ? ` (${STATUS_LABEL[medStatus(m)].toLowerCase()})` : ''}</div>`).join('') : '<div class="muted">None</div>'}
        ${doses.length ? `<div class="caption" style="margin-top:6px">Doses marked taken in the last 14 days: ${taken} of ${doses.length} (patient-reported).</div>` : ''}
        <h2 class="sec">Recent results</h2>${results.length ? results.map((r) => `<div>${esc(r.test)} ${esc(r.value)}${r.unit ? ' ' + esc(r.unit) : ''} (${fmtDate(r.docDate)})</div>`).join('') : '<div class="muted">None</div>'}
        ${episodes.length ? `<h2 class="sec">Recent symptoms (patient-reported)</h2>${episodes.map((e) => `<div>${fmtDate(e.createdAt.slice(0, 10))}: ${esc(e.complaint)} — ${esc(DISPOSITION_LABEL[e.disposition] || '')}</div>`).join('')}` : ''}
        ${appts.length ? `<h2 class="sec">Planned follow-ups</h2>${appts.map((a) => `<div>${fmtDate(a.date)} ${esc([a.doctor, a.reason].filter(Boolean).join(' · '))}</div>`).join('')}` : ''}
        ${notes.length ? `<h2 class="sec">Notes</h2>${notes.map((n) => `<div>${esc(n.text)}</div>`).join('')}` : ''}
        <hr class="sep"><div class="caption">Generated by MedNest from the patient's own documents and reports. Symptom checks come from a rules-based assistant and are not diagnoses. Not a clinical record.</div>
      </div>
      <button class="btn primary noprint" id="print">Save as PDF / Print</button>
    </div>`);
}

function screenShare(id) {
  const p = getProfile(id);
  if (!p) return go('#/');
  render(`
    ${topbar(`#/profile/${id}/edit`, `Share ${esc(p.name)}`)}
    <div class="screen">
      <div class="card">Sharing exports a copy of this profile as a file. Later changes are not sent automatically. Document photos are not included.</div>
      <button class="btn primary" id="export-profile">Download profile file</button>
      <div class="caption" style="text-align:center;margin-top:8px">On the native app this file is encrypted with a code. Here it is a plain JSON copy — share it only with people you trust.</div>
    </div>`);
}

function screenImport() {
  render(`
    ${topbar('#/', 'Import profile')}
    <div class="screen">
      ${DB.profiles.length >= MAX_PROFILES ? `<div class="card" style="border-color:var(--warn)">You already have ${MAX_PROFILES} profiles. Remove one to import another.</div>` : `<label class="label">Choose a profile file (.json)</label><input type="file" id="import-file" accept="application/json,.json" /><div id="import-preview"></div>`}
    </div>`);
}

function screenSettings() {
  const used = (() => { try { return (new Blob([localStorage.getItem(KEY) || '']).size / 1024).toFixed(1) + ' KB'; } catch { return '—'; } })();
  const perm = typeof Notification === 'undefined' ? 'Not supported' : { granted: 'On (while open)', denied: 'Blocked', default: 'Off' }[Notification.permission];
  render(`
    ${topbar('#/', 'Settings')}
    <div class="screen">
      <h2 class="sec">Data</h2>
      <div class="card link" id="export"><div class="grow">Export all data (JSON)</div><span class="arrow">›</span></div>
      <div class="card"><div class="row" style="justify-content:space-between"><span>Storage used</span><span class="muted">${used} + photos</span></div></div>
      <div class="card link" id="wipe"><div class="grow" style="color:var(--danger)">Delete all data</div><span class="arrow">›</span></div>
      <h2 class="sec">App</h2>
      <div class="card link" id="notif"><div class="row grow" style="justify-content:space-between"><span>Reminders</span><span class="muted">${perm}</span></div></div>
      <div class="card"><div class="row" style="justify-content:space-between"><span>Theme</span><span class="muted">System</span></div></div>
      <div class="card"><div class="row" style="justify-content:space-between"><span>Language</span><span class="muted">English</span></div></div>
      <h2 class="sec">About</h2>
      <div class="card link" data-href="./privacy"><div class="grow">Privacy policy</div><span class="arrow">›</span></div>
      <div class="card"><div class="grow muted">MedNest organises your records and its symptom check can help you decide when to see a doctor. It does not diagnose and does not replace a doctor. In an emergency call ${core.EMERGENCY_NUMBER}.</div></div>
      <div class="counter">MedNest web · v1.1.0 · ${esc(core.TRIAGE_ENGINE_VERSION)}</div>
      <div class="caption" style="text-align:center;margin-top:8px">Your data is stored only in this browser.</div>
    </div>`);
  $('#notif')?.addEventListener('click', async () => { if (typeof Notification !== 'undefined' && Notification.permission === 'default') { await Notification.requestPermission(); screenSettings(); } });
}

/* ============================== event wiring ============================== */
function wire() {
  app.querySelectorAll('[data-go]').forEach((e) => e.addEventListener('click', (ev) => { ev.stopPropagation(); go(e.dataset.go); }));
  app.querySelectorAll('[data-href]').forEach((e) => e.addEventListener('click', () => (location.href = e.dataset.href)));

  if ($('#ob-next')) {
    $('#skip')?.addEventListener('click', () => { window.__ob = 2; renderWelcome(); });
    $('#understand')?.addEventListener('change', (e) => ($('#ob-next').disabled = !e.target.checked));
    $('#ob-next').addEventListener('click', () => { if (window.__ob < 2) { window.__ob++; renderWelcome(); } else { localStorage.setItem(FLAG_ONBOARDED, '1'); go('#/'); } });
  }

  if ($('#f-save')) {
    const d = window.__draft;
    $('#f-rel')?.querySelectorAll('[data-rel]').forEach((b) => b.addEventListener('click', () => { d.relation = b.dataset.rel; selOne($('#f-rel'), b); }));
    $('#f-sex')?.querySelectorAll('[data-sex]').forEach((b) => b.addEventListener('click', () => { d.sex = b.dataset.sex; selOne($('#f-sex'), b); }));
    $('#f-color')?.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => { d.color = b.dataset.color; $('#f-color').querySelectorAll('.d').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); }));
    $('#f-save').addEventListener('click', () => saveProfile(d));
    $('#f-del')?.addEventListener('click', () => deleteProfile(d.id));
  }

  $('#doc-del')?.addEventListener('click', () => { const parts = location.hash.split('/'); deleteDocument(parts[2], parts[4]); });

  if ($('#ask-send')) {
    const id = location.hash.split('/')[2];
    const submit = (text) => { if (!text?.trim()) return; const res = askRecords(id, text); window.__chat.log.push({ role: 'user', text }); window.__chat.log.push({ role: 'bot', text: res.answer, sources: res.sources }); renderAsk(id); };
    $('#ask-send').addEventListener('click', () => submit($('#ask-input').value));
    $('#ask-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(e.target.value); });
    app.querySelectorAll('[data-ask]').forEach((b) => b.addEventListener('click', () => submit(b.dataset.ask)));
  }

  $('#print')?.addEventListener('click', () => window.print());
  $('#export-profile')?.addEventListener('click', () => exportProfile(location.hash.split('/')[2]));
  $('#import-file')?.addEventListener('change', (e) => previewImport(e.target.files[0]));
  $('#export')?.addEventListener('click', exportData);
  $('#wipe')?.addEventListener('click', wipeData);

  $('#hi-load')?.addEventListener('click', loadWebLLM);
  if ($('#hi-send')) {
    const submit = () => { const el = $('#hi-input'); const v = el.value; el.value = ''; sendHealthMsg(v); };
    $('#hi-send').addEventListener('click', submit);
    $('#hi-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }
}
function selOne(container, btn) { container.querySelectorAll('.chip').forEach((c) => c.classList.remove('sel')); btn.classList.add('sel'); }

/* ============================== actions ============================== */
function saveProfile(d) {
  const name = $('#f-name').value.trim();
  d.birthYear = $('#f-year').value.trim();
  d.bloodGroup = $('#f-blood').value.trim();
  d.allergies = $('#f-allergy').value.trim();
  if (!name) return flash('Please enter a name.');
  if (!d.relation) return flash('Please choose a relation.');
  d.name = name;
  if (d.id) { Object.assign(getProfile(d.id), d); audit(d.id, 'profile', d.id, 'update'); }
  else { if (DB.profiles.length >= MAX_PROFILES) return flash('You already have 4 profiles.'); DB.profiles.push({ ...d, id: uid(), createdAt: todayISO() }); }
  save();
  go(d.id ? '#/profile/' + d.id : '#/');
}
const PROFILE_ARRAYS = ['documents', 'medicines', 'results', 'doseLogs', 'appointments', 'episodes', 'chats', 'audit'];
function deleteProfile(id) {
  const p = getProfile(id);
  const typed = prompt(`This removes ALL documents, medicines, reminders and symptom checks for "${p.name}" from this browser. This cannot be undone.\n\nType the profile name to confirm:`);
  if (typed !== p.name) { if (typed !== null) flash('Name did not match. Nothing deleted.'); return; }
  byProfile(DB.documents, id).forEach((d) => (d.imageIds || []).forEach((i) => IDB.del(i)));
  DB.profiles = DB.profiles.filter((x) => x.id !== id);
  PROFILE_ARRAYS.forEach((k) => (DB[k] = DB[k].filter((x) => x.profileId !== id)));
  DB.snoozes = DB.snoozes.filter((s) => s.data?.profileId !== id);
  save(); go('#/');
}
function deleteDocument(pid, docId) {
  if (!confirm('Delete this document and everything read from it?')) return;
  const doc = getDoc(docId);
  (doc?.imageIds || []).forEach((i) => IDB.del(i));
  DB.documents = DB.documents.filter((d) => d.id !== docId);
  DB.medicines = DB.medicines.filter((m) => m.documentId !== docId);
  DB.results = DB.results.filter((r) => r.documentId !== docId);
  DB.appointments = DB.appointments.filter((a) => a.documentId !== docId);
  audit(pid, 'document', docId, 'delete', { note: doc ? `${doc.type} of ${doc.docDate}` : undefined });
  save(); go('#/profile/' + pid + '/timeline');
}
function download(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}
function exportData() { download(DB, 'mednest-export.json'); }
function exportProfile(pid) {
  const p = getProfile(pid);
  const bundle = { kind: 'mednest-profile', version: 2, profile: p };
  PROFILE_ARRAYS.forEach((k) => (bundle[k] = byProfile(DB[k], pid)));
  download(bundle, `mednest-${(p.name || 'profile').replace(/\s+/g, '-').toLowerCase()}.json`);
}
function previewImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data; try { data = JSON.parse(reader.result); } catch { return flash('That file is not valid.'); }
    if (data.kind !== 'mednest-profile' || !data.profile) return flash('Not a MedNest profile file.');
    const preview = $('#import-preview');
    preview.innerHTML = `<div class="card">${dotHtml(data.profile.color)} <strong>${esc(data.profile.name)}</strong> · ${esc(data.profile.relation || '')}<div class="list-sub">${(data.documents || []).length} documents · ${(data.medicines || []).filter((m) => m.active !== false).length} active medicines</div></div><button class="btn primary" id="do-import">Add to my profiles</button>`;
    $('#do-import').addEventListener('click', () => doImport(data));
  };
  reader.readAsText(file);
}
function doImport(data) {
  if (DB.profiles.length >= MAX_PROFILES) return flash('You already have 4 profiles. Remove one first.');
  const dup = DB.profiles.find((p) => p.name.toLowerCase() === data.profile.name.toLowerCase());
  const newPid = uid();
  const name = dup ? data.profile.name + ' (imported)' : data.profile.name;
  DB.profiles.push({ ...data.profile, id: newPid, name, importedFrom: data.profile.id, createdAt: todayISO() });
  const docMap = {}; const medMap = {};
  (data.documents || []).forEach((d) => { const nid = uid(); docMap[d.id] = nid; DB.documents.push({ ...d, id: nid, profileId: newPid, imageIds: [] }); });
  const imported = migrate({ medicines: (data.medicines || []).map((m) => ({ ...m })), documents: [], version: data.version || 1 });
  imported.medicines.forEach((m) => { const nid = uid(); medMap[m.id] = nid; DB.medicines.push({ ...m, id: nid, profileId: newPid, documentId: docMap[m.documentId] || null }); });
  (data.results || []).forEach((r) => DB.results.push({ ...r, id: uid(), profileId: newPid, documentId: docMap[r.documentId] || null }));
  (data.appointments || []).forEach((a) => DB.appointments.push({ ...a, id: uid(), profileId: newPid, documentId: docMap[a.documentId] || null }));
  (data.doseLogs || []).forEach((l) => { const mid = medMap[l.medicineId]; if (mid) DB.doseLogs.push({ ...l, id: uid(), profileId: newPid, medicineId: mid, doseKey: l.doseKey.replace(l.medicineId, mid) }); });
  const epMap = {};
  (data.episodes || []).forEach((e) => { const nid = uid(); epMap[e.id] = nid; DB.episodes.push({ ...e, id: nid, profileId: newPid }); });
  (data.chats || []).forEach((c) => DB.chats.push({ ...c, id: uid(), profileId: newPid, episodeId: epMap[c.episodeId] || null }));
  save(); go('#/profile/' + newPid);
}
function wipeData() {
  const t = prompt('This permanently deletes ALL profiles, records and photos from this browser.\n\nType DELETE to confirm:');
  if (t === 'DELETE') { localStorage.removeItem(KEY); IDB.clear(); DB = load(); go('#/'); }
}
function flash(msg) { alert(msg); }

/* ============================== reminders (web) ============================== */
// The browser cannot wake a closed page, so web reminders fire only while MedNest is
// open. Times come from the same code as the Android app (buildDoseAlarms /
// appointmentAlarms); each reminder fires once (fired ids are remembered). A reminder
// showing never marks a dose as taken — the user taps Taken / Skip.
const FIRED_KEY = 'mednest.fired';
let lastTick = Date.now() - 60_000;
function firedSet() { try { return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) || '[]')); } catch { return new Set(); } }
function dueAlarms(from, to) {
  const out = [];
  const since = new Date(from);
  for (const p of DB.profiles) {
    const meds = byProfile(DB.medicines, p.id);
    const logs = byProfile(DB.doseLogs, p.id);
    out.push(...core.buildDoseAlarms(meds, logs, since, { profileName: p.name }).filter((a) => a.at <= to).map((a) => ({ ...a, data: { ...a.data, profileId: p.id } })));
    for (const ap of byProfile(DB.appointments, p.id)) out.push(...core.appointmentAlarms(ap, since, { profileName: p.name }).filter((a) => a.at <= to).map((a) => ({ ...a, data: { ...a.data, profileId: p.id } })));
  }
  out.push(...DB.snoozes.filter((s) => s.at > from && s.at <= to));
  return out;
}
function tickReminders() {
  const now = Date.now();
  const fired = firedSet();
  for (const a of dueAlarms(lastTick, now)) {
    const key = `${a.id}@${a.at}`;
    if (fired.has(key)) continue;
    fired.add(key);
    showReminder(a);
  }
  DB.snoozes = DB.snoozes.filter((s) => s.at > now - 3600_000);
  localStorage.setItem(FIRED_KEY, JSON.stringify([...fired].slice(-300)));
  lastTick = now;
}
function showReminder(a) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const n = new Notification(a.title, { body: a.body, tag: a.id });
      n.onclick = () => { window.focus(); go(a.data?.kind === 'dose' ? `#/profile/${a.data.profileId}/doses` : `#/profile/${a.data.profileId}/appointments`); };
    }
  } catch (_) {}
  // In-page banner with the same actions as the Android notification.
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<div class="name">${esc(a.title)}</div><div class="list-sub">${esc(a.body)}</div>${a.data?.kind === 'dose' ? '<div class="row" style="gap:8px"><button class="btn primary" data-t="taken">Taken</button><button class="btn secondary" data-t="later">Later</button><button class="btn secondary" data-t="skipped">Skip</button></div>' : '<button class="btn secondary" data-t="ok">OK</button>'}`;
  document.body.appendChild(el);
  el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.t; const d = a.data || {};
    if (t === 'taken' || t === 'skipped') logDose(d.profileId, d.medicineId, d.doseKey, d.at, t);
    if (t === 'later') snoozeDose(d.profileId, a);
    el.remove(); routeNow();
  }));
}

/* ============================== Health Info (in-browser open-source model) ============================== */
const HEALTH_SYS = `You are a careful health-information assistant inside the MedNest app.
Rules you must always follow:
- Give only GENERAL, educational information about conditions, symptoms, tests and medicines.
- You are NOT a doctor. Never diagnose the user, never tell them which medicine or what dose to take, never interpret their personal results, and never give emergency treatment instructions.
- If asked for personal diagnosis or treatment ("do I have X", "should I take Y", "what dose should I take"), briefly decline and tell them to see a doctor.
- Keep answers short and in plain words. End EVERY answer with: "This is general information, not medical advice — please see a doctor."
- You have no internet access. Answer from general knowledge and say clearly when you are unsure.`;

const WEBLLM_MODEL = 'Llama-3.2-1B-Instruct-q4f32_1-MLC';
const webllm = { engine: null, status: 'idle', progress: '', busy: false, log: [] };

function screenHealthInfo() { renderHealthInfo(); }

function renderHealthInfo() {
  const w = webllm;
  const logHtml = w.log.map((m) => m.role === 'user'
    ? `<div class="card" style="margin-left:40px;border-color:var(--accent)"><strong>You:</strong> ${esc(m.text)}</div>`
    : `<div class="card ${m.emergency ? 'bubble-emergency' : ''}">${esc(m.text)}${m.emergency ? `<a class="btn danger" href="tel:${core.EMERGENCY_NUMBER}">Call ${core.EMERGENCY_NUMBER}</a>` : ''}</div>`).join('');
  let controls = '';
  if (w.status === 'idle') controls = `<button class="btn primary" id="hi-load">Load assistant (one-time ~1 GB download)</button><div class="caption" style="text-align:center;margin-top:6px">Runs fully in your browser. Needs a WebGPU browser (Chrome or Edge on desktop works best). Nothing is uploaded.</div>`;
  else if (w.status === 'loading') controls = `<div class="card"><div>Loading model…</div><div class="caption">${esc(w.progress)}</div></div>`;
  else if (w.status === 'nogpu') controls = `<div class="card" style="border-color:var(--warn)">This browser doesn't support WebGPU, so the in-browser model can't run here. Try Chrome or Edge on a desktop/laptop. (The native app uses the phone's own on-device model instead.)</div>`;
  else if (w.status === 'error') controls = `<div class="card" style="border-color:var(--danger)">Could not load the model: ${esc(w.progress)}</div><button class="btn secondary" id="hi-load">Try again</button>`;
  const inputRow = w.status === 'ready'
    ? `<div class="row" style="gap:8px;position:sticky;bottom:8px"><input id="hi-input" placeholder="Ask a general health question…" class="grow" ${w.busy ? 'disabled' : ''}/><button class="iconbtn" id="hi-send" style="background:var(--accent);color:var(--onAccent)">➤</button></div>`
    : '';
  render(`
    ${topbar('#/', 'Health Info')}
    <div class="screen">
      <div class="card"><div class="caption">General health information only — not a diagnosis and not personal medical advice. Feeling unwell? Open a profile and use “Check a symptom”. This assistant has no internet access.</div></div>
      ${logHtml}
      ${w.busy ? '<div class="caption" style="text-align:center">Thinking…</div>' : ''}
      ${controls}
      <div class="disclaimer">General information, not medical advice.</div>
      ${inputRow}
    </div>`);
}

async function loadWebLLM() {
  const w = webllm;
  if (!('gpu' in navigator)) { w.status = 'nogpu'; renderHealthInfo(); return; }
  w.status = 'loading'; w.progress = 'starting…'; renderHealthInfo();
  try {
    const mod = await import('https://esm.run/@mlc-ai/web-llm@0.2.79');
    w.engine = await mod.CreateMLCEngine(WEBLLM_MODEL, {
      initProgressCallback: (p) => { w.progress = p && p.text ? p.text : ''; if (w.status === 'loading') renderHealthInfo(); },
    });
    w.status = 'ready'; renderHealthInfo();
  } catch (e) {
    w.status = 'error'; w.progress = e && e.message ? e.message : String(e); renderHealthInfo();
  }
}

async function sendHealthMsg(text) {
  const w = webllm;
  if (!text || !text.trim() || !w.engine || w.busy) return;
  w.log.push({ role: 'user', text: text.trim() });
  // Emergency warning signs get the fixed message in code — never a model answer.
  const flags = core.detectRedFlags(text);
  if (flags[0]?.level === 'emergency') {
    w.log.push({ role: 'assistant', emergency: true, text: flags.some((f) => f.id === 'self_harm') ? core.SELF_HARM_MESSAGE : core.EMERGENCY_MESSAGE });
    renderHealthInfo();
    return;
  }
  w.busy = true; renderHealthInfo();
  try {
    const messages = [{ role: 'system', content: HEALTH_SYS }, ...w.log.filter((m) => !m.emergency).map((m) => ({ role: m.role, content: m.text }))];
    const reply = await w.engine.chat.completions.create({ messages, temperature: 0.4, max_tokens: 400 });
    const answer = reply && reply.choices && reply.choices[0] && reply.choices[0].message ? reply.choices[0].message.content : '(no answer)';
    w.log.push({ role: 'assistant', text: answer || '(no answer)' });
  } catch (e) {
    w.log.push({ role: 'assistant', text: 'Sorry — something went wrong generating an answer. Please try again.' });
  }
  w.busy = false; renderHealthInfo();
}

/* ============================== router ============================== */
function route() {
  const h = location.hash || '#/';
  if (!localStorage.getItem(FLAG_ONBOARDED) && h !== '#/welcome') return go('#/welcome');
  const parts = h.slice(2).split('/');
  if (h === '#/welcome') return screenWelcome();
  if (h === '#/' || parts[0] === '') return screenProfiles();
  if (parts[0] === 'settings') return screenSettings();
  if (parts[0] === 'import') return screenImport();
  if (parts[0] === 'health-info') return screenHealthInfo();
  if (parts[0] === 'profile') {
    if (parts[1] === 'new') return screenProfileForm(null);
    const id = parts[1];
    if (!getProfile(id)) return go('#/');
    switch (parts[2]) {
      case undefined: return screenOverview(id);
      case 'edit': return screenProfileForm(id);
      case 'add': return screenAddDoc(id);
      case 'review': return screenReview(id);
      case 'timeline': return screenTimeline(id);
      case 'history': return screenHistory(id);
      case 'episode': return screenEpisode(id, parts[3]);
      case 'meds': return screenMeds(id);
      case 'medicine': return screenMedicine(id, parts[3]);
      case 'doses': return screenDoses(id);
      case 'appointments': return screenAppointments(id);
      case 'assistant': return screenAssistant(id);
      case 'ask': return screenAsk(id);
      case 'summary': return screenSummary(id);
      case 'share': return screenShare(id);
      case 'doc': return screenDocDetail(id, parts[3]);
    }
  }
  screenProfiles();
}
window.addEventListener('hashchange', route);
route();
if (!globalThis.__MEDNEST_TEST__) { tickReminders(); setInterval(tickReminders, 20_000); }

// Exported for off-device unit tests (ignored by the browser module loader).
export { askRecords, patternNotes, buildSummary, latestResults, migrate, saveAssessment, logDose };
