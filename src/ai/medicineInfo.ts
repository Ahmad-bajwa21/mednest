// Curated general information about common medicines, for "what is this medicine for?"
// questions in Ask. Fixed text written in code — the model never generates medicine
// information. It describes what a medicine is COMMONLY used for; the reason it was
// prescribed for this person comes only from their own documents.
//
// CLINICAL REVIEW REQUIRED: every entry is a DRAFT for pharmacist/clinician sign-off.
// Brand names are common Pakistan-market brands (launch market); extend per market.
import { levenshtein } from './medicineMatch';

export const MEDICINE_INFO_VERSION = 'medinfo-0.1-draft';

export interface MedicineInfo {
  /** Generic name first, then common brand names (lower case). */
  names: string[];
  /** Plain-language class, e.g. "a blood thinner (anticoagulant)". */
  what: string;
  /** What it is commonly used for. */
  commonUse: string;
  /** Important general safety note (high-risk medicines), if any. */
  note?: string;
}

export const MEDICINE_INFO: MedicineInfo[] = [
  { names: ['warfarin', 'coumadin', 'marevan'], what: 'a blood thinner (anticoagulant)', commonUse: 'to prevent or treat blood clots — for example with some heart rhythm problems, after heart valve replacement, or for clots in the legs or lungs', note: 'Warfarin needs regular INR blood tests. Many foods and medicines change how it works, so check with your doctor or pharmacist before starting anything new, and seek help quickly for unusual bleeding or bruising.' },
  { names: ['rivaroxaban', 'xarelto'], what: 'a blood thinner (anticoagulant)', commonUse: 'to prevent or treat blood clots, for example with some heart rhythm problems or clots in the legs or lungs', note: 'Seek help quickly for unusual bleeding. Tell any doctor or dentist that you take it.' },
  { names: ['apixaban', 'eliquis'], what: 'a blood thinner (anticoagulant)', commonUse: 'to prevent or treat blood clots, for example with some heart rhythm problems or clots in the legs or lungs', note: 'Seek help quickly for unusual bleeding. Tell any doctor or dentist that you take it.' },
  { names: ['clopidogrel', 'plavix', 'lowplat'], what: 'an antiplatelet medicine', commonUse: 'to help prevent heart attacks and strokes, often after a heart stent or a previous heart attack or stroke', note: 'Do not stop it without your doctor’s advice, especially after a stent.' },
  { names: ['aspirin', 'disprin', 'loprin', 'ascard'], what: 'a pain reliever that, in low doses, is an antiplatelet medicine', commonUse: 'in low doses, to help prevent heart attacks and strokes; in higher doses, for pain and fever' },
  { names: ['paracetamol', 'acetaminophen', 'panadol', 'calpol', 'tylenol'], what: 'a pain reliever and fever reducer', commonUse: 'for mild to moderate pain and for fever', note: 'Taking more than the prescribed amount can seriously harm the liver. Many cold and flu products also contain paracetamol.' },
  { names: ['ibuprofen', 'brufen', 'advil'], what: 'an anti-inflammatory pain reliever (NSAID)', commonUse: 'for pain, swelling and fever' },
  { names: ['diclofenac', 'voltaren', 'dicloran', 'arthrotec'], what: 'an anti-inflammatory pain reliever (NSAID)', commonUse: 'for pain and swelling, such as joint or muscle pain' },
  { names: ['colchicine', 'colchicin'], what: 'a medicine for gout', commonUse: 'to treat and prevent gout attacks, and sometimes for inflammation around the heart (pericarditis)', note: 'Taking more than prescribed is dangerous. Stop and tell your doctor if you get diarrhoea, vomiting or stomach pain.' },
  { names: ['naproxen', 'naprosyn'],what: 'an anti-inflammatory pain reliever (NSAID)', commonUse: 'for pain and swelling, such as joint pain' },
  { names: ['tramadol', 'tramal'], what: 'a strong pain reliever (opioid)', commonUse: 'for moderate to severe pain', note: 'It can cause drowsiness and dependence. Do not drive if it makes you sleepy.' },
  { names: ['omeprazole', 'risek', 'losec', 'omezol'], what: 'a stomach acid reducer (proton pump inhibitor)', commonUse: 'for heartburn, acid reflux, stomach ulcers and gastritis, and to protect the stomach' },
  { names: ['esomeprazole', 'nexium', 'esso'], what: 'a stomach acid reducer (proton pump inhibitor)', commonUse: 'for heartburn, acid reflux, stomach ulcers and gastritis' },
  { names: ['pantoprazole', 'pantra', 'protonix'], what: 'a stomach acid reducer (proton pump inhibitor)', commonUse: 'for heartburn, acid reflux, stomach ulcers and gastritis' },
  { names: ['famotidine', 'famot'], what: 'a stomach acid reducer (H2 blocker)', commonUse: 'for heartburn, acid reflux and stomach ulcers' },
  { names: ['domperidone', 'motilium'], what: 'an anti-sickness medicine', commonUse: 'for nausea, vomiting and bloating' },
  { names: ['ondansetron', 'zofran', 'onset'], what: 'an anti-sickness medicine', commonUse: 'to prevent or treat nausea and vomiting' },
  { names: ['metoclopramide', 'maxolon'], what: 'an anti-sickness medicine', commonUse: 'for nausea and vomiting' },
  { names: ['loperamide', 'imodium'], what: 'an anti-diarrhoea medicine', commonUse: 'to slow down diarrhoea' },
  { names: ['ors', 'oral rehydration salts', 'pedialyte'], what: 'oral rehydration salts', commonUse: 'to replace water and salts lost through diarrhoea or vomiting' },
  { names: ['metformin', 'glucophage', 'neodipar'], what: 'a diabetes medicine', commonUse: 'to lower blood sugar in type 2 diabetes' },
  { names: ['glimepiride', 'amaryl', 'getryl'], what: 'a diabetes medicine (sulfonylurea)', commonUse: 'to lower blood sugar in type 2 diabetes', note: 'It can cause low blood sugar (shakiness, sweating, confusion). Eat regular meals.' },
  { names: ['gliclazide', 'diamicron'], what: 'a diabetes medicine (sulfonylurea)', commonUse: 'to lower blood sugar in type 2 diabetes', note: 'It can cause low blood sugar (shakiness, sweating, confusion). Eat regular meals.' },
  { names: ['sitagliptin', 'januvia', 'janumet'], what: 'a diabetes medicine', commonUse: 'to lower blood sugar in type 2 diabetes' },
  { names: ['empagliflozin', 'jardiance'], what: 'a diabetes medicine (SGLT2 inhibitor)', commonUse: 'to lower blood sugar in type 2 diabetes; also used for some heart and kidney conditions' },
  { names: ['insulin', 'mixtard', 'lantus', 'humulin', 'novorapid'], what: 'insulin', commonUse: 'to control blood sugar in diabetes', note: 'It can cause low blood sugar (shakiness, sweating, confusion). Know how to treat a low.' },
  { names: ['amlodipine', 'norvasc', 'amlo'], what: 'a blood pressure medicine (calcium channel blocker)', commonUse: 'for high blood pressure and some types of chest pain (angina)' },
  { names: ['losartan', 'cozaar', 'eziday'], what: 'a blood pressure medicine (ARB)', commonUse: 'for high blood pressure, and to protect the kidneys in diabetes' },
  { names: ['valsartan', 'diovan'], what: 'a blood pressure medicine (ARB)', commonUse: 'for high blood pressure and heart failure' },
  { names: ['lisinopril', 'zestril'], what: 'a blood pressure medicine (ACE inhibitor)', commonUse: 'for high blood pressure and heart failure' },
  { names: ['captopril', 'capoten'], what: 'a blood pressure medicine (ACE inhibitor)', commonUse: 'for high blood pressure and heart failure' },
  { names: ['bisoprolol', 'concor'], what: 'a beta blocker', commonUse: 'for high blood pressure, heart failure and some heart rhythm problems', note: 'Do not stop it suddenly without your doctor’s advice.' },
  { names: ['atenolol', 'tenormin'], what: 'a beta blocker', commonUse: 'for high blood pressure and some heart rhythm problems', note: 'Do not stop it suddenly without your doctor’s advice.' },
  { names: ['propranolol', 'inderal'], what: 'a beta blocker', commonUse: 'for high blood pressure, fast heartbeat, migraine prevention and anxiety symptoms', note: 'Do not stop it suddenly without your doctor’s advice.' },
  { names: ['furosemide', 'lasix'], what: 'a water tablet (diuretic)', commonUse: 'to remove extra fluid, for example in heart failure, and for high blood pressure' },
  { names: ['hydrochlorothiazide', 'hctz'], what: 'a water tablet (diuretic)', commonUse: 'for high blood pressure and fluid build-up' },
  { names: ['spironolactone', 'aldactone'], what: 'a water tablet (diuretic)', commonUse: 'for heart failure, fluid build-up and some hormone conditions' },
  { names: ['atorvastatin', 'lipitor', 'atorva'], what: 'a cholesterol-lowering medicine (statin)', commonUse: 'to lower cholesterol and reduce the risk of heart attack and stroke' },
  { names: ['rosuvastatin', 'crestor', 'rovista'], what: 'a cholesterol-lowering medicine (statin)', commonUse: 'to lower cholesterol and reduce the risk of heart attack and stroke' },
  { names: ['simvastatin', 'zocor'], what: 'a cholesterol-lowering medicine (statin)', commonUse: 'to lower cholesterol and reduce the risk of heart attack and stroke' },
  { names: ['levothyroxine', 'thyroxine', 'euthyrox', 'synthroid'], what: 'a thyroid hormone', commonUse: 'to replace thyroid hormone when the thyroid is underactive (hypothyroidism)', note: 'It is usually taken on an empty stomach, as your doctor or pharmacist explains.' },
  { names: ['amoxicillin', 'amoxil'], what: 'an antibiotic (penicillin type)', commonUse: 'to treat bacterial infections such as chest, ear, throat and urine infections', note: 'Antibiotics work only against bacteria. Finish the course as prescribed. Tell your doctor if you are allergic to penicillin.' },
  { names: ['co-amoxiclav', 'amoxicillin clavulanate', 'augmentin', 'amclav'], what: 'an antibiotic (penicillin type)', commonUse: 'to treat bacterial infections such as chest, sinus, skin and urine infections', note: 'Finish the course as prescribed. Tell your doctor if you are allergic to penicillin.' },
  { names: ['azithromycin', 'azomax', 'zithromax'], what: 'an antibiotic (macrolide)', commonUse: 'to treat bacterial infections such as chest, throat and some skin infections, and typhoid', note: 'Finish the course as prescribed.' },
  { names: ['clarithromycin', 'klaricid'], what: 'an antibiotic (macrolide)', commonUse: 'to treat bacterial infections, and as part of treatment for the stomach bacterium H. pylori', note: 'Finish the course as prescribed.' },
  { names: ['ciprofloxacin', 'ciproxin', 'cipro'], what: 'an antibiotic (quinolone)', commonUse: 'to treat bacterial infections such as urine and gut infections', note: 'Finish the course as prescribed.' },
  { names: ['levofloxacin', 'leflox', 'levaquin'], what: 'an antibiotic (quinolone)', commonUse: 'to treat bacterial infections such as chest and urine infections', note: 'Finish the course as prescribed.' },
  { names: ['cefixime', 'cefspan', 'suprax'], what: 'an antibiotic (cephalosporin)', commonUse: 'to treat bacterial infections such as throat, urine infections and typhoid', note: 'Finish the course as prescribed.' },
  { names: ['ceftriaxone', 'rocephin'], what: 'an injectable antibiotic (cephalosporin)', commonUse: 'to treat more serious bacterial infections' },
  { names: ['metronidazole', 'flagyl'], what: 'an antibiotic and anti-parasite medicine', commonUse: 'to treat some gut infections (such as amoebic dysentery), dental and gynaecological infections', note: 'Avoid alcohol while taking it and for a couple of days after.' },
  { names: ['cetirizine', 'zyrtec', 'rigix'], what: 'an antihistamine (anti-allergy)', commonUse: 'for allergies such as hay fever, itchy skin and hives' },
  { names: ['loratadine', 'claritin'], what: 'an antihistamine (anti-allergy)', commonUse: 'for allergies such as hay fever and hives' },
  { names: ['fexofenadine', 'telfast', 'fexet'], what: 'an antihistamine (anti-allergy)', commonUse: 'for allergies such as hay fever and hives' },
  { names: ['chlorpheniramine', 'piriton', 'avil'], what: 'an antihistamine (anti-allergy)', commonUse: 'for allergies and itching', note: 'It can cause drowsiness.' },
  { names: ['montelukast', 'singulair', 'myteka'], what: 'an asthma and allergy medicine', commonUse: 'to help prevent asthma symptoms and for allergies' },
  { names: ['salbutamol', 'ventolin', 'albuterol'], what: 'a reliever inhaler (bronchodilator)', commonUse: 'to quickly open the airways during asthma or wheezing', note: 'If you need it much more often than usual, see a doctor.' },
  { names: ['prednisolone', 'deltacortril'], what: 'a steroid medicine', commonUse: 'to reduce inflammation, for example in asthma attacks, allergies and some joint or skin conditions', note: 'Do not stop a longer course suddenly without your doctor’s advice.' },
  { names: ['dexamethasone', 'decadron'], what: 'a steroid medicine', commonUse: 'to reduce inflammation and swelling in many conditions' },
  { names: ['sertraline', 'zoloft', 'serlift'], what: 'an antidepressant (SSRI)', commonUse: 'for depression, anxiety and some related conditions', note: 'It can take a few weeks to work. Do not stop suddenly without your doctor’s advice.' },
  { names: ['escitalopram', 'cipralex', 'citanew'], what: 'an antidepressant (SSRI)', commonUse: 'for depression and anxiety', note: 'It can take a few weeks to work. Do not stop suddenly without your doctor’s advice.' },
  { names: ['fluoxetine', 'prozac'], what: 'an antidepressant (SSRI)', commonUse: 'for depression and some related conditions', note: 'Do not stop suddenly without your doctor’s advice.' },
  { names: ['alprazolam', 'xanax'], what: 'a sedative (benzodiazepine)', commonUse: 'for short-term relief of severe anxiety', note: 'It can cause drowsiness and dependence. Do not drive if it makes you sleepy.' },
  { names: ['bromazepam', 'lexotanil'], what: 'a sedative (benzodiazepine)', commonUse: 'for short-term relief of severe anxiety', note: 'It can cause drowsiness and dependence.' },
  { names: ['gabapentin', 'neurontin', 'gabica'], what: 'a nerve pain and anti-seizure medicine', commonUse: 'for nerve pain and some types of seizures', note: 'It can cause drowsiness or dizziness.' },
  { names: ['pregabalin', 'lyrica'], what: 'a nerve pain medicine', commonUse: 'for nerve pain, and sometimes anxiety or seizures', note: 'It can cause drowsiness or dizziness.' },
  { names: ['vitamin d', 'cholecalciferol', 'sunny d', 'indrop d'], what: 'a vitamin supplement', commonUse: 'to treat or prevent low vitamin D and support bone health' },
  { names: ['calcium', 'cacit', 'os-cal'], what: 'a mineral supplement', commonUse: 'to support bone health or treat low calcium' },
  { names: ['ferrous sulfate', 'iron', 'fefol', 'sangobion'], what: 'an iron supplement', commonUse: 'to treat or prevent iron-deficiency anaemia' },
  { names: ['folic acid', 'folate'], what: 'a vitamin (B9) supplement', commonUse: 'before and during early pregnancy, and for some types of anaemia' },
];

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 -]/g, ' ').split(/\s+/).filter(Boolean);
}

/** Find general info for a medicine name as written on a record ("Tab. Risek 20mg"). */
export function lookupMedicineInfo(name: string | null | undefined): MedicineInfo | null {
  if (!name) return null;
  const text = ` ${words(name).join(' ')} `;
  // Exact word / phrase match first (multi-word names like "folic acid").
  for (const info of MEDICINE_INFO) if (info.names.some((n) => text.includes(` ${n} `))) return info;
  // Then a single typo for longer names (OCR or spelling), only if it is unambiguous.
  const hits = new Set<MedicineInfo>();
  for (const w of words(name)) {
    if (w.length < 6) continue;
    for (const info of MEDICINE_INFO) if (info.names.some((n) => !n.includes(' ') && n.length >= 6 && levenshtein(w, n) <= 1)) hits.add(info);
  }
  return hits.size === 1 ? [...hits][0]! : null;
}

export interface MedicineMatch {
  info: MedicineInfo;
  /** The name in our list that matched (brand or generic). */
  matched: string;
  /** Active ingredient (generic name). */
  generic: string;
  /** exact / one-letter spelling difference = same medicine; possible = please confirm. */
  certainty: 'exact' | 'spelling' | 'possible';
}

/**
 * Identify a medicine from the name as written. A two-letter difference (e.g. "Mitika"
 * vs the brand "Myteka") is returned as `possible`, so the user is asked to confirm the
 * name on the box or with a pharmacist instead of us assuming.
 */
export function identifyMedicine(name: string | null | undefined): MedicineMatch | null {
  if (!name) return null;
  const ws = words(name);
  const text = ` ${ws.join(' ')} `;
  for (const info of MEDICINE_INFO) {
    const n = info.names.find((x) => text.includes(` ${x} `));
    if (n) return { info, matched: n, generic: info.names[0]!, certainty: 'exact' };
  }
  for (const maxDist of [1, 2] as const) {
    const hits: Array<{ info: MedicineInfo; n: string }> = [];
    for (const w of ws) {
      if (w.length < (maxDist === 1 ? 6 : 5)) continue;
      for (const info of MEDICINE_INFO) {
        const n = info.names.find((x) => !x.includes(' ') && x.length >= 5 && Math.abs(x.length - w.length) <= maxDist && levenshtein(w, x) <= maxDist);
        if (n && !hits.some((h) => h.info === info)) hits.push({ info, n });
      }
    }
    if (hits.length === 1) return { info: hits[0]!.info, matched: hits[0]!.n, generic: hits[0]!.info.names[0]!, certainty: maxDist === 1 ? 'spelling' : 'possible' };
    if (hits.length > 1) return null; // ambiguous: do not pick one
  }
  return null;
}

/**
 * Usual amount PER DOSE for adults (generous ranges). Used only to ask the user to
 * double-check an entry that looks like a typo (e.g. colchicine "5 mg" instead of
 * "0.5 mg"). Never used to suggest a dose. CLINICAL REVIEW REQUIRED (draft).
 */
const USUAL_DOSE: Record<string, { min: number; max: number; unit: 'mg' | 'mcg' }> = {
  colchicine: { min: 0.5, max: 1.2, unit: 'mg' },
  warfarin: { min: 0.5, max: 15, unit: 'mg' },
  paracetamol: { min: 100, max: 1000, unit: 'mg' },
  ibuprofen: { min: 100, max: 800, unit: 'mg' },
  metformin: { min: 250, max: 1000, unit: 'mg' },
  glimepiride: { min: 0.5, max: 8, unit: 'mg' },
  amlodipine: { min: 2.5, max: 10, unit: 'mg' },
  losartan: { min: 12.5, max: 100, unit: 'mg' },
  bisoprolol: { min: 1.25, max: 10, unit: 'mg' },
  atorvastatin: { min: 10, max: 80, unit: 'mg' },
  rosuvastatin: { min: 5, max: 40, unit: 'mg' },
  omeprazole: { min: 10, max: 40, unit: 'mg' },
  esomeprazole: { min: 20, max: 40, unit: 'mg' },
  clopidogrel: { min: 75, max: 600, unit: 'mg' },
  aspirin: { min: 75, max: 1000, unit: 'mg' },
  levothyroxine: { min: 12.5, max: 300, unit: 'mcg' },
  amoxicillin: { min: 125, max: 1000, unit: 'mg' },
  'co-amoxiclav': { min: 375, max: 1000, unit: 'mg' },
  azithromycin: { min: 250, max: 500, unit: 'mg' },
  ciprofloxacin: { min: 250, max: 750, unit: 'mg' },
  metronidazole: { min: 200, max: 800, unit: 'mg' },
  prednisolone: { min: 1, max: 60, unit: 'mg' },
  tramadol: { min: 50, max: 100, unit: 'mg' },
};

/** A gentle "please check" when a recorded dose is outside the usual range, else null. */
export function doseCheck(name: string | null | undefined, dose: string | null | undefined): string | null {
  const info = lookupMedicineInfo(name);
  const m = dose?.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g)\b/);
  if (!info || !m) return null;
  const range = USUAL_DOSE[info.names[0]!];
  if (!range) return null;
  const v = parseFloat(m[1]!);
  const unit = m[2] === 'µg' ? 'mcg' : m[2]!;
  const inMg = unit === 'g' ? v * 1000 : unit === 'mcg' ? v / 1000 : v;
  const value = range.unit === 'mcg' ? inMg * 1000 : inMg;
  if (value >= range.min && value <= range.max) return null;
  const generic = info.names[0]!.charAt(0).toUpperCase() + info.names[0]!.slice(1);
  return `Please check the dose: ${generic} is usually ${range.min}–${range.max} ${range.unit} per dose, and “${dose}” is outside that. It may be a typo — compare it with the prescription or the box, and correct it in Meds if needed.`;
}
