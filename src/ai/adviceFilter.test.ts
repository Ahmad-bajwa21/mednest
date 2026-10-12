import { isAdviceSeeking } from './adviceFilter';

describe('advice-seeking guard', () => {
  it('flags diagnosis/treatment questions', () => {
    [
      'Should I stop this medicine?',
      'Do I have diabetes?',
      'Can I double the dose?',
      'What should I eat?',
      'Is it safe to take these together?',
      'What is wrong with my liver?',
      'Which medicine should I take for this?',
    ].forEach((q) => expect(isAdviceSeeking(q)).toBe(true));
  });

  it('allows record-lookup questions', () => {
    [
      'When was the last sugar test?',
      'What are the current medicines?',
      'What changed this year?',
      'Who prescribed Metformin?',
    ].forEach((q) => expect(isAdviceSeeking(q)).toBe(false));
  });

  it('ignores empty input', () => {
    expect(isAdviceSeeking('')).toBe(false);
  });
});
