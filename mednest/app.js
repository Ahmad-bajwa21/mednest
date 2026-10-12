// MedNest — complete web app (fully client-side; data stays in this browser,
// matching the native app's "on-device" philosophy). No build, no server, no account.
// Mirrors the native spec: screens, template summary, code-based pattern notes,
// rule-based Ask with an advice-seeking refusal, share/import with a 4-profile cap.

/* ============================== utilities ============================== */
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + Math.random().toString(16).slice(2));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayISO = () => new Date().toISOString().slice(0, 10);

const RELATIONS = ['Self', 'Mother', 'Father', 'Spouse', 'Child', 'Other'];
const DOC_TYPES = ['Prescription', 'Lab report', 'Scan report', 'Bill', 'Other'];
const DOT_COLORS = ['#0F766E', '#1D4ED8', '#9333EA', '#C2410C'];
const TIME_SLOTS = ['Morning', 'Afternoon', 'Evening', 'Night'];
const SLOT_CLOCK = { Morning: '8:00', Afternoon: '14:00', Evening: '18:00', Night: '21:00' };
const MAX_PROFILES = 4;
const DISCLAIMER = 'Information only. Not medical advice.';

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d)) return esc(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtMonth(iso) {
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? 'Undated' : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
function calcAge(birthYear) {
  const y = parseInt(birthYear, 10);
  return y ? new Date().getFullYear() - y : null;
}
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function num(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }

/* ============================== store ============================== */
const KEY = 'mednest.v1';
const FLAG_ONBOARDED = 'mednest.onboarded';
let DB = load();
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (_) {}
  return { profiles: [], documents: [], medicines: [], results: [] };
}
function save() { localStorage.setItem(KEY, JSON.stringify(DB)); }

const byProfile = (arr, pid) => arr.filter((x) => x.profileId === pid);
const getProfile = (id) => DB.profiles.find((p) => p.id === id);
const getDoc = (id) => DB.documents.find((d) => d.id === id);
const activeMeds = (pid) => byProfile(DB.medicines, pid).filter((m) => m.active !== false);

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
    // Rising / falling across 3+ readings
    if (series.length >= 3) {
      const vals = series.map((r) => num(r.value));
      const rising = vals.every((v, i) => i === 0 || v > vals[i - 1]);
      const falling = vals.every((v, i) => i === 0 || v < vals[i - 1]);
      if (rising || falling) {
        notes.push({ text: `${t} has ${rising ? 'risen' : 'fallen'} across the last ${vals.length} readings (${vals.join(', ')}).`, sources: series.map((r) => r.documentId) });
      }
    }
    // Out of range 2+ times
    const oor = series.filter((r) => { const v = num(r.value), lo = num(r.rangeLow), hi = num(r.rangeHigh); return v != null && ((lo != null && v < lo) || (hi != null && v > hi)); });
    if (oor.length >= 2) {
      notes.push({ text: `${t} has been outside the report's range in ${oor.length} tests.`, sources: oor.map((r) => r.documentId) });
    }
  }
  // Repeated prescriptions: same medicine name 3+ times in 12 months
  const meds = byProfile(DB.medicines, pid);
  const byName = {};
  meds.forEach((m) => (byName[m.name.toLowerCase()] ||= []).push(m));
  for (const [, group] of Object.entries(byName)) {
    const recent = group.filter((m) => m.startDate && m.startDate >= addDays(todayISO(), -365));
    if (recent.length >= 3) {
      notes.push({ text: `${group[0].name} was prescribed ${recent.length} times in the last 12 months.`, sources: recent.map((m) => m.documentId) });
    }
  }
  // Many prescribers: 3+ distinct doctors among active meds' documents
  const activeDocs = activeMeds(pid).map((m) => getDoc(m.documentId)).filter(Boolean);
  const doctors = [...new Set(activeDocs.map((d) => (d.doctor || '').trim().toLowerCase()).filter(Boolean))];
  if (doctors.length >= 3) {
    notes.push({ text: `Active medicines come from ${doctors.length} different doctors.`, sources: activeDocs.map((d) => d.id) });
  }
  return notes.slice(0, 5); // spec: max 5
}

/* ============================== Ask: rule-based retrieval (spec §6.4 Task D / §7.4) ============================== */
const ADVICE_RE = /\b(should i|do i have|is it (safe|ok|okay)|can i (stop|start|take|increase|double)|diagnos|what('?s| is) wrong|cure|treat(ment)?|prescribe me|how much should)\b/i;

function askRecords(pid, question) {
  const q = question.trim();
  if (!q) return null;
  if (ADVICE_RE.test(q)) {
    return { refusal: true, answer: "I can't advise on that. I can show you what your records say, and you can discuss it with your doctor.", sources: [] };
  }
  // No documents yet — guide the user instead of a flat "not found". MedNest only
  // answers from this person's own documents, never general medical knowledge.
  if (byProfile(DB.documents, pid).length === 0) {
    return { answer: "There are no records for this person yet. Add a document (tap ＋ on the overview), then I can answer questions about it. MedNest only answers from your own documents — it does not give general medical information.", sources: [] };
  }
  const lower = q.toLowerCase();
  // Structured: current medicines
  if (/\b(current|active|which) medicine|what (medicine|meds)|taking now\b/.test(lower)) {
    const meds = activeMeds(pid);
    return meds.length
      ? { answer: 'Active medicines: ' + meds.map((m) => `${m.name}${m.dose ? ' ' + m.dose : ''}`).join('; ') + '.', sources: [...new Set(meds.map((m) => m.documentId))] }
      : { answer: 'No active medicines are recorded.', sources: [] };
  }
  // Structured: latest/last test value
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
  // Keyword fallback over documents/meds/results
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

function tabsBar(pid, active) {
  const t = (route, icon, label, key) => `<a href="#/profile/${pid}${route}" class="${active === key ? 'on' : ''}"><span class="ti">${icon}</span>${label}</a>`;
  return `<nav class="tabs">${t('', '▦', 'Overview', 'overview')}${t('/timeline', '≣', 'Timeline', 'timeline')}${t('/meds', '℞', 'Meds', 'meds')}${t('/ask', '?', 'Ask', 'ask')}</nav>`;
}
const adSlot = () => `<div class="adslot">AD</div>`;
const dotHtml = (c) => `<span class="dot" style="background:${esc(c || DOT_COLORS[0])}"></span>`;
const srcLinks = (pid, ids) => [...new Set(ids)].map((id) => { const d = getDoc(id); return d ? `<a class="inline" href="#/profile/${pid}/doc/${id}">${esc(d.type)}, ${fmtDate(d.docDate)}</a>` : ''; }).filter(Boolean).join(' · ');

/* ============================== onboarding (S2) ============================== */
function screenWelcome() {
  window.__ob = 0;
  renderWelcome();
}
function renderWelcome() {
  const slides = [
    { ico: '📷', t: 'Photograph your papers', b: 'MedNest reads prescriptions and reports and files them for each family member.' },
    { ico: '🔒', t: 'It stays on your device', b: 'No account. No upload. Your health records live only in this browser.' },
    { ico: '🩺', t: 'A helper, not a doctor', b: 'MedNest organises and explains your documents. It does not diagnose or advise treatment.' },
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

/* ============================== screens ============================== */
function screenProfiles() {
  const list = DB.profiles.map((p) => {
    const meds = activeMeds(p.id);
    const docs = byProfile(DB.documents, p.id);
    const sumLine = !docs.length ? 'No records yet' : meds.length ? `${meds.length} active medicine${meds.length > 1 ? 's' : ''}` : `${docs.length} document${docs.length > 1 ? 's' : ''}`;
    const next = meds.length && meds[0].times?.length ? `Next: ${meds[0].name} ${SLOT_CLOCK[meds[0].times[0]] || ''}` : 'Next: no reminders';
    return `<div class="card link" data-go="#/profile/${p.id}"><div class="row grow">${dotHtml(p.color)}<div class="grow"><div class="name">${esc(p.name)} <span class="muted" style="font-weight:400">${esc(p.relation)}</span></div><div class="list-sub truncate">${esc(sumLine)}</div><div class="caption">${esc(next)}</div></div></div><span class="arrow">›</span></div>`;
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
    <div class="topbar"><button class="iconbtn back" data-go="${p ? '#/profile/' + id : '#/'}">‹</button><h1>${p ? 'Edit profile' : 'New profile'}</h1></div>
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

function screenOverview(id) {
  const p = getProfile(id);
  if (!p) return go('#/');
  const docs = byProfile(DB.documents, id);
  const meds = activeMeds(id);
  const results = latestResults(id);
  const notes = patternNotes(id);
  const coming = comingUp(id);
  const resHtml = results.length ? results.map((r) => `<div class="row" style="justify-content:space-between"><span>${esc(r.test)}</span><span class="${r.outOfRange ? 'pill warn' : ''}">${esc(r.value)}${r.unit ? ' ' + esc(r.unit) : ''} <span class="trend ${r.trend}">${r.trend === 'up' ? '▲' : r.trend === 'down' ? '▼' : '='}</span></span></div>`).join('<hr class="sep">') : '<div class="muted">No results yet</div>';
  const notesHtml = notes.length ? notes.map((n) => `<div style="margin-bottom:10px">${esc(n.text)}<div class="caption">${srcLinks(id, n.sources)} · Discuss with your doctor.</div></div>`).join('') : '<div class="muted">Nothing notable yet.</div>';
  const comingHtml = coming.length ? coming.map((c) => `<div class="row" style="justify-content:space-between"><span>${esc(c.text)}</span><span class="caption">${esc(c.when)}</span></div>`).join('<hr class="sep">') : '<div class="muted">Nothing in the next 14 days.</div>';
  render(`
    <div class="topbar"><button class="iconbtn back" data-go="#/">‹</button>${dotHtml(p.color)}<h1>${esc(p.name)}</h1><button class="iconbtn" data-go="#/profile/${id}/edit">⋮</button></div>
    <div class="screen">
      <h2 class="sec">Summary</h2>
      <div class="card"><div>${esc(buildSummary(id))}</div><div class="caption" style="margin-top:8px">Updated ${fmtDate(todayISO())} · built from ${docs.length} document${docs.length === 1 ? '' : 's'}</div></div>
      <h2 class="sec">Active medicines (${meds.length})</h2>
      <div class="card link" data-go="#/profile/${id}/meds"><div class="grow">${meds.length ? meds.slice(0, 3).map((m) => esc(m.name)).join(', ') : '<span class="muted">None</span>'}</div><span class="arrow">›</span></div>
      <h2 class="sec">Latest results</h2><div class="card">${resHtml}</div>
      <h2 class="sec">Things to notice (${notes.length})</h2><div class="card">${notesHtml}</div>
      <h2 class="sec">Coming up</h2><div class="card">${comingHtml}</div>
      <button class="btn secondary" data-go="#/profile/${id}/summary">Doctor summary</button>
      <div class="disclaimer">${DISCLAIMER}</div>
    </div>
    <button class="fab" data-go="#/profile/${id}/add">＋</button>${tabsBar(id, 'overview')}`);
}

function comingUp(id) {
  const out = [];
  activeMeds(id).forEach((m) => { if (m.times?.length) out.push({ text: `${m.name} ${m.dose || ''}`.trim(), when: m.times.map((t) => SLOT_CLOCK[t]).join(', ') }); });
  byProfile(DB.documents, id).forEach((d) => { if (d.followUp && d.followUp >= todayISO() && d.followUp <= addDays(todayISO(), 14)) out.push({ text: 'Follow-up: ' + d.followUp, when: fmtDate(d.followUp) }); });
  return out.slice(0, 6);
}

function screenAddDoc(id) {
  if (!getProfile(id)) return go('#/');
  window.__doc = { type: 'Prescription', docDate: todayISO(), doctor: '', followUp: '', meds: [], results: [] };
  renderAddDoc(id);
}
function renderAddDoc(id) {
  const d = window.__doc;
  const medRows = d.meds.map((m, i) => `<div class="card"><div class="row"><input data-m="${i}" data-k="name" value="${esc(m.name)}" placeholder="Medicine name" class="grow" /><button class="iconbtn" data-rmmed="${i}">✕</button></div><div class="row" style="gap:10px;margin-top:8px"><input data-m="${i}" data-k="dose" value="${esc(m.dose)}" placeholder="Dose e.g. 500 mg" /><input data-m="${i}" data-k="durationDays" value="${esc(m.durationDays)}" inputmode="numeric" placeholder="Days" /></div><div class="chips" style="margin-top:8px">${TIME_SLOTS.map((t) => `<button class="chip ${m.times.includes(t) ? 'sel' : ''}" data-mtime="${i}" data-slot="${t}">${t}</button>`).join('')}</div></div>`).join('');
  const resRows = d.results.map((r, i) => `<div class="card"><div class="row"><input data-r="${i}" data-k="test" value="${esc(r.test)}" placeholder="Test e.g. HbA1c" class="grow" /><button class="iconbtn" data-rmres="${i}">✕</button></div><div class="row" style="gap:10px;margin-top:8px"><input data-r="${i}" data-k="value" value="${esc(r.value)}" placeholder="Value" /><input data-r="${i}" data-k="unit" value="${esc(r.unit)}" placeholder="Unit" /></div><div class="row" style="gap:10px;margin-top:8px"><input data-r="${i}" data-k="rangeLow" value="${esc(r.rangeLow)}" placeholder="Range low" /><input data-r="${i}" data-k="rangeHigh" value="${esc(r.rangeHigh)}" placeholder="Range high" /></div></div>`).join('');
  render(`
    <div class="topbar"><button class="iconbtn back" data-go="#/profile/${id}">✕</button><h1>Add document</h1></div>
    <div class="screen">
      <div class="caption noprint">Manual entry. On the native app the camera + on-device AI fills this in for you to check.</div>
      <label class="label">Type</label><div class="chips" id="d-type">${DOC_TYPES.map((t) => `<button class="chip ${d.type === t ? 'sel' : ''}" data-dtype="${t}">${t}</button>`).join('')}</div>
      <div class="row" style="gap:16px"><div class="grow"><label class="label">Date</label><input id="d-date" type="date" value="${esc(d.docDate)}" /></div><div class="grow"><label class="label">Doctor</label><input id="d-doctor" value="${esc(d.doctor)}" placeholder="Dr. S. Khan" /></div></div>
      <label class="label">Follow-up date (optional)</label><input id="d-follow" type="date" value="${esc(d.followUp)}" />
      <h2 class="sec">Medicines</h2>${medRows}<button class="textbtn" id="add-med">＋ Add medicine</button>
      <h2 class="sec">Results</h2>${resRows}<button class="textbtn" id="add-res">＋ Add result</button>
      <button class="btn primary" id="d-save">Confirm and save</button>
      <button class="textbtn danger" data-go="#/profile/${id}">Discard</button>
    </div>`);
}

function screenDocDetail(id, docId) {
  const p = getProfile(id); const doc = getDoc(docId);
  if (!p || !doc) return go('#/profile/' + id);
  const meds = byProfile(DB.medicines, id).filter((m) => m.documentId === docId);
  const res = byProfile(DB.results, id).filter((r) => r.documentId === docId);
  const simple = res.length
    ? res.map((r) => { const v = num(r.value), lo = num(r.rangeLow), hi = num(r.rangeHigh); let note = ''; if (v != null && hi != null && v > hi) note = ` This is above the report's range (up to ${r.rangeHigh}).`; else if (v != null && lo != null && v < lo) note = ` This is below the report's range (from ${r.rangeLow}).`; return `Your ${r.test} is ${r.value}${r.unit ? ' ' + r.unit : ''}.${note}`; }).join(' ')
    : meds.length ? `This ${doc.type.toLowerCase()} lists ${meds.length} medicine${meds.length > 1 ? 's' : ''}.` : `A ${doc.type.toLowerCase()} dated ${fmtDate(doc.docDate)}.`;
  const compare = res.map((r) => { const prev = sortedResults(id).find((x) => x.test === r.test && (x.docDate || '') < (doc.docDate || '')); return prev ? `${r.test}: ${prev.value} → ${r.value} (since ${fmtDate(prev.docDate)})` : ''; }).filter(Boolean);
  render(`
    <div class="topbar"><button class="iconbtn back" data-go="#/profile/${id}/timeline">‹</button><h1>${esc(doc.type)}</h1><button class="iconbtn" id="doc-del">🗑</button></div>
    <div class="screen">
      <div class="caption">${fmtDate(doc.docDate)}${doc.doctor ? ' · ' + esc(doc.doctor) : ''}</div>
      <h2 class="sec">In simple words</h2><div class="card">${esc(simple)}</div>
      ${res.length ? `<h2 class="sec">Results</h2><div class="card">${res.map((r) => { const v = num(r.value), lo = num(r.rangeLow), hi = num(r.rangeHigh); const oor = v != null && ((lo != null && v < lo) || (hi != null && v > hi)); return `<div class="row" style="justify-content:space-between"><span>${esc(r.test)}</span><span class="${oor ? 'pill warn' : ''}">${esc(r.value)}${r.unit ? ' ' + esc(r.unit) : ''}</span></div>`; }).join('<hr class="sep">')}</div>` : ''}
      ${meds.length ? `<h2 class="sec">Medicines</h2><div class="card">${meds.map((m) => `<div>${esc(m.name)} ${esc(m.dose || '')} — ${(m.times || []).join(', ') || '—'}</div>`).join('')}</div>` : ''}
      ${compare.length ? `<h2 class="sec">Compared with earlier</h2><div class="card">${compare.map((c) => `<div>${esc(c)}</div>`).join('')}</div>` : ''}
      <div class="disclaimer">${DISCLAIMER}</div>
    </div>`);
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
  render(`<div class="topbar"><button class="iconbtn back" data-go="#/profile/${id}">‹</button>${dotHtml(p.color)}<h1>Timeline</h1></div><div class="screen">${body}</div>${adSlot()}${tabsBar(id, 'timeline')}`);
}

function screenMeds(id) {
  const p = getProfile(id);
  if (!p) return go('#/');
  const all = byProfile(DB.medicines, id);
  const active = all.filter((m) => m.active !== false);
  const past = all.filter((m) => m.active === false);
  const medCard = (m) => `<div class="card"><div class="row" style="justify-content:space-between"><span class="name">${esc(m.name)} ${esc(m.dose || '')}</span>${m.active !== false ? `<button class="textbtn" data-stop="${m.id}">Stop</button>` : '<span class="pill">Past</span>'}</div><div class="list-sub">${(m.times || []).join(' · ') || 'No times set'}</div><div class="caption">${m.durationDays ? 'For ' + m.durationDays + ' days' : 'No end date'}${m.documentId && getDoc(m.documentId) ? ' · <a class="inline" href="#/profile/' + id + '/doc/' + m.documentId + '">source</a>' : ''}</div></div>`;
  render(`<div class="topbar"><button class="iconbtn back" data-go="#/profile/${id}">‹</button>${dotHtml(p.color)}<h1>Medicines</h1></div><div class="screen"><h2 class="sec">Active (${active.length})</h2>${active.length ? active.map(medCard).join('') : '<div class="muted">No active medicines</div>'}${past.length ? `<h2 class="sec">Past (${past.length})</h2>${past.map(medCard).join('')}` : ''}<div class="disclaimer">${DISCLAIMER}</div></div>${tabsBar(id, 'meds')}`);
}

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
    <div class="topbar"><button class="iconbtn back" data-go="#/profile/${id}">‹</button>${dotHtml(p.color)}<h1>Ask</h1></div>
    <div class="screen">
      ${chat.log.length ? '' : `<div class="card"><div class="caption">I answer only from ${esc(p.name)}'s saved documents — not general medical information. Add documents first, then ask things like the examples below.</div></div>`}
      ${chat.log.length ? logHtml : `<div class="chips">${chips.map((c) => `<button class="chip" data-ask="${esc(c)}">${esc(c)}</button>`).join('')}</div>`}
      <div class="disclaimer">${DISCLAIMER}</div>
      <div class="row" style="gap:8px;position:sticky;bottom:72px"><input id="ask-input" placeholder="Ask about ${esc(p.name)}…" class="grow"/><button class="iconbtn" id="ask-send" style="background:var(--accent);color:var(--onAccent)">➤</button></div>
    </div>${tabsBar(id, 'ask')}`);
}

function screenSummary(id) {
  const p = getProfile(id);
  if (!p) return go('#/');
  const age = calcAge(p.birthYear);
  const meds = activeMeds(id);
  const results = latestResults(id, 6);
  const notes = patternNotes(id);
  render(`
    <div class="topbar"><button class="iconbtn back" data-go="#/profile/${id}">‹</button><h1>Doctor summary</h1></div>
    <div class="screen">
      <div class="card" id="docsum">
        <div class="name" style="font-size:18px">${esc(p.name)} · ${esc(p.sex || '-')}${age != null ? ' · ' + age : ''}</div>
        <div class="muted">Allergies: ${esc(p.allergies || 'none recorded')}</div>
        <h2 class="sec">Current medicines</h2>${meds.length ? meds.map((m) => `<div>${esc(m.name)} ${esc(m.dose || '')} — ${(m.times || []).join(', ') || '—'}</div>`).join('') : '<div class="muted">None</div>'}
        <h2 class="sec">Recent results</h2>${results.length ? results.map((r) => `<div>${esc(r.test)} ${esc(r.value)}${r.unit ? ' ' + esc(r.unit) : ''} (${fmtDate(r.docDate)})</div>`).join('') : '<div class="muted">None</div>'}
        ${notes.length ? `<h2 class="sec">Notes</h2>${notes.map((n) => `<div>${esc(n.text)}</div>`).join('')}` : ''}
        <hr class="sep"><div class="caption">Generated by MedNest from the patient's own documents. Not a clinical record.</div>
      </div>
      <button class="btn primary noprint" id="print">Save as PDF / Print</button>
    </div>${tabsBar(id, 'summary')}`);
}

function screenShare(id) {
  const p = getProfile(id);
  if (!p) return go('#/');
  render(`
    <div class="topbar"><button class="iconbtn back" data-go="#/profile/${id}/edit">‹</button><h1>Share ${esc(p.name)}</h1></div>
    <div class="screen">
      <div class="card">Sharing exports a copy of this profile as a file. Later changes are not sent automatically.</div>
      <button class="btn primary" id="export-profile">Download profile file</button>
      <div class="caption" style="text-align:center;margin-top:8px">On the native app this file is encrypted with a code. Here it is a plain JSON copy — share it only with people you trust.</div>
    </div>`);
}

function screenImport() {
  render(`
    <div class="topbar"><button class="iconbtn back" data-go="#/">‹</button><h1>Import profile</h1></div>
    <div class="screen">
      ${DB.profiles.length >= MAX_PROFILES ? `<div class="card" style="border-color:var(--warn)">You already have ${MAX_PROFILES} profiles. Remove one to import another.</div>` : `<label class="label">Choose a profile file (.json)</label><input type="file" id="import-file" accept="application/json,.json" /><div id="import-preview"></div>`}
    </div>`);
}

function screenSettings() {
  const used = (() => { try { return (new Blob([localStorage.getItem(KEY) || '']).size / 1024).toFixed(1) + ' KB'; } catch { return '—'; } })();
  render(`
    <div class="topbar"><button class="iconbtn back" data-go="#/">‹</button><h1>Settings</h1></div>
    <div class="screen">
      <h2 class="sec">Data</h2>
      <div class="card link" id="export"><div class="grow">Export all data (JSON)</div><span class="arrow">›</span></div>
      <div class="card"><div class="row" style="justify-content:space-between"><span>Storage used</span><span class="muted">${used}</span></div></div>
      <div class="card link" id="wipe"><div class="grow" style="color:var(--danger)">Delete all data</div><span class="arrow">›</span></div>
      <h2 class="sec">App</h2>
      <div class="card"><div class="row" style="justify-content:space-between"><span>Theme</span><span class="muted">System</span></div></div>
      <div class="card"><div class="row" style="justify-content:space-between"><span>Language</span><span class="muted">English</span></div></div>
      <div class="card"><div class="row" style="justify-content:space-between"><span>Remove ads</span><span class="muted">In native app</span></div></div>
      <h2 class="sec">About</h2>
      <div class="card link" data-href="./privacy"><div class="grow">Privacy policy</div><span class="arrow">›</span></div>
      <div class="card"><div class="grow muted">Not medical advice. MedNest organises and explains your own documents; it does not diagnose or advise treatment.</div></div>
      <div class="counter">MedNest web · v1.0.0</div>
      <div class="caption" style="text-align:center;margin-top:8px">Your data is stored only in this browser.</div>
    </div>`);
}

/* ============================== event wiring ============================== */
function wire() {
  app.querySelectorAll('[data-go]').forEach((e) => e.addEventListener('click', () => go(e.dataset.go)));
  app.querySelectorAll('[data-href]').forEach((e) => e.addEventListener('click', () => (location.href = e.dataset.href)));

  // onboarding
  if ($('#ob-next')) {
    $('#skip')?.addEventListener('click', () => { window.__ob = 2; renderWelcome(); });
    $('#understand')?.addEventListener('change', (e) => ($('#ob-next').disabled = !e.target.checked));
    $('#ob-next').addEventListener('click', () => { if (window.__ob < 2) { window.__ob++; renderWelcome(); } else { localStorage.setItem(FLAG_ONBOARDED, '1'); go('#/'); } });
  }

  // profile form
  if ($('#f-save')) {
    const d = window.__draft;
    $('#f-rel')?.querySelectorAll('[data-rel]').forEach((b) => b.addEventListener('click', () => { d.relation = b.dataset.rel; selOne($('#f-rel'), b); }));
    $('#f-sex')?.querySelectorAll('[data-sex]').forEach((b) => b.addEventListener('click', () => { d.sex = b.dataset.sex; selOne($('#f-sex'), b); }));
    $('#f-color')?.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => { d.color = b.dataset.color; $('#f-color').querySelectorAll('.d').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); }));
    $('#f-save').addEventListener('click', () => saveProfile(d));
    $('#f-del')?.addEventListener('click', () => deleteProfile(d.id));
  }

  // add document
  if ($('#d-save')) {
    const doc = window.__doc;
    const id = location.hash.split('/')[2];
    $('#d-type').querySelectorAll('[data-dtype]').forEach((b) => b.addEventListener('click', () => { doc.type = b.dataset.dtype; selOne($('#d-type'), b); }));
    $('#d-date').addEventListener('input', (e) => (doc.docDate = e.target.value));
    $('#d-doctor').addEventListener('input', (e) => (doc.doctor = e.target.value));
    $('#d-follow').addEventListener('input', (e) => (doc.followUp = e.target.value));
    app.querySelectorAll('[data-m]').forEach((inp) => inp.addEventListener('input', (e) => (doc.meds[inp.dataset.m][inp.dataset.k] = e.target.value)));
    app.querySelectorAll('[data-r]').forEach((inp) => inp.addEventListener('input', (e) => (doc.results[inp.dataset.r][inp.dataset.k] = e.target.value)));
    app.querySelectorAll('[data-mtime]').forEach((b) => b.addEventListener('click', () => { const m = doc.meds[b.dataset.mtime]; const s = b.dataset.slot; m.times = m.times.includes(s) ? m.times.filter((x) => x !== s) : [...m.times, s]; b.classList.toggle('sel'); }));
    app.querySelectorAll('[data-rmmed]').forEach((b) => b.addEventListener('click', () => { doc.meds.splice(+b.dataset.rmmed, 1); renderAddDoc(id); }));
    app.querySelectorAll('[data-rmres]').forEach((b) => b.addEventListener('click', () => { doc.results.splice(+b.dataset.rmres, 1); renderAddDoc(id); }));
    $('#add-med').addEventListener('click', () => { doc.meds.push({ name: '', dose: '', durationDays: '', times: [] }); renderAddDoc(id); });
    $('#add-res').addEventListener('click', () => { doc.results.push({ test: '', value: '', unit: '', rangeLow: '', rangeHigh: '' }); renderAddDoc(id); });
    $('#d-save').addEventListener('click', () => saveDocument(id, doc));
  }

  // doc detail delete
  $('#doc-del')?.addEventListener('click', () => { const parts = location.hash.split('/'); deleteDocument(parts[2], parts[4]); });

  // meds stop
  app.querySelectorAll('[data-stop]').forEach((b) => b.addEventListener('click', () => { const m = DB.medicines.find((x) => x.id === b.dataset.stop); if (m) { m.active = false; m.endDate = todayISO(); save(); route(); } }));

  // ask
  if ($('#ask-send')) {
    const id = location.hash.split('/')[2];
    const submit = (text) => { if (!text?.trim()) return; const res = askRecords(id, text); window.__chat.log.push({ role: 'user', text }); window.__chat.log.push({ role: 'bot', text: res.answer, sources: res.sources }); renderAsk(id); };
    $('#ask-send').addEventListener('click', () => submit($('#ask-input').value));
    $('#ask-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(e.target.value); });
    app.querySelectorAll('[data-ask]').forEach((b) => b.addEventListener('click', () => submit(b.dataset.ask)));
  }

  // summary print
  $('#print')?.addEventListener('click', () => window.print());

  // share / import
  $('#export-profile')?.addEventListener('click', () => exportProfile(location.hash.split('/')[2]));
  $('#import-file')?.addEventListener('change', (e) => previewImport(e.target.files[0]));

  // settings
  $('#export')?.addEventListener('click', exportData);
  $('#wipe')?.addEventListener('click', wipeData);

  // health info (in-browser model)
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
  if (d.id) Object.assign(getProfile(d.id), d);
  else { if (DB.profiles.length >= MAX_PROFILES) return flash('You already have 4 profiles.'); DB.profiles.push({ ...d, id: uid(), createdAt: todayISO() }); }
  save();
  go(d.id ? '#/profile/' + d.id : '#/');
}
function deleteProfile(id) {
  const p = getProfile(id);
  const typed = prompt(`This removes ALL documents, medicines and reminders for "${p.name}" from this browser. This cannot be undone.\n\nType the profile name to confirm:`);
  if (typed !== p.name) { if (typed !== null) flash('Name did not match. Nothing deleted.'); return; }
  DB.profiles = DB.profiles.filter((x) => x.id !== id);
  ['documents', 'medicines', 'results'].forEach((k) => (DB[k] = DB[k].filter((x) => x.profileId !== id)));
  save(); go('#/');
}
function saveDocument(pid, doc) {
  if (!doc.docDate) return flash('Please set a date.');
  const docId = uid();
  DB.documents.push({ id: docId, profileId: pid, type: doc.type, docDate: doc.docDate, doctor: doc.doctor, followUp: doc.followUp, createdAt: todayISO() });
  doc.meds.filter((m) => m.name.trim()).forEach((m) => DB.medicines.push({ id: uid(), profileId: pid, documentId: docId, name: m.name.trim(), dose: m.dose.trim(), times: m.times, durationDays: m.durationDays, startDate: doc.docDate, endDate: m.durationDays ? addDays(doc.docDate, +m.durationDays) : '', active: true }));
  doc.results.filter((r) => r.test.trim()).forEach((r) => DB.results.push({ id: uid(), profileId: pid, documentId: docId, docDate: doc.docDate, test: r.test.trim(), value: r.value.trim(), unit: r.unit.trim(), rangeLow: r.rangeLow, rangeHigh: r.rangeHigh }));
  save(); go('#/profile/' + pid);
}
function deleteDocument(pid, docId) {
  if (!confirm('Delete this document and everything read from it?')) return;
  DB.documents = DB.documents.filter((d) => d.id !== docId);
  DB.medicines = DB.medicines.filter((m) => m.documentId !== docId);
  DB.results = DB.results.filter((r) => r.documentId !== docId);
  save(); go('#/profile/' + pid + '/timeline');
}
function download(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}
function exportData() { download(DB, 'mednest-export.json'); }
function exportProfile(pid) {
  const p = getProfile(pid);
  const bundle = { kind: 'mednest-profile', version: 1, profile: p, documents: byProfile(DB.documents, pid), medicines: byProfile(DB.medicines, pid), results: byProfile(DB.results, pid) };
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
  // remap documents & children with fresh ids while preserving links
  const idMap = {};
  (data.documents || []).forEach((d) => { const nid = uid(); idMap[d.id] = nid; DB.documents.push({ ...d, id: nid, profileId: newPid }); });
  (data.medicines || []).forEach((m) => DB.medicines.push({ ...m, id: uid(), profileId: newPid, documentId: idMap[m.documentId] || null }));
  (data.results || []).forEach((r) => DB.results.push({ ...r, id: uid(), profileId: newPid, documentId: idMap[r.documentId] || null }));
  save(); go('#/profile/' + newPid);
}
function wipeData() {
  const t = prompt('This permanently deletes ALL profiles and records from this browser.\n\nType DELETE to confirm:');
  if (t === 'DELETE') { localStorage.removeItem(KEY); DB = load(); go('#/'); }
}
function flash(msg) { alert(msg); }

/* ============================== Health Info (in-browser open-source model) ============================== */
// Runs an open-source model fully in the browser via WebLLM (WebGPU). No API, no server,
// no account — the "on-device" model, web edition. General education only; refuses
// personal diagnosis/treatment. No internet access, so no web search.
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
    : `<div class="card">${esc(m.text)}</div>`).join('');
  let controls = '';
  if (w.status === 'idle') controls = `<button class="btn primary" id="hi-load">Load assistant (one-time ~1 GB download)</button><div class="caption" style="text-align:center;margin-top:6px">Runs fully in your browser. Needs a WebGPU browser (Chrome or Edge on desktop works best). Nothing is uploaded.</div>`;
  else if (w.status === 'loading') controls = `<div class="card"><div>Loading model…</div><div class="caption">${esc(w.progress)}</div></div>`;
  else if (w.status === 'nogpu') controls = `<div class="card" style="border-color:var(--warn)">This browser doesn't support WebGPU, so the in-browser model can't run here. Try Chrome or Edge on a desktop/laptop. (The native app uses the phone's own on-device model instead.)</div>`;
  else if (w.status === 'error') controls = `<div class="card" style="border-color:var(--danger)">Could not load the model: ${esc(w.progress)}</div><button class="btn secondary" id="hi-load">Try again</button>`;
  const inputRow = w.status === 'ready'
    ? `<div class="row" style="gap:8px;position:sticky;bottom:8px"><input id="hi-input" placeholder="Ask a general health question…" class="grow" ${w.busy ? 'disabled' : ''}/><button class="iconbtn" id="hi-send" style="background:var(--accent);color:var(--onAccent)">➤</button></div>`
    : '';
  render(`
    <div class="topbar"><button class="iconbtn back" data-go="#/">‹</button><h1>Health Info</h1></div>
    <div class="screen">
      <div class="card"><div class="caption">General health information only — not a diagnosis and not personal medical advice. Always discuss your own health with a doctor. This assistant has no internet access.</div></div>
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
  w.busy = true; renderHealthInfo();
  try {
    const messages = [{ role: 'system', content: HEALTH_SYS }, ...w.log.map((m) => ({ role: m.role, content: m.text }))];
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
  // onboarding gate (first run)
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
      case 'timeline': return screenTimeline(id);
      case 'meds': return screenMeds(id);
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

// Exported for off-device unit tests (ignored by the browser module loader).
export { askRecords, patternNotes, buildSummary, latestResults };
