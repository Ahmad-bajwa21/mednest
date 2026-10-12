// Advice-seeking guard (spec §6.4 / S14). A lightweight rule-based check runs BEFORE
// the Ask model. Diagnosis/treatment questions get a fixed refusal, never a model
// answer. The relevant records are still shown afterwards.

export const ADVICE_REFUSAL =
  "I can't advise on that. I can show you what your records say, and you can discuss it with your doctor.";

const ADVICE_PATTERNS: RegExp[] = [
  /\bshould i\b/i,
  /\bdo i have\b/i,
  /\bis it (safe|ok|okay|fine|normal|dangerous|bad)\b/i,
  /\bcan i (stop|start|take|increase|decrease|reduce|double|skip|change)\b/i,
  /\bwhat('?s| is) wrong with\b/i,
  /\b(diagnos|prognos)/i,
  /\b(cure|treat(ment)?|remedy)\b/i,
  /\bwhich medicine should\b/i,
  /\bhow much should i (take|have)\b/i,
  /\bwhat should i (do|take|eat|avoid)\b/i,
  /\bdo i need (to see|a doctor|medicine|surgery)\b/i,
];

export function isAdviceSeeking(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  return ADVICE_PATTERNS.some((re) => re.test(q));
}
