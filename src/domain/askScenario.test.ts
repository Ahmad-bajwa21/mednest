// The Panadol / Rigix / Mitika scenario from testing (Ask: retrieval, context,
// schedule ambiguity, identification, follow-ups).
import { askCare, type AskData } from './askCare';

const d: AskData = {
  profileName: 'Tashfeen',
  allergies: null,
  documents: [{ id: 'd1', type: 'Prescription', docDate: '2026-10-13', doctor: 'Dr. Sana', diagnosisWritten: null, source: 'camera' }],
  medicines: [
    { id: 'p', documentId: 'd1', source: 'document_confirmed', name: 'Panadol', dose: '100 mg', times: ['21:00', 'Morning', 'Afternoon'], instructions: 'after meals', startDate: '2026-10-13', status: 'active', confirmedAt: 'x' },
    { id: 'r', documentId: 'd1', source: 'document_confirmed', name: 'Rigix', dose: '10 mg', times: [], instructions: 'after meals', startDate: '2026-10-13', status: 'pending', confirmedAt: 'x' },
    { id: 'm', documentId: 'd1', source: 'document_confirmed', name: 'Mitika', dose: '10 mg', times: ['Night'], instructions: 'any time', startDate: '2026-10-13', status: 'active', confirmedAt: 'x' },
  ],
  results: [],
  appointments: [{ id: 'a', date: '2026-10-21', status: 'planned', reason: 'Follow-up', documentId: 'd1', sourceText: 'after 1 week', basis: 'relative_to_document' }],
  episodes: [],
  doseLogs: [],
  now: new Date(2026, 9, 13, 12, 0),
};

describe('Ask — Panadol / Rigix / Mitika', () => {
  it('"When do I take it?" → one clarification; "Mitika" then retrieves 9:00 PM', () => {
    const q1 = askCare('When do I take it?', d)!;
    expect(q1.answer).toMatch(/Which medicine do you mean — Panadol, Rigix or Mitika\?/);
    expect(q1.pendingIntent).toBe('when');
    const q2 = askCare('Mitika', d, { pendingIntent: q1.pendingIntent })!;
    expect(q2.answer).toMatch(/Mitika 10 mg: 9:00 PM · any time/);
    expect(q2.medicineId).toBe('m');
    expect(q2.answer).not.toMatch(/couldn’t find/);
  });

  it('keeps the selected medicine across follow-ups', () => {
    const r = askCare('when do I take it?', d, { lastMedicineId: 'm' })!;
    expect(r.answer).toMatch(/Mitika 10 mg: 9:00 PM/);
    expect(r.answer).not.toMatch(/Which medicine/);
  });

  it('switches context when another medicine is named', () => {
    expect(askCare('and when do I take panadol?', d, { lastMedicineId: 'm' })!.medicineId).toBe('p');
  });

  it('flags the Mitika conflict (9:00 PM vs "any time") instead of guessing', () => {
    const r = askCare('when do I take mitika', d)!;
    expect(r.answer).toMatch(/fixed time \(9:00 PM\) but the instructions also say “any time”/);
    expect(r.answer).toMatch(/check with the prescribing doctor or a pharmacist/);
  });

  it('Rigix: says no scheduled time is recorded, never invents one', () => {
    const r = askCare('when do I take rigix', d)!;
    expect(r.answer).toMatch(/Rigix 10 mg: No scheduled time is recorded\. The instructions say “after meals”/);
    expect(r.answer).toMatch(/I won’t guess a time/);
    expect(r.answer).not.toMatch(/\d:\d\d (AM|PM)/);
  });

  it('Panadol times are chronological, with provenance', () => {
    const r = askCare('when do I take panadol', d)!;
    expect(r.answer).toMatch(/8:00 AM, 2:00 PM, 9:00 PM · after meals/);
    expect(r.answer).toMatch(/read automatically and confirmed by you/);
  });

  it('Mitika is identified as POSSIBLY Myteka (montelukast) and asks to confirm', () => {
    const r = askCare('what is mitika for', d)!;
    expect(r.answer).toMatch(/may be Myteka \(contains montelukast\)/);
    expect(r.answer).toMatch(/please confirm the name on the box or with a pharmacist/);
    expect(r.answer).toMatch(/doesn’t say why it was prescribed/);
  });

  it('Rigix is identified as cetirizine; general info kept separate from the prescription', () => {
    const r = askCare('what is rigix for', d)!;
    expect(r.answer).toMatch(/Rigix 10 mg — an antihistamine \(anti-allergy\) \(contains cetirizine\)/);
    expect(r.answer).toMatch(/no reason written/);
  });

  it('a bare name gives everything saved about the medicine', () => {
    const r = askCare('Rigix', d)!;
    expect(r.answer).toMatch(/Take: no scheduled time recorded · after meals/);
    expect(r.answer).toMatch(/Duration: No duration is written/);
  });

  it('"All of them" after the clarification answers for every medicine', () => {
    const r = askCare('All of them', d, { pendingIntent: 'when' })!;
    expect(r.answer).toMatch(/Panadol 100 mg: 8:00 AM/);
    expect(r.answer).toMatch(/Rigix 10 mg: No scheduled time/);
    expect(r.answer).toMatch(/Mitika 10 mg: 9:00 PM/);
  });

  it('follow-up answer shows date, reason source, basis, status — and is not a booking', () => {
    const r = askCare('Next follow-up?', d)!;
    expect(r.answer).toMatch(/21 Oct 2026 \(in 8 days\)/);
    expect(r.answer).toMatch(/Doctor: Dr\. Sana/);
    expect(r.answer).toMatch(/the document says “after 1 week”/);
    expect(r.answer).toMatch(/calculated from the document date and confirmed by you/);
    expect(r.answer).toMatch(/not a booking/);
  });

  it('an unrecognisable medicine asks for confirmation instead of guessing', () => {
    const one: AskData = { ...d, medicines: [{ id: 'z', name: 'Qwertyx', dose: '5 mg', times: [], startDate: '2026-10-13', status: 'active', confirmedAt: 'x' }] };
    expect(askCare('what is it for', one)!.answer).toMatch(/can’t identify this medicine from its name alone/);
  });
});
