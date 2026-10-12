// Fixed prompts for the four model tasks (spec §6.4). Low temperature, JSON output
// validated against a schema. The model only copies from the provided text — code
// enforces that with the copy-only check and the medicine/test matchers.

export const GENERATION = { temperature: 0.1, topP: 0.9 } as const;

// Task A — classify & extract. OCR text in, structured JSON out.
export function taskAPrompt(ocrText: string): string {
  return `You read medical documents. Use ONLY the text below. Do not guess.
If something is unclear or missing, use null and add its name to "unsure".

Return JSON:
{
 "type": "prescription|lab_report|scan_report|discharge_summary|bill|other",
 "patient_name": string|null,
 "date": "YYYY-MM-DD"|null,
 "doctor": string|null,
 "diagnosis_written": string|null,
 "medicines": [{"name":..., "dose":..., "frequency":..., "duration_days":..., "instructions":...}],
 "results": [{"test":..., "value":..., "unit":..., "range":...}],
 "follow_up": string|null,
 "unsure": [field names]
}

DOCUMENT TEXT:
<<<${ocrText}>>>`;
}

// Task B — plain-language explanation of ONE document, given its extracted JSON.
// Restate only; may compare a value with the printed range; must end with the disclaimer.
export function taskBPrompt(extractedJson: string): string {
  return `Restate this document in plain, kind, simple words for the patient.
Rules: restate only what is in the data; you MAY say a value is above or below the range
printed on the report; do NOT say what the user should do except "discuss with your doctor";
end with: "Information only. Not medical advice."

DATA:
${extractedJson}`;
}

// Task C — pattern note / summary phrasing. The trend maths is done in code; the model
// only phrases the already-computed fact.
export function taskCPrompt(structuredFact: string): string {
  return `Write ONE short, neutral sentence stating this fact for the patient.
Rules: state only what the records show; never name a disease the documents do not name;
never suggest treatment; end with "Discuss with your doctor."

FACT:
${structuredFact}`;
}

// Task D — answer a question using ONLY retrieved records.
export function taskDPrompt(chunksWithIdsAndDates: string, question: string): string {
  return `Answer using ONLY the records below. Quote dates.
If the answer is not in the records, say you could not find it.
Do not diagnose. Do not advise starting, stopping or changing any medicine.
RECORDS:
<<<${chunksWithIdsAndDates}>>>
QUESTION: <<<${question}>>>
Return JSON: {"answer": string, "source_ids": [..]}`;
}
