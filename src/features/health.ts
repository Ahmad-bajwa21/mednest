// General Health Info assistant — native app. Uses the on-device open-source model
// (native.llm, e.g. Gemma) — no API, no server, offline, free. General education only;
// refuses personal diagnosis/treatment. No internet access, so no web search.
import { native } from '../native';
import { detectRedFlags, EMERGENCY_MESSAGE, SELF_HARM_MESSAGE } from '../ai/triage/redFlags';

export const HEALTH_SYSTEM = `You are a careful health-information assistant inside the MedNest app.
Rules you must always follow:
- Give only GENERAL, educational information about conditions, symptoms, tests and medicines.
- You are NOT a doctor. Never diagnose the user, never tell them which medicine or what dose to take, never interpret their personal results, and never give emergency treatment instructions.
- If asked for personal diagnosis or treatment, briefly decline and tell them to see a doctor.
- Keep answers short and in plain words. End EVERY answer with: "This is general information, not medical advice — please see a doctor."
- You have no internet access. Answer from general knowledge and say clearly when you are unsure.`;

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

// The LlmRunner takes a single prompt string, so format the conversation chat-style.
export function buildHealthPrompt(history: ChatTurn[]): string {
  const convo = history.map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.text}`).join('\n');
  return `${HEALTH_SYSTEM}\n\n${convo}\nAssistant:`;
}

export async function askHealthInfo(history: ChatTurn[]): Promise<string> {
  // Emergency warning signs get the fixed message in code — never a model answer.
  const last = [...history].reverse().find((t) => t.role === 'user');
  const flags = last ? detectRedFlags(last.text) : [];
  if (flags[0]?.level === 'emergency') return flags.some((f) => f.id === 'self_harm') ? SELF_HARM_MESSAGE : EMERGENCY_MESSAGE;
  await native.llm.ensureReady();
  const out = await native.llm.generate(buildHealthPrompt(history), { temperature: 0.4, maxTokens: 400 });
  return out.trim();
}
