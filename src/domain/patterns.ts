// Pattern-note detection (spec §7.3). RULES IN CODE; the model only phrases the result.
// A note states what the records show — never names a disease the documents don't name,
// never suggests treatment. Max 5, most recent first. Each ends "Discuss with your doctor."
import { addDays, toNum, type ProfileBundle } from './types';

export interface PatternNote {
  kind: string;
  text: string;
  sources: string[]; // document ids
}

export function patternNotes(b: ProfileBundle): PatternNote[] {
  const notes: PatternNote[] = [];
  const tests = [...new Set(b.results.map((r) => r.test))];

  for (const t of tests) {
    const series = b.results
      .filter((r) => r.test === t && toNum(r.value) != null)
      .sort((a, z) => (a.docDate ?? '').localeCompare(z.docDate ?? ''));

    if (series.length >= 3) {
      const vals = series.map((r) => toNum(r.value)!);
      const rising = vals.every((v, i) => i === 0 || v > vals[i - 1]!);
      const falling = vals.every((v, i) => i === 0 || v < vals[i - 1]!);
      if (rising || falling) {
        notes.push({
          kind: 'trend',
          text: `${t} has ${rising ? 'risen' : 'fallen'} across the last ${vals.length} readings (${vals.join(', ')}).`,
          sources: series.map((r) => r.documentId!).filter(Boolean),
        });
      }
    }

    const oor = series.filter((r) => {
      const v = toNum(r.value);
      return v != null && ((r.rangeLow != null && v < r.rangeLow) || (r.rangeHigh != null && v > r.rangeHigh));
    });
    if (oor.length >= 2) {
      notes.push({
        kind: 'out_of_range',
        text: `${t} has been outside the report's range in ${oor.length} tests.`,
        sources: oor.map((r) => r.documentId!).filter(Boolean),
      });
    }
  }

  // Repeated prescriptions: same name 3+ times in 12 months.
  const byName: Record<string, typeof b.medicines> = {};
  b.medicines.forEach((m) => ((byName[m.name.toLowerCase()] ||= []).push(m)));
  const cutoff = addDays(new Date().toISOString().slice(0, 10), -365);
  for (const group of Object.values(byName)) {
    const recent = group.filter((m) => m.startDate && m.startDate >= cutoff);
    if (recent.length >= 3) {
      notes.push({
        kind: 'repeat_rx',
        text: `${group[0]!.name} was prescribed ${recent.length} times in the last 12 months.`,
        sources: recent.map((m) => m.documentId!).filter(Boolean),
      });
    }
  }

  // Many prescribers: 3+ distinct doctors among active meds' documents.
  const activeDocs = b.medicines
    .filter((m) => m.active !== false)
    .map((m) => b.documents.find((d) => d.id === m.documentId))
    .filter((d): d is NonNullable<typeof d> => !!d);
  const doctors = [...new Set(activeDocs.map((d) => (d.doctor ?? '').trim().toLowerCase()).filter(Boolean))];
  if (doctors.length >= 3) {
    notes.push({
      kind: 'many_prescribers',
      text: `Active medicines come from ${doctors.length} different doctors.`,
      sources: activeDocs.map((d) => d.id),
    });
  }

  return notes.slice(0, 5);
}
