// Rules-based document reader: OCR text -> Task A shaped extraction, without a model.
// Used by the web build (no on-device model) and as the native fallback when the model
// is unavailable. It only COPIES text it finds; it never infers. Because pattern
// matching on OCR text is less reliable than a model, readWithRules() marks every
// medicine field and every result value "please check", so nothing reaches a schedule
// without the user confirming it against the paper.
import type { ExtractionA, ExtractedMedicine, ExtractedResult, DocType } from './extractionSchema';
import { processExtraction, type ReviewDocument } from './extract';
import { parseFollowUp } from '../domain/followUp';

const FORM = /^(?:\d+[.)]\s*)?(?:[-•*]\s*)?(tab(?:let)?s?|cap(?:sule)?s?|syp|syrup|susp(?:ension)?|inj(?:ection)?|drops?|cream|oint(?:ment)?|gel|sachet|inhaler)\b\.?\s*/i;
const DOSE = /\b\d+(?:\.\d+)?\s?(?:mg|mcg|µg|g|ml|iu|units?)\b(?:\s*\/\s*\d+(?:\.\d+)?\s?(?:mg|ml))?/i;
const FREQ = /\b(\d\s*[-+]\s*\d\s*[-+]\s*\d(?:\s*[-+]\s*\d)?|o\.?d\.?|b\.?d\.?|b\.?i\.?d\.?|t\.?d\.?s\.?|t\.?i\.?d\.?|q\.?d\.?s\.?|q\.?i\.?d\.?|h\.?s\.?|s\.?o\.?s\.?|p\.?r\.?n\.?|once (?:a day|daily)|twice (?:a day|daily)|thrice (?:a day|daily)|three times (?:a day|daily)|four times (?:a day|daily)|at (?:night|bedtime)|when required|as needed)(?=\s|$|[,;.])/i;
const DURATION = /(?:x|×|for)\s*(\d{1,3})\s*(days?|d\b|weeks?|wks?|w\b|months?)/i;
const INSTRUCTION = /\b((?:before|after|with)\s+(?:meals?|food|breakfast|lunch|dinner)|empty stomach|at bedtime)\b/i;
const FOLLOW = /\b(follow[- ]?up|review|revisit|re-?visit|come back|next visit|f\/u)\b/i;
const RESULT = /^([A-Za-z][A-Za-z0-9 .()%/-]{1,32}?)\s*[:\-]?\s+(\d+(?:\.\d+)?)(?![\d.])\s*([A-Za-z%µ/][A-Za-z0-9%µ/.^]*)?\s*\(?\s*(\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?)\s*\)?/;

function classify(t: string): DocType {
  if (/discharge summary|date of discharge|discharged on/i.test(t)) return 'discharge_summary';
  if (/(ultrasound|x-ray|xray|ct scan|mri|sonography|impression:)/i.test(t)) return 'scan_report';
  if (/(reference range|normal range|hba1c|haemoglobin|hemoglobin|glucose|cholesterol|creatinine|test result|laboratory)/i.test(t)) return 'lab_report';
  if (/(\brx\b|^\s*(tab|cap|syp|inj)\b|prescription)/im.test(t) || (DOSE.test(t) && FREQ.test(t))) return 'prescription';
  if (/(invoice|receipt|bill no|amount due|total\s*(rs|pkr))/i.test(t)) return 'bill';
  return 'other';
}

function firstDate(lines: string[]): { date: string | null; unsure: boolean } {
  for (const line of lines) {
    if (FOLLOW.test(line)) continue; // a follow-up date is not the document date
    const p = parseFollowUp(line);
    if (p.kind === 'absolute') return { date: p.date, unsure: p.ambiguous };
  }
  return { date: null, unsure: true };
}

function medicineFrom(line: string): ExtractedMedicine | null {
  const form = line.match(FORM);
  const dose = line.match(DOSE);
  const freq = line.match(FREQ);
  if (!form && !(dose && freq)) return null;
  let rest = form ? line.slice(form[0].length) : line;
  const cut = [dose?.index, freq ? rest.search(FREQ) : -1].map((i) => (i === undefined ? -1 : i)).filter((i) => i > 0);
  if (dose) {
    const di = rest.search(DOSE);
    if (di > 0) cut.push(di);
  }
  const end = cut.length ? Math.min(...cut) : rest.length;
  rest = rest.slice(0, end).replace(/[-–:,]+\s*$/, '').trim();
  const name = rest.split(/\s+/).slice(0, 4).join(' ') || null;
  const dur = line.match(DURATION);
  let durationDays: number | null = null;
  if (dur) {
    const n = parseInt(dur[1]!, 10);
    const u = dur[2]!.toLowerCase();
    durationDays = u.startsWith('w') ? n * 7 : u.startsWith('m') ? null : n; // months are left for the user
  }
  return {
    name,
    dose: dose ? dose[0] : null,
    frequency: freq ? freq[0] : null,
    duration_days: durationDays,
    instructions: line.match(INSTRUCTION)?.[0] ?? null,
  };
}

const META_LINE = /^(date|patient|name|age|sex|gender|ref(?:erred)?|mr ?no|lab ?no|sample)\b/i;

function resultFrom(line: string): ExtractedResult | null {
  if (META_LINE.test(line) || /\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line)) return null;
  const m = line.match(RESULT);
  if (!m) return null;
  return { test: m[1]!.trim(), value: m[2]!, unit: m[3] ?? null, range: m[4]!.replace(/\s+/g, '') };
}

export function ruleExtract(ocrText: string): ExtractionA {
  const lines = ocrText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const type = classify(ocrText);
  const { date, unsure: dateUnsure } = firstDate(lines);
  // Name words are Capitalised (degrees like MBBS/FCPS are all caps and stop the match).
  const doctor = ocrText.match(/\bDr\.? ?[A-Z](?:[a-z]+|\.)(?: [A-Z](?:[a-z]+|\.)){0,2}/)?.[0] ?? null;
  const patient = ocrText.match(/\b(?:patient(?:'s)?(?: name)?|name)\s*[:\-]\s*([A-Za-z][A-Za-z .]{1,40})/i)?.[1]?.trim() ?? null;
  const diagnosis = ocrText.match(/\b(?:diagnosis|dx|provisional diagnosis)\s*[:\-]\s*(.+)/i)?.[1]?.trim() ?? null;
  const followLine = lines.find((l) => FOLLOW.test(l));
  const follow = followLine ? followLine.replace(/^.*?\b(follow[- ]?up|review|revisit|re-?visit|come back|next visit|f\/u)\b\s*[:\-]?\s*/i, '$1 ').trim() : null;

  const medicines = type === 'lab_report' ? [] : lines.filter((l) => !FOLLOW.test(l)).map(medicineFrom).filter((m): m is ExtractedMedicine => !!m?.name);
  const results = type === 'lab_report' ? lines.map(resultFrom).filter((r): r is ExtractedResult => !!r) : [];

  const unsure: string[] = [];
  if (dateUnsure) unsure.push('date');
  return { type, patient_name: patient, date, doctor, diagnosis_written: diagnosis, medicines, results, follow_up: follow, unsure };
}

/** Rules reader + the standard validators, with every medicine field and result value flagged. */
export function readWithRules(ocrText: string): { review: ReviewDocument; extraction: ExtractionA } | null {
  const extraction = ruleExtract(ocrText);
  const out = processExtraction(extraction, ocrText, []);
  if (!out.ok || !out.review) return null;
  const review: ReviewDocument = {
    ...out.review,
    medicines: out.review.medicines.map((m) => ({ ...m, nameUnsure: true, doseUnsure: true, frequencyUnsure: true })),
    results: out.review.results.map((r) => ({ ...r, valueUnsure: true })),
  };
  review.hasUnresolved = review.dateUnsure || review.medicines.length > 0 || review.results.length > 0;
  return { review, extraction };
}
