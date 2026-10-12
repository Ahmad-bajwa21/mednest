// Plain domain shapes used by the pure logic (summary, patterns, trends, Ask).
// Decoupled from DB rows so the logic is trivially testable and reusable.

export interface ProfileLike {
  id: string;
  name: string;
  birthYear?: number | null;
  sex?: string | null;
  allergies?: string | null;
}
export interface DocumentLike {
  id: string;
  type: string;
  docDate?: string | null;
  doctor?: string | null;
  followUp?: string | null;
}
export interface MedicineLike {
  id: string;
  documentId?: string | null;
  name: string;
  dose?: string | null;
  times: string[];
  durationDays?: number | null;
  startDate?: string | null;
  active: boolean;
}
export interface ResultLike {
  id: string;
  documentId?: string | null;
  docDate?: string | null;
  test: string;
  value?: string | null;
  unit?: string | null;
  rangeLow?: number | null;
  rangeHigh?: number | null;
}

export interface ProfileBundle {
  profile: ProfileLike;
  documents: DocumentLike[];
  medicines: MedicineLike[];
  results: ResultLike[];
}

export const SLOT_CLOCK: Record<string, string> = {
  Morning: '8:00',
  Afternoon: '14:00',
  Evening: '18:00',
  Night: '21:00',
};

export function toNum(v: unknown): number | null {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
export function activeMedicines(b: ProfileBundle): MedicineLike[] {
  return b.medicines.filter((m) => m.active !== false);
}
export function sortedResults(b: ProfileBundle): ResultLike[] {
  return b.results.slice().sort((a, z) => (z.docDate ?? '').localeCompare(a.docDate ?? ''));
}
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
