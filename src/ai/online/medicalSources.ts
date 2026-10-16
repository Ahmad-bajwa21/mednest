// Live, free medical information from trusted public sources, fetched with the user's
// own internet connection (no API keys, no MedNest server):
//   - RxNorm (US National Library of Medicine): names, misspellings -> active ingredient
//   - MedlinePlus Connect (NIH): plain-language drug and health-topic summaries
//   - openFDA drug labels (US FDA): official uses, boxed warnings, interactions text
//   - NLM Clinical Tables: symptom/condition term -> ICD-10 code (for MedlinePlus)
//   - Wikipedia: general fallback, clearly labelled as an encyclopedia
// What is sent: only the search term (a medicine name or health topic). Results are
// shown WITH their source and link; they are general information, never a diagnosis
// or a personal dosing instruction. Text is copied from the sources, not generated.
import { identifyMedicine } from '../medicineInfo';

export type FetchFn = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export interface SourceRef {
  name: string;
  url: string;
}

export interface OnlineDrugInfo {
  query: string;
  generic: string | null;
  /** How sure we are that the name maps to this ingredient. */
  match: 'exact' | 'spelling' | 'possible' | 'rxnorm' | 'none';
  summary: string | null; // MedlinePlus (patient-friendly)
  fdaUses: string | null; // FDA label "indications and usage"
  boxedWarning: string | null;
  /** Other medicines of this patient that the FDA label's interaction section names. */
  interactionMentions: string[];
  sources: SourceRef[];
}

export interface OnlineTopicInfo {
  query: string;
  title: string | null;
  summary: string | null;
  sources: SourceRef[];
}

const RXNAV = 'https://rxnav.nlm.nih.gov/REST';
const CONNECT = 'https://connect.medlineplus.gov/service';
const FDA = 'https://api.fda.gov/drug/label.json';
const TABLES = 'https://clinicaltables.nlm.nih.gov/api/conditions/v3/search';
const WIKI = 'https://en.wikipedia.org';

const enc = encodeURIComponent;

async function getJson(fetchFn: FetchFn, url: string): Promise<any> {
  try {
    const r = await fetchFn(url);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const GENERIC = new Set(['pain', 'ache', 'aches', 'problem', 'problems', 'disease', 'symptom', 'symptoms', 'issue', 'condition', 'feeling', 'severe', 'chronic', 'acute', 'what', 'have']);
const MEDICAL = /(disease|disorder|condition|syndrome|infection|inflammat|medication|medicine|drug|symptom|pain|cancer|tumou?r|vitamin|hormone|virus|viral|bacteri|chronic|medical|clinical|organ|tissue|gland|treatment|therapy|injury|allergy|allergic|deficiency|blood|heart|lung|kidney|liver|skin|nerve|brain|bone|muscle|joint)w*/i;

/** Does a result title share a meaningful word with what was asked? */
export function relevant(query: string, title: string): boolean {
  const stem = (w: string) => w.slice(0, 5);
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERIC.has(w));
  if (!words.length) return false;
  const t = title.toLowerCase();
  return words.some((w) => t.includes(stem(w)));
}

/** Plain text from HTML-ish source text, trimmed to whole sentences within `max`. */
export function cleanText(raw: string | null | undefined, max = 600): string | null {
  if (!raw) return null;
  let t = raw
    .replace(/<\/li>\s*/gi, '; ') // keep list items apart: "blood clots; heart valves"
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\[\s*see [^\]]*\]/gi, '') // FDA cross-references "[see Warnings (5.1)]"
    .replace(/\(\s*\d+(\.\d+)*\s*\)/g, '') // section numbers "( 1.1 )"
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/;\s*([.;]|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(/^\d+(\.\d+)?\s+[A-Z][A-Z &]+[A-Z]\s+/, ''); // "1 INDICATIONS AND USAGE "
  if (t.length <= max) return t || null;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.'));
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…').trim();
}

/** Resolve a medicine name to its active ingredient (local brand list first, then RxNorm). */
export async function resolveIngredient(name: string, fetchFn: FetchFn): Promise<{ generic: string | null; match: OnlineDrugInfo['match'] }> {
  const local = identifyMedicine(name);
  if (local) return { generic: local.generic, match: local.certainty };
  const word = name.trim().split(/\s+/)[0] ?? name;
  const approx = await getJson(fetchFn, `${RXNAV}/approximateTerm.json?term=${enc(word)}&maxEntries=1`);
  const cand = approx?.approximateGroup?.candidate?.[0];
  if (!cand?.rxcui) return { generic: null, match: 'none' };
  const rel = await getJson(fetchFn, `${RXNAV}/rxcui/${enc(cand.rxcui)}/related.json?tty=IN`);
  const ing = rel?.relatedGroup?.conceptGroup?.find((g: any) => g.tty === 'IN')?.conceptProperties?.[0]?.name;
  return ing ? { generic: String(ing).toLowerCase(), match: 'rxnorm' } : { generic: null, match: 'none' };
}

/** Everything the public sources say about one medicine. */
export async function lookupMedicineOnline(name: string, fetchFn: FetchFn, otherGenerics: string[] = []): Promise<OnlineDrugInfo> {
  const { generic, match } = await resolveIngredient(name, fetchFn);
  const out: OnlineDrugInfo = { query: name, generic, match, summary: null, fdaUses: null, boxedWarning: null, interactionMentions: [], sources: [] };
  if (!generic) {
    const w = await wikipediaSummary(name, fetchFn);
    if (w.summary) {
      out.summary = w.summary;
      out.sources.push(...w.sources);
    }
    return out;
  }
  const [ids, label] = await Promise.all([
    getJson(fetchFn, `${RXNAV}/rxcui.json?name=${enc(generic)}&search=2`),
    getJson(fetchFn, `${FDA}?search=openfda.generic_name:%22${enc(generic)}%22&limit=1`),
  ]);
  const rxcui = ids?.idGroup?.rxnormId?.[0];
  if (rxcui) {
    const mp = await getJson(fetchFn, `${CONNECT}?mainSearchCriteria.v.cs=2.16.840.1.113883.6.88&mainSearchCriteria.v.c=${enc(rxcui)}&knowledgeResponseType=application/json`);
    const e = mp?.feed?.entry?.[0];
    if (e) {
      out.summary = cleanText(e.summary?._value, 600);
      out.sources.push({ name: 'MedlinePlus (US National Library of Medicine)', url: String(e.link?.[0]?.href ?? 'https://medlineplus.gov').split('?')[0]! });
    }
  }
  const r = label?.results?.[0];
  if (r) {
    out.fdaUses = cleanText(r.indications_and_usage?.[0], 450);
    out.boxedWarning = cleanText(r.boxed_warning?.[0], 350);
    const inter = String((r.drug_interactions ?? []).join(' ')).toLowerCase();
    out.interactionMentions = otherGenerics.filter((g) => g && g !== generic && new RegExp(`\\b${g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(inter));
    out.sources.push({ name: 'US FDA drug label (openFDA)', url: `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${enc(generic)}` });
  }
  if (!out.summary && !out.fdaUses) {
    const w = await wikipediaSummary(generic, fetchFn);
    if (w.summary) {
      out.summary = w.summary;
      out.sources.push(...w.sources);
    }
  }
  return out;
}

// Everyday words → the term MedlinePlus knows, and common topics → ICD-10 code, so
// "headaches", "stomach pain" or "anxiety" always reach the right MedlinePlus page.
const ALIASES: Record<string, string> = {
  headaches: 'headache', 'head ache': 'headache', 'head pain': 'headache', 'sar dard': 'headache', migraines: 'migraine',
  'stomach pain': 'abdominal pain', 'stomach ache': 'abdominal pain', stomachache: 'abdominal pain', 'tummy ache': 'abdominal pain', 'tummy pain': 'abdominal pain', 'belly pain': 'abdominal pain', 'pet dard': 'abdominal pain', 'abdominal pains': 'abdominal pain',
  anxious: 'anxiety', 'anxiety attack': 'panic attack', 'panic attacks': 'panic attack', depressed: 'depression', 'low mood': 'depression', stressed: 'stress',
  'high blood pressure': 'hypertension', bp: 'hypertension', 'blood pressure': 'hypertension', sugar: 'diabetes', 'blood sugar': 'diabetes', 'sugar disease': 'diabetes',
  acidity: 'heartburn', 'acid reflux': 'heartburn', gerd: 'heartburn', 'loose motion': 'diarrhea', 'loose motions': 'diarrhea', diarrhoea: 'diarrhea', vomiting: 'nausea and vomiting', nausea: 'nausea and vomiting',
  'sore throat': 'sore throat', 'common cold': 'cold', flu: 'influenza', fevers: 'fever', bukhar: 'fever', coughing: 'cough', khansi: 'cough', 'back ache': 'back pain', backache: 'back pain', 'kamar dard': 'back pain',
  dizzy: 'dizziness', 'cant sleep': 'insomnia', "can't sleep": 'insomnia', sleeplessness: 'insomnia', tired: 'fatigue', tiredness: 'fatigue', anaemia: 'anemia', 'urine infection': 'urinary tract infection', uti: 'urinary tract infection',
};
const ICD10: Record<string, string> = {
  headache: 'R51.9', migraine: 'G43.909', 'abdominal pain': 'R10.9', anxiety: 'F41.9', 'panic attack': 'F41.0', depression: 'F32.A', stress: 'F43.9', insomnia: 'G47.00',
  fever: 'R50.9', cough: 'R05.9', cold: 'J00', influenza: 'J11.1', 'sore throat': 'J02.9', diarrhea: 'R19.7', 'nausea and vomiting': 'R11.2', constipation: 'K59.00',
  'back pain': 'M54.9', dizziness: 'R42', 'chest pain': 'R07.9', fatigue: 'R53.83', rash: 'R21', heartburn: 'R12', gastritis: 'K29.70', hypertension: 'I10', diabetes: 'E11.9',
  asthma: 'J45.909', gout: 'M10.9', anemia: 'D64.9', 'high cholesterol': 'E78.5', cholesterol: 'E78.5', 'urinary tract infection': 'N39.0', typhoid: 'A01.00', dengue: 'A90', malaria: 'B54',
};

/** "Headaches" → "headache", "stomach pain" → "abdominal pain". */
export function canonicalTopic(term: string): string {
  const t = term.toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (ALIASES[t]) return ALIASES[t]!;
  if (ICD10[t]) return t;
  const singular = t.replace(/\b(\w{4,}?)(es|s)\b/g, (w, stem, end) => (/(diabetes|stress|abscess|lupus|herpes|measles|mumps|tetanus|rabies|scabies|piles)$/.test(w) ? w : end === 'es' && /(ch|sh|ss|x)$/.test(stem) ? stem : stem + (end === 'es' ? 'e' : '')));
  return ALIASES[singular] ?? singular;
}

/** A symptom or condition, from MedlinePlus (via its ICD-10 code), else Wikipedia. */
export async function lookupTopicOnline(term: string, fetchFn: FetchFn): Promise<OnlineTopicInfo> {
  const canonical = canonicalTopic(term);
  const known = ICD10[canonical];
  if (known) {
    const mp = await getJson(fetchFn, `${CONNECT}?mainSearchCriteria.v.cs=2.16.840.1.113883.6.90&mainSearchCriteria.v.c=${enc(known)}&knowledgeResponseType=application/json`);
    const e = mp?.feed?.entry?.[0];
    if (e?.summary?._value) {
      return {
        query: term,
        title: e.title?._value ?? canonical,
        summary: cleanText(e.summary._value, 700),
        sources: [{ name: 'MedlinePlus (US National Library of Medicine)', url: String(e.link?.[0]?.href ?? 'https://medlineplus.gov').split('?')[0]! }],
      };
    }
  }
  term = canonical;
  const t = await getJson(fetchFn, `${TABLES}?terms=${enc(term)}&df=primary_name,icd10cm_codes&maxList=3`);
  const rows: Array<[string, string]> = Array.isArray(t?.[3]) ? t[3] : [];
  for (const [title, codes] of rows) {
    const code = String(codes ?? '').split(',')[0]?.trim();
    if (!code || !relevant(term, title)) continue; // e.g. "stomach pain" must not become an infant topic
    const mp = await getJson(fetchFn, `${CONNECT}?mainSearchCriteria.v.cs=2.16.840.1.113883.6.90&mainSearchCriteria.v.c=${enc(code)}&knowledgeResponseType=application/json`);
    const e = mp?.feed?.entry?.[0];
    if (e?.summary?._value) {
      return {
        query: term,
        title: e.title?._value ?? title,
        summary: cleanText(e.summary._value, 700),
        sources: [{ name: 'MedlinePlus (US National Library of Medicine)', url: String(e.link?.[0]?.href ?? 'https://medlineplus.gov').split('?')[0]! }],
      };
    }
  }
  const w = await wikipediaSummary(term, fetchFn);
  return { query: term, title: w.title, summary: w.summary, sources: w.sources };
}

export async function wikipediaSummary(term: string, fetchFn: FetchFn): Promise<OnlineTopicInfo> {
  const s = await getJson(fetchFn, `${WIKI}/w/api.php?action=query&list=search&srsearch=${enc(term)}&srlimit=1&format=json&origin=*`);
  const title = s?.query?.search?.[0]?.title;
  if (!title || !relevant(term, title)) return { query: term, title: null, summary: null, sources: [] };
  const p = await getJson(fetchFn, `${WIKI}/api/rest_v1/page/summary/${enc(String(title).replace(/ /g, '_'))}`);
  // Only medical articles ("so wru" must never return the Welsh Rugby Union).
  if (!MEDICAL.test(`${p?.description ?? ''} ${String(p?.extract ?? '').slice(0, 300)}`)) return { query: term, title: null, summary: null, sources: [] };
  const summary = cleanText(p?.extract, 600);
  return summary
    ? { query: term, title, summary, sources: [{ name: 'Wikipedia (general encyclopedia — less authoritative)', url: p?.content_urls?.desktop?.page ?? `${WIKI}/wiki/${enc(title)}` }] }
    : { query: term, title: null, summary: null, sources: [] };
}

/** Readable block for chat: what each source says, with links, labelled as general. */
export function renderDrugInfo(d: OnlineDrugInfo, displayName: string): string {
  const L: string[] = [];
  const name = displayName.charAt(0).toUpperCase() + displayName.slice(1);
  if (!d.summary && !d.fdaUses) return `I couldn’t find ${name} in the online medicine sources. Please check the name on the box, or ask a pharmacist.`;
  const ing = d.generic && d.generic.toLowerCase() !== displayName.toLowerCase() ? ` (active ingredient: ${d.generic})` : '';
  L.push(`From trusted online sources about ${name}${ing}:`);
  if (d.match === 'possible') L.push(`⚠ “${displayName}” isn’t an exact match — this is about ${d.generic}. Please confirm the name on the box.`);
  if (d.summary) L.push(`• ${d.summary}`);
  if (d.fdaUses) L.push(`• FDA label — uses: ${d.fdaUses}`);
  if (d.boxedWarning) L.push(`⚠ FDA boxed warning: ${d.boxedWarning}`);
  if (d.interactionMentions.length) L.push(`⚠ The FDA label’s interaction section mentions ${d.interactionMentions.join(' and ')}, ${d.interactionMentions.length > 1 ? 'which are' : 'which is'} also in your records. Ask your doctor or pharmacist whether this combination is right for you.`);
  L.push('Sources:\n' + d.sources.map((s) => `• ${s.name}: ${s.url}`).join('\n'));
  L.push('General information from public sources — not a diagnosis, and not instructions for you. Follow your own prescription.');
  return L.join('\n');
}

export function renderTopicInfo(t: OnlineTopicInfo): string {
  if (!t.summary) return `I couldn’t find reliable information about “${t.query}” online.`;
  return [
    `From trusted online sources${t.title ? ` — ${t.title}` : ''}:`,
    `• ${t.summary}`,
    'Sources:\n' + t.sources.map((s) => `• ${s.name}: ${s.url}`).join('\n'),
    'General information — not a diagnosis. If you feel unwell, use “Check a symptom”.',
  ].join('\n');
}
