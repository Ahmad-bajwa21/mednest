// Copy-only check (spec §6.4 RULE): the model must never produce a name or number
// from its own memory. Every extracted value MUST appear in the OCR text. If it does
// not, the field is marked unsure and surfaced on the review screen (S9).
//
// This is the single most important safety check in the pipeline — "being unsure is
// fine, being confidently wrong is not" (§6.7).

// Normalise for forgiving comparison: lowercase, collapse whitespace, drop commas in
// numbers so "1,000" matches "1000". We keep digits/letters and decimal points.
function normalise(s: string): string {
  return s.toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ').trim();
}

// A number appears if its numeric token is present in the OCR text, ignoring
// thousands separators and surrounding units.
function numberAppears(value: string, haystack: string): boolean {
  // Strip thousands separators from the value too, so "1,000" tokenises as "1000".
  const nums = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/g);
  if (!nums) return false;
  return nums.every((n) => new RegExp(`(^|[^\\d.])${n.replace('.', '\\.')}([^\\d]|$)`).test(haystack));
}

// A text value appears if every significant word (len >= 3) is found. Short tokens
// (mg, ml, bd) are allowed to be absent because OCR often mangles them.
function textAppears(value: string, haystack: string): boolean {
  const words = normalise(value).split(' ').filter((w) => w.length >= 3 && !/^\d/.test(w));
  if (words.length === 0) return true; // nothing substantive to verify
  return words.every((w) => haystack.includes(w));
}

/**
 * @returns true if `value` is grounded in `ocrText` (safe to keep), false if it must
 * be flagged unsure.
 */
export function valueIsGrounded(value: string | null | undefined, ocrText: string): boolean {
  if (value == null || value === '') return true; // nulls are already "unsure"
  const hay = normalise(ocrText);
  const hasDigits = /\d/.test(value);
  if (hasDigits && !numberAppears(value, hay)) return false;
  return textAppears(value, hay);
}

/**
 * Given extracted field values keyed by name, return the names of fields that are NOT
 * grounded in the OCR text and therefore must be added to the "unsure" set.
 */
export function findUngroundedFields(fields: Record<string, string | null | undefined>, ocrText: string): string[] {
  return Object.entries(fields)
    .filter(([, v]) => !valueIsGrounded(v, ocrText))
    .map(([k]) => k);
}
