// Post-processing pipeline for Task A output (spec §6.4). After the model answers,
// CODE does the safety work:
//   1. validate JSON schema
//   2. copy-only check — every name/number must appear in the OCR text, else unsure
//   3. medicine fuzzy-match against the bundled list (0 or >1 close => unsure)
//   4. frequency shorthand -> time slots via rules
// The result feeds the review screen (S9), where nothing is saved until the user
// confirms and every unresolved "unsure" field blocks Confirm.
import { validateExtractionA, type ExtractionA } from './extractionSchema';
import { valueIsGrounded } from './copyOnly';
import { matchMedicine, type MedicineEntry, type MatchResult } from './medicineMatch';
import { parseFrequency, type Slot } from './frequency';

export interface ReviewMedicine {
  name: string | null;
  nameUnsure: boolean;
  match: MatchResult;
  dose: string | null;
  doseUnsure: boolean;
  frequencyRaw: string | null;
  slots: Slot[];
  frequencyUnsure: boolean;
  durationDays: number | null;
  instructions: string | null;
}

export interface ReviewResult {
  test: string | null;
  value: string | null;
  valueUnsure: boolean;
  unit: string | null;
  range: string | null;
}

export interface ReviewDocument {
  type: ExtractionA['type'];
  patientName: string | null;
  date: string | null;
  dateUnsure: boolean;
  doctor: string | null;
  diagnosisWritten: string | null;
  followUp: string | null;
  medicines: ReviewMedicine[];
  results: ReviewResult[];
  // true when at least one field is unsure — Confirm stays blocked until resolved.
  hasUnresolved: boolean;
}

export interface ProcessOutcome {
  ok: boolean;
  errors: string[];
  review?: ReviewDocument;
}

export function processExtraction(modelOutput: unknown, ocrText: string, medicineList: MedicineEntry[]): ProcessOutcome {
  const v = validateExtractionA(modelOutput);
  if (!v.ok || !v.value) return { ok: false, errors: v.errors };
  const a = v.value;
  const modelUnsure = new Set(a.unsure.map((s) => s.toLowerCase()));

  // The date is a legitimate reformat (e.g. "12 Sep 2026" -> "2026-09-12"), so the
  // numeric copy-only check does not apply. It is flagged only when missing or when the
  // model itself was unsure; the user always sees and can edit it on the review screen.
  const dateUnsure = !a.date || modelUnsure.has('date');

  const medicines: ReviewMedicine[] = a.medicines.map((m) => {
    const nameGrounded = valueIsGrounded(m.name, ocrText);
    const match = m.name ? matchMedicine(m.name, medicineList) : { status: 'none' as const, candidates: [] };
    const freq = parseFrequency(m.frequency);
    return {
      name: m.name,
      nameUnsure: !nameGrounded || match.status === 'unsure' || match.status === 'none',
      match,
      dose: m.dose,
      doseUnsure: !valueIsGrounded(m.dose, ocrText),
      frequencyRaw: m.frequency,
      slots: freq.slots,
      frequencyUnsure: !!m.frequency && !freq.recognised && !freq.asNeeded,
      durationDays: m.duration_days,
      instructions: m.instructions,
    };
  });

  const results: ReviewResult[] = a.results.map((r) => ({
    test: r.test,
    value: r.value,
    valueUnsure: !valueIsGrounded(r.value, ocrText),
    unit: r.unit,
    range: r.range,
  }));

  const hasUnresolved =
    dateUnsure ||
    medicines.some((m) => m.nameUnsure || m.doseUnsure || m.frequencyUnsure) ||
    results.some((r) => r.valueUnsure);

  return {
    ok: true,
    errors: [],
    review: {
      type: a.type,
      patientName: a.patient_name,
      date: a.date,
      dateUnsure,
      doctor: a.doctor,
      diagnosisWritten: a.diagnosis_written,
      followUp: a.follow_up,
      medicines,
      results,
      hasUnresolved,
    },
  };
}
