// Optional model assist for the symptom assistant. When the rule parsers cannot read an
// answer to a choice question ("it's kind of up here under my ribs"), the on-device
// model is asked to pick from the slot's ALLOWED option values only. The engine then
// re-validates the reply against those values, so the model can never introduce a
// symptom, a diagnosis, a medicine or advice. Any failure simply returns null and the
// engine re-asks the question.
import type { LlmRunner } from '../../native/types';
import type { Slot } from './protocols';
import type { Interpreter } from './engine';

export function interpretPrompt(slot: Slot, answer: string): string {
  const options = (slot.options ?? []).map((o) => `"${o.value}" = ${o.label}`).join('\n');
  const shape = slot.kind === 'multi' ? '{"values": [option values]}' : '{"value": option value or null}';
  return `Map the patient's answer to the allowed options. Use ONLY these option values.
If the answer does not clearly match, return null (or an empty list). Do not add anything else.

QUESTION: ${slot.question}
ALLOWED OPTIONS:
${options}

ANSWER: <<<${answer}>>>
Return JSON: ${shape}`;
}

export function makeLlmInterpreter(llm: LlmRunner): Interpreter {
  return async (slot, answer) => {
    if (!slot.options?.length) return null;
    try {
      await llm.ensureReady();
      const raw = await llm.generate(interpretPrompt(slot, answer), { temperature: 0, maxTokens: 64 });
      const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as { value?: unknown; values?: unknown };
      const allowed = new Set(slot.options.map((o) => o.value));
      if (slot.kind === 'multi') {
        const vs = Array.isArray(json.values) ? json.values.filter((v): v is string => typeof v === 'string' && allowed.has(v)) : [];
        return vs.length ? vs : null;
      }
      return typeof json.value === 'string' && allowed.has(json.value) ? json.value : null;
    } catch {
      return null;
    }
  };
}
