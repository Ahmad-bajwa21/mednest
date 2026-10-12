// Template-built living summary (spec §5.2). This is the no-model fallback that keeps
// the summary card never-empty (RULE), and is reused on web. The model version only
// rephrases these same facts — it never invents conditions.
import { activeMedicines, sortedResults, type ProfileBundle } from './types';

export function age(birthYear?: number | null): number | null {
  return birthYear ? new Date().getFullYear() - birthYear : null;
}

export function buildSummary(b: ProfileBundle): string {
  if (b.documents.length === 0) return 'No records yet. Add a document to start this summary.';
  const parts: string[] = [];
  const a = age(b.profile.birthYear);
  const sex = b.profile.sex && b.profile.sex !== '-' ? b.profile.sex : '';
  if (a != null) parts.push(`${a} years${sex ? ', ' + sex : ''}.`);
  const meds = activeMedicines(b);
  if (meds.length) {
    const names = meds.slice(0, 2).map((m) => m.name).join(', ');
    parts.push(`${meds.length} active medicine${meds.length > 1 ? 's' : ''}${names ? ' (' + names + ')' : ''}.`);
  }
  const r = sortedResults(b)[0];
  if (r) parts.push(`Last ${r.test} ${r.value ?? ''}${r.unit ? ' ' + r.unit : ''}.`);
  if (b.profile.allergies) parts.push(`Allergy: ${b.profile.allergies}.`);
  return parts.join(' ') || 'Records added.';
}
