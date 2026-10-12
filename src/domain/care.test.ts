import { historyEntries, pendingConfirmations, todaysDoses, upcomingAppointments, type CareData, type CareMedicine } from './care';

const med = (over: Partial<CareMedicine> = {}): CareMedicine => ({
  id: 'm1',
  name: 'Amoxicillin',
  dose: '500 mg',
  times: ['Morning', 'Night'],
  startDate: '2026-10-13',
  durationDays: 5,
  status: 'active',
  confirmedAt: '2026-10-13T08:00:00Z',
  source: 'document_confirmed',
  ...over,
});

const data = (over: Partial<CareData> = {}): CareData => ({
  documents: [],
  medicines: [],
  appointments: [],
  episodes: [],
  doseLogs: [],
  ...over,
});

describe('dashboard', () => {
  it("today's doses carry their state", () => {
    const now = new Date(2026, 9, 13, 12, 0);
    const doses = todaysDoses([med()], [{ doseKey: 'm1:2026-10-13:08:00', status: 'taken' }], now);
    expect(doses.map((d) => d.state)).toEqual(['taken', 'upcoming']);
  });

  it('pending confirmations: incomplete medicine, proposed and overdue follow-ups', () => {
    const items = pendingConfirmations(
      data({
        medicines: [med(), med({ id: 'm2', name: 'Syrup X', times: [], status: 'pending' })],
        appointments: [
          { id: 'a1', date: null, status: 'proposed', sourceText: 'after 1 week', createdAt: '' },
          { id: 'a2', date: '2026-10-01', status: 'planned', createdAt: '' },
        ],
      }),
      '2026-10-13',
    );
    expect(items.map((i) => i.kind)).toEqual(['medicine', 'appointment', 'overdue_followup']);
    expect(items[0]!.detail).toMatch(/How often/);
    expect(items[1]!.title).toBe('Choose a follow-up date');
  });

  it('upcoming appointments are planned, future and sorted', () => {
    const list = upcomingAppointments(
      [
        { id: 'b', date: '2026-10-25', status: 'planned', createdAt: '' },
        { id: 'a', date: '2026-10-20', status: 'planned', createdAt: '' },
        { id: 'p', date: '2026-10-15', status: 'proposed', createdAt: '' },
        { id: 'old', date: '2026-10-01', status: 'planned', createdAt: '' },
      ],
      '2026-10-13',
    );
    expect(list.map((a) => a.id)).toEqual(['a', 'b']);
  });
});

describe('history', () => {
  it('is chronological and keeps provenance distinct', () => {
    const h = historyEntries(
      data({
        documents: [{ id: 'd1', type: 'Prescription', docDate: '2026-10-13', doctor: 'Dr. Ali', diagnosisWritten: 'Gastritis', source: 'camera' }],
        medicines: [med({ documentId: 'd1' })],
        episodes: [{ id: 'e1', complaint: 'Stomach pain', disposition: 'gp', createdAt: '2026-10-12T10:00:00Z' }],
        audit: [{ entity: 'medicine', entityId: 'm1', action: 'status', detail: JSON.stringify({ before: 'active', after: 'paused' }), at: '2026-10-14T09:00:00Z' }],
      }),
    );
    expect(h[0]!.title).toBe('Amoxicillin: active → paused');
    expect(h.find((e) => e.kind === 'diagnosis')!.provenance).toMatch(/Written by the doctor/);
    expect(h.find((e) => e.kind === 'document')!.provenance).toMatch(/read by AI, confirmed by you/);
    expect(h.find((e) => e.kind === 'symptom')!.provenance).toMatch(/not a diagnosis/);
    expect(h.at(-1)!.kind).toBe('symptom');
  });
});
