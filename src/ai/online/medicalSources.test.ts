import { cleanText, lookupMedicineOnline, lookupTopicOnline, renderDrugInfo, type FetchFn } from './medicalSources';

// Minimal fake of the public APIs, keyed by URL fragment.
function fakeFetch(routes: Record<string, unknown>): { fetch: FetchFn; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetch: async (url: string) => {
      calls.push(url);
      const key = Object.keys(routes).find((k) => url.includes(k));
      return { ok: !!key, json: async () => (key ? routes[key] : null) };
    },
  };
}

const MONTELUKAST = {
  'rxcui.json?name=montelukast': { idGroup: { rxnormId: ['88249'] } },
  'mainSearchCriteria.v.c=88249': { feed: { entry: [{ title: { _value: 'Montelukast' }, link: [{ href: 'https://medlineplus.gov/druginfo/meds/a600014.html?utm_source=x' }], summary: { _value: '<p>Montelukast is used to prevent wheezing and coughing caused by asthma.</p>' } }] } },
  'generic_name:%22montelukast%22': { results: [{ indications_and_usage: ['1 INDICATIONS AND USAGE Montelukast is indicated for prophylaxis of asthma.'], boxed_warning: ['WARNING: SERIOUS NEUROPSYCHIATRIC EVENTS'], drug_interactions: ['Phenobarbital decreases exposure.'] }] },
};

describe('online medical sources', () => {
  it('cleans source text to whole sentences', () => {
    expect(cleanText('<p>One. Two three.</p>')).toBe('One. Two three.');
    expect(cleanText('1 INDICATIONS AND USAGE Warfarin is indicated for clots.')).toBe('Warfarin is indicated for clots.');
  });

  it('Pakistan brand → ingredient locally, then MedlinePlus + FDA with sources', async () => {
    const { fetch, calls } = fakeFetch(MONTELUKAST);
    const d = await lookupMedicineOnline('Myteka 10 mg', fetch, ['warfarin', 'phenobarbital']);
    expect(d.generic).toBe('montelukast');
    expect(d.match).toBe('exact');
    expect(d.summary).toMatch(/prevent wheezing/);
    expect(d.fdaUses).toBe('Montelukast is indicated for prophylaxis of asthma.');
    expect(d.boxedWarning).toMatch(/NEUROPSYCHIATRIC/);
    expect(d.interactionMentions).toEqual(['phenobarbital']);
    expect(d.sources.map((s) => s.name)).toEqual(['MedlinePlus (US National Library of Medicine)', 'US FDA drug label (openFDA)']);
    expect(d.sources[0]!.url).toBe('https://medlineplus.gov/druginfo/meds/a600014.html');
    // Only the medicine name is sent — no patient identity.
    expect(calls.every((u) => !/tashfeen|penicillin/i.test(u))).toBe(true);
  });

  it('near-miss name is flagged for confirmation in the rendered answer', async () => {
    const { fetch } = fakeFetch(MONTELUKAST);
    const d = await lookupMedicineOnline('Mitika', fetch);
    expect(d.match).toBe('possible');
    expect(renderDrugInfo(d, 'Mitika')).toMatch(/isn’t an exact match — this is about montelukast/);
  });

  it('unknown local name falls back to RxNorm approximate matching', async () => {
    const { fetch } = fakeFetch({
      'approximateTerm.json?term=Qxorbal': { approximateGroup: { candidate: [{ rxcui: '153165' }] } },
      'rxcui/153165/related.json': { relatedGroup: { conceptGroup: [{ tty: 'IN', conceptProperties: [{ name: 'Atorvastatin' }] }] } },
    });
    const d = await lookupMedicineOnline('Qxorbal', fetch);
    expect(d.match).toBe('rxnorm');
    expect(d.generic).toBe('atorvastatin');
  });

  it('nothing found → honest message, no invented content', async () => {
    const { fetch } = fakeFetch({});
    const d = await lookupMedicineOnline('Qwertyx', fetch);
    expect(d.summary).toBeNull();
    expect(renderDrugInfo(d, 'Qwertyx')).toMatch(/couldn’t find Qwertyx/);
  });

  it('network failure never throws', async () => {
    const failing: FetchFn = async () => { throw new Error('offline'); };
    const d = await lookupMedicineOnline('Panadol', failing);
    expect(d.summary).toBeNull();
  });

  it('health topic via ICD-10 → MedlinePlus', async () => {
    const { fetch } = fakeFetch({
      'conditions/v3/search?terms=migraine': [2, ['1'], null, [['Migraine', 'G43.909']]],
      'mainSearchCriteria.v.c=G43.909': { feed: { entry: [{ title: { _value: 'Migraine' }, link: [{ href: 'https://medlineplus.gov/migraine.html?x=1' }], summary: { _value: 'Migraines are a recurring type of headache.' } }] } },
    });
    const t = await lookupTopicOnline('migraine', fetch);
    expect(t.title).toBe('Migraine');
    expect(t.summary).toMatch(/recurring type of headache/);
    expect(t.sources[0]!.url).toBe('https://medlineplus.gov/migraine.html');
  });
});

describe('source text cleanup', () => {
  it('keeps list items apart and strips FDA cross-references', () => {
    expect(cleanText('<p>Used to:</p><ul><li>prevent clots</li><li>protect valves</li></ul>')).toBe('Used to: prevent clots; protect valves');
    expect(cleanText('Can cause bleeding [see Warnings and Precautions ( 5.1 )] . Monitor INR ( 2.1 ).')).toBe('Can cause bleeding. Monitor INR.');
  });
});
