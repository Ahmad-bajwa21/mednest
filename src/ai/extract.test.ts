import { validateExtractionA } from './extractionSchema';
import { processExtraction } from './extract';
import type { MedicineEntry } from './medicineMatch';

const LIST: MedicineEntry[] = [
  { id: 'metformin', name: 'Metformin' },
  { id: 'amaryl', name: 'Amaryl', generic: 'Glimepiride' },
];

const OCR = `Dr. S. Khan   12 Sep 2026
Metformin 500 mg 1-0-1 for 30 days
Review after 1 month`;

const goodModelOutput = {
  type: 'prescription',
  patient_name: null,
  date: '2026-09-12',
  doctor: 'Dr. S. Khan',
  diagnosis_written: null,
  medicines: [{ name: 'Metformin', dose: '500 mg', frequency: '1-0-1', duration_days: 30, instructions: null }],
  results: [],
  follow_up: 'Review after 1 month',
  unsure: [],
};

describe('validateExtractionA', () => {
  it('accepts a well-formed object', () => {
    expect(validateExtractionA(goodModelOutput).ok).toBe(true);
  });
  it('rejects a bad type and malformed date', () => {
    const r = validateExtractionA({ ...goodModelOutput, type: 'xray', date: '12/09/2026' });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
  it('rejects non-array medicines', () => {
    expect(validateExtractionA({ ...goodModelOutput, medicines: 'nope' }).ok).toBe(false);
  });
});

describe('processExtraction', () => {
  it('produces a clean review for grounded, matched data', () => {
    const r = processExtraction(goodModelOutput, OCR, LIST);
    expect(r.ok).toBe(true);
    const m = r.review!.medicines[0]!;
    expect(m.match.status).toBe('matched');
    expect(m.slots).toEqual(['Morning', 'Night']);
    expect(m.nameUnsure).toBe(false);
    expect(m.doseUnsure).toBe(false);
    expect(r.review!.hasUnresolved).toBe(false);
  });

  it('flags a hallucinated dose not present in OCR (blocks Confirm)', () => {
    const out = { ...goodModelOutput, medicines: [{ ...goodModelOutput.medicines[0]!, dose: '850 mg' }] };
    const r = processExtraction(out, OCR, LIST);
    expect(r.review!.medicines[0]!.doseUnsure).toBe(true);
    expect(r.review!.hasUnresolved).toBe(true);
  });

  it('flags an ungrounded (hallucinated) medicine name as unsure', () => {
    // "Insulin" is NOT in the OCR text, so the copy-only check must flag the name.
    const out = { ...goodModelOutput, medicines: [{ name: 'Insulin', dose: '500 mg', frequency: 'BD', duration_days: 30, instructions: null }] };
    const r = processExtraction(out, OCR, LIST);
    expect(r.review!.medicines[0]!.nameUnsure).toBe(true);
  });

  it('fails on invalid model output', () => {
    const r = processExtraction({ garbage: true }, OCR, LIST);
    expect(r.ok).toBe(false);
    expect(r.review).toBeUndefined();
  });
});
