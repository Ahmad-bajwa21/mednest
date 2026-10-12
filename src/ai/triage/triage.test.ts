import { detectRedFlags } from './redFlags';
import { parseDuration, parseMulti, parseSeverity } from './parse';
import { MEDICINE_REPLY, respond, startTriage, type TriageState } from './engine';
import { PROTOCOLS, type TriageContext } from './protocols';

const ctx = (over: Partial<TriageContext> = {}): TriageContext => ({
  ageYears: 34,
  allergies: null,
  activeMedicines: [],
  priorEpisodes: [],
  now: new Date('2026-10-13T09:00:00Z'),
  ...over,
});

async function run(messages: string[], c = ctx()) {
  let { state } = startTriage(c);
  let last: Awaited<ReturnType<typeof respond>>['messages'] = [];
  for (const m of messages) {
    const r = await respond(state, m, c);
    state = r.state;
    last = r.messages;
  }
  return { state, last };
}

const asked = (s: TriageState) => s.transcript.filter((t) => t.role === 'assistant').map((t) => t.text);

describe('red flags', () => {
  it.each([
    'I have chest pain and sweating',
    'my father cannot breathe properly',
    'her face is drooping and speech is slurred',
    'I am vomiting blood',
    'my lips are swelling after eating nuts',
    'I want to kill myself',
    'worst headache of my life',
    'he passed out',
    'seenay mein dard hai',
  ])('flags emergency: %s', (msg) => {
    expect(detectRedFlags(msg)[0]?.level).toBe('emergency');
  });

  it('respects simple negation', () => {
    expect(detectRedFlags('stomach pain, no chest pain, not short of breath')).toEqual([]);
  });

  it('does not let a loose "no" cancel a real warning sign', () => {
    expect(detectRedFlags('no idea why but chest pain started')[0]?.id).toBe('chest_pain');
  });

  it('ordinary complaints do not trigger', () => {
    expect(detectRedFlags('I have stomach pain since yesterday')).toEqual([]);
  });
});

describe('parsers', () => {
  it('reads durations', () => {
    expect(parseDuration('since yesterday')?.hours).toBe(24);
    expect(parseDuration('about 3 days')?.hours).toBe(72);
    expect(parseDuration('a week ago')?.hours).toBe(168);
    expect(parseDuration('no idea')).toBeNull();
  });
  it('reads severity, strict mode ignores bare numbers', () => {
    expect(parseSeverity('7')).toBe(7);
    expect(parseSeverity('pain for 2 days', true)).toBeNull();
    expect(parseSeverity('7/10', true)).toBe(7);
    expect(parseSeverity('unbearable')).toBe(10);
  });
  it('multi-choice honours negation', () => {
    const opts = PROTOCOLS[0]!.slots.find((s) => s.id === 'associated')!.options!;
    expect(parseMulti('vomiting but no fever', opts)).toEqual(['vomiting']);
    expect(parseMulti('none', opts)).toEqual(['none']);
  });
});

describe('triage engine', () => {
  it('emergency ends questioning immediately', async () => {
    const { state, last } = await run(['I have stomach pain', 'Now I also have chest pain']);
    expect(state.done).toBe(true);
    expect(state.disposition).toBe('emergency');
    expect(last[0]!.kind).toBe('emergency');
    expect(last[0]!.text).toMatch(/1122/);
  });

  it('emergency in the very first message gets no follow-up questions', async () => {
    const { state, last } = await run(['my mother is unconscious']);
    expect(last).toHaveLength(1);
    expect(last[0]!.kind).toBe('emergency');
    expect(state.protocolId).toBeNull();
  });

  it('adapts: skips what the opening message already said', async () => {
    const { state, last } = await run(['I have stomach pain since yesterday in the upper middle, with vomiting']);
    expect(state.protocolId).toBe('abdominal_pain');
    expect(state.answers.onset).toMatchObject({ kind: 'duration', hours: 24 });
    expect(state.answers.location).toMatchObject({ value: 'upper_middle' });
    // Next question is severity — not "when did it start" or "where".
    expect(last[0]!.text).toMatch(/0 \(none\) to 10/);
    expect(asked(state).some((t) => /When did it start/.test(t))).toBe(false);
  });

  it('asks about remaining symptoms without dropping prefilled ones', async () => {
    const { state } = await run([
      'stomach pain since yesterday upper middle with vomiting',
      '4',
      'comes and goes',
      'fever',
    ]);
    expect(asked(state).some((t) => t.startsWith('Besides vomiting'))).toBe(true);
    expect(state.answers.associated).toMatchObject({ values: ['vomiting', 'fever'] });
  });

  it('full stomach-pain conversation ends in a self-care outcome with safety net', async () => {
    const { state, last } = await run([
      'I have stomach pain',
      '2 days ago',
      'upper middle',
      '3',
      'comes and goes',
      'bloating',
      'biryani from a street stall',
      'no',
    ]);
    expect(state.done).toBe(true);
    expect(state.disposition).toBe('self_care');
    const summary = last[0]!;
    expect(summary.kind).toBe('summary');
    expect(summary.text).toMatch(/Get medical help sooner if/);
    expect(summary.text).toMatch(/not a diagnosis/);
    expect(summary.text).not.toMatch(/\bmg\b|tablet/i);
  });

  it('combination rule: lower right pain with fever is urgent', async () => {
    const { state } = await run(['stomach pain since this morning', 'lower right', '6', 'all the time', 'fever and vomiting', 'rice', 'no']);
    expect(state.disposition).toBe('urgent');
  });

  it('headache: sudden + severe escalates to emergency mid-conversation', async () => {
    const { state } = await run(['headache', '1 hour', 'suddenly', '9']);
    expect(state.disposition).toBe('emergency');
  });

  it('refuses medicine requests and repeats the question', async () => {
    const { state } = await run(['I have a headache']);
    const r = await respond(state, 'which tablet should I take?', ctx());
    expect(r.messages[0]!.text).toBe(MEDICINE_REPLY);
    expect(r.messages[1]!.kind).toBe('question');
    expect(r.state.pendingSlot).toBe(state.pendingSlot);
  });

  it('is history-aware: uses a prior episode and the allergy record', async () => {
    const c = ctx({
      allergies: 'Penicillin',
      activeMedicines: ['Metformin 500 mg'],
      priorEpisodes: [{ protocolId: 'abdominal_pain', complaint: 'Stomach pain', date: '2026-09-12' }],
    });
    const { state, last } = await run(['stomach pain 2 days', 'upper middle', '3', 'comes and goes', 'none', 'dal chawal'], c);
    expect(asked(state).at(-1)).toMatch(/reported stomach pain on 2026-09-12/);
    const done = await respond(state, 'yes', c);
    expect(done.messages[0]!.text).toMatch(/Penicillin/);
    expect(done.messages[0]!.text).toMatch(/Metformin/);
    expect(done.messages[0]!.text).toMatch(/reported this 1 time before/);
    void last;
  });

  it('too many "not sure" answers gives an insufficient-information outcome', async () => {
    const { state } = await run(['stomach pain', 'not sure', 'not sure', 'not sure', 'not sure', 'not sure', 'skip', 'skip']);
    expect(state.disposition).toBe('insufficient');
  });

  it('unknown complaint offers a choice, then falls back to general questions', async () => {
    const { state, last } = await run(['my knee feels odd']);
    expect(last[0]!.quickReplies).toContain('Something else');
    const r = await respond(state, 'Something else', ctx());
    expect(r.state.protocolId).toBe('general');
  });

  it('never mutates the previous state', async () => {
    const { state } = await run(['headache']);
    const snapshot = JSON.stringify(state);
    await respond(state, '2 days', ctx());
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
