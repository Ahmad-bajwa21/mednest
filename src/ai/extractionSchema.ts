// Task A output schema + validator (spec §6.4). The model returns JSON; code validates
// it against this schema and retries once on failure. Hand-rolled (no runtime dep) so
// it is trivially unit-testable off-device.

export type DocType = 'prescription' | 'lab_report' | 'scan_report' | 'discharge_summary' | 'bill' | 'other';
export const DOC_TYPES: DocType[] = ['prescription', 'lab_report', 'scan_report', 'discharge_summary', 'bill', 'other'];

export interface ExtractedMedicine {
  name: string | null;
  dose: string | null;
  frequency: string | null;
  duration_days: number | null;
  instructions: string | null;
}

export interface ExtractedResult {
  test: string | null;
  value: string | null;
  unit: string | null;
  range: string | null;
}

export interface ExtractionA {
  type: DocType;
  patient_name: string | null;
  date: string | null; // YYYY-MM-DD
  doctor: string | null;
  diagnosis_written: string | null;
  medicines: ExtractedMedicine[];
  results: ExtractedResult[];
  follow_up: string | null;
  unsure: string[];
}

export interface ValidationResult {
  ok: boolean;
  value?: ExtractionA;
  errors: string[];
}

const isStrOrNull = (v: unknown) => v === null || typeof v === 'string';
const isNumOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v));

export function validateExtractionA(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null) {
    return { ok: false, errors: ['root is not an object'] };
  }
  const o = input as Record<string, unknown>;

  if (!DOC_TYPES.includes(o.type as DocType)) errors.push(`type must be one of ${DOC_TYPES.join('|')}`);
  if (!isStrOrNull(o.patient_name)) errors.push('patient_name must be string|null');
  if (!isStrOrNull(o.date)) errors.push('date must be string|null');
  else if (o.date && !/^\d{4}-\d{2}-\d{2}$/.test(o.date as string)) errors.push('date must be YYYY-MM-DD');
  if (!isStrOrNull(o.doctor)) errors.push('doctor must be string|null');
  if (!isStrOrNull(o.diagnosis_written)) errors.push('diagnosis_written must be string|null');
  if (!isStrOrNull(o.follow_up)) errors.push('follow_up must be string|null');

  if (!Array.isArray(o.medicines)) errors.push('medicines must be an array');
  else {
    o.medicines.forEach((m, i) => {
      if (typeof m !== 'object' || m === null) return errors.push(`medicines[${i}] not an object`);
      const mm = m as Record<string, unknown>;
      if (!isStrOrNull(mm.name)) errors.push(`medicines[${i}].name must be string|null`);
      if (!isStrOrNull(mm.dose)) errors.push(`medicines[${i}].dose must be string|null`);
      if (!isStrOrNull(mm.frequency)) errors.push(`medicines[${i}].frequency must be string|null`);
      if (!isNumOrNull(mm.duration_days)) errors.push(`medicines[${i}].duration_days must be number|null`);
      if (!isStrOrNull(mm.instructions)) errors.push(`medicines[${i}].instructions must be string|null`);
    });
  }

  if (!Array.isArray(o.results)) errors.push('results must be an array');
  else {
    o.results.forEach((r, i) => {
      if (typeof r !== 'object' || r === null) return errors.push(`results[${i}] not an object`);
      const rr = r as Record<string, unknown>;
      if (!isStrOrNull(rr.test)) errors.push(`results[${i}].test must be string|null`);
      if (!isStrOrNull(rr.value)) errors.push(`results[${i}].value must be string|null`);
      if (!isStrOrNull(rr.unit)) errors.push(`results[${i}].unit must be string|null`);
      if (!isStrOrNull(rr.range)) errors.push(`results[${i}].range must be string|null`);
    });
  }

  if (!Array.isArray(o.unsure) || !(o.unsure as unknown[]).every((x) => typeof x === 'string')) {
    errors.push('unsure must be string[]');
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: input as ExtractionA, errors: [] };
}
