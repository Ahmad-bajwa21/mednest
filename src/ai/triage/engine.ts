// Symptom assistant engine (spec §1, §12). A deterministic state machine over the
// protocols in ./protocols:
//   1. every user message is screened for emergency warning signs FIRST — an emergency
//      ends the questioning immediately with a fixed message;
//   2. the complaint picks a protocol; anything the patient already said in the opening
//      message pre-fills the matching questions, which are then skipped (adaptive);
//   3. remaining relevant questions are asked one at a time; conditional questions are
//      asked only when relevant; history (earlier episodes) replaces repeat questions;
//   4. requests for medicines/doses get a fixed reply (never a recommendation);
//   5. the outcome (disposition) is computed by rules, then summarised by template.
// The optional `interpret` hook lets the on-device model map an answer the parsers could
// not read onto the slot's ALLOWED options — it can never add values or advice.
import { detectRedFlags, highestLevel, sortFlags, EMERGENCY_MESSAGE, EMERGENCY_NUMBER, SELF_HARM_MESSAGE, type FlagLevel, type RedFlag } from './redFlags';
import { isSkip, parseChoice, parseDuration, parseMulti, parseSeverity, parseYesNo } from './parse';
import { acknowledgement, classifyMessage, conversationalReply, empathyLine, isSymptomStatement, type ConvIntent } from '../conversation';
import {
  GENERAL_PROTOCOL,
  PROTOCOL_VERSION,
  PROTOCOLS,
  matchProtocol,
  protocolById,
  type AnswerValue,
  type Answers,
  type Protocol,
  type Slot,
  type TriageContext,
} from './protocols';

export const TRIAGE_ENGINE_VERSION = `triage-engine-0.1 (${PROTOCOL_VERSION})`;

export type Disposition = 'emergency' | 'urgent' | 'gp' | 'self_care' | 'insufficient';

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
  at: string; // ISO timestamp
}

export interface AssistantMessage {
  kind: 'question' | 'emergency' | 'summary' | 'info';
  text: string;
  quickReplies?: string[];
}

export interface TriageState {
  protocolId: string | null;
  complaint: string | null;
  answers: Answers;
  /** Slots filled from free text without a direct question (shown for confirmation). */
  prefilled: string[];
  pendingSlot: string | null;
  /** Times the current question was re-asked because the answer was not understood. */
  retries: number;
  flags: RedFlag[];
  /** Warning signs found in the patient's own words (kept for the whole check). */
  textFlags?: RedFlag[];
  done: boolean;
  disposition: Disposition | null;
  /** The person chose to stop before an outcome (nothing to save). */
  stopped?: boolean;
  transcript: Turn[];
}

export interface TriageOutcome {
  disposition: Disposition;
  heading?: string;
  flags: RedFlag[];
  summary: string;
  advice: string;
  generalInfo: string[];
  safetyNet: string[];
  contextNotes: string[];
}

export type Interpreter = (slot: Slot, answer: string) => Promise<string | string[] | null>;

export const MEDICINE_REPLY =
  'I can’t recommend medicines or doses. A doctor or pharmacist can advise you safely, taking your other medicines and allergies into account.';

export const DISCLAIMER =
  'This is general information from a rules-based assistant, not a diagnosis. It does not replace a doctor’s assessment.';

const MEDICINE_REQUEST =
  /\b(what|which) (medicine|medication|tablet|pill|drug|antibiotic|painkiller|syrup)\b|\b(can|should) i take\b|\bhow much .* (take|give)\b|\bdose of\b|\bdosage\b|\bprescribe\b|\b(kaunsi|konsi) (dawai|dawa|goli)\b/i;

const START_PROMPT = 'Hi. Tell me what is bothering you today, in your own words. For example: "I have stomach pain since yesterday".';

const SKIP_REPLY = 'Not sure';
const MAX_RETRIES = 1;

function nowIso(ctx: TriageContext) {
  return ctx.now.toISOString();
}

function say(state: TriageState, ctx: TriageContext, msg: AssistantMessage): AssistantMessage {
  state.transcript.push({ role: 'assistant', text: msg.text, at: nowIso(ctx) });
  return msg;
}

export function startTriage(ctx: TriageContext): { state: TriageState; messages: AssistantMessage[] } {
  const state: TriageState = {
    protocolId: null,
    complaint: null,
    answers: {},
    prefilled: [],
    pendingSlot: null,
    retries: 0,
    flags: [],
    textFlags: [],
    done: false,
    disposition: null,
    transcript: [],
  };
  return { state, messages: [say(state, ctx, { kind: 'info', text: START_PROMPT })] };
}

/** Feed one user message. Returns a NEW state plus the assistant's replies. */
export async function respond(
  prev: TriageState,
  text: string,
  ctx: TriageContext,
  interpret?: Interpreter,
): Promise<{ state: TriageState; messages: AssistantMessage[] }> {
  const state: TriageState = structuredCloneState(prev);
  const messages: AssistantMessage[] = [];
  const input = text.trim();
  if (!input) return { state, messages };
  state.transcript.push({ role: 'user', text: input, at: nowIso(ctx) });

  // 1. Warning signs first, on every message — even after the assessment ended.
  const free = detectRedFlags(input);
  if (free.length) {
    state.textFlags = [...(state.textFlags ?? []), ...free];
    mergeFlags(state, free);
  }
  if (highestLevel(free) === 'emergency') {
    messages.push(...finishEmergency(state, ctx, free));
    return { state, messages };
  }

  if (state.done) {
    messages.push(say(state, ctx, { kind: 'info', text: 'This assessment is complete. Start a new check if you have a different problem.' }));
    return { state, messages };
  }

  // 2. Conversation before forms: stop, start over, "why are you asking?", complaints
  //    and small talk get a human reply instead of being forced into the questions.
  const intent = classifyMessage(input);
  const pending = state.pendingSlot ? currentProtocol(state).slots.find((s) => s.id === state.pendingSlot) : undefined;
  const seed = state.transcript.length;
  if (intent === 'stop') {
    state.done = true;
    state.stopped = true;
    state.pendingSlot = null;
    messages.push(say(state, ctx, { kind: 'info', text: `Okay, we’ll stop here — this check won’t be saved as an assessment. If you start to feel worse or notice any warning sign, call ${EMERGENCY_NUMBER} or see a doctor. You can start a new check anytime.` }));
    return { state, messages };
  }
  if (intent === 'restart') {
    const fresh = startTriage(ctx);
    fresh.state.transcript = [...state.transcript];
    return { state: fresh.state, messages: [say(fresh.state, ctx, { kind: 'info', text: `Sure, let’s start again. ${START_PROMPT}` })] };
  }
  if (intent === 'why_ask' && pending) {
    messages.push(say(state, ctx, { kind: 'info', text: `${whyWeAsk(pending)} If you’re not sure, just say “not sure”.` }));
    messages.push(say(state, ctx, questionFor(pending, state, ctx)));
    return { state, messages };
  }
  if (intent === 'complaint') {
    messages.push(
      say(state, ctx, {
        kind: 'info',
        text: pending
          ? 'I’m sorry — I know these questions can feel robotic. Each one helps me work out how urgent this is, and there are only a few left. Answer in your own words, or say “not sure” to skip.'
          : conversationalReply('complaint', 'symptom', seed)!,
      }),
    );
    if (pending) messages.push(say(state, ctx, questionFor(pending, state, ctx)));
    return { state, messages };
  }
  if (!state.protocolId && !pending && SMALL_TALK.has(intent) && intent !== 'unclear') {
    messages.push(say(state, ctx, { kind: 'info', text: conversationalReply(intent, 'symptom', seed)! }));
    return { state, messages };
  }

  // 3. Medicine/dose requests get a fixed reply; the current question is repeated.
  if (MEDICINE_REQUEST.test(input)) {
    messages.push(say(state, ctx, { kind: 'info', text: MEDICINE_REPLY }));
    if (state.pendingSlot) {
      const slot = currentProtocol(state).slots.find((s) => s.id === state.pendingSlot);
      if (slot) messages.push(say(state, ctx, questionFor(slot, state, ctx)));
    } else {
      messages.push(say(state, ctx, { kind: 'info', text: START_PROMPT }));
    }
    return { state, messages };
  }

  // 4. Choose the protocol from the opening complaint. A symptom we have no specific
  //    questions for goes straight to the general questions — no forced category list.
  let justStarted = false;
  let answeredNow = false;
  if (!state.protocolId) {
    const chosen = PROTOCOLS.find((p) => p.label.toLowerCase() === input.toLowerCase()) ?? matchProtocol(input);
    const symptomLike = intent === 'symptom' || isSymptomStatement(input);
    if (!chosen && !symptomLike && state.complaint === null) {
      state.complaint = input;
      messages.push(
        say(state, ctx, {
          kind: 'question',
          text: 'I’m not sure I understood what’s bothering you. Could you describe it in your own words — for example “I’ve had stomach pain since yesterday”? Or tap the closest one:',
          quickReplies: PROTOCOLS.map((p) => p.label),
        }),
      );
      return { state, messages };
    }
    const protocol = chosen ?? GENERAL_PROTOCOL;
    state.protocolId = protocol.id;
    // Keep the person's own words as the complaint. A tapped option ("Headache",
    // "Something else") keeps what they typed earlier, if anything.
    const tappedOption = PROTOCOLS.some((p) => p.label.toLowerCase() === input.toLowerCase());
    if (!chosen || tappedOption) state.complaint = state.complaint ?? (chosen ? protocol.label : input);
    else state.complaint = input;
    prefillFromText(state, protocol, state.complaint + ' ' + (state.complaint === input ? '' : input));
    justStarted = true;
  } else if (state.pendingSlot) {
    // 4. Answer to the pending question.
    const protocol = currentProtocol(state);
    const slot = protocol.slots.find((s) => s.id === state.pendingSlot);
    if (slot) {
      // "hi", "thanks", "who are you" etc. are not answers (even to free-text questions).
      const chatty = SMALL_TALK.has(intent) && intent !== 'unclear' && intent !== 'ack';
      const value = chatty ? null : await readAnswer(slot, input, interpret);
      if (value === null && chatty) {
        const reply = conversationalReply(intent, 'symptom', seed) ?? '';
        messages.push(say(state, ctx, { kind: 'info', text: intent === 'identity' || intent === 'capabilities' ? `${reply.split('. ')[0]}. Let’s finish these few questions so I can guide you.` : reply.split(/(?<=[.!?])\s/)[0]! }));
        messages.push(say(state, ctx, questionFor(slot, state, ctx)));
        return { state, messages };
      }
      if (value === null && state.retries < MAX_RETRIES) {
        state.retries++;
        messages.push(say(state, ctx, { ...questionFor(slot, state, ctx), text: `Sorry, I didn’t quite get that. ${questionFor(slot, state, ctx).text}` }));
        return { state, messages };
      }
      const before = state.answers[slot.id];
      if (value?.kind === 'multi' && before?.kind === 'multi') {
        // "Besides vomiting, any of these?" — keep what the opening message told us.
        const extra = value.values.includes('none') ? [] : value.values.map((v, i) => [v, value.labels[i]!] as const);
        const merged = [...before.values.map((v, i) => [v, before.labels[i]!] as const), ...extra.filter(([v]) => !before.values.includes(v))];
        state.answers[slot.id] = { kind: 'multi', values: merged.map(([v]) => v), labels: merged.map(([, l]) => l) };
      } else if (before?.kind === 'multi' && (!value || value.kind === 'skipped')) {
        // keep the prefilled symptoms
      } else {
        state.answers[slot.id] = value ?? (slot.kind === 'text' ? { kind: 'text', value: input } : { kind: 'skipped' });
      }
      state.pendingSlot = null;
      state.retries = 0;
      answeredNow = true;
    }
  }

  // 5. Protocol rules after every answer.
  const protocol = currentProtocol(state);
  // Rule flags are recomputed from ALL answers each turn (a later answer can refine an
  // earlier one); warning signs from the patient's own words are always kept.
  state.flags = [];
  mergeFlags(state, state.textFlags ?? []);
  mergeFlags(state, protocol.rules(state.answers, ctx));
  // A warning-sign question answered "not sure" cannot be ruled out: at least "today".
  mergeFlags(
    state,
    protocol.slots
      .filter((s) => s.critical && state.answers[s.id]?.kind === 'skipped')
      .map((s) => ({ id: `unknown_${s.id}`, level: 'urgent' as const, reason: `${s.critical} could not be ruled out` })),
  );
  if (highestLevel(state.flags) === 'emergency') {
    messages.push(...finishEmergency(state, ctx, state.flags));
    return { state, messages };
  }
  let urgentNoted = false;
  if (highestLevel(state.flags) === 'urgent' && !messages.some((m) => m.kind === 'info') && !state.transcript.some((t) => t.text.startsWith(URGENT_NOTE) || t.text.startsWith(GENTLE_NOTE))) {
    urgentNoted = true;
    // After a disclosure (e.g. thoughts of self-harm) a clinical "see a doctor because
    // of…" line feels cold; the gentle protocols reassure and keep going instead.
    messages.push(
      say(state, ctx, {
        kind: 'info',
        text: protocol.gentle
          ? `${GENTLE_NOTE} I want to make sure you’re safe, so I’ll ask a couple more questions.`
          : `${URGENT_NOTE} ${state.flags.filter((f) => f.level === 'urgent').map((f) => f.reason).join('; ')}. I’ll ask just a few more questions.`,
      }),
    );
  }

  // 6. Next relevant question, or the outcome.
  const next = nextSlot(protocol, state, ctx);
  if (next) {
    state.pendingSlot = next.id;
    // Read like a conversation: empathy when we start, a short thanks after each answer.
    const q = questionFor(next, state, ctx);
    const label = protocol.id === 'general' ? 'this' : protocol.label;
    // No acknowledgement right after the urgent note, or when the question already thanks them.
    const prefix = justStarted ? protocol.opening ?? empathyLine(label, seed) : answeredNow && !urgentNoted && !/^Thank you/.test(q.text) ? acknowledgement(seed, protocol.gentle) : '';
    messages.push(say(state, ctx, { ...q, text: prefix ? `${prefix} ${q.text}` : q.text }));
    return { state, messages };
  }
  const outcome = computeOutcome(state, ctx);
  state.done = true;
  state.disposition = outcome.disposition;
  messages.push(say(state, ctx, { kind: 'summary', text: renderOutcome(outcome) }));
  return { state, messages };
}

const SMALL_TALK = new Set<ConvIntent>(['greeting', 'how_are_you', 'identity', 'capabilities', 'thanks', 'praise', 'bye', 'ack', 'confused', 'unclear']);

/** Why a question matters, in plain words, for "why are you asking?". */
function whyWeAsk(slot: Slot): string {
  const id = slot.id;
  if (slot.critical) return `I ask this to rule out ${slot.critical} — rare, but a sign that needs urgent care.`;
  const WHY: Record<string, string> = {
    onset: 'When it started helps tell a new problem from one that has been going on for a while.',
    severity: 'How strong it is helps decide how soon you should be seen.',
    location: 'Where the pain is tells me which warning signs matter most.',
    pattern: 'Whether it is constant or comes and goes changes how urgent it may be.',
    associated: 'Other symptoms can change how urgent this is.',
    food: 'Recent food can explain stomach upsets and food poisoning.',
    previous: 'Whether this is new or familiar changes how cautious I should be.',
    remedies: 'Your doctor will want to know what you have already taken.',
    temperature: 'A very high temperature needs quicker care.',
    drinking: 'Not being able to drink can lead to dehydration.',
  };
  return WHY[id] ?? 'It helps me understand how urgent this is.';
}

const URGENT_NOTE = 'Please arrange to see a doctor today because of';
const GENTLE_NOTE = 'Thank you for trusting me with that.';

function structuredCloneState(s: TriageState): TriageState {
  return JSON.parse(JSON.stringify(s)) as TriageState;
}

function currentProtocol(state: TriageState): Protocol {
  return protocolById(state.protocolId) ?? GENERAL_PROTOCOL;
}

function mergeFlags(state: TriageState, flags: RedFlag[]) {
  const seen = new Set(state.flags.map((f) => f.id));
  for (const f of flags) if (!seen.has(f.id)) state.flags.push(f);
  state.flags = sortFlags(state.flags);
}

function finishEmergency(state: TriageState, ctx: TriageContext, flags: RedFlag[]): AssistantMessage[] {
  state.done = true;
  state.disposition = 'emergency';
  state.pendingSlot = null;
  const selfHarm = flags.some((f) => f.id === 'self_harm' || f.id === 'suicide_plan' || f.id === 'not_safe');
  const harmOthers = flags.some((f) => f.id === 'harm_others');
  const reasons = flags.filter((f) => f.level === 'emergency').map((f) => f.reason);
  const text = selfHarm
    ? SELF_HARM_MESSAGE
    : harmOthers
      ? `Thank you for being honest with me — that matters. Please call ${EMERGENCY_NUMBER} or go to the nearest emergency department now, and if you can, move to a safe place and ask someone you trust to be with you. Help is available, and you don’t have to handle this alone.`
      : `You mentioned ${joinAnd(reasons)}. ${EMERGENCY_MESSAGE}`;
  return [say(state, ctx, { kind: 'emergency', text })];
}

function nextSlot(protocol: Protocol, state: TriageState, ctx: TriageContext): Slot | undefined {
  return protocol.slots.find((s) => {
    const a = state.answers[s.id];
    const partialMulti = a?.kind === 'multi' && state.prefilled.includes(s.id) && !a.values.includes('none');
    if (a && !partialMulti) return false;
    if (partialMulti && state.transcript.some((t) => t.role === 'assistant' && t.text.includes(otherThan(a.labels)))) return false;
    return s.askIf ? s.askIf(state.answers, ctx) : true;
  });
}

function otherThan(labels: string[]) {
  return `Besides ${joinAnd(labels.map((l) => l.toLowerCase()))}`;
}

function questionFor(slot: Slot, state: TriageState, ctx: TriageContext): AssistantMessage {
  const a = state.answers[slot.id];
  // History-aware: an earlier episode of the same problem replaces "had it before?".
  if (slot.id === 'previous') {
    const prior = ctx.priorEpisodes.filter((e) => e.protocolId === state.protocolId).sort((x, z) => z.date.localeCompare(x.date))[0];
    if (prior) {
      return {
        kind: 'question',
        text: `Your history shows you reported ${prior.complaint.toLowerCase()} on ${prior.date}. ${slot.question}`,
        quickReplies: ['Yes', 'No', SKIP_REPLY],
      };
    }
  }
  if (slot.kind === 'multi' && a?.kind === 'multi') {
    return {
      kind: 'question',
      text: `${otherThan(a.labels)}, do you have any of these?`,
      quickReplies: (slot.options ?? []).filter((o) => !a.values.includes(o.value)).map((o) => o.label),
    };
  }
  const quickReplies =
    slot.kind === 'yesno' ? ['Yes', 'No', SKIP_REPLY]
    : slot.kind === 'scale' ? ['2 – mild', '5 – moderate', '8 – severe', '10 – worst']
    : slot.options ? [...slot.options.map((o) => o.label), SKIP_REPLY]
    : [SKIP_REPLY];
  return { kind: 'question', text: slot.question, quickReplies };
}

async function readAnswer(slot: Slot, input: string, interpret?: Interpreter): Promise<AnswerValue | null> {
  if (isSkip(input)) return { kind: 'skipped' };
  const opts = slot.options ?? [];
  const label = (v: string) => opts.find((o) => o.value === v)?.label ?? v;
  switch (slot.kind) {
    case 'duration': {
      const d = parseDuration(input);
      return d ? { kind: 'duration', hours: d.hours, text: d.text } : null;
    }
    case 'scale': {
      const n = parseSeverity(input);
      return n === null ? null : { kind: 'scale', value: n };
    }
    case 'yesno': {
      const b = parseYesNo(input);
      return b === null ? null : { kind: 'yesno', value: b };
    }
    case 'text':
      return { kind: 'text', value: input };
    case 'choice': {
      let v = parseChoice(input, opts);
      if (!v && interpret) {
        const m = await interpret(slot, input);
        v = typeof m === 'string' && opts.some((o) => o.value === m) ? m : null; // allowed values only
      }
      return v ? { kind: 'choice', value: v, label: label(v) } : null;
    }
    case 'multi': {
      let vs = parseMulti(input, opts);
      if (!vs && interpret) {
        const m = await interpret(slot, input);
        const arr = Array.isArray(m) ? m.filter((x) => x === 'none' || opts.some((o) => o.value === x)) : [];
        vs = arr.length ? arr : null;
      }
      return vs ? { kind: 'multi', values: vs, labels: vs.map(label) } : null;
    }
  }
}

/** Fill slots from what the patient already said, so we never ask it again. */
function prefillFromText(state: TriageState, protocol: Protocol, text: string) {
  for (const slot of protocol.slots) {
    if (!slot.prefillable || state.answers[slot.id]) continue;
    let v: AnswerValue | null = null;
    const opts = slot.options ?? [];
    if (slot.kind === 'duration') {
      const d = parseDuration(text);
      if (d) v = { kind: 'duration', hours: d.hours, text: d.text };
    } else if (slot.kind === 'scale') {
      const n = parseSeverity(text, true);
      if (n !== null) v = { kind: 'scale', value: n };
    } else if (slot.kind === 'choice') {
      const c = opts.filter((o) => o.aliases?.test(text.toLowerCase()));
      if (c.length === 1) v = { kind: 'choice', value: c[0]!.value, label: c[0]!.label };
    } else if (slot.kind === 'multi') {
      const vs = parseMulti(text, opts)?.filter((x) => x !== 'none');
      if (vs?.length) v = { kind: 'multi', values: vs, labels: vs.map((x) => opts.find((o) => o.value === x)?.label ?? x) };
    }
    if (v) {
      state.answers[slot.id] = v;
      state.prefilled.push(slot.id);
    }
  }
}

/* ============================== outcome ============================== */

const ADVICE: Record<Disposition, string> = {
  emergency: EMERGENCY_MESSAGE,
  urgent: `Please get seen by a doctor today — within the next few hours — at a clinic, urgent care or an emergency department. If any warning sign below appears, go to the emergency department or call ${EMERGENCY_NUMBER} straight away.`,
  gp: 'Please book an appointment with a general physician (GP) in the next few days.',
  self_care: 'From what you told me, this can usually be watched at home for now.',
  insufficient: 'I don’t have enough information to guide you safely. If you are worried, please speak to a doctor.',
};

export function computeOutcome(state: TriageState, ctx: TriageContext): TriageOutcome {
  const protocol = currentProtocol(state);
  const flags = sortFlags(state.flags);
  const level: FlagLevel | null = highestLevel(flags);
  const asked = protocol.slots.filter((s) => (s.askIf ? s.askIf(state.answers, ctx) : true));
  const skipped = asked.filter((s) => !state.answers[s.id] || state.answers[s.id]!.kind === 'skipped').length;

  let disposition: Disposition;
  if (level === 'emergency') disposition = 'emergency';
  else if (level === 'urgent') disposition = 'urgent';
  else if (asked.length && skipped / asked.length >= 0.5) disposition = 'insufficient';
  else if (level === 'gp') disposition = 'gp';
  else {
    const sev = state.answers.severity?.kind === 'scale' ? state.answers.severity.value : null;
    disposition = sev !== null && sev >= 6 ? 'gp' : 'self_care';
  }

  const own = disposition !== 'emergency' ? protocol.advice?.[disposition] : undefined;
  let advice = own ?? ADVICE[disposition];
  if (disposition === 'self_care' && !own) advice += ` If it is not better within ${protocol.seeGpAfterDays} day${protocol.seeGpAfterDays === 1 ? '' : 's'}, or it gets worse, see a doctor.`;
  // The reasons are listed separately ("Why:") by renderOutcome.

  const contextNotes: string[] = [];
  if (ctx.allergies?.trim()) contextNotes.push(`Your record lists an allergy: ${ctx.allergies.trim()}. Tell any doctor or pharmacist you see.`);
  if (ctx.activeMedicines.length) contextNotes.push(`Medicines recorded in MedNest: ${ctx.activeMedicines.join(', ')}. Tell the doctor what you are actually taking and how. Do not stop or change a medicine without medical advice.`);
  const prior = ctx.priorEpisodes.filter((e) => e.protocolId === protocol.id);
  if (prior.length) contextNotes.push(`You have reported this ${prior.length} time${prior.length === 1 ? '' : 's'} before (last on ${prior.map((p) => p.date).sort().pop()}). Repeated episodes are worth discussing with a doctor.`);

  return {
    disposition,
    heading: (disposition !== 'emergency' ? protocol.heading?.[disposition] : undefined) ?? HEADINGS[disposition],
    flags,
    summary: summarise(state, protocol),
    advice,
    generalInfo: disposition === 'self_care' || disposition === 'gp' ? protocol.generalInfo : [],
    safetyNet: protocol.safetyNet,
    contextNotes,
  };
}

/**
 * What the problem is called in records and summaries: the protocol name, or for the
 * general questions a cleaned-up version of what the person described. A question or
 * an unclear message is never recorded as the patient's problem.
 */
export function complaintLabel(state: Pick<TriageState, 'protocolId' | 'complaint'>): string {
  const protocol = protocolById(state.protocolId);
  if (protocol && protocol.id !== 'general') return protocol.label;
  const c = (state.complaint ?? '').trim();
  if (!c || !isSymptomStatement(c)) return 'Symptom check';
  const cleaned = c
    .replace(/^\s*(i\s*(have|'ve got|got|am having|'m having|have been having|feel|'m feeling|am feeling|keep getting|keep)|feeling|having|been having|suffering from|mujhe|mera|meri)\s+/i, '')
    .replace(/^\s*(a|an|some|really|very|bad|severe)\s+/i, '')
    .replace(/[.!]+$/, '')
    .trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : 'Symptom check';
}

export function summarise(state: TriageState, protocol: Protocol = currentProtocol(state)): string {
  const parts: string[] = [];
  for (const slot of protocol.slots) {
    const a = state.answers[slot.id];
    if (!a || a.kind === 'skipped') continue;
    const v =
      a.kind === 'duration' ? (a.text === 'today' || a.text.startsWith('since') || a.text.includes('ago') ? a.text : `about ${a.text} ago`)
      : a.kind === 'scale' ? `${a.value}/10`
      : a.kind === 'choice' ? a.label
      : a.kind === 'multi' ? (a.values.includes('none') && a.values.length === 1 ? 'none' : a.labels.filter((l) => l !== 'None of these').join(', '))
      : a.kind === 'yesno' ? (a.value ? 'yes' : 'no')
      : a.value;
    parts.push(`${slot.label}: ${v}`);
  }
  const words = state.complaint && isSymptomStatement(state.complaint) ? state.complaint : null;
  return [`Problem: ${complaintLabel(state)}`, ...(words ? [`In your words: “${words}”`] : []), ...parts].join('\n');
}

const HEADINGS: Record<Disposition, string> = {
  emergency: 'Seek emergency care now',
  urgent: 'See a doctor today',
  gp: 'See a GP in the next few days',
  self_care: 'Watch at home for now',
  insufficient: 'Not enough information',
};

export function renderOutcome(o: TriageOutcome): string {
  const lines = [`${o.heading ?? HEADINGS[o.disposition]}`, '', o.advice];
  const reasons = o.flags.filter((f) => f.level === (o.disposition === 'gp' ? 'gp' : o.disposition)).map((f) => f.reason);
  if (reasons.length && (o.disposition === 'urgent' || o.disposition === 'gp')) lines.push('', 'Why:', ...uniqText(reasons).map((r) => `• ${cap1(r)}`));
  lines.push('', 'What you told me:', o.summary);
  if (o.generalInfo.length) lines.push('', 'General information:', ...o.generalInfo.map((s) => `• ${s}`));
  if (o.safetyNet.length) lines.push('', `Go to the emergency department or call ${EMERGENCY_NUMBER} if:`, ...o.safetyNet.map((s) => `• ${s}`));
  if (o.contextNotes.length) lines.push('', 'From your records:', ...o.contextNotes.map((s) => `• ${s}`));
  lines.push('', DISCLAIMER);
  return lines.join('\n');
}

export function dispositionHeading(d: Disposition): string {
  return HEADINGS[d];
}

function uniqText(xs: string[]): string[] {
  return [...new Set(xs)];
}

function cap1(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function joinAnd(xs: string[]): string {
  const u = [...new Set(xs)];
  if (u.length <= 1) return u[0] ?? '';
  return `${u.slice(0, -1).join(', ')} and ${u[u.length - 1]}`;
}
