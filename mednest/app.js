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
/* ============================== icons ============================== */
// One consistent line-icon set (24px grid, 1.8 stroke) for every medical concept.
const ICON_PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  assistant: '<path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-5A8.5 8.5 0 1 1 21 12z"/><path d="M12 8.5v7M8.5 12h7"/>',
  chat: '<path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-5A8.5 8.5 0 1 1 21 12z"/><path d="M8.5 10.5h7M8.5 14h4.5"/>',
  records: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h3.5"/>',
  pill: '<path d="M10.5 3.5a4.95 4.95 0 0 1 7 7l-7 7a4.95 4.95 0 0 1-7-7z"/><path d="M7 7l7 7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  prescription: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 12h6M9 16h4"/>',
  lab: '<path d="M9 3h6M10 3v6.5L4.6 18.6A1.6 1.6 0 0 0 6 21h12a1.6 1.6 0 0 0 1.4-2.4L14 9.5V3"/><path d="M7.2 15h9.6"/>',
  scan: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  symptom: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  next: '<path d="M9 18l6-6-6-6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16 9.8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  stethoscope: '<path d="M5 3v5a5 5 0 0 0 10 0V3"/><path d="M10 13v2a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="11" r="2"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.6M8.2 13.2l7.6 4.6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
  logo: '<path d="M12 6v12M6 12h12"/>',
};
const icon = (name, size = 22) => `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${name === 'logo' ? 3 : 1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
const DOC_ICON = { Prescription: 'prescription', 'Lab report': 'lab', 'Scan report': 'scan', 'Discharge summary': 'records', Bill: 'receipt', Other: 'file' };
const docIcon = (type) => icon(DOC_ICON[type] || 'file');
const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const avatar = (p, cls = '') => `<span class="avatar ${cls}" style="background:${esc(p.color || DOT_COLORS[0])}" aria-hidden="true">${esc(initials(p.name))}</span>`;
// Where a piece of information came from, as a consistent badge.
const PROVENANCE = {
  ai: ['Read by MedNest · confirmed by you', 'accent'],
  you: ['Entered by you', ''],
  reported: ['You reported', 'info'],
  doctor: ['Written by doctor', 'ok'],
  general: ['General information', ''],
  check: ['Needs checking', 'warn'],
};
const badge = (kind) => { const [t, c] = PROVENANCE[kind] || PROVENANCE.you; return `<span class="pill ${c}">${t}</span>`; };

// Medicine times, always in chronological order.
const timesSorted = (times) => core.sortedTimes(times || []).map(timeLabel);

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
  for (const k of ['profiles', 'documents', 'medicines', 'results', 'doseLogs', 'appointments', 'episodes', 'chats', 'audit', 'snoozes', 'symptomUpdates', 'visitSummaries']) db[k] ||= [];
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

/* ============================== Ask (spec §6.4 Task D / §7.4) ============================== */
// Shared rules-based answerer (src/domain/askCare.ts): answers from this person's own
// records plus curated general medicine information; refuses advice; catches emergencies.
function askRecords(pid, question, context = {}) {
  const p = getProfile(pid);
  const data = {
    profileName: p.name,
    allergies: p.allergies || null,
    documents: byProfile(DB.documents, pid),
    medicines: byProfile(DB.medicines, pid),
    results: byProfile(DB.results, pid),
    appointments: byProfile(DB.appointments, pid),
    episodes: byProfile(DB.episodes, pid),
    doseLogs: byProfile(DB.doseLogs, pid),
    now: new Date(),
  };
  return core.askCare(question, data, context);
}

/* ============================== render helpers ============================== */
function render(html) { app.innerHTML = html; wire(); window.scrollTo(0, 0); }
const go = (route) => { location.hash = route; };
const routeNow = () => route();

// Bottom navigation: the five places people look for health information.
// Older screen keys map onto them (e.g. the symptom check and Ask both live under Assistant).
const TAB_OF = { overview: 'home', home: 'home', assistant: 'assist', ask: 'assist', assist: 'assist', history: 'records', timeline: 'records', records: 'records', meds: 'meds', appointments: 'appts', appts: 'appts' };
function tabsBar(pid, active) {
  const on = TAB_OF[active] || active;
  const t = (r, ic, label, key) => `<a href="#/profile/${pid}${r}" class="${on === key ? 'on' : ''}" ${on === key ? 'aria-current="page"' : ''}><span class="ti">${icon(ic, 22)}</span>${label}</a>`;
  return `<nav class="tabs" aria-label="Main">${t('', 'home', 'Home', 'home')}${t('/assist', 'assistant', 'Assistant', 'assist')}${t('/history', 'records', 'Records', 'records')}${t('/meds', 'pill', 'Medicines', 'meds')}${t('/appointments', 'calendar', 'Appointments', 'appts')}</nav>`;
}
// The web demo shows no ads (the Android app has a labelled banner slot, spec §11).
const adSlot = () => '';
const dotHtml = (c) => `<span class="dot" style="background:${esc(c || DOT_COLORS[0])}"></span>`;
const srcLinks = (pid, ids) => [...new Set(ids)].map((id) => { const d = getDoc(id); return d ? `<a class="inline" href="#/profile/${pid}/doc/${id}">${esc(d.type)}, ${fmtDate(d.docDate)}</a>` : ''; }).filter(Boolean).join(' · ');
const topbar = (back, title, extra = '') => `<div class="topbar"><button class="iconbtn back" data-go="${back}" aria-label="Back">${icon('back', 24)}</button><h1>${title}</h1>${extra}</div>`;

/* ============================== onboarding (S2) ============================== */
function screenWelcome() {
  window.__ob = 0;
  renderWelcome();
}
function renderWelcome() {
  const slides = [
    { ico: 'prescription', t: 'All your medical papers, organised', b: 'Photograph prescriptions and reports. MedNest files them for each family member and sets medicine and follow-up reminders.' },
    { ico: 'lock', t: 'Private by design', b: 'No account and no MedNest server. Your records stay on this device. When you look something up, only the medicine name or topic is sent to trusted public medical sources.' },
    { ico: 'stethoscope', t: 'A helper, not a doctor', b: 'MedNest organises your records and its symptom check helps you decide when to get care. It does not diagnose, and it never replaces your doctor.' },
  ];
  const i = window.__ob;
  const s = slides[i];
  const last = i === slides.length - 1;
  render(`
    <div class="topbar"><div class="brand"><span class="logo">${icon('logo', 18)}</span><span class="brand-name">MedNest</span></div>${!last ? '<button class="textbtn" id="skip">Skip</button>' : ''}</div>
    <div class="screen" style="text-align:center;padding-top:24px">
      <div class="empty" style="padding:24px 0 8px"><div class="ico-wrap" style="width:88px;height:88px;border-radius:28px">${icon(s.ico, 40)}</div></div>
      <div class="title">${s.t}</div>
      <p class="muted" style="max-width:360px;margin:8px auto 0">${s.b}</p>
      ${last ? `<label class="row" style="justify-content:center;gap:10px;margin-top:22px;cursor:pointer"><input type="checkbox" id="understand"/> I understand MedNest is not a doctor</label>` : ''}
      <div style="margin:24px 0;color:var(--textMuted);letter-spacing:4px" aria-hidden="true">${slides.map((_, k) => (k === i ? '●' : '○')).join('')}</div>
      <button class="btn primary" id="ob-next" ${last ? 'disabled' : ''}>${last ? 'Get started' : 'Next'}</button>
      ${last ? '<a class="inline" href="./privacy" style="display:inline-block;margin-top:14px">Read the privacy policy</a>' : ''}
    </div>
  `);
}

/* ============================== profiles (first screen) ============================== */
function screenProfiles() {
  const list = DB.profiles.map((p) => {
    const docs = byProfile(DB.documents, p.id);
    const meds = activeMeds(p.id);
    const nextDose = core.todaysDoses(byProfile(DB.medicines, p.id), byProfile(DB.doseLogs, p.id), new Date()).find((d) => d.state === 'upcoming' || d.state === 'due');
    const pend = core.pendingConfirmations(careData(p.id), todayISO()).length;
    const sub = !docs.length && !meds.length ? 'No records yet' : `${meds.length} medicine${meds.length === 1 ? '' : 's'} · ${docs.length} document${docs.length === 1 ? '' : 's'}`;
    return `<div class="card link" data-go="#/profile/${p.id}" role="link" aria-label="Open ${esc(p.name)}">
      <div class="row grow">${avatar(p)}<div class="grow">
        <div class="name">${esc(p.name)} <span class="muted" style="font-weight:400">· ${esc(p.relation)}</span></div>
        <div class="list-sub truncate">${esc(sub)}</div>
        <div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">${nextDose ? `<span class="pill accent">${icon('clock', 13)} ${core.formatTime(nextDose.occ.time)} · ${esc(nextDose.medicine.name)}</span>` : ''}${pend ? `<span class="pill warn">${pend} to confirm</span>` : ''}</div>
      </div></div><span class="arrow">${icon('next', 20)}</span></div>`;
  }).join('');
  const addCard = DB.profiles.length < MAX_PROFILES ? `<button class="btn secondary" data-go="#/profile/new">${icon('plus', 20)} Add a family member</button>` : `<div class="counter">${MAX_PROFILES} of ${MAX_PROFILES} profiles</div>`;
  const body = DB.profiles.length
    ? `<h2 class="sec">Whose records? <button class="textbtn" data-go="#/import" style="padding:0">Import</button></h2>${list}${addCard}`
    : `<div class="empty"><div class="ico-wrap">${icon('user', 30)}</div><p style="color:var(--text);font-weight:600;margin:0">Start with the first person</p><p>Add yourself or a family member whose prescriptions and reports you look after.</p><button class="btn primary" data-go="#/profile/new">${icon('plus', 20)} Add a family member</button><button class="textbtn" data-go="#/import">Import a profile file</button></div>`;
  render(`
    <div class="topbar"><div class="brand"><span class="logo">${icon('logo', 18)}</span><span class="brand-name">MedNest</span></div><button class="iconbtn" data-go="#/settings" aria-label="Settings">${icon('settings')}</button></div>
    <div class="screen">
      <div class="greeting"><div class="who">Your family’s health, organised</div><div class="muted" style="margin-top:4px">Prescriptions, medicines, reminders and symptom checks — in one calm place.</div></div>
      ${body}
      <div class="card link" data-go="#/health-info"><div class="row grow"><span class="tile info">${icon('chat')}</span><div class="grow"><div class="name">General health questions</div><div class="list-sub">An open-source assistant that runs in your browser</div></div></div><span class="arrow">${icon('next', 20)}</span></div>
      <div class="trust"><span class="tile">${icon('shield')}</span><div class="grow"><div class="name">Private by design</div><div class="caption" style="color:var(--text)">Your records stay in this browser — no account, no MedNest server. Only medicine names and health topics you look up are sent to public medical sources. <a class="inline" href="#/settings">Privacy &amp; data</a></div></div></div>
    </div>`);
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

/* ============================== home (S7) ============================== */
// Priorities, top to bottom: anything urgent or needing confirmation, the assistant,
// today's medicines, appointments, recent documents, then a short health overview.
function greetingWord() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function screenOverview(id) {
  const p = getProfile(id);
  if (!p) return go('#/');
  const docs = byProfile(DB.documents, id);
  const notes = patternNotes(id);
  const data = careData(id);
  const pending = core.pendingConfirmations(data, todayISO());
  const doses = core.todaysDoses(data.medicines, data.doseLogs, new Date());
  const appts = core.upcomingAppointments(data.appointments, todayISO()).slice(0, 3);
  const recent = docs.slice().sort((a, b) => (b.docDate || '').localeCompare(a.docDate || '')).slice(0, 3);
  const results = latestResults(id, 1);
  const meds = activeMeds(id);
  const lastCheck = byProfile(DB.episodes, id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const recentUrgent = lastCheck && (lastCheck.disposition === 'emergency' || lastCheck.disposition === 'urgent') && Date.now() - new Date(lastCheck.createdAt).getTime() < 48 * 3600e3 ? lastCheck : null;
  const taken = doses.filter((d) => d.state === 'taken').length;
  const doseCls = (s) => (s === 'taken' ? 'ok' : s === 'missed' || s === 'due' ? 'warn' : '');
  const MON = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short' });
  const DAY = (iso) => new Date(iso + 'T00:00:00').getDate();

  const urgentHtml = recentUrgent ? `<div class="card bubble-emergency"><div class="row"><span class="tile warn" style="background:var(--surface);color:var(--danger)">${icon('alert')}</span><div class="grow"><div class="name" style="color:var(--danger)">${recentUrgent.disposition === 'emergency' ? 'Emergency care was advised' : 'See a doctor today'}</div><div class="list-sub">From the symptom check for ${esc(recentUrgent.complaint.toLowerCase())}. Don’t wait.</div></div></div>${recentUrgent.disposition === 'emergency' ? `<a class="btn danger" href="tel:${core.EMERGENCY_NUMBER}">${icon('phone', 18)} Call ${core.EMERGENCY_NUMBER}</a>` : ''}</div>` : '';
  const pendingHtml = pending.length ? `<h2 class="sec">Needs your attention <span class="pill warn">${pending.length}</span></h2><div class="card" style="border-color:var(--warn)">${pending.slice(0, 3).map((x) => `<div class="list-row" data-go="${x.kind === 'medicine' ? `#/profile/${id}/medicine/${x.id}` : `#/profile/${id}/appointments`}"><span class="tile warn">${icon(x.kind === 'medicine' ? 'pill' : 'calendar', 20)}</span><div class="grow"><div class="name" style="font-size:15px">${esc(x.title)}</div><div class="caption">${esc(x.detail)}</div></div>${icon('next', 18)}</div>`).join('')}</div>` : '';
  const dosesHtml = doses.length
    ? `<div class="row" style="justify-content:space-between"><span class="caption">${taken} of ${doses.length} taken today</span><a class="inline" href="#/profile/${id}/doses">Open</a></div><div class="progress" role="progressbar" aria-valuenow="${taken}" aria-valuemin="0" aria-valuemax="${doses.length}"><span style="width:${Math.round((taken / doses.length) * 100)}%"></span></div>
       ${doses.slice(0, 5).map((d) => `<div class="list-row" data-go="#/profile/${id}/doses"><span class="tile">${icon('pill', 20)}</span><div class="grow"><div class="name" style="font-size:15px">${esc(d.medicine.name)}${d.medicine.dose ? ' · ' + esc(d.medicine.dose) : ''}</div><div class="caption">${core.formatTime(d.occ.time)}${d.medicine.instructions ? ' · ' + esc(d.medicine.instructions) : ''}</div></div><span class="pill ${doseCls(d.state)}">${DOSE_LABEL[d.state]}</span></div>`).join('')}`
    : `<div class="row"><span class="tile">${icon('pill', 20)}</span><div class="grow"><div class="name" style="font-size:15px">No doses scheduled today</div><div class="caption">Medicines with confirmed times appear here with reminders.</div></div></div>`;
  const apptHtml = appts.length
    ? appts.map((a) => `<div class="list-row" data-go="#/profile/${id}/appointments"><div class="datebox"><div class="m">${MON(a.date)}</div><div class="d">${DAY(a.date)}</div></div><div class="grow"><div class="name" style="font-size:15px">${esc(a.reason && a.reason !== 'Follow-up' ? a.reason.replace(/^Follow-up:\s*/i, 'Follow-up · ') : 'Follow-up')}</div><div class="caption">${esc(a.doctor || 'Doctor not recorded')}${a.time ? ' · ' + esc(a.time) : ''}</div></div>${icon('next', 18)}</div>`).join('')
    : `<div class="row"><span class="tile info">${icon('calendar', 20)}</span><div class="grow"><div class="name" style="font-size:15px">Nothing planned</div><div class="caption">Follow-ups from prescriptions appear here after you confirm the date.</div></div></div>`;
  const recentHtml = recent.length
    ? recent.map((d) => `<div class="list-row" data-go="#/profile/${id}/doc/${d.id}"><span class="tile info">${docIcon(d.type)}</span><div class="grow"><div class="name" style="font-size:15px">${esc(d.type)}</div><div class="caption">${fmtDate(d.docDate)}${d.doctor ? ' · ' + esc(d.doctor) : ''}</div></div>${icon('next', 18)}</div>`).join('')
    : `<div class="row"><span class="tile info">${icon('prescription', 20)}</span><div class="grow"><div class="name" style="font-size:15px">No documents yet</div><div class="caption">Scan a prescription or report with “Add document”.</div></div></div>`;
  const r0 = results[0];
  const lastResult = r0 ? `${esc(r0.test)} ${esc(r0.value)}${r0.unit ? ' ' + esc(r0.unit) : ''} <span class="trend ${r0.trend}" aria-label="${r0.trend === 'up' ? 'higher than before' : r0.trend === 'down' ? 'lower than before' : 'unchanged'}">${r0.trend === 'up' ? '▲' : r0.trend === 'down' ? '▼' : '='}</span>${r0.outOfRange ? ' <span class="pill warn">outside report range</span>' : ''}` : 'None yet';

  render(`
    <div class="topbar"><button class="iconbtn back" data-go="#/" aria-label="All profiles">${icon('back', 24)}</button>${avatar(p, 'sm')}<h1>${esc(p.name)}</h1><button class="iconbtn" data-go="#/profile/${id}/edit" aria-label="Edit profile">${icon('edit')}</button></div>
    <div class="screen">
      <div class="greeting"><div class="hi">${greetingWord()}</div><div class="who">${p.relation === 'Self' ? 'Your health today' : `${esc(p.name)}’s health today`}</div></div>
      ${urgentHtml}
      ${pendingHtml}
      <div class="hero">
        <div class="h">${icon('assistant')} Health assistant</div>
        <p>Feeling unwell? Answer a few questions to know how soon to get care — or ask about medicines and records.</p>
        <div class="actions"><button class="btn on-hero" data-go="#/profile/${id}/assistant">${icon('symptom', 18)} Check a symptom</button><button class="btn on-hero-outline" data-go="#/profile/${id}/ask">${icon('chat', 18)} Ask a question</button></div>
      </div>
      <h2 class="sec">Today’s medicines</h2><div class="card">${dosesHtml}</div>
      <h2 class="sec">Upcoming appointments <a class="inline" href="#/profile/${id}/appointments">All</a></h2><div class="card">${apptHtml}</div>
      <h2 class="sec">Recent documents <a class="inline" href="#/profile/${id}/timeline">All</a></h2><div class="card">${recentHtml}</div>
      <h2 class="sec">Health overview</h2>
      <div class="stat-grid">
        <div class="stat"><div class="k">Allergies</div><div class="v" ${p.allergies ? 'style="color:var(--warn)"' : ''}>${esc(p.allergies || 'None recorded')}</div></div>
        <div class="stat"><div class="k">Medicines</div><div class="v">${meds.length} current</div></div>
        <div class="stat"><div class="k">Latest result</div><div class="v">${lastResult}</div></div>
        <div class="stat"><div class="k">Last symptom check</div><div class="v">${lastCheck ? `${esc(lastCheck.complaint)} · ${fmtDate(lastCheck.createdAt.slice(0, 10))}` : 'None'}</div></div>
      </div>
      <div class="card"><div class="caption" style="margin-bottom:4px">Summary · built from ${docs.length} document${docs.length === 1 ? '' : 's'}</div>${esc(buildSummary(id))}</div>
      ${notes.length ? `<h2 class="sec">Things to notice</h2><div class="card">${notes.map((n) => `<div style="margin-bottom:10px">${esc(n.text)}<div class="caption">${srcLinks(id, n.sources)}${n.sources.length ? ' · ' : ''}Discuss with your doctor.</div></div>`).join('')}</div>` : ''}
      <div class="btn-row"><button class="btn secondary" data-go="#/profile/${id}/visit">${icon('stethoscope', 18)} Doctor visit summary</button><button class="btn secondary" data-go="#/profile/${id}/history">${icon('records', 18)} Medical history</button></div>
      <div class="disclaimer">${DISCLAIMER}</div>
    </div>
    <button class="fab" data-go="#/profile/${id}/add">${icon('plus', 20)} Add document</button>${tabsBar(id, 'home')}`);
}

/* ============================== assistant hub ============================== */
function screenAssist(id) {
  const p = getProfile(id);
  render(`
    ${topbar('#/profile/' + id, 'Health assistant')}
    <div class="screen">
      <div class="notice"><span class="tile warn" style="width:34px;height:34px">${icon('phone', 18)}</span><div class="grow caption" style="color:var(--text)">Emergency, such as chest pain or trouble breathing? Call ${core.EMERGENCY_NUMBER} now.</div><a class="pill danger" href="tel:${core.EMERGENCY_NUMBER}" style="text-decoration:none">Call</a></div>
      <div class="card link" data-go="#/profile/${id}/assistant"><div class="row grow"><span class="tile">${icon('symptom')}</span><div class="grow"><div class="name">Check a symptom</div><div class="list-sub">A few questions, then how soon to get care and what to watch for.</div></div></div><span class="arrow">${icon('next', 20)}</span></div>
      <div class="card link" data-go="#/profile/${id}/ask"><div class="row grow"><span class="tile info">${icon('chat')}</span><div class="grow"><div class="name">Ask about ${p.relation === 'Self' ? 'my' : esc(p.name) + '’s'} records</div><div class="list-sub">Medicines, timings, results, follow-ups and allergies.</div></div></div><span class="arrow">${icon('next', 20)}</span></div>
      <div class="card link" data-go="#/profile/${id}/visit"><div class="row grow"><span class="tile ok">${icon('stethoscope')}</span><div class="grow"><div class="name">Doctor visit summary</div><div class="list-sub">Your symptoms in order, ready to show the doctor.</div></div></div><span class="arrow">${icon('next', 20)}</span></div>
      <div class="card link" data-go="#/health-info"><div class="row grow"><span class="tile">${icon('info')}</span><div class="grow"><div class="name">General health questions</div><div class="list-sub">Open-source model in your browser · general information only.</div></div></div><span class="arrow">${icon('next', 20)}</span></div>
      <div class="caption" style="margin-top:12px">The symptom check and Ask follow fixed, reviewed rules and use your saved records — they don’t invent medical facts. They are not a diagnosis and don’t replace your doctor.</div>
    </div>${tabsBar(id, 'assist')}`);
}


/* ============================== add document: choose (S8) ============================== */
function screenAddDoc(id) {
  if (!getProfile(id)) return go('#/');
  render(`
    ${topbar('#/profile/' + id, 'Add document')}
    <div class="screen">
      <label class="option" for="in-camera"><span class="oico">${icon('camera')}</span><span class="grow"><span class="name">Scan with camera</span><span class="caption" style="display:block">Take a clear photo of the whole page. You can retake it if it is blurry.</span></span></label>
      <input type="file" id="in-camera" accept="image/*" capture="environment" hidden />
      <label class="option" for="in-gallery"><span class="oico">${icon('image')}</span><span class="grow"><span class="name">Choose from gallery</span><span class="caption" style="display:block">Photos or a PDF of a prescription or report (up to 5 pages).</span></span></label>
      <input type="file" id="in-gallery" accept="image/*,application/pdf" multiple hidden />
      <div class="option" id="in-manual" role="button"><span class="oico">${icon('edit')}</span><span class="grow"><span class="name">Enter manually</span><span class="caption" style="display:block">Type the details yourself.</span></span></div>
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
  const setStatus = (msg) => render(`${topbar('#/profile/' + pid + '/add', 'Reading…')}<div class="screen"><div class="empty"><div class="ico-wrap"><span class="spin">${icon('clock', 30)}</span></div><p>${esc(msg)}</p><p class="caption">Reading happens in this browser. It can take up to a minute.</p></div></div>`);
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
      <label class="label">Dose</label><input class="${fieldCls(`med.${i}.dose`)}" data-m="${i}" data-k="dose" data-key="med.${i}.dose" value="${esc(m.dose)}" placeholder="e.g. 500 mg" />${hint(`med.${i}.dose`)}${okBtn(`med.${i}.dose`)}${core.doseCheck(m.name, m.dose) ? `<div class="caption warn-text">⚠ ${esc(core.doseCheck(m.name, m.dose))}</div>` : ''}
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
      <h2 class="sec">Medicines</h2>${medRows}<button class="textbtn" id="add-med">${icon('plus', 18)} Add medicine</button>
      <h2 class="sec">Results</h2>${resRows}<button class="textbtn" id="add-res">${icon('plus', 18)} Add result</button>
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
    ${topbar(`#/profile/${id}/timeline`, esc(doc.type), `<button class="iconbtn" id="doc-del" aria-label="Delete document">${icon('trash')}</button>`)}
    <div class="screen">
      <div class="caption">${fmtDate(doc.docDate)}${doc.doctor ? ' · ' + esc(doc.doctor) : ''}</div>
      <div class="caption">${doc.source && doc.source !== 'manual' ? 'Read automatically, then checked and confirmed by you.' : 'Entered by you.'}</div>
      ${images.length ? `<h2 class="sec">Original document</h2><div class="thumbs big">${images.map((i) => `<img data-img="${i}" alt="Original document page" />`).join('')}</div>` : ''}
      ${doc.diagnosisWritten ? `<div class="card"><div class="caption">Diagnosis written by the doctor</div>${esc(doc.diagnosisWritten)}</div>` : ''}
      <h2 class="sec">In simple words</h2><div class="card">${esc(simple)}</div>
      ${res.length ? `<h2 class="sec">Results</h2><div class="card">${res.map((r) => { const v = num(r.value), lo = num(r.rangeLow), hi = num(r.rangeHigh); const oor = v != null && ((lo != null && v < lo) || (hi != null && v > hi)); return `<div class="row" style="justify-content:space-between"><span>${esc(r.test)}</span><span class="${oor ? 'pill warn' : ''}">${esc(r.value)}${r.unit ? ' ' + esc(r.unit) : ''}</span></div>`; }).join('<hr class="sep">')}</div>` : ''}
      ${meds.length ? `<h2 class="sec">Medicines</h2><div class="card">${meds.map((m) => `<div class="row link-row" style="justify-content:space-between" data-go="#/profile/${id}/medicine/${m.id}"><span>${esc(m.name)} ${esc(m.dose || '')}</span><span class="caption">${timesSorted(m.times).join(', ') || (m.asNeeded ? 'when needed' : '—')} ›</span></div>`).join('<hr class="sep">')}</div>` : ''}
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
  if (!docs.length) body = `<div class="empty"><div class="ico-wrap">${icon('prescription', 30)}</div><p>No documents yet.</p><button class="btn primary" data-go="#/profile/${id}/add">Add document</button></div>`;
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
const HISTORY_ICON = { document: 'prescription', diagnosis: 'stethoscope', medicine_start: 'pill', medicine_change: 'edit', symptom: 'symptom', appointment: 'calendar' };
// Map the provenance sentence from core.historyEntries to a consistent badge.
const provBadge = (text) => (/doctor/i.test(text) ? badge('doctor') : /reported by you/i.test(text) ? badge('reported') : /read by AI|read automatically|AI-read/i.test(text) ? badge('ai') : badge('you'));
function screenHistory(id) {
  const p = getProfile(id);
  const entries = core.historyEntries(careData(id));
  const groups = [];
  for (const e of entries) { const m = fmtMonth(e.date.slice(0, 10)); const g = groups.find((x) => x[0] === m); g ? g[1].push(e) : groups.push([m, [e]]); }
  const link = (e) => (e.kind === 'document' || e.kind === 'diagnosis' ? `#/profile/${id}/doc/${e.refId}` : e.kind.startsWith('medicine') ? `#/profile/${id}/medicine/${e.refId}` : e.kind === 'appointment' ? `#/profile/${id}/appointments` : `#/profile/${id}/episode/${e.refId}`);
  const body = entries.length
    ? groups.map(([month, list]) => `<h2 class="sec">${esc(month)}</h2>${list.map((e) => `<div class="card link" data-go="${link(e)}"><div class="row grow" style="align-items:flex-start"><span class="tile ${e.kind === 'symptom' ? 'info' : e.kind === 'diagnosis' ? 'ok' : ''}">${e.kind === 'document' ? docIcon(e.title.split(' · ')[0]) : icon(HISTORY_ICON[e.kind], 20)}</span><div class="grow"><div class="name">${esc(e.title)}</div>${e.detail ? `<div class="list-sub">${esc(e.detail)}</div>` : ''}<div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap"><span class="caption">${fmtDate(e.date.slice(0, 10))}</span>${provBadge(e.provenance)}</div></div></div><span class="arrow">${icon('next', 20)}</span></div>`).join('')}`).join('')
    : `<div class="empty"><div class="ico-wrap">${icon('records', 30)}</div><p>Nothing recorded yet. Add a document or check a symptom.</p></div>`;
  render(`
    ${topbar('#/profile/' + id, 'Medical history')}
    <div class="screen">
      ${p.allergies ? `<div class="card" style="border-color:var(--warn)"><div class="caption" style="color:var(--warn)">Allergies</div>${esc(p.allergies)}</div>` : ''}
      <div class="row" style="gap:8px"><button class="btn secondary" data-go="#/profile/${id}/visit">Doctor visit summary</button><button class="btn secondary" data-go="#/profile/${id}/timeline">All documents</button></div>
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
  // Each message says who it is from, so patient answers and assistant guidance never blur.
  const bubble = (b) => b.msg.kind === 'online'
    ? `<div class="card bubble-online"><div class="who-label">${icon('info', 14)} Live from trusted sources · MedlinePlus</div><div class="msg">${b.msg.pending ? `<span class="spin" style="display:inline-flex;vertical-align:middle">${icon('clock', 16)}</span> ` : ''}${linkify(b.msg.text)}</div></div>`
    : b.role === 'user'
    ? `<div class="card bubble-user"><div class="who-label">${icon('user', 14)} You</div>${esc(b.msg.text)}</div>`
    : `<div class="card ${b.msg.kind === 'emergency' ? 'bubble-emergency' : b.msg.kind === 'summary' ? 'bubble-summary' : 'bubble-bot'}">${b.msg.kind === 'emergency' ? `<div class="name row" style="color:var(--danger);gap:8px">${icon('alert', 20)} Get help now</div>` : `<div class="who-label">${icon('assistant', 14)} MedNest symptom check · rules-based${b.msg.kind === 'summary' ? ' · not a diagnosis' : ''}</div>`}<div class="msg">${esc(b.msg.text)}</div>${b.msg.kind === 'emergency' ? `<a class="btn danger" href="tel:${num112}">${icon('phone', 18)} Call ${num112}</a>` : ''}</div>`;
  const last = [...t.bubbles].reverse().find((b) => b.role === 'assistant')?.msg;
  const quick = !t.state.done && last?.quickReplies?.length ? `<div class="chips" style="margin-top:8px">${last.quickReplies.map((q) => `<button class="chip" data-qr="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : '';
  render(`
    ${topbar('#/profile/' + id, `Symptom check · ${esc(p.name)}`)}
    <div class="screen">
      <div class="notice"><span class="tile warn" style="width:34px;height:34px">${icon('phone', 18)}</span><span class="grow caption" style="color:var(--text)">Not a doctor. Emergency? Call ${num112} now.</span><a class="pill danger" style="text-decoration:none" href="tel:${num112}">Call ${num112}</a></div>
      ${t.bubbles.map(bubble).join('')}
      ${t.busy ? '<div class="caption">…</div>' : ''}
      ${quick}
      ${t.state.done ? `${t.savedId ? `<div class="caption" style="text-align:center;margin-top:12px">Saved to ${esc(p.name)}’s medical history.</div>` : ''}<button class="btn primary" data-go="#/profile/${id}/visit">${icon('stethoscope', 18)} Prepare doctor visit summary</button>${t.state.disposition !== 'emergency' && !t.learned ? `<button class="btn secondary" id="tri-learn">${icon('info', 18)} Learn more from MedlinePlus</button>` : ''}<button class="btn secondary" id="tri-new">Start a new check</button><button class="textbtn" data-go="#/profile/${id}/history" style="display:block;margin:4px auto">See medical history</button>` : `<div class="row" style="gap:8px;position:sticky;bottom:76px;margin-top:12px"><input id="tri-input" placeholder="Type your answer…" class="grow" autocomplete="off"/><button class="iconbtn" id="tri-send" style="background:var(--accent);color:var(--onAccent)" aria-label="Send">${icon('next', 22)}</button></div>`}
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
    if (r.state.done && !r.state.stopped && !t.savedId) t.savedId = saveAssessment(id, r.state, r.messages);
    renderAssistant(id);
    window.scrollTo(0, document.body.scrollHeight);
    $('#tri-input')?.focus();
  };
  $('#tri-send')?.addEventListener('click', () => send($('#tri-input').value));
  $('#tri-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(e.target.value); });
  app.querySelectorAll('[data-qr]').forEach((b) => b.addEventListener('click', () => send(b.dataset.qr)));
  $('#tri-new')?.addEventListener('click', () => { window.__tri = null; screenAssistant(id); });
  $('#tri-learn')?.addEventListener('click', async () => {
    if (!online()) return flash('You’re offline. Connect to the internet to read more.');
    t.learned = true;
    const protocol = core.PROTOCOLS.find((x) => x.id === t.state.protocolId);
    const term = protocol && protocol.id !== 'general' ? protocol.label : core.topicOf(t.state.complaint || '') || t.state.complaint || '';
    const msg = { kind: 'online', pending: true, text: `Looking up “${term}” on MedlinePlus…` };
    t.bubbles.push({ role: 'assistant', msg });
    renderAssistant(id);
    const found = await cachedEnrichment({ kind: 'topic', term });
    msg.pending = false;
    msg.text = found || 'I couldn’t find reliable information about this online.';
    if (location.hash.endsWith('/assistant')) renderAssistant(id);
  });
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
  return `<div class="card link" data-go="#/profile/${id}/medicine/${m.id}" ${needs ? 'style="border-color:var(--warn)"' : ''}><div class="grow"><div class="row" style="justify-content:space-between"><span class="name">${esc(m.name)} ${esc(m.dose || '')}</span><span class="pill ${needs ? 'warn' : st === 'active' ? 'ok' : ''}">${needs ? 'Needs details' : STATUS_LABEL[st]}</span></div><div class="list-sub">${m.asNeeded ? 'When needed' : timesSorted(m.times).join(' · ') || 'No times set'}</div><div class="caption">${end ? 'Until ' + fmtDate(end) : 'No end date'}${m.instructions ? ' · ' + esc(m.instructions) : ''}</div></div><span class="arrow">›</span></div>`;
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
  const doseWarn = core.doseCheck(m.name, m.dose);
  const schedWarn = core.scheduleIssues(m).filter((i) => i.kind === 'conflict' || i.kind === 'unclear_time');
  const end = core.effectiveEndDate(m);
  const f = window.__medForm = editing ? (window.__medForm && window.__medForm.id === mid ? window.__medForm : { id: mid, name: m.name, dose: m.dose || '', times: [...m.times], durationDays: m.durationDays ? String(m.durationDays) : '', startDate: m.startDate || '', instructions: m.instructions || '', asNeeded: !!m.asNeeded }) : null;
  const custom = f ? f.times.filter((t) => !TIME_SLOTS.includes(t)) : [];
  render(`
    ${topbar(`#/profile/${id}/meds`, esc(m.name), !editing ? '<button class="textbtn" id="m-edit">Edit</button>' : '')}
    <div class="screen">
      <div class="card">
        <div class="row" style="justify-content:space-between"><span class="name">${STATUS_LABEL[st]}</span><span class="caption">${m.source === 'document_confirmed' ? 'From prescription · confirmed by you' : 'Entered by you'}</span></div>
        <div class="list-sub">${m.asNeeded ? 'Take when needed — no timed reminders.' : timesSorted(m.times).join(' · ') || 'No times set'}</div>
        <div class="list-sub">${m.dose ? 'Dose: ' + esc(m.dose) : 'Dose not set'}${m.instructions ? ' · ' + esc(m.instructions) : ''}</div>
        <div class="caption">${m.startDate ? 'From ' + fmtDate(m.startDate) : 'Start date not set'}${end ? ' to ' + fmtDate(end) : ' · No end date written — reminders continue until you stop them'}</div>
        ${m.documentId && getDoc(m.documentId) ? `<a class="inline" href="#/profile/${id}/doc/${m.documentId}">View source document</a>` : ''}
      </div>
      ${schedWarn.map((i) => `<div class="card" style="border-color:var(--warn);color:var(--warn)">⚠ ${esc(i.text)} Please check with your doctor or pharmacist, then edit the schedule.</div>`).join('')}
      ${doseWarn ? `<div class="card" style="border-color:var(--warn);color:var(--warn)">⚠ ${esc(doseWarn)}</div>` : ''}
      ${blockers.length && (st === 'active' || st === 'pending') ? `<div class="card"style="border-color:var(--warn)"><div class="name" style="color:var(--warn)">Reminders not set yet</div>${blockers.map((b) => `<div class="list-sub">• ${esc(b)}</div>`).join('')}<div class="caption" style="margin-top:6px">Check the prescription or ask your doctor or pharmacist, then add the missing details.</div>${!editing ? '<button class="btn primary" id="m-edit2">Add details</button>' : ''}</div>` : ''}
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
      <h2 class="sec">About this medicine</h2>
      <div class="card bubble-online" id="m-online">${window.__medOnline?.id === mid ? `<div class="msg">${linkify(window.__medOnline.text)}</div>` : `<div class="caption" style="color:var(--text)">See what MedlinePlus (NIH) and the US FDA label say about ${esc(m.name)}, and whether the label mentions any of your other medicines.</div><button class="btn secondary" id="m-lookup">${icon('info', 18)} Look up online</button>`}</div>
      <div class="disclaimer">${DISCLAIMER}</div>
    </div>`);
  // Leave edit mode; drop a trailing /edit from the address so a refresh shows the view.
  const viewMed = () => (location.hash.endsWith('/edit') ? go(`#/profile/${id}/medicine/${mid}`) : screenMedicine(id, mid));
  const readForm = () => { if (!f) return; f.name = $('#e-name').value; f.dose = $('#e-dose').value; f.startDate = $('#e-start').value; f.durationDays = $('#e-days').value; f.instructions = $('#e-instr').value; };
  $('#m-lookup')?.addEventListener('click', async () => {
    if (!online()) return flash('You’re offline. Connect to the internet to look this medicine up.');
    $('#m-online').innerHTML = `<div class="msg"><span class="spin" style="display:inline-flex;vertical-align:middle">${icon('clock', 16)}</span> Checking MedlinePlus and the FDA label…</div>`;
    // Records are included: the patient's other medicines are checked against the label.
    const others = activeMeds(id).filter((x) => x.id !== mid).map((x) => x.name);
    const generics = [...new Set(others.map((n) => core.identifyMedicine(n)?.generic).filter(Boolean))];
    const text = await cachedEnrichment({ kind: 'drug', names: [m.name], otherGenerics: generics });
    window.__medOnline = { id: mid, text: text || 'I couldn’t find this medicine in the online sources. Please check the name on the box, or ask a pharmacist.' };
    if (location.hash.includes(`/medicine/${mid}`)) screenMedicine(id, mid);
  });
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
    $('#e-cancel').addEventListener('click', () => { window.__medForm = null; viewMed(); });
    $('#e-save').addEventListener('click', () => {
      readForm();
      if (!f.name.trim()) return flash('Please enter the medicine name.');
      if (f.durationDays && !/^\d+$/.test(f.durationDays.trim())) return flash('Days must be a number.');
      const before = { name: m.name, dose: m.dose, times: m.times, durationDays: m.durationDays, startDate: m.startDate, instructions: m.instructions };
      Object.assign(m, { name: f.name.trim(), dose: f.dose.trim() || null, times: f.asNeeded ? [] : f.times, asNeeded: f.asNeeded, durationDays: f.durationDays ? parseInt(f.durationDays, 10) : null, startDate: f.startDate || null, endDate: '', instructions: f.instructions.trim() || null, confirmedAt: nowIso(), updatedAt: nowIso() });
      if (m.status === 'pending') m.status = 'active';
      audit(id, 'medicine', m.id, 'update', { before, after: { name: m.name, dose: m.dose, times: m.times, durationDays: m.durationDays, startDate: m.startDate, instructions: m.instructions } });
      save(); window.__medForm = null; viewMed();
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
      <h2 class="sec">Today</h2>${today.length ? today.map((d) => row(d, true)).join('') : `<div class="empty"><div class="ico-wrap">${icon('pill', 30)}</div><p>No doses scheduled today.</p></div>`}
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
    ${topbar('#/profile/' + id, 'Follow-ups', `<button class="textbtn" data-edit="new">${icon('plus', 18)} Add</button>`)}
    <div class="screen">
      ${editing === 'new' ? editor() : ''}
      ${proposed.length ? '<h2 class="sec">Needs your confirmation</h2>' : ''}
      ${proposed.map((a) => (editing === a.id ? editor() : `<div class="card" style="border-color:var(--warn)"><div class="name">${a.date ? 'Proposed: ' + fmtDate(a.date) : 'Date not clear'}</div>${a.sourceText ? `<div class="list-sub">Document says: “${esc(a.sourceText)}”</div>` : ''}<div class="caption">${basisText(a)}</div><button class="btn primary" data-edit="${a.id}">${a.date ? 'Check and confirm' : 'Choose date'}</button><button class="textbtn" data-ast="${a.id}" data-v="cancelled">Not needed</button></div>`)).join('')}
      <h2 class="sec">Planned</h2>
      ${planned.length || editing === 'new' ? '' : `<div class="empty"><div class="ico-wrap">${icon('calendar', 30)}</div><p>No follow-ups planned.</p><p class="caption">Follow-ups from prescriptions appear here after you confirm the date. You can also add one.</p></div>`}
      ${planned.map((a) => (editing === a.id ? editor() : `<div class="card" ${a.date < today ? 'style="border-color:var(--warn)"' : ''}><div class="row" style="justify-content:space-between"><span class="name">${fmtDate(a.date)}${a.time ? ' · ' + esc(a.time) : ''}</span>${a.date < today ? '<span class="pill warn">Date passed</span>' : ''}</div><div class="list-sub">${esc([a.doctor, a.reason].filter(Boolean).join(' · ') || 'Follow-up')}</div><div class="caption">Reminders: the evening before and on the day.</div><div class="row" style="flex-wrap:wrap;gap:0"><button class="textbtn" data-ast="${a.id}" data-v="completed">Mark done</button><button class="textbtn" data-edit="${a.id}">Reschedule</button><button class="textbtn" data-ast="${a.id}" data-v="cancelled">Cancel</button></div></div>`)).join('')}
      ${done.length ? `<h2 class="sec">Past</h2>${done.map((a) => `<div class="card"><div>${fmtDate(a.date)} · ${a.status === 'completed' ? 'Done' : 'Cancelled'}</div><div class="caption">${esc([a.doctor, a.reason].filter(Boolean).join(' · '))}</div></div>`).join('')}` : ''}
      <div class="disclaimer">MedNest reminds you; it does not book appointments. ${DISCLAIMER}</div>
    </div>${tabsBar(id, 'appts')}`);
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
  const chips = ['What medicines am I taking, and why?', 'When do I take them?', 'Next follow-up?', 'Last sugar test?'];
  const logHtml = chat.log.map((m) => m.role === 'user'
    ? `<div class="card bubble-user"><div class="who-label">${icon('user', 14)} You</div>${esc(m.text)}</div>`
    : m.triage
      ? chatTriageBubble(m)
      : m.online
      ? `<div class="card bubble-online"><div class="who-label">${icon('info', 14)} Live from trusted sources · MedlinePlus, FDA, RxNorm</div><div class="msg">${m.pending ? `<span class="spin" style="display:inline-flex;vertical-align:middle">${icon('clock', 16)}</span> ` : ''}${linkify(m.text)}</div></div>`
      : `<div class="card ${m.emergency ? 'bubble-emergency' : 'bubble-bot'}"><div class="who-label">${icon('chat', 14)} MedNest · from your records</div><div class="msg">${esc(m.text)}</div>${m.emergency ? `<a class="btn danger" href="tel:${core.EMERGENCY_NUMBER}">Call ${core.EMERGENCY_NUMBER}</a>` : ''}${m.sources?.length ? `<div class="caption" style="margin-top:6px">Source: ${srcLinks(id, m.sources)}</div>` : ''}</div>`).join('');
  const lastBot = [...chat.log].reverse().find((m) => m.role === 'bot');
  const addBtn = lastBot?.addMedicine && !lastBot.added ? `<button class="btn primary" id="ask-add">Add ${esc(lastBot.addMedicine.name)}${lastBot.addMedicine.dose ? ' ' + esc(lastBot.addMedicine.dose) : ''} to medicines</button>` : '';
  const followChips = addBtn + ((lastBot?.quickReplies || lastBot?.suggestions)?.length ? `<div class="chips" style="margin-top:8px">${(lastBot.quickReplies || lastBot.suggestions).map((c) => `<button class="chip" data-ask="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : '');
  render(`
    ${topbar('#/profile/' + id, 'Ask')}
    <div class="screen">
      ${chat.log.length ? '' : `<div class="card"><div class="caption">Ask me anything about ${esc(p.name)}'s medicines (what they’re for, when to take them, for how long), results, follow-ups or allergies — or just tell me how you’re feeling and I’ll ask a few questions. To talk through a symptom, use <a class="inline" href="#/profile/${id}/assistant">Check a symptom</a>.</div></div>`}
      ${chat.log.length ? logHtml + followChips : `<div class="chips">${chips.map((c) => `<button class="chip" data-ask="${esc(c)}">${esc(c)}</button>`).join('')}<button class="chip" data-go="#/profile/${id}/assistant">Check a symptom →</button></div>`}
      <div class="disclaimer">${DISCLAIMER}</div>
      <div class="row" style="gap:8px;position:sticky;bottom:76px"><input id="ask-input" placeholder="Ask about ${esc(p.name)}…" class="grow"/><button class="iconbtn" id="ask-send" style="background:var(--accent);color:var(--onAccent)" aria-label="Send">${icon('next', 22)}</button></div>
    </div>${tabsBar(id, 'ask')}`);
}

/* ============================== symptom check inside a chat ============================== */
// When someone describes a symptom in Ask, the symptom check runs right there in the
// conversation (same rules engine as the Check tab) and the result is saved to history.
function chatTriageBubble(m) {
  if (m.kind === 'emergency') return `<div class="card bubble-emergency"><div class="name row" style="color:var(--danger);gap:8px">${icon('alert', 20)} Get help now</div><div class="msg">${esc(m.text)}</div><a class="btn danger" href="tel:${core.EMERGENCY_NUMBER}">${icon('phone', 18)} Call ${core.EMERGENCY_NUMBER}</a></div>`;
  return `<div class="card ${m.kind === 'summary' ? 'bubble-summary' : 'bubble-bot'}"><div class="who-label">${icon('symptom', 14)} MedNest symptom check${m.kind === 'summary' ? ' · rules-based, not a diagnosis' : ''}</div><div class="msg">${esc(m.text)}</div>${m.saved ? `<div class="caption" style="margin-top:8px">Saved to medical history. <a class="inline" href="#/profile/${m.pid}/visit">Doctor visit summary</a></div>` : ''}</div>`;
}
async function startChatTriage(pid, text) {
  const chat = window.__chat;
  const ctx = triageContext(pid);
  chat.triage = core.startTriage(ctx).state;
  chat.triageSaved = false;
  return continueChatTriage(pid, text);
}
async function continueChatTriage(pid, text) {
  const chat = window.__chat;
  chat.log.push({ role: 'user', text });
  const r = await core.respond(chat.triage, text, triageContext(pid));
  chat.triage = r.state;
  const msgs = r.messages.map((m) => ({ role: 'bot', triage: true, kind: m.kind, text: m.text, quickReplies: m.quickReplies, pid }));
  if (r.state.done && !r.state.stopped && !chat.triageSaved && r.state.disposition) {
    saveAssessment(pid, r.state, r.messages);
    chat.triageSaved = true;
    const last = msgs[msgs.length - 1];
    if (last) last.saved = true;
  }
  chat.log.push(...msgs);
  renderAsk(pid);
  window.scrollTo(0, document.body.scrollHeight);
}

/* ============================== live medical information ============================== */
// Free public sources fetched with the user's own connection (MedlinePlus, FDA drug
// labels, RxNorm, NLM Clinical Tables, Wikipedia). Only medicine names / topic words
// are sent; answers show the source and link. See src/ai/online/.
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;
const webFetch = (url) => fetch(url, { headers: { Accept: 'application/json' } });
const onlineCache = new Map();
async function cachedEnrichment(plan) {
  const key = JSON.stringify(plan);
  if (!onlineCache.has(key)) onlineCache.set(key, core.runEnrichment(plan, webFetch).catch(() => null));
  return onlineCache.get(key);
}
// Escape, then turn source URLs into links that open outside the app.
function linkify(text) {
  return esc(text).replace(/https?:\/\/[^\s<]+/g, (u) => `<a class="inline" href="${u}" target="_blank" rel="noopener noreferrer">${u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}</a>`);
}
async function enrichOnline(pid, question, res, prevMedicineId) {
  const chat = window.__chat;
  const meds = activeMeds(pid);
  const plan = core.planEnrichment(question, res.answer, meds, { lastMedicineId: prevMedicineId, replyMedicineId: res.medicineId });
  if (!plan) return;
  if (!online()) {
    chat.log.push({ role: 'bot', online: true, text: 'You’re offline, so I can’t check online medical sources right now. The answer above uses only what is saved on this device.' });
    return renderAsk(pid);
  }
  const msg = { role: 'bot', online: true, pending: true, text: 'Checking trusted medical sources…' };
  chat.log.push(msg);
  renderAsk(pid);
  window.scrollTo(0, document.body.scrollHeight);
  const text = await cachedEnrichment(plan);
  msg.pending = false;
  msg.text = text || (plan.kind === 'topic' ? `I couldn’t find reliable information about that online. Try different words, or ask a doctor or pharmacist.` : 'I couldn’t find this medicine in the online sources. Please check the name on the box, or ask a pharmacist.');
  if (location.hash.endsWith(`/profile/${pid}/ask`) && window.__chat === chat) {
    renderAsk(pid);
    window.scrollTo(0, document.body.scrollHeight);
  }
}

/* ============================== doctor visit summary ============================== */
// Chronological summary of what the patient reported (symptom checks + updates +
// corrections) plus labelled records, to review and show the doctor. Built by code from
// saved entries only (src/domain/visitSummary.ts) — nothing invented, nothing overwritten.
const VISIT_PERIODS = [['7', 'Last 7 days'], ['14', 'Last 14 days'], ['30', 'Last 30 days'], ['all', 'Everything']];
const SOURCE_PILL = { symptom_check: ['Patient-reported', ''], patient_update: ['Patient update', ''], correction: ['Correction', 'warn'], mednest_advice: ['MedNest advice', 'ok'] };

function visitData(id) {
  const p = getProfile(id);
  const period = window.__visitPeriod || '14';
  const since = period === 'all' ? null : new Date(Date.now() - (+period) * 86400000).toISOString();
  const profile = { name: p.name, ageYears: calcAge(p.birthYear), sex: p.sex, allergies: p.allergies };
  const summary = core.buildVisitSummary({
    profile,
    episodes: byProfile(DB.episodes, id),
    updates: byProfile(DB.symptomUpdates, id),
    medicines: byProfile(DB.medicines, id).map((m) => ({ ...m, status: medStatus(m) })),
    documents: byProfile(DB.documents, id),
    since,
    now: new Date(),
  });
  return { summary, profile, text: core.renderVisitSummaryText(summary, profile) };
}

function screenVisitSummary(id) {
  const { summary: s, text } = visitData(id);
  const period = window.__visitPeriod || '14';
  const complaints = [...new Set([...byProfile(DB.episodes, id).map((e) => e.complaint), ...byProfile(DB.symptomUpdates, id).map((u) => u.complaint)])];
  const saved = byProfile(DB.visitSummaries, id).slice().reverse();
  const sevText = (sev) => (!sev.length ? 'not reported' : sev.map((x) => `${x.value}/10 (${new Date(x.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })})`).join(' → '));
  const urgent = s.urgent ? `<div class="card bubble-emergency"><div class="name" style="color:var(--danger)">${s.urgent.disposition === 'emergency' ? 'Emergency care was advised' : 'Seeing a doctor today was advised'}</div><div class="list-sub">Your symptom check on ${fmtDate(s.urgent.at.slice(0, 10))} for ${esc(s.urgent.complaint.toLowerCase())} advised ${s.urgent.disposition === 'emergency' ? 'emergency care' : 'seeing a doctor the same day'}. Don’t wait for a planned appointment.</div>${s.urgent.disposition === 'emergency' ? `<a class="btn danger" href="tel:${core.EMERGENCY_NUMBER}">Call ${core.EMERGENCY_NUMBER}</a>` : ''}</div>` : '';
  const timeline = s.timeline.map((t) => { const [label, cls] = SOURCE_PILL[t.source]; return `<div class="tl-item"><div class="tl-time">${new Date(t.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div><div class="tl-body">${esc(t.text)} <span class="pill ${cls}">${label}</span></div></div>`; }).join('');
  const blocks = s.complaints.map((c) => `
    <div class="card">
      <div class="name">${esc(c.complaint)}</div>
      <dl class="facts">
        <dt>Onset</dt><dd>${esc(c.onset || 'Not reported')}</dd>
        <dt>Severity</dt><dd>${esc(sevText(c.severities))}</dd>
        <dt>Reported</dt><dd>${esc(c.positives.join('; ') || 'Nothing beyond the main complaint')}</dd>
        ${c.negatives.length ? `<dt>Said no to</dt><dd>${esc(c.negatives.join('; '))}</dd>` : ''}
        <dt>Took for it</dt><dd>${esc(c.remedies.join('; ') || 'None reported')}</dd>
        <dt>Happened before</dt><dd>${esc(c.hadBefore || 'Not reported')}</dd>
        ${c.latestAdvice ? `<dt>MedNest advice</dt><dd>${esc(c.latestAdvice)}</dd>` : ''}
      </dl>
      ${c.toClarify.length ? `<div class="caption warn-text">Still to clarify: ${esc(c.toClarify.join('; '))}</div>` : ''}
    </div>`).join('');
  render(`
    ${topbar('#/profile/' + id, 'Doctor visit summary')}
    <div class="screen">
      ${urgent}
      <div class="caption">Built from what you reported in MedNest and your saved records. Review it, correct anything wrong, then show or send it to your doctor. It is not a diagnosis.</div>
      <div class="chips" style="margin-top:10px">${VISIT_PERIODS.map(([v, l]) => `<button class="chip ${period === v ? 'sel' : ''}" data-period="${v}">${l}</button>`).join('')}</div>
      ${s.empty ? `<div class="empty"><div class="ico-wrap">${icon('stethoscope', 30)}</div><p>No symptoms reported in this period.</p><button class="btn primary" data-go="#/profile/${id}/assistant">Check a symptom</button></div>` : `
      <h2 class="sec">Timeline</h2><div class="card">${timeline}</div>
      <h2 class="sec">Summary</h2>${blocks}`}
      <h2 class="sec">Records in MedNest</h2>
      <div class="card"><dl class="facts">
        <dt>Allergies</dt><dd>${esc(s.allergies || 'None recorded')}</dd>
        <dt>Medicines</dt><dd>${s.medicines.length ? s.medicines.map(esc).join('<br>') : 'None recorded'}</dd>
        <dt>Diagnoses written</dt><dd>${s.diagnoses.length ? s.diagnoses.map(esc).join('<br>') : 'None recorded'}</dd>
      </dl></div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn primary" id="v-share" style="flex:1 1 140px">Share</button>
        <button class="btn secondary" id="v-copy" style="flex:1 1 140px">Copy</button>
        <button class="btn secondary" id="v-download" style="flex:1 1 140px">Download</button>
        <button class="btn secondary" id="v-print" style="flex:1 1 140px">Print / PDF</button>
      </div>
      <button class="btn secondary" id="v-save">Save to medical records</button>
      <details class="card" ${window.__visitOpen ? 'open' : ''} id="v-update-box"><summary>Add an update or correct something</summary>
        <div class="caption" style="margin-top:6px">Updates are added with today’s date and time. Corrections are kept next to the original entry — nothing is deleted.</div>
        <label class="label">Which problem?</label>
        <select id="u-complaint">${complaints.map((c) => `<option>${esc(c)}</option>`).join('')}<option value="__new">Something new…</option></select>
        <input id="u-new" placeholder="Name of the new problem" style="margin-top:8px;display:${complaints.length ? 'none' : 'block'}" />
        <label class="label">How bad is it now? (0–10, optional)</label><input id="u-sev" inputmode="numeric" placeholder="e.g. 6" />
        <label class="label">New symptoms (optional)</label><input id="u-sym" placeholder="e.g. fever since this morning" />
        <label class="label">Note (optional)</label><input id="u-note" placeholder="e.g. took paracetamol at 2 pm" />
        <label class="row" style="gap:10px;margin-top:12px;cursor:pointer"><input type="checkbox" id="u-corr" style="width:auto"/> This corrects an earlier entry</label>
        <button class="btn primary" id="u-save">Add to timeline</button>
      </details>
      ${saved.length ? `<h2 class="sec">Saved summaries</h2>${saved.map((v) => `<details class="card"><summary>${fmtDate(v.createdAt.slice(0, 10))} · ${new Date(v.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</summary><pre class="ocr">${esc(v.text)}</pre></details>`).join('')}` : ''}
      <pre class="print-only">${esc(text)}</pre>
    </div>`);
  app.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => { window.__visitPeriod = b.dataset.period; screenVisitSummary(id); }));
  $('#u-complaint')?.addEventListener('change', (e) => { $('#u-new').style.display = e.target.value === '__new' ? 'block' : 'none'; });
  $('#v-copy')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(text); flash('Summary copied.'); } catch { flash('Copy is not available here — use Download instead.'); } });
  $('#v-download')?.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = `mednest-visit-summary-${todayISO()}.txt`;
    a.click();
  });
  $('#v-share')?.addEventListener('click', async () => {
    if (navigator.share) { try { await navigator.share({ title: 'Doctor visit summary', text }); } catch (_) {} }
    else { try { await navigator.clipboard.writeText(text); flash('Sharing isn’t available in this browser, so the summary was copied instead.'); } catch { flash('Use Download or Print to share the summary.'); } }
  });
  $('#v-save')?.addEventListener('click', () => {
    const v = { id: uid(), profileId: id, createdAt: nowIso(), period, text };
    DB.visitSummaries.push(v);
    audit(id, 'document', v.id, 'create', { note: 'doctor visit summary saved' });
    save(); flash('Saved to medical records.'); screenVisitSummary(id);
  });
  $('#u-save')?.addEventListener('click', () => {
    const sel = $('#u-complaint').value;
    const complaint = sel === '__new' || !sel ? $('#u-new').value.trim() : sel;
    if (!complaint) return flash('Please name the problem.');
    const sevRaw = $('#u-sev').value.trim();
    const severity = sevRaw === '' ? null : parseInt(sevRaw, 10);
    if (severity !== null && (isNaN(severity) || severity < 0 || severity > 10)) return flash('Severity must be a number from 0 to 10.');
    const newSymptoms = $('#u-sym').value.trim() || null;
    const note = $('#u-note').value.trim() || null;
    if (severity === null && !newSymptoms && !note) return flash('Add a severity, new symptoms or a note.');
    // New warning signs in an update get the emergency message straight away.
    const flags = core.detectRedFlags(`${newSymptoms || ''} ${note || ''}`);
    const lastEp = byProfile(DB.episodes, id).filter((e) => e.complaint === complaint).pop();
    const u = { id: uid(), profileId: id, at: nowIso(), complaint, severity, newSymptoms, note, correctsId: $('#u-corr').checked ? lastEp?.id || 'earlier' : null };
    DB.symptomUpdates.push(u);
    audit(id, 'episode', u.id, 'create', { note: u.correctsId ? 'correction' : 'symptom update' });
    save();
    window.__visitOpen = false;
    if (flags[0]?.level === 'emergency') flash(flags.some((f) => f.id === 'self_harm') ? core.SELF_HARM_MESSAGE : core.EMERGENCY_MESSAGE);
    else if (severity !== null && severity >= 8) flash('Your symptoms sound worse. Please run a new symptom check now (the Check tab) so MedNest can tell you how soon to get care — don’t wait for your appointment.');
    screenVisitSummary(id);
  });
  $('#v-print')?.addEventListener('click', () => {
    document.body.classList.add('print-visit');
    window.print();
    setTimeout(() => document.body.classList.remove('print-visit'), 500);
  }, { once: true });
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
        <h2 class="sec">Current medicines</h2>${meds.length ? meds.map((m) => `<div>${esc(m.name)} ${esc(m.dose || '')} — ${m.asNeeded ? 'when needed' : timesSorted(m.times).join(', ') || '—'}${medStatus(m) !== 'active' ? ` (${STATUS_LABEL[medStatus(m)].toLowerCase()})` : ''}</div>`).join('') : '<div class="muted">None</div>'}
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
  const perm = typeof Notification === 'undefined' ? 'Not supported' : { granted: 'On while MedNest is open', denied: 'Blocked in browser settings', default: 'Off — tap to turn on' }[Notification.permission];
  render(`
    ${topbar('#/', 'Settings')}
    <div class="screen">
      <h2 class="sec">Privacy &amp; data</h2>
      <div class="trust"><span class="tile">${icon('shield')}</span><div class="grow"><div class="name">Your records stay on this device</div><div class="caption" style="color:var(--text)">Stored only in this browser (${used} plus photos). No account and no MedNest server. Photos are read in your browser. For live medical information, only medicine names and health topics are sent to MedlinePlus, RxNorm, the FDA and Wikipedia — never your name, profile or documents.</div></div></div>
      <div class="card link" id="export"><div class="row grow"><span class="tile ">${icon('download', 20)}</span><div class="grow"><div class="name">Export all data</div><div class="list-sub">Download a copy of every record (JSON)</div></div></div><span class="arrow">${icon('next', 20)}</span></div>
      <div class="card link" data-href="./privacy"><div class="row grow"><span class="tile ">${icon('lock', 20)}</span><div class="grow"><div class="name">Privacy policy</div><div class="list-sub">What is stored, where, and how to delete it</div></div></div><span class="arrow">${icon('next', 20)}</span></div>
      <div class="card link" id="wipe"><div class="row grow"><span class="tile warn">${icon('trash', 20)}</span><div class="grow"><div class="name">Delete all data</div><div class="list-sub">Permanently remove all profiles, records and photos</div></div></div><span class="arrow">${icon('next', 20)}</span></div>
      <h2 class="sec">Reminders</h2>
      <div class="card link" id="notif"><div class="row grow"><span class="tile ">${icon('clock', 20)}</span><div class="grow"><div class="name">Medicine &amp; follow-up reminders</div><div class="list-sub">${perm}</div></div></div><span class="arrow">${icon('next', 20)}</span></div>
      <h2 class="sec">About MedNest</h2>
      <div class="card"><div class="row" style="align-items:flex-start"><span class="tile">${icon('stethoscope', 20)}</span><div class="grow caption" style="color:var(--text)">MedNest organises your records, and its symptom check helps you decide when to get care. It does not diagnose and does not replace your doctor. In an emergency call ${core.EMERGENCY_NUMBER}.</div></div></div>
      <div class="counter">MedNest web · v1.2.0 · ${esc(core.TRIAGE_ENGINE_VERSION)}</div>
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
    const submit = async (text) => {
      if (!text?.trim()) return;
      const chat = window.__chat;
      // A symptom check is running in this chat: the message is an answer to it.
      if (chat.triage && !chat.triage.done) return continueChatTriage(id, text);
      const intent = core.classifyMessage(text);
      if (intent === 'symptom') return startChatTriage(id, text);
      const small = intent === 'unclear' ? null : core.conversationalReply(intent, 'records', chat.log.length);
      if (small) {
        chat.log.push({ role: 'user', text }, { role: 'bot', text: small, conversational: true });
        renderAsk(id);
        return window.scrollTo(0, document.body.scrollHeight);
      }
      let res;
      try {
        res = askRecords(id, text, { lastMedicineId: chat.lastMedicineId, explainedIds: chat.explainedIds, pendingIntent: chat.pendingIntent });
      } catch (e) {
        // Never show a misleading "not found" when reading the records failed.
        res = { answer: 'Sorry — I couldn’t read the saved records just now, so I can’t answer reliably. Nothing was changed. Please try again, or open Meds to see your medicines directly.', sources: [] };
      }
      const prevMedicineId = chat.lastMedicineId;
      if (res.medicineId) chat.lastMedicineId = res.medicineId;
      if (res.explainedIds) chat.explainedIds = res.explainedIds;
      chat.pendingIntent = res.pendingIntent || null;
      chat.log.push({ role: 'user', text });
      chat.log.push({ role: 'bot', text: res.answer, sources: res.sources, suggestions: res.suggestions, emergency: res.emergency, addMedicine: res.addMedicine });
      renderAsk(id);
      window.scrollTo(0, document.body.scrollHeight);
      // Then look it up live in trusted public sources (MedlinePlus, FDA, RxNorm).
      if (!res.emergency && !res.refusal) enrichOnline(id, text, res, prevMedicineId);
    };
    // "I am also taking X": add it as the user told it (name + dose only). Times are never
    // guessed — the medicine waits under Pending confirmations until the user sets them.
    $('#ask-add')?.addEventListener('click', () => {
      const chat = window.__chat;
      const bot = [...chat.log].reverse().find((m) => m.role === 'bot');
      if (!bot?.addMedicine || bot.added) return;
      const now = nowIso();
      const med = { id: uid(), profileId: id, documentId: null, name: bot.addMedicine.name, dose: bot.addMedicine.dose, times: [], durationDays: null, startDate: todayISO(), endDate: '', instructions: null, asNeeded: false, confirmedAt: now, source: 'manual', status: 'pending', active: true, updatedAt: now };
      DB.medicines.push(med);
      audit(id, 'medicine', med.id, 'create', { after: { name: med.name, dose: med.dose, status: 'pending' }, note: 'added from Ask' });
      save();
      bot.added = true;
      chat.lastMedicineId = med.id;
      window.__medForm = null;
      location.hash = `#/profile/${id}/medicine/${med.id}/edit`;
    });
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
const PROFILE_ARRAYS = ['documents', 'medicines', 'results', 'doseLogs', 'appointments', 'episodes', 'chats', 'audit', 'symptomUpdates', 'visitSummaries'];
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
- You are given SOURCES fetched from trusted medical websites. Base every statement on them; if they do not cover the question, say so plainly.`;

const WEBLLM_MODEL = 'Llama-3.2-1B-Instruct-q4f32_1-MLC';
const webllm = { engine: null, status: 'idle', progress: '', busy: false, log: [] };

function screenHealthInfo() { renderHealthInfo(); }

// General health questions. Works on every device: answers come live from trusted
// public sources (MedlinePlus, FDA, RxNorm, Wikipedia as fallback) with links. The
// optional in-browser open-source model can then write a short plain-language summary
// using ONLY those sources — it is never the source of medical facts itself.
function renderHealthInfo() {
  const w = webllm;
  const logHtml = w.log.map((m) => m.role === 'user'
    ? `<div class="card bubble-user"><div class="who-label">${icon('user', 14)} You</div>${esc(m.text)}</div>`
    : m.emergency
      ? `<div class="card bubble-emergency"><div class="name row" style="color:var(--danger);gap:8px">${icon('alert', 20)} Get help now</div><div class="msg">${esc(m.text)}</div><a class="btn danger" href="tel:${core.EMERGENCY_NUMBER}">${icon('phone', 18)} Call ${core.EMERGENCY_NUMBER}</a></div>`
      : m.triage || m.conversational
      ? `<div class="card ${m.kind === 'summary' ? 'bubble-summary' : 'bubble-bot'}"><div class="who-label">${icon(m.triage ? 'symptom' : 'chat', 14)} ${m.triage ? 'MedNest symptom check · rules-based' : 'MedNest'}</div><div class="msg">${esc(m.text)}</div></div>`
      : `<div class="card ${m.ai ? 'bubble-bot' : 'bubble-online'}"><div class="who-label">${icon(m.ai ? 'assistant' : 'info', 14)} ${m.ai ? 'Summary by the in-browser AI · based only on the sources above' : 'Live from trusted sources · MedlinePlus, FDA, RxNorm'}</div><div class="msg">${m.pending ? `<span class="spin" style="display:inline-flex;vertical-align:middle">${icon('clock', 16)}</span> ` : ''}${linkify(m.text)}</div></div>`).join('');
  const modelCard = w.status === 'ready'
    ? `<div class="caption">${icon('check', 14)} In-browser AI summaries are on.</div>`
    : w.status === 'loading'
      ? `<div class="card"><div class="name">Loading the in-browser AI…</div><div class="caption">${esc(w.progress)}</div></div>`
      : w.status === 'nogpu'
        ? `<div class="caption">This browser can’t run the in-browser AI (no WebGPU). Answers from trusted sources still work.</div>`
        : w.status === 'error'
          ? `<div class="caption warn-text">The in-browser AI couldn’t load: ${esc(w.progress)}. Answers from trusted sources still work.</div>`
          : `<details class="card"><summary>Optional: plain-language summaries by an in-browser AI</summary><div class="caption" style="margin:6px 0">Downloads an open-source model once (~1 GB) and runs it on this device. Needs Chrome or Edge with WebGPU. It only summarises the sources shown.</div><button class="btn secondary" id="hi-load">Turn on in-browser AI</button></details>`;
  const lastA = [...w.log].reverse().find((m) => m.role !== 'user');
  const replyChips = lastA?.quickReplies?.length && w.triage && !w.triage.done ? `<div class="chips" style="margin-top:8px">${lastA.quickReplies.map((c) => `<button class="chip" data-hq="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : '';
  const chips = w.log.length ? '' : `<div class="chips">${['What is gout?', 'What is warfarin used for?', 'Migraine', 'High blood pressure'].map((c) => `<button class="chip" data-hq="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
  render(`
    ${topbar('#/', 'General health questions')}
    <div class="screen">
      <div class="notice"><span class="tile info" style="width:34px;height:34px">${icon('info', 18)}</span><span class="grow caption" style="color:var(--text)">Answers come live from MedlinePlus (NIH), US FDA drug labels and RxNorm, with links. General information only — not a diagnosis.</span></div>
      ${chips}
      ${logHtml}
      ${replyChips}
      ${modelCard}
      <div class="row" style="gap:8px;position:sticky;bottom:12px;margin-top:12px"><input id="hi-input" placeholder="Ask about a condition or medicine…" class="grow" ${w.busy ? 'disabled' : ''} autocomplete="off"/><button class="iconbtn" id="hi-send" style="background:var(--accent);color:var(--onAccent)" aria-label="Send">${icon('next', 22)}</button></div>
      <div class="disclaimer">For your own records, open a profile and use Ask. If you feel unwell, use “Check a symptom”.</div>
    </div>`);
  app.querySelectorAll('[data-hq]').forEach((b) => b.addEventListener('click', () => sendHealthMsg(b.dataset.hq)));
  if (w.log.length) window.scrollTo(0, document.body.scrollHeight);
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

// No profile here: the check uses no personal history and is not saved.
function genericTriageContext() {
  return { ageYears: null, allergies: null, activeMedicines: [], priorEpisodes: [], now: new Date() };
}
async function healthTriage(q) {
  const w = webllm;
  const r = await core.respond(w.triage, q, genericTriageContext());
  w.triage = r.state;
  w.log.push(...r.messages.map((m) => (m.kind === 'emergency' ? { role: 'assistant', emergency: true, text: m.text } : { role: 'assistant', triage: true, kind: m.kind, text: m.text, quickReplies: m.quickReplies })));
  if (r.state.done && !r.state.stopped && r.state.disposition && r.state.disposition !== 'emergency') w.log.push({ role: 'assistant', conversational: true, text: 'To save this to your medical history and include your medicines and allergies, open your profile and use Check a symptom.' });
  renderHealthInfo();
}

async function sendHealthMsg(text) {
  const w = webllm;
  if (!text || !text.trim() || w.busy) return;
  const q = text.trim();
  w.log.push({ role: 'user', text: q });
  // Emergency warning signs get the fixed message in code — never a lookup or model answer.
  const flags = core.detectRedFlags(q);
  if (flags[0]?.level === 'emergency') {
    w.triage = null; // an emergency ends any check in progress
    w.log.push({ role: 'assistant', emergency: true, text: flags.some((f) => f.id === 'self_harm') ? core.SELF_HARM_MESSAGE : core.EMERGENCY_MESSAGE });
    return renderHealthInfo();
  }
  // A symptom check running here: this message answers it.
  if (w.triage && !w.triage.done) return healthTriage(q);
  const intent = core.classifyMessage(q);
  if (intent === 'symptom') { w.triage = core.startTriage(genericTriageContext()).state; return healthTriage(q); }
  const small = intent === 'unclear' ? null : core.conversationalReply(intent, 'general', w.log.length);
  if (small) { w.log.push({ role: 'assistant', conversational: true, text: small }); return renderHealthInfo(); }
  if (!online()) {
    w.log.push({ role: 'assistant', text: 'You’re offline. Connect to the internet to look this up in trusted medical sources.' });
    return renderHealthInfo();
  }
  // Medicine name → drug lookup; otherwise the topic of the question.
  const plan = core.planEnrichment(q, '', [], {}) || { kind: 'topic', term: core.topicOf(q) || q };
  const msg = { role: 'assistant', pending: true, text: 'Checking trusted medical sources…' };
  w.log.push(msg);
  w.busy = true; renderHealthInfo();
  const found = await cachedEnrichment(plan);
  msg.pending = false;
  msg.text = found || 'I couldn’t find reliable information about that. Try a simpler term (for example the name of a condition or medicine), or ask a doctor or pharmacist.';
  if (found && w.engine) {
    try {
      const reply = await w.engine.chat.completions.create({
        messages: [
          { role: 'system', content: `${HEALTH_SYS}\nUse ONLY the SOURCES below. If they do not answer the question, say so. Keep it under 120 words.` },
          { role: 'user', content: `QUESTION: ${q}\n\nSOURCES:\n${found}` },
        ],
        temperature: 0.2,
        max_tokens: 220,
      });
      const answer = reply?.choices?.[0]?.message?.content;
      if (answer) w.log.push({ role: 'assistant', ai: true, text: answer });
    } catch (_) { /* the sourced answer above stands on its own */ }
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
      case 'medicine': return screenMedicine(id, parts[3], parts[4] === 'edit');
      case 'doses': return screenDoses(id);
      case 'appointments': return screenAppointments(id);
      case 'assist': return screenAssist(id);
      case 'assistant': return screenAssistant(id);
      case 'ask': return screenAsk(id);
      case 'summary': return screenSummary(id);
      case 'visit': return screenVisitSummary(id);
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
