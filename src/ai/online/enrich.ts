// Decides when an answer should be enriched with live information from trusted public
// sources, and what to look up. Shared by the web app and the Android app.
// Records are used to personalise the lookup (which medicines to look up, and which of
// the patient's other medicines to check in the FDA label's interaction section); only
// medicine names / topic words are sent to the public services.
import { identifyMedicine } from '../medicineInfo';
import { lookupMedicineOnline, lookupTopicOnline, renderDrugInfo, renderTopicInfo, type FetchFn } from './medicalSources';

export type EnrichPlan =
  | { kind: 'drug'; names: string[]; otherGenerics: string[] }
  | { kind: 'topic'; term: string }
  | null;

interface MedLike {
  id: string;
  name: string;
}

const STOP = /\b(what|whats|what's|is|are|was|the|a|an|of|for|about|tell|me|explain|please|my|i|do|does|can|could|how|why|it|this|that|these|those|they|them|should|know|more|information|info|on|in|to|and|with|have|has|you|symptoms?|causes?|signs?|treatment|treat|meaning|mean|define|definition|kya|hai|hota)\b/g;

/** The health topic in a free question ("what are the symptoms of gout?" -> "gout"). */
export function topicOf(question: string): string | null {
  const t = question.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(STOP, ' ').replace(/\s+/g, ' ').trim();
  return t.length >= 3 && t.split(' ').length <= 4 ? t : null;
}

export function planEnrichment(
  question: string,
  answer: string,
  meds: MedLike[],
  ctx: { lastMedicineId?: string | null; replyMedicineId?: string | null },
): EnrichPlan {
  const q = ` ${question.toLowerCase()} `;
  const wantsInfo = /\b(what|why|for|about|side ?effects?|warnings?|interact\w*|safe|tell|explain|use|used|kya)\b/.test(q);
  const otherGenerics = [...new Set(meds.map((m) => identifyMedicine(m.name)?.generic).filter((g): g is string => !!g))];

  // 1. The patient's own medicines named in the question (or "it" / the one just discussed).
  let targets = meds.filter((m) => {
    const first = m.name.toLowerCase().split(/\s+/)[0] ?? '';
    return first.length >= 3 && q.includes(first);
  });
  if (!targets.length && /\b(it|this|that)\b/.test(q) && ctx.lastMedicineId) targets = meds.filter((m) => m.id === ctx.lastMedicineId);
  if (!targets.length && ctx.replyMedicineId) targets = meds.filter((m) => m.id === ctx.replyMedicineId);
  if (/\b(these|them|they|all|both|collectively|my medicines|my meds)\b/.test(q) && meds.length > 1) targets = meds;
  if (targets.length && wantsInfo) return { kind: 'drug', names: targets.slice(0, 4).map((m) => m.name), otherGenerics };

  // 2. A medicine that is not in the records ("what is panadol?").
  const word = question.toLowerCase().split(/[^a-z0-9-]+/).find((w) => w.length >= 4 && identifyMedicine(w) && identifyMedicine(w)!.certainty !== 'possible');
  if (word && wantsInfo) return { kind: 'drug', names: [word], otherGenerics };

  // 3. A general health question, or one the records could not answer.
  const couldNotAnswer = /couldn’t find|could not find|can’t identify/.test(answer);
  const generalQuestion = /^\s*(what (is|are)|tell me about|explain|symptoms? of|causes? of|signs? of|how (is|are|do)|what causes|kya hai)\b/.test(question.toLowerCase());
  if (couldNotAnswer || generalQuestion) {
    const term = topicOf(question);
    if (term) return { kind: 'topic', term };
  }
  return null;
}

/** Run a plan and return chat-ready text (null when nothing reliable was found). */
export async function runEnrichment(plan: EnrichPlan, fetchFn: FetchFn): Promise<string | null> {
  if (!plan) return null;
  if (plan.kind === 'topic') {
    const t = await lookupTopicOnline(plan.term, fetchFn);
    return t.summary ? renderTopicInfo(t) : null;
  }
  const parts: string[] = [];
  for (const name of plan.names) {
    const d = await lookupMedicineOnline(name, fetchFn, plan.otherGenerics);
    if (d.summary || d.fdaUses) parts.push(renderDrugInfo(d, name.split(/\s+/)[0]!));
  }
  return parts.length ? parts.join('\n\n') : null;
}
