import { matchMedicine, similarity, levenshtein, type MedicineEntry } from './medicineMatch';

const LIST: MedicineEntry[] = [
  { id: 'metformin', name: 'Metformin' },
  { id: 'amaryl', name: 'Amaryl', generic: 'Glimepiride' },
  { id: 'amoxil', name: 'Amoxil', generic: 'Amoxicillin' },
  { id: 'panadol', name: 'Panadol', generic: 'Paracetamol' },
];

describe('levenshtein / similarity', () => {
  it('computes distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
  });
  it('similarity is 1 for identical', () => {
    expect(similarity('Metformin', 'metformin')).toBe(1);
  });
});

describe('matchMedicine', () => {
  it('returns a confident single match', () => {
    const r = matchMedicine('Metformin', LIST);
    expect(r.status).toBe('matched');
    expect(r.matchedId).toBe('metformin');
  });

  it('matches on generic name', () => {
    const r = matchMedicine('Paracetamol', LIST);
    expect(r.status).toBe('matched');
    expect(r.matchedId).toBe('panadol');
  });

  it('flags unsure (not confidently matched) for a near-miss name', () => {
    // "Amoxi" is close to Amoxil but not a confident single match.
    const r = matchMedicine('Amoxi', LIST);
    expect(r.status).toBe('unsure');
    expect(r.candidates.length).toBeGreaterThanOrEqual(1);
  });

  it('offers multiple candidates when two names are equidistant', () => {
    const ambiguous = [
      { id: 'amlodip', name: 'Amlodip' },
      { id: 'amlodin', name: 'Amlodin' },
    ];
    const r = matchMedicine('Amlodis', ambiguous); // 1 edit from each
    expect(r.status).toBe('unsure');
    expect(r.candidates.length).toBe(2);
  });

  it('returns none for an unknown medicine', () => {
    const r = matchMedicine('Zፘqxwv', LIST);
    expect(r.status).toBe('none');
    expect(r.candidates).toEqual([]);
  });
});
