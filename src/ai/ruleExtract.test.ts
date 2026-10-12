import { readWithRules, ruleExtract } from './ruleExtract';

const RX = `City Clinic Lahore
Dr. Sana Khan  MBBS FCPS
Patient Name: Ahmed Raza
Date: 12/10/2026
Diagnosis: Acute gastritis
1. Tab. Omeprazole 20mg 1-0-1 x 14 days before meals
2. Tab Paracetamol 500 mg TDS x 5 days after meals
3. Syp. Gaviscon 10 ml SOS
Follow up after 2 weeks`;

const LAB = `Chughtai Lab
Patient: Fatima Bibi
Date: 2026-09-01
Test Result Unit Reference Range
HbA1c 7.2 % 4.0-5.6
Fasting Glucose 132 mg/dL (70-100)`;

describe('rules-based document reader', () => {
  it('reads a typed prescription by copying what is written', () => {
    const a = ruleExtract(RX);
    expect(a.type).toBe('prescription');
    expect(a.date).toBe('2026-10-12');
    expect(a.doctor).toBe('Dr. Sana Khan');
    expect(a.patient_name).toBe('Ahmed Raza');
    expect(a.diagnosis_written).toBe('Acute gastritis');
    expect(a.follow_up).toMatch(/after 2 weeks/i);
    expect(a.medicines).toEqual([
      { name: 'Omeprazole', dose: '20mg', frequency: '1-0-1', duration_days: 14, instructions: 'before meals' },
      { name: 'Paracetamol', dose: '500 mg', frequency: 'TDS', duration_days: 5, instructions: 'after meals' },
      { name: 'Gaviscon', dose: '10 ml', frequency: 'SOS', duration_days: null, instructions: null },
    ]);
  });

  it('reads lab results with their printed range', () => {
    const a = ruleExtract(LAB);
    expect(a.type).toBe('lab_report');
    expect(a.results).toEqual([
      { test: 'HbA1c', value: '7.2', unit: '%', range: '4.0-5.6' },
      { test: 'Fasting Glucose', value: '132', unit: 'mg/dL', range: '70-100' },
    ]);
    expect(a.medicines).toEqual([]);
  });

  it('flags every medicine field and result value for the user to confirm', () => {
    const r = readWithRules(RX)!.review;
    expect(r.medicines.every((m) => m.nameUnsure && m.doseUnsure && m.frequencyUnsure)).toBe(true);
    expect(r.hasUnresolved).toBe(true);
    expect(r.medicines[0]!.slots).toEqual(['Morning', 'Night']);
    expect(readWithRules(LAB)!.review.results.every((x) => x.valueUnsure)).toBe(true);
  });

  it('never invents: unreadable text yields nothing to schedule', () => {
    const a = ruleExtract('blurry scribble ~~ ::');
    expect(a.medicines).toEqual([]);
    expect(a.date).toBeNull();
    expect(a.unsure).toContain('date');
  });
});
