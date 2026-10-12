import { buildVisitSummary, renderVisitSummaryText, type VisitInput } from './visitSummary';

const now = new Date('2026-10-14T09:00:00Z');
const input = (over: Partial<VisitInput> = {}): VisitInput => ({
  profile: { name: 'Tashfeen', ageYears: 34, sex: 'M', allergies: 'Penicillin' },
  episodes: [
    {
      id: 'e1',
      protocolId: 'headache',
      complaint: 'Headache',
      createdAt: '2026-10-13T09:00:00Z',
      disposition: 'self_care',
      answers: {
        onset: { kind: 'duration', hours: 3, text: '3 hours' },
        severity: { kind: 'scale', value: 5 },
        associated: { kind: 'multi', values: ['none'], labels: ['None of these'] },
        injury: { kind: 'yesno', value: false },
        previous: { kind: 'yesno', value: true },
        remedies: { kind: 'text', value: 'Panadol 500 mg at 8 am' },
      },
    },
    {
      id: 'e2',
      protocolId: 'headache',
      complaint: 'Headache',
      createdAt: '2026-10-14T08:00:00Z',
      disposition: 'urgent',
      answers: {
        severity: { kind: 'scale', value: 8 },
        associated: { kind: 'multi', values: ['fever'], labels: ['Fever'] },
        neck: { kind: 'yesno', value: false },
        rash: { kind: 'skipped' },
      },
    },
  ],
  updates: [{ id: 'u1', at: '2026-10-14T08:15:00Z', complaint: 'Headache', note: 'Took another Panadol', severity: 7 }],
  medicines: [{ name: 'Warfarin', dose: '5 mg', source: 'document_confirmed', status: 'active' }],
  documents: [{ id: 'd1', type: 'Prescription', docDate: '2026-10-01', doctor: 'Dr. Ali', diagnosisWritten: 'Atrial fibrillation' }],
  now,
  ...over,
});

describe('doctor visit summary', () => {
  it('builds a chronological timeline only from recorded reports', () => {
    const s = buildVisitSummary(input());
    expect(s.timeline.map((t) => t.refId)).toEqual(['e1', 'e1', 'e2', 'e2', 'u1']);
    expect(s.timeline[0]!.text).toMatch(/Reported headache; severity 5\/10; started 3 hours before this report/);
    expect(s.timeline[2]!.text).toMatch(/severity 8\/10; with: Fever/);
    expect(s.timeline[4]!.source).toBe('patient_update');
  });

  it('tracks severity progression, positives, negatives and remedies', () => {
    const c = buildVisitSummary(input()).complaints[0]!;
    expect(c.severities.map((x) => x.value)).toEqual([5, 8, 7]);
    expect(c.positives).toContain('Fever');
    expect(c.negatives).toContain('Stiff neck');
    expect(c.remedies).toEqual(['Panadol 500 mg at 8 am']);
    expect(c.hadBefore).toBe('yes');
  });

  it('lists what is still unknown instead of inventing it', () => {
    const c = buildVisitSummary(input()).complaints[0]!;
    expect(c.toClarify).toContain('Not answered: new rash');
  });

  it('puts recent urgent advice first so the summary never delays care', () => {
    const s = buildVisitSummary(input());
    expect(s.urgent?.disposition).toBe('urgent');
    expect(renderVisitSummaryText(s, input().profile)).toMatch(/IMPORTANT: .* seeing a doctor the same day .* Do not wait/);
  });

  it('keeps corrections next to the original entry', () => {
    const s = buildVisitSummary(input({ updates: [{ id: 'c1', at: '2026-10-14T08:30:00Z', complaint: 'Headache', note: 'Fever started at 8:15, not before', correctsId: 'e2' }] }));
    expect(s.timeline.some((t) => t.refId === 'e2')).toBe(true);
    expect(s.timeline.find((t) => t.refId === 'c1')!.text).toMatch(/Correction by patient \(the earlier entry is kept\)/);
  });

  it('labels the source of records; diagnoses only if written by a doctor', () => {
    const text = renderVisitSummaryText(buildVisitSummary(input()), input().profile);
    expect(text).toMatch(/Warfarin 5 mg — from a prescription, confirmed by the patient/);
    expect(text).toMatch(/Atrial fibrillation — written by Dr\. Ali/);
    expect(text).toMatch(/Severity: 5\/10 .* → 7\/10 .* — worse; highest 8\/10/);
    expect(text).toMatch(/Not a diagnosis/);
    expect(text).toMatch(/\[patient-reported\]/);
  });

  it('respects the time window and reports an empty period honestly', () => {
    const s = buildVisitSummary(input({ since: '2026-10-15T00:00:00Z' }));
    expect(s.empty).toBe(true);
    expect(renderVisitSummaryText(s, input().profile)).toMatch(/No symptoms have been reported in this period/);
  });
});
