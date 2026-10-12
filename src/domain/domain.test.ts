import type { ProfileBundle } from './types';
import { buildSummary, age } from './summary';
import { latestResults } from './trends';
import { patternNotes } from './patterns';
import { askRecords } from './ask';

function bundle(): ProfileBundle {
  return {
    profile: { id: 'p', name: 'Ammi', birthYear: 1962, sex: 'F', allergies: 'penicillin' },
    documents: [
      { id: 'd1', type: 'Lab report', docDate: '2026-03-01', doctor: 'Dr. Khan' },
      { id: 'd2', type: 'Lab report', docDate: '2026-06-01', doctor: 'Dr. Khan' },
      { id: 'd3', type: 'Prescription', docDate: '2026-09-01', doctor: 'Dr. Ali' },
    ],
    medicines: [
      { id: 'm1', documentId: 'd3', name: 'Metformin', dose: '500 mg', times: ['Morning', 'Night'], durationDays: 30, startDate: '2026-09-01', active: true },
    ],
    results: [
      { id: 'r1', documentId: 'd1', docDate: '2026-03-01', test: 'HbA1c', value: '6.5', unit: '%', rangeHigh: 5.7 },
      { id: 'r2', documentId: 'd2', docDate: '2026-06-01', test: 'HbA1c', value: '6.8', unit: '%', rangeHigh: 5.7 },
      { id: 'r3', documentId: 'd3', docDate: '2026-09-01', test: 'HbA1c', value: '7.2', unit: '%', rangeHigh: 5.7 },
    ],
  };
}

describe('summary', () => {
  it('builds from stored facts', () => {
    const s = buildSummary(bundle());
    expect(s).toMatch(/years, F/);
    expect(s).toContain('Metformin');
    expect(s).toContain('penicillin');
  });
  it('empty-state when no documents', () => {
    const b = bundle();
    b.documents = [];
    expect(buildSummary(b)).toMatch(/No records yet/);
  });
  it('age helper', () => {
    expect(age(1962)).toBe(new Date().getFullYear() - 1962);
    expect(age(null)).toBeNull();
  });
});

describe('trends', () => {
  it('marks the latest HbA1c as rising and out of range', () => {
    const [r] = latestResults(bundle(), 3);
    expect(r!.value).toBe('7.2');
    expect(r!.trend).toBe('up');
    expect(r!.outOfRange).toBe(true);
  });
});

describe('patterns', () => {
  it('detects a rising series and repeated out-of-range', () => {
    const notes = patternNotes(bundle());
    expect(notes.some((n) => /risen across the last 3 readings \(6\.5, 6\.8, 7\.2\)/.test(n.text))).toBe(true);
    expect(notes.some((n) => n.kind === 'out_of_range')).toBe(true);
    notes.forEach((n) => expect(n.sources.length).toBeGreaterThan(0));
  });
});

describe('ask', () => {
  it('refuses advice-seeking questions', () => {
    const a = askRecords(bundle(), 'Should I stop Metformin?');
    expect(a!.refusal).toBe(true);
    expect(a!.sources).toEqual([]);
  });
  it('answers current medicines with source', () => {
    const a = askRecords(bundle(), 'What are the current medicines?');
    expect(a!.answer).toContain('Metformin');
    expect(a!.sources).toContain('d3');
  });
  it('answers last sugar test', () => {
    const a = askRecords(bundle(), 'When was the last sugar test?');
    expect(a!.answer).toMatch(/HbA1c was 7\.2/);
    expect(a!.sources).toContain('d3');
  });
  it('returns not found for irrelevant queries', () => {
    const a = askRecords(bundle(), 'xyzzy plugh');
    expect(a!.answer).toMatch(/could not find/);
  });
});
