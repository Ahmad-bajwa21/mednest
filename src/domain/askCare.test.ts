import { askCare, type AskData } from './askCare';
import { lookupMedicineInfo } from '../ai/medicineInfo';

const base = (over: Partial<AskData> = {}): AskData => ({
  profileName: 'Tashfeen',
  allergies: 'penicillin',
  documents: [{ id: 'd1', type: 'Prescription', docDate: '2026-10-13', doctor: 'Dr. Ali', diagnosisWritten: null }],
  medicines: [
    { id: 'm1', documentId: 'd1', name: 'warfarin', dose: '5mg', times: ['Night'], startDate: '2026-10-13', durationDays: null, status: 'active', confirmedAt: '2026-10-13' },
  ],
  results: [],
  appointments: [],
  episodes: [],
  doseLogs: [],
  now: new Date(2026, 9, 13, 12, 0),
  ...over,
});

describe('Ask', () => {
  it('"what medicine do i eat and why" lists AND explains', () => {
    const r = askCare('what medicine do i eat and why', base())!;
    expect(r.answer).toMatch(/Warfarin 5mg — a blood thinner/);
    expect(r.answer).toMatch(/Take: 9:00 PM/);
    expect(r.answer).toMatch(/Prescribed by Dr\. Ali on 13 Oct 2026/);
    expect(r.answer).toMatch(/no reason written/);
    expect(r.answer).toMatch(/blood thinner/);
    expect(r.medicineId).toBe('m1');
  });

  it('"what is this medicine for" follows up on the last medicine', () => {
    const d = base({ medicines: [...base().medicines, { id: 'm2', documentId: 'd1', name: 'Risek', dose: '20mg', times: ['Morning'], startDate: '2026-10-13', status: 'active', confirmedAt: 'x' }] });
    const r = askCare('what is this medicine for', d, { lastMedicineId: 'm1' })!;
    expect(r.answer).toMatch(/warfarin/i);
    expect(r.answer).toMatch(/INR/);
    expect(r.answer).not.toMatch(/could not find|couldn’t find/);
  });

  it('uses the diagnosis written on the prescription when there is one', () => {
    const d = base({ documents: [{ id: 'd1', type: 'Prescription', docDate: '2026-10-13', doctor: 'Dr. Ali', diagnosisWritten: 'Atrial fibrillation' }] });
    expect(askCare('why do I take warfarin?', d)!.answer).toMatch(/diagnosis written: Atrial fibrillation/);
  });

  it('answers when / how long / who', () => {
    expect(askCare('when do I take it?', base())!.answer).toMatch(/9:00 PM/);
    expect(askCare('how long do I take warfarin', base())!.answer).toMatch(/No duration is written/);
    expect(askCare('which doctor prescribed it', base())!.answer).toMatch(/Dr\. Ali on 13 Oct 2026/);
  });

  it('gives general info for a medicine not in the record', () => {
    const r = askCare('what is panadol for', base())!;
    expect(r.answer).toMatch(/pain reliever/);
    expect(r.answer).toMatch(/not in Tashfeen’s records/);
  });

  it('"I am also taking colchecine 5 mg" points to adding it, with general info (typo tolerated)', () => {
    const r = askCare('i am also taking colchecine 5 mg', base())!;
    expect(r.answer).toMatch(/Colchicine isn’t in Tashfeen’s records/);
    expect(r.answer).toMatch(/Tap “Add Colchicine 5 mg”/);
    expect(r.answer).toMatch(/Please check the dose/);
    expect(r.answer).toMatch(/You also take warfarin/);
    expect(r.addMedicine).toEqual({ name: 'Colchicine', dose: '5 mg' });
    expect(r.answer).toMatch(/gout/);
    expect(r.answer).not.toMatch(/couldn’t find/);
  });

  it('"I take warfarin" confirms a medicine already in the record', () => {
    const r = askCare('I take warfarin at night', base())!;
    expect(r.answer).toMatch(/Yes — warfarin 5mg is in Tashfeen’s records: 9:00 PM/);
    expect(r.medicineId).toBe('m1');
  });

  it('"I started taking xyzmed" with an unknown medicine still points to adding it', () => {
    const r = askCare('I started taking xyzmed', base())!;
    expect(r.answer).toMatch(/Xyzmed isn’t in Tashfeen’s records/);
    expect(r.answer).not.toMatch(/commonly used/);
  });

  it('still refuses advice and catches emergencies', () => {
    expect(askCare('should I stop warfarin?', base())!.refusal).toBe(true);
    expect(askCare('I have chest pain', base())!.emergency).toBe(true);
  });

  it('answers follow-ups, allergies and today’s doses', () => {
    const d = base({ appointments: [{ id: 'a1', date: '2026-10-20', status: 'planned', doctor: 'Dr. Ali', reason: 'INR check' }] });
    expect(askCare('when is my next follow up', d)!.answer).toMatch(/20 Oct 2026 with Dr\. Ali — INR check/);
    expect(askCare('any allergies?', d)!.answer).toMatch(/penicillin/);
    expect(askCare('did I take my medicines today', d)!.answer).toMatch(/9:00 PM warfarin: upcoming/);
  });

  it('never dead-ends: unknown questions get suggestions', () => {
    const r = askCare('tell me a joke', base())!;
    expect(r.suggestions?.length).toBeGreaterThan(0);
  });

  it('medicine lookup handles brands and small typos', () => {
    expect(lookupMedicineInfo('Tab. Risek 20mg')?.what).toMatch(/acid reducer/);
    expect(lookupMedicineInfo('Augmentin 625')?.what).toMatch(/antibiotic/);
    expect(lookupMedicineInfo('warfrin')?.what).toMatch(/blood thinner/);
    expect(lookupMedicineInfo('xyz')).toBeNull();
  });
});

describe('Ask — the reported conversation (warfarin + colchicine)', () => {
  const d = base({
    medicines: [
      { id: 'm1', documentId: 'd1', name: 'warfarin', dose: '5mg', times: ['Morning', 'Night'], startDate: '2026-10-13', durationDays: null, status: 'active', confirmedAt: 'x' },
      { id: 'm2', documentId: null, name: 'Colchicine', dose: '5mg', times: [], startDate: '2026-10-13', durationDays: null, status: 'pending', confirmedAt: 'x' },
    ],
  });

  it('"what are these medicines for collectively" covers BOTH medicines', () => {
    const r = askCare('what are these medicines for collectively', d, { lastMedicineId: 'm2' })!;
    expect(r.answer).toMatch(/2 medicines/);
    expect(r.answer).toMatch(/Warfarin 5mg — a blood thinner/);
    expect(r.answer).toMatch(/Colchicine 5mg — a medicine for gout/);
  });

  it('flags colchicine "5mg" as a likely typo (usual 0.5–1.2 mg)', () => {
    const r = askCare('what are these medicines for', d)!;
    expect(r.answer).toMatch(/Please check the dose: Colchicine is usually 0.5–1.2 mg per dose/);
    expect(r.answer).not.toMatch(/Warfarin is usually/);
  });

  it('"which disease are these for" explains uses without inventing a diagnosis', () => {
    const r = askCare('which disease are these for', d)!;
    expect(r.answer).toMatch(/No diagnosis is written/);
    expect(r.answer).toMatch(/only the doctor who prescribed them can/);
    expect(r.answer).toMatch(/Warfarin 5mg — a blood thinner/);
    expect(r.answer).toMatch(/Colchicine 5mg — a medicine for gout/);
    expect(r.answer).toMatch(/don’t assume a diagnosis/);
    expect(r.answer).toMatch(/Ask Dr\. Ali/);
  });

  it('asking "what is it for?" again gives a short answer, not the same paragraph', () => {
    const first = askCare('what is warfarin for', d)!;
    const again = askCare('what is it for?', d, { lastMedicineId: 'm1', explainedIds: first.explainedIds })!;
    expect(again.answer).toMatch(/^In short:/);
    expect(again.answer.length).toBeLessThan(first.answer.length);
    expect(again.answer).not.toMatch(/INR/);
  });
});
