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
    expect(asked(state).some((t) => t.includes('Besides vomiting'))).toBe(true);
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
      'none',
    ]);
    expect(state.done).toBe(true);
    expect(state.disposition).toBe('self_care');
    const summary = last[0]!;
    expect(summary.kind).toBe('summary');
    expect(summary.text).toMatch(/Go to the emergency department or call 1122 if/);
    expect(summary.text).toMatch(/not a diagnosis/);
    expect(summary.text).not.toMatch(/\bmg\b|tablet/i);
  });

  it('combination rule: lower right pain with fever is urgent', async () => {
    const { state } = await run(['stomach pain since this morning', 'lower right', '6', 'all the time', 'fever and vomiting', 'rice', 'no', 'none']);
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
    const mid = await respond(state, 'yes', c);
    const done = await respond(mid.state, 'none', c);
    expect(done.messages[0]!.text).toMatch(/Penicillin/);
    expect(done.messages[0]!.text).toMatch(/Metformin/);
    expect(done.messages[0]!.text).toMatch(/reported this 1 time before/);
    void last;
  });

  it('too many "not sure" answers gives an insufficient-information outcome', async () => {
    const { state } = await run(['stomach pain', 'not sure', 'not sure', 'not sure', 'not sure', 'not sure', 'skip', 'skip', 'skip']);
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

describe('headache triage scenarios (protocols-0.2-draft)', () => {
  const asks = (s: TriageState, re: RegExp) => s.transcript.some((t) => t.role === 'assistant' && re.test(t.text));

  it('severe headache with fever: asks neck, rash and confusion directly, then advises "today, within hours"', async () => {
    const { state, last } = await run(['I have a headache', 'since yesterday', 'gradually', '8', 'fever', 'no', 'no', 'no', 'no', 'no', 'none']);
    expect(asks(state, /neck stiff/)).toBe(true);
    expect(asks(state, /new rash/)).toBe(true);
    expect(asks(state, /confusion, unusual drowsiness/)).toBe(true);
    expect(state.disposition).toBe('urgent');
    expect(last[0]!.text).toMatch(/within the next few hours/);
    expect(last[0]!.text).toMatch(/Why:\n• A severe headache with fever/);
    expect(last[0]!.text).toMatch(/Stiff neck: no/);
  });

  it.each([
    ['stiff neck', ['headache', '1 day', 'gradually', '7', 'fever', 'yes']],
    ['rash with fever', ['headache', '1 day', 'gradually', '6', 'fever', 'no', 'yes']],
    ['confusion', ['headache', '1 day', 'gradually', '7', 'fever', 'no', 'no', 'yes']],
    ['sudden extremely severe headache', ['headache', '1 hour', 'suddenly', '10']],
    ['weakness volunteered', ['headache with weakness in my arm']],
  ])('emergency: %s — and questioning stops', async (_label, msgs) => {
    const { state, last } = await run(msgs as string[]);
    expect(state.disposition).toBe('emergency');
    expect(state.done).toBe(true);
    expect(last.at(-1)!.kind).toBe('emergency');
  });

  it('missing answer to a critical question raises urgency instead of guessing', async () => {
    const { state } = await run(['headache', '2 days', 'gradually', '7', 'none', 'not sure', 'no', 'no', 'no', 'no', 'none']);
    expect(state.flags.some((f) => f.id === 'unknown_neck')).toBe(true);
    expect(state.disposition).toBe('urgent');
  });

  it('similar to previous mild headaches → watch at home; new/different → today', async () => {
    const mild = await run(['headache', 'this morning', 'gradually', '3', 'none', 'no', 'yes', 'no', 'none']);
    expect(asks(mild.state, /different from your usual ones/)).toBe(true);
    expect(mild.state.disposition).toBe('self_care');
    const diff = await run(['headache', 'this morning', 'gradually', '4', 'none', 'no', 'yes', 'yes', 'none']);
    expect(diff.state.disposition).toBe('urgent');
  });

  it('does not ask irrelevant red-flag questions for a mild headache without fever', async () => {
    const { state } = await run(['headache', 'today', 'gradually', '3', 'none', 'no', 'no', 'none']);
    expect(asks(state, /new rash/)).toBe(false);
    expect(asks(state, /neck stiff/)).toBe(false);
  });

  it('works without any patient history', async () => {
    const c = ctx({ ageYears: null, allergies: null, activeMedicines: [], priorEpisodes: [] });
    const { state } = await run(['headache', 'today', 'gradually', '3', 'none', 'no', 'no', 'none'], c);
    expect(state.done).toBe(true);
  });

  it('records medicines the patient took (patient-reported)', async () => {
    const { state } = await run(['headache', 'today', 'gradually', '3', 'none', 'no', 'no', 'panadol 500 at 9am']);
    expect(state.answers.remedies).toEqual({ kind: 'text', value: 'panadol 500 at 9am' });
  });
});

describe('natural conversation in the symptom check', () => {
  it('"I feel you are not a good AI" gets an apology, not symptom categories', async () => {
    const { state, last } = await run(['I feel you are not a good AI']);
    expect(last[0]!.text).toMatch(/I’m sorry — it sounds like I haven’t been helpful/);
    expect(last[0]!.quickReplies).toBeUndefined();
    expect(state.protocolId).toBeNull();
  });

  it('"so wru" is answered as "who are you"', async () => {
    const { last } = await run(['so wru']);
    expect(last[0]!.text).toMatch(/MedNest’s health assistant — a computer program/);
  });

  it('a symptom with no specific protocol goes straight to questions (no category list)', async () => {
    const { state, last } = await run(['my knee hurts when I walk']);
    expect(state.protocolId).toBe('general');
    expect(last[0]!.quickReplies).not.toContain('Stomach pain');
    expect(last[0]!.text).toMatch(/I’ll ask a few|let’s figure out|Thanks for telling me/);
  });

  it('starts with empathy and acknowledges answers', async () => {
    const { state } = await run(['I have stomach pain', '2 days']);
    const said = asked(state);
    expect(said[1]).toMatch(/sorry you’re dealing with stomach pain|That sounds uncomfortable|Thanks for telling me/);
    expect(said[2]).toMatch(/^(Got it\.|Thanks\.|Okay, thank you\.|Thanks — that helps\.|Understood\.|Okay\.) /);
  });

  it('"why are you asking?" explains, then repeats the question', async () => {
    const { state } = await run(['headache', 'today', 'gradually', '8', 'fever']);
    const r = await respond(state, 'why are you asking this?', ctx());
    expect(r.messages[0]!.text).toMatch(/rule out neck stiffness/);
    expect(r.messages[1]!.text).toMatch(/neck stiff/);
    expect(r.state.pendingSlot).toBe('neck');
  });

  it('small talk mid-check is answered briefly and the question repeated — not taken as an answer', async () => {
    const { state } = await run(['stomach pain', '2 days', 'upper middle', '3', 'comes and goes', 'none']);
    expect(state.pendingSlot).toBe('food');
    const r = await respond(state, 'thanks', ctx());
    expect(r.state.answers.food).toBeUndefined();
    expect(r.messages[1]!.text).toMatch(/eaten or drunk/);
  });

  it('"stop" ends without an assessment; "start over" resets', async () => {
    const stopped = await run(['headache', 'stop']);
    expect(stopped.state.done).toBe(true);
    expect(stopped.state.stopped).toBe(true);
    expect(stopped.state.disposition).toBeNull();
    const again = await run(['headache', 'start over']);
    expect(again.state.protocolId).toBeNull();
    expect(again.last[0]!.text).toMatch(/let’s start again/);
  });
});
