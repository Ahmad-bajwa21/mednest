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

import { symptomOffer, topicForSymptom, wantsCheck } from './conversation';
describe('separating information from symptom checks', () => {
  it('offers a choice with empathy', () => {
    const o = symptomOffer('I have stomach pain');
    expect(o.text).toMatch(/sorry/i);
    expect(o.quickReplies).toEqual(['Check my symptoms', 'Just general information']);
    expect(symptomOffer('I feel depressed').text).toMatch(/gentle questions/);
  });
  it('understands the choice', () => {
    expect(wantsCheck('Check my symptoms')).toBe(true);
    expect(wantsCheck('yes please')).toBe(true);
    expect(wantsCheck('Just general information')).toBe(false);
    expect(wantsCheck('hmm')).toBeNull();
  });
  it('finds the topic in a described symptom', () => {
    expect(topicForSymptom('I have stomach pain since yesterday')).toBe('stomach pain');
    expect(topicForSymptom('I feel depressed and my thoughts are getting worse')).toBe('depression');
    expect(topicForSymptom('feeling anxious all the time')).toBe('anxiety');
  });
});
