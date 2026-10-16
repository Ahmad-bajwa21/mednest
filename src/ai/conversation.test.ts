import { classifyMessage, conversationalReply, expandShorthand, isSymptomStatement } from './conversation';

describe('conversation intents', () => {
  it.each([
    ['so wru', 'identity'],
    ['who are you?', 'identity'],
    ['are you a doctor', 'identity'],
    ['I feel you are not a good AI', 'complaint'],
    ['this bot is useless', 'complaint'],
    ['you don’t understand me', 'complaint'],
    ['hi', 'greeting'],
    ['Assalam o alaikum', 'greeting'],
    ['hru', 'how_are_you'],
    ['thanks!', 'thanks'],
    ['ok', 'ack'],
    ['bye', 'bye'],
    ['huh?', 'confused'],
    ['what can you do', 'capabilities'],
    ['why are you asking this', 'why_ask'],
    ['stop', 'stop'],
    ['start over', 'restart'],
    ['I have stomach pain', 'symptom'],
    ['my head hurts', 'symptom'],
    ['feeling dizzy since morning', 'symptom'],
    ['mujhe bukhar hai', 'symptom'],
    ['what is fever?', 'question'],
    ['what is warfarin for', 'question'],
  ])('%s → %s', (text, intent) => {
    expect(classifyMessage(text)).toBe(intent);
  });

  it('expands chat shorthand', () => {
    expect(expandShorthand('so wru').trim()).toBe('so who are you');
    expect(expandShorthand('r u a bot').trim()).toBe('are you a bot');
  });

  it('a question about a symptom is not a symptom report', () => {
    expect(isSymptomStatement('what causes stomach pain?')).toBe(false);
    expect(isSymptomStatement('I keep getting headaches')).toBe(true);
  });

  it('replies like a person, and never to real questions or symptoms', () => {
    expect(conversationalReply('identity', 'general')).toMatch(/MedNest’s health assistant — a computer program, not a person and not a doctor/);
    expect(conversationalReply('complaint', 'symptom')).toMatch(/I’m sorry — it sounds like I haven’t been helpful/);
    expect(conversationalReply('symptom', 'records')).toBeNull();
    expect(conversationalReply('question', 'records')).toBeNull();
  });
});
