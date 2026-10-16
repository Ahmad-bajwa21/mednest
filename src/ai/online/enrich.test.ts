import { planEnrichment, topicOf } from './enrich';

const meds = [
  { id: 'w', name: 'warfarin' },
  { id: 'c', name: 'Colchicine' },
  { id: 'm', name: 'Mitika' },
];

describe('when to look things up online', () => {
  it('extracts the health topic from a question', () => {
    expect(topicOf('What are the symptoms of gout?')).toBe('gout');
    expect(topicOf('tell me about migraine')).toBe('migraine');
    expect(topicOf('what is it')).toBeNull();
  });

  it('a recorded medicine named in the question → drug lookup, with the other medicines for interactions', () => {
    const p = planEnrichment('what is warfarin for', '...', meds, {});
    expect(p).toEqual({ kind: 'drug', names: ['warfarin'], otherGenerics: ['warfarin', 'colchicine', 'montelukast'] });
  });

  it('"it" uses the medicine just discussed; "these" covers all', () => {
    expect(planEnrichment('what is it for?', '', meds, { lastMedicineId: 'c' })).toMatchObject({ names: ['Colchicine'] });
    expect(planEnrichment('what are these for', '', meds, {})).toMatchObject({ names: ['warfarin', 'Colchicine', 'Mitika'] });
  });

  it('a medicine not in the records → drug lookup', () => {
    expect(planEnrichment('what is panadol used for', '', meds, {})).toMatchObject({ kind: 'drug', names: ['panadol'] });
  });

  it('general or unanswered questions → topic lookup', () => {
    expect(planEnrichment('what is gout?', '', meds, {})).toEqual({ kind: 'topic', term: 'gout' });
    expect(planEnrichment('kidney stones', 'I couldn’t find an answer to that', meds, {})).toEqual({ kind: 'topic', term: 'kidney stones' });
  });

  it('record-only questions are not sent online', () => {
    expect(planEnrichment('when do I take warfarin', '', meds, {})).toBeNull();
    expect(planEnrichment('next follow-up?', 'Next follow-up: 21 Oct', meds, {})).toBeNull();
  });
});

describe('conversation is never searched online', () => {
  it.each(['I have stomach pain', 'so wru', 'I feel you are not a good AI', 'thanks', 'hi'])('%s → no lookup', (q) => {
    expect(planEnrichment(q, 'I couldn’t find an answer to that', meds, {})).toBeNull();
  });
});
