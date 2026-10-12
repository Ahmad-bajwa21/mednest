// Document capture pipeline (spec §9.3, proposal §3–§4):
//   images -> kept in app-private storage (originals are ALWAYS retained)
//          -> OCR (on-device) -> Task A extraction (on-device model)
//          -> code validators (schema, copy-only, medicine match, frequency rules)
//          -> review screen, where every unsure field must be resolved by the user.
// Any failure degrades to manual entry with the images still attached — nothing is lost.
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { native } from '../native';
import { taskAPrompt, GENERATION } from '../ai/prompts';
import { processExtraction, type ReviewDocument } from '../ai/extract';
import type { MedicineEntry } from '../ai/medicineMatch';
import { readWithRules } from '../ai/ruleExtract';
import { DOCS_DIR } from '../data/files';

// TODO(data): bundle the launch-market medicine list (spec §8). Until then every
// medicine name is flagged "please check", which is the safe behaviour.
const MEDICINE_LIST: MedicineEntry[] = [];

export interface ScanOutcome {
  imagePaths: string[];
  ocrText: string;
  review: ReviewDocument | null;
  extractionJson: string | null;
  modelVersion: string | null;
  /** Why the automatic reading did not work, in plain words (null = it worked). */
  problem: string | null;
}



/** Copy picked/scanned images into the app's private folder so they outlive the cache. */
export async function retainImages(uris: string[]): Promise<string[]> {
  await FileSystem.makeDirectoryAsync(DOCS_DIR, { intermediates: true }).catch(() => undefined);
  const out: string[] = [];
  for (const uri of uris) {
    const ext = (uri.split('?')[0]!.match(/\.(jpe?g|png|webp|heic|pdf)$/i)?.[1] ?? 'jpg').toLowerCase();
    const dest = `${DOCS_DIR}${Crypto.randomUUID()}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    out.push(dest);
  }
  return out;
}

export async function readDocument(uris: string[]): Promise<ScanOutcome> {
  const imagePaths = await retainImages(uris);
  const base: ScanOutcome = { imagePaths, ocrText: '', review: null, extractionJson: null, modelVersion: null, problem: null };

  // 1. OCR, page by page.
  let ocrText = '';
  try {
    const pages = await Promise.all(imagePaths.filter((p) => !p.endsWith('.pdf')).map((p) => native.ocr.recognise(p)));
    ocrText = pages.map((p) => p.fullText).join('\n\n').trim();
  } catch {
    return { ...base, problem: 'We could not read the text on this page. You can retake the photo or fill in the details yourself.' };
  }
  if (ocrText.length < 12) {
    return { ...base, ocrText, problem: 'The photo looks blurry or has too little readable text. Please retake it in good light, or fill in the details yourself.' };
  }

  // 2. Extraction by the on-device model, then code validation. One retry on bad JSON.
  await native.foreground.start('Reading your document…').catch(() => undefined);
  try {
    await native.llm.ensureReady();
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await native.llm.generate(taskAPrompt(ocrText), { ...GENERATION, maxTokens: 1024 });
      const json = parseJsonLoose(raw);
      const res = processExtraction(json, ocrText, MEDICINE_LIST);
      if (res.ok && res.review) {
        return { ...base, ocrText, review: res.review, extractionJson: JSON.stringify(json), modelVersion: native.llm.modelVersion };
      }
    }
    return rulesFallback(base, ocrText);
  } catch {
    return rulesFallback(base, ocrText);
  } finally {
    await native.foreground.stop().catch(() => undefined);
    native.llm.release().catch(() => undefined);
  }
}

// Model unavailable or unusable: the rules reader copies what it can and flags every
// medicine field for the user, so nothing is scheduled unchecked.
function rulesFallback(base: ScanOutcome, ocrText: string): ScanOutcome {
  const r = readWithRules(ocrText);
  if (r) return { ...base, ocrText, review: r.review, extractionJson: JSON.stringify(r.extraction), modelVersion: 'rules-reader', problem: null };
  return { ...base, ocrText, problem: 'We could not understand this document automatically. Please fill in the details yourself — the photo is saved.' };
}

function parseJsonLoose(raw: string): unknown {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}
