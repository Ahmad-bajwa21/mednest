// Ask over a single profile's records (spec §6.4 Task D / §7.4). On-device this feeds
// retrieved chunks to the model; here (and on web) it is the rule-based path that handles
// "latest"/"how many" structured queries directly and refuses advice-seeking questions.
import { ADVICE_REFUSAL, isAdviceSeeking } from '../ai/adviceFilter';
import { activeMedicines, sortedResults, type ProfileBundle } from './types';
import { patternNotes } from './patterns';

export interface AskAnswer {
  answer: string;
  sources: string[]; // document ids
  refusal?: boolean;
}

export function askRecords(b: ProfileBundle, question: string): AskAnswer | null {
  const q = question.trim();
  if (!q) return null;
  if (isAdviceSeeking(q)) return { answer: ADVICE_REFUSAL, sources: [], refusal: true };

  const lower = q.toLowerCase();

  if (/\b(current|active|which) medicine|what (medicine|meds)|taking now\b/.test(lower)) {
    const meds = activeMedicines(b);
    return meds.length
      ? {
          answer: 'Active medicines: ' + meds.map((m) => `${m.name}${m.dose ? ' ' + m.dose : ''}`).join('; ') + '.',
          sources: [...new Set(meds.map((m) => m.documentId).filter((x): x is string => !!x))],
        }
      : { answer: 'No active medicines are recorded.', sources: [] };
  }

  const res = sortedResults(b);
  const testHit =
    res.find((r) => lower.includes(r.test.toLowerCase())) ||
    (/sugar|hba1c|glucose/.test(lower) ? res.find((r) => /hba1c|glucose|sugar/i.test(r.test)) : undefined);
  if (/last|latest|recent|when/.test(lower) && testHit) {
    return {
      answer: `The last ${testHit.test} was ${testHit.value ?? ''}${testHit.unit ? ' ' + testHit.unit : ''} on ${testHit.docDate ?? 'an unknown date'}.`,
      sources: testHit.documentId ? [testHit.documentId] : [],
    };
  }

  if (/what changed|this year|trend|pattern/.test(lower)) {
    const notes = patternNotes(b);
    return notes.length
      ? { answer: notes.map((n) => n.text).join(' '), sources: [...new Set(notes.flatMap((n) => n.sources))] }
      : { answer: 'No notable patterns found yet in the records.', sources: [] };
  }

  // Keyword fallback over documents + their meds/results.
  const words = lower.split(/\s+/).filter((w) => w.length > 2);
  const score = (t: string) => words.reduce((s, w) => s + (t.toLowerCase().includes(w) ? 1 : 0), 0);
  const ranked = b.documents
    .map((d) => {
      const meds = b.medicines.filter((m) => m.documentId === d.id).map((m) => m.name).join(' ');
      const rs = b.results.filter((r) => r.documentId === d.id).map((r) => `${r.test} ${r.value ?? ''}`).join(' ');
      return { d, s: score(`${d.type} ${d.doctor ?? ''} ${meds} ${rs}`) };
    })
    .filter((x) => x.s > 0)
    .sort((a, z) => z.s - a.s)
    .slice(0, 3);
  if (!ranked.length) return { answer: 'I could not find that in the records.', sources: [] };
  const top = ranked[0]!.d;
  return {
    answer: `Found in a ${top.type.toLowerCase()} from ${top.docDate ?? 'an unknown date'}${top.doctor ? ' (' + top.doctor + ')' : ''}. See the sources below.`,
    sources: ranked.map((x) => x.d.id),
  };
}
