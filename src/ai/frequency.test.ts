import { parseFrequency } from './frequency';

describe('parseFrequency', () => {
  it('parses positional 1-0-1 as Morning + Night', () => {
    const r = parseFrequency('1-0-1');
    expect(r.slots).toEqual(['Morning', 'Night']);
    expect(r.perDay).toBe(2);
    expect(r.recognised).toBe(true);
  });

  it('parses 1-1-1-1 as all four slots', () => {
    expect(parseFrequency('1-1-1-1').slots).toEqual(['Morning', 'Afternoon', 'Evening', 'Night']);
  });

  it('parses Latin abbreviations', () => {
    expect(parseFrequency('BD').slots).toEqual(['Morning', 'Night']);
    expect(parseFrequency('TDS').perDay).toBe(3);
    expect(parseFrequency('OD').slots).toEqual(['Morning']);
    expect(parseFrequency('HS').slots).toEqual(['Night']);
  });

  it('flags SOS/PRN as as-needed with no slots', () => {
    const r = parseFrequency('SOS');
    expect(r.asNeeded).toBe(true);
    expect(r.slots).toEqual([]);
    expect(r.recognised).toBe(true);
  });

  it('parses natural language', () => {
    expect(parseFrequency('twice a day').slots).toEqual(['Morning', 'Night']);
    expect(parseFrequency('at night').slots).toEqual(['Night']);
  });

  it('returns unrecognised for gibberish so the field is flagged', () => {
    const r = parseFrequency('zzz??');
    expect(r.recognised).toBe(false);
    expect(r.slots).toEqual([]);
  });
});
