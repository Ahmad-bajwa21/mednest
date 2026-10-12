import { valueIsGrounded, findUngroundedFields } from './copyOnly';

const OCR = `Dr. S. Khan
Metformin 500 mg 1-0-1 for 30 days
HbA1c 7.2 %  (range below 5.7)
Cholesterol 182 mg/dL`;

describe('copy-only check', () => {
  it('accepts a number present in the OCR text', () => {
    expect(valueIsGrounded('7.2', OCR)).toBe(true);
    expect(valueIsGrounded('500 mg', OCR)).toBe(true);
  });

  it('rejects a number NOT in the OCR text (hallucinated value)', () => {
    expect(valueIsGrounded('8.1', OCR)).toBe(false);
    expect(valueIsGrounded('250 mg', OCR)).toBe(false);
  });

  it('accepts a name present in the text', () => {
    expect(valueIsGrounded('Metformin', OCR)).toBe(true);
    expect(valueIsGrounded('Dr. S. Khan', OCR)).toBe(true);
  });

  it('rejects a hallucinated medicine name', () => {
    expect(valueIsGrounded('Amoxicillin', OCR)).toBe(false);
  });

  it('treats null/empty as unsure-compatible (returns true, already null)', () => {
    expect(valueIsGrounded(null, OCR)).toBe(true);
    expect(valueIsGrounded('', OCR)).toBe(true);
  });

  it('handles thousands separators', () => {
    expect(valueIsGrounded('1,000', 'Paracetamol 1000 mg')).toBe(true);
  });

  it('findUngroundedFields lists only the hallucinated fields', () => {
    const bad = findUngroundedFields({ doctor: 'Dr. S. Khan', value: '9.9', test: 'HbA1c' }, OCR);
    expect(bad).toEqual(['value']);
  });
});
