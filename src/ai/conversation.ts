// Conversation layer shared by every chat (Ask, symptom check, general health
// questions). Before anything is looked up or forced into a symptom flow, it works out
// what kind of message this is — a greeting, "who are you", thanks, feedback, a
// question about why we ask something, a symptom the person is describing, or a real
// question — and gives a natural, human reply where that is all that is needed.
// Rules in code (predictable, testable); replies vary so the chat doesn't feel canned.

export type ConvIntent =
  | 'greeting'
  | 'how_are_you'
  | 'identity'
  | 'capabilities'
  | 'thanks'
  | 'praise'
  | 'complaint'
  | 'bye'
  | 'ack'
  | 'confused'
  | 'why_ask'
  | 'stop'
  | 'restart'
  | 'symptom'
  | 'topic'
  | 'question'
  | 'unclear';

const norm = (s: string) =>
  ` ${s.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9'\s?]/g, ' ').replace(/\s+/g, ' ').trim()} `;

// Common chat shorthand → words, so "so wru" is understood as "so who are you".
const SHORTHAND: Array<[RegExp, string]> = [
  [/\bwru\b/g, 'who are you'],
  [/\bwbu\b/g, 'what about you'],
  [/\bhru\b/g, 'how are you'],
  [/\bhw r u\b/g, 'how are you'],
  [/\br u\b/g, 'are you'],
  [/\bu r\b/g, 'you are'],
  [/\bur\b/g, 'your'],
  [/\bu\b/g, 'you'],
  [/\by\b/g, 'why'],
  [/\bpls\b|\bplz\b/g, 'please'],
  [/\bthx\b|\bty\b|\btnx\b/g, 'thanks'],
  [/\bidk\b/g, "i don't know"],
  [/\bnvm\b/g, 'never mind'],
  [/\bim\b/g, "i'm"],
  [/\bdont\b/g, "don't"],
  [/\bcant\b/g, "can't"],
];

export function expandShorthand(text: string): string {
  let t = norm(text);
  for (const [re, w] of SHORTHAND) t = t.replace(re, w);
  return t.replace(/\s+/g, ' ');
}

// Body parts and symptom words (English + common Roman Urdu) for "is this a symptom?".
const SYMPTOM_WORDS =
  /\b(pain|painful|ache|aches|aching|hurts?|hurting|sore|fever|temperature|cough|coughing|cold|flu|vomit\w*|throwing up|nause\w*|diarrh\w*|loose motions?|constipat\w*|dizz\w*|faint\w*|headaches?|migraines?|rash(es)?|itch\w*|swell\w*|swollen|bleed\w*|blood|burn\w*|cramps?|tired|fatigue|weak\w*|numb\w*|breath\w*|wheez\w*|sneez\w*|runny|blocked nose|chills|sweat\w*|infection|injur\w*|sprain|bruise|lump|stiff|insomnia|can't sleep|anxious|anxiety|panic|depress\w*|unwell|sick|ill|dard|bukhar|khansi|ulti|dast|chakkar|kamzori|zukam|nazla)\b/;
const BODY_PARTS =
  /\b(stomach|tummy|belly|abdomen|head|chest|back|neck|throat|ear|ears|eye|eyes|nose|tooth|teeth|knee|leg|legs|arm|arms|hand|foot|feet|joint|joints|skin|heart|kidney|side|shoulder|hip|pet|sar|seena|kamar|gala)\b/;
const I_HAVE = /^\s*(feeling|having|been having|been feeling|got|suffering from)\b|\b(suffering from|i have|i've got|i got|i am having|i'm having|i've been having|i feel|i'm feeling|i am feeling|i keep|my \w+ (hurts?|is hurting|aches|is aching|is sore|is swollen|is bleeding)|mujhe|mera|meri|mere)\b/;

// Mood and mental-health words (English + common Roman Urdu).
const MENTAL =
  /\b(depress\w*|anxi\w*|panic\w*|stress\w*|sad|sadness|hopeless\w*|worthless|low mood|(feel|feeling|felt)( very| so| really| quite)? (low|down|sad|empty|hopeless|numb|worthless|lonely|anxious|stressed)|lonely|loneliness|can't cope|cannot cope|overwhelm\w*|overthink\w*|intrusive thoughts?|dark thoughts?|negative thoughts?|bad thoughts?|thoughts? (are|is|keep) (getting )?(worse|bad)|mental health|mentally|crying|empty inside|numb inside|suicid\w*|self[- ]?harm|kill myself|end my life|don't want to live|udas\w*|pareshan\w*|tension|ghabrahat|dil nahi lagta)\b/;

/** Mood / mental-health concern (depression, anxiety, worrying thoughts). */
export function isMentalHealth(text: string): boolean {
  return MENTAL.test(expandShorthand(text));
}

const QUESTION_START = /^\s*(what|whats|what's|why|how|which|when|where|who|is|are|can|could|should|does|do|tell me about|explain|define|list)\b/;

/**
 * True when the person is describing their OWN symptom ("I have stomach pain",
 * "my head hurts", "I feel depressed"). A question ("why do I have headaches?",
 * "what is anxiety?") is never a symptom report.
 */
export function isSymptomStatement(text: string): boolean {
  const t = expandShorthand(text);
  if (QUESTION_START.test(t) || /\?\s*$/.test(t)) return false;
  if (/\b(you|your)\b/.test(t) && !/\bmy\b/.test(t)) return false; // talking about the assistant
  const symptom = SYMPTOM_WORDS.test(t) || MENTAL.test(t) || (BODY_PARTS.test(t) && /\b(pain|hurts?|ache|sore|problem|issue|dard)\b/.test(t));
  return symptom && I_HAVE.test(t);
}

/** A bare health term with no first person ("headaches", "anxiety", "stomach pain"). */
export function isHealthTopic(text: string): boolean {
  const t = expandShorthand(text);
  const words = t.trim().split(' ').filter(Boolean);
  if (!words.length || words.length > 5 || I_HAVE.test(t) || QUESTION_START.test(t) || /\?\s*$/.test(t)) return false;
  return (
    SYMPTOM_WORDS.test(t) ||
    MENTAL.test(t) ||
    (BODY_PARTS.test(t) && /\b(pain|ache|problem|dard)\b/.test(t)) ||
    /\b(diabetes|blood pressure|hypertension|asthma|cholesterol|thyroid|gout|arthritis|allergy|allergies|typhoid|dengue|malaria|covid|ulcer|acidity|gastritis|piles|hepatitis|anemia|anaemia)\b/.test(t)
  );
}

export function classifyMessage(text: string): ConvIntent {
  const t = expandShorthand(text);
  const words = t.trim().split(' ').filter(Boolean);
  if (!words.length) return 'unclear';

  if (/\b(stop|cancel|quit|exit|end this|leave it|never mind|forget it|bas karo|chhoro)\b/.test(t) && words.length <= 6) return 'stop';
  if (/\b(start (over|again)|restart|new check|begin again|reset)\b/.test(t)) return 'restart';
  if (/\bwhy (are|do) you (ask|need|want)|why (this|that) question|why does (it|that) matter|why do you need to know|what does (that|this) have to do\b/.test(t)) return 'why_ask';
  if (/\b(not (a )?(good|great|helpful|smart|useful)|useless|stupid|dumb|bad (ai|bot|app)|terrible|worst|you suck|not working|doesn't work|don't understand me|you don't understand|robotic|annoying|waste of time|bekar|bakwas)\b/.test(t) && /\b(you|your|this|it|ai|bot|app|chat)\b/.test(t))
    return 'complaint';
  if (isSymptomStatement(text)) return 'symptom';
  if (isHealthTopic(text)) return 'topic';
  if (/\b(who are you|what are you|are you (a |an )?(bot|robot|ai|human|real|doctor|person)|your name|who made you|who built you|ap kon|aap kaun|tum kaun)\b/.test(t)) return 'identity';
  if (/\b(what can you do|how (can|do) you help|what do you do|help me|how does this work|how to use)\b/.test(t) || /^\s*help\s*$/.test(t)) return 'capabilities';
  if (/\b(how are you|how're you|how r you|how are things|how is it going|how's it going|what about you|kaise ho|kya haal)\b/.test(t)) return 'how_are_you';
  if (/^\s*(hi+|hello+|hey+|hiya|yo|salam|salaam|assalam\w*|aoa|good (morning|afternoon|evening))\b/.test(t) && words.length <= 5) return 'greeting';
  if (/\b(thanks|thank you|thankyou|shukriya|jazakallah\w*|appreciate it)\b/.test(t)) return 'thanks';
  if (/\b(good (job|bot|ai)|great|awesome|nice|helpful|well done|love it|perfect|amazing)\b/.test(t) && words.length <= 8) return 'praise';
  if (/^\s*(bye|goodbye|good bye|see you|cya|khuda hafiz|allah hafiz|take care)\b/.test(t)) return 'bye';
  if (/^\s*(what|huh|eh|sorry|i don't understand|didn't get (it|that)|what do you mean|matlab)\s*\??\s*$/.test(t)) return 'confused';
  if (/^\s*(ok|okay|k|kk|hmm+|mm+|fine|alright|cool|sure|got it|oh|ah|acha|achha|theek)\s*$/.test(t)) return 'ack';
  if (/[?]|^\s*(what|why|how|when|which|who|where|is|are|can|could|do|does|should|will|tell|explain|list|show)\b/.test(t) || words.length >= 3) return 'question';
  return 'unclear';
}

/** Deterministic variety: same conversation position → same choice (testable). */
function pick<T>(options: T[], seed: number): T {
  return options[Math.abs(seed) % options.length]!;
}

export type ChatScope = 'records' | 'symptom' | 'general';

const SCOPE_HELP: Record<ChatScope, string> = {
  records: 'I can answer questions about your saved records — your medicines (what they’re for, when to take them, for how long), results, follow-ups and allergies — and look medicines up in trusted medical sources. If you’re feeling unwell, just tell me what’s going on and I’ll ask a few questions.',
  symptom: 'Tell me what’s bothering you in your own words — for example “I’ve had stomach pain since yesterday” — and I’ll ask a few short questions, then tell you how soon to get care and what to watch for.',
  general: 'Ask me about a condition or a medicine — for example “what is gout?” or “what is warfarin used for?” — and I’ll look it up in trusted sources like MedlinePlus and the FDA, with links. If you’re feeling unwell, tell me what’s going on.',
};

/**
 * A natural reply for conversational messages; null when the message needs real
 * handling (a symptom, a question, or an answer to the current question).
 */
export function conversationalReply(intent: ConvIntent, scope: ChatScope, seed = 0, name?: string | null): string | null {
  const hi = name ? `, ${name}` : '';
  switch (intent) {
    case 'greeting':
      return pick([`Hello${hi}! How can I help today?`, `Hi${hi} — good to see you. What would you like to know?`, `Assalam o alaikum${hi}! How are you feeling today?`], seed) + ' ' + (scope === 'symptom' ? 'If something is bothering you, tell me about it in your own words.' : '');
    case 'how_are_you':
      return pick(['I’m doing well, thanks for asking! More importantly — how are you feeling?', 'All good on my side, thank you. How about you — anything bothering you today?'], seed);
    case 'identity':
      return `I’m MedNest’s health assistant — a computer program, not a person and not a doctor. ${scope === 'records' ? 'I work from your saved records and trusted medical sources.' : scope === 'symptom' ? 'I ask questions based on clinical rules to help you decide how soon to get care.' : 'I look things up in trusted medical sources and show you the links.'} I can’t diagnose, but I can help you understand and organise things. What can I help with?`;
    case 'capabilities':
      return SCOPE_HELP[scope];
    case 'thanks':
      return pick(['You’re welcome! Is there anything else I can help with?', 'Happy to help. Take care — and ask me anytime.', 'Anytime! Let me know if anything else comes up.'], seed);
    case 'praise':
      return pick(['Thank you, that’s kind! What else can I help with?', 'Glad it helped! Anything else?'], seed);
    case 'complaint':
      return `I’m sorry — it sounds like I haven’t been helpful, and that’s frustrating. I’m a fairly simple assistant: I work best with short, specific messages. ${SCOPE_HELP[scope]} You can also tell me what I got wrong and I’ll try again.`;
    case 'bye':
      return pick(['Take care! Come back anytime.', 'Goodbye — I hope you feel well.', 'Allah hafiz! Look after yourself.'], seed);
    case 'ack':
      return pick(['Okay. Anything else you’d like to know?', 'Alright — I’m here if you need anything else.'], seed);
    case 'confused':
      return `Sorry, let me be clearer. ${SCOPE_HELP[scope]}`;
    case 'unclear':
      return `I’m not sure I understood that. ${SCOPE_HELP[scope]}`;
    default:
      return null;
  }
}

/** Short acknowledgements between symptom questions, so it reads like a conversation. */
export function acknowledgement(seed: number, gentle = false): string {
  // Neutral on purpose: it follows yes AND no answers to sensitive questions.
  if (gentle) return pick(['Thank you for sharing that.', 'Thank you.', 'Thank you for being open with me.', 'I appreciate you telling me.'], seed);
  return pick(['Got it.', 'Thanks.', 'Okay, thank you.', 'Thanks — that helps.', 'Understood.', 'Okay.'], seed);
}

/** Opening line when a symptom flow starts. */
export function empathyLine(label: string, seed: number): string {
  const what = label.toLowerCase();
  return pick(
    [`I’m sorry you’re dealing with ${what}. I’ll ask a few quick questions so I can guide you — answer in your own words or tap an option.`,
     `That sounds uncomfortable — let’s figure out how soon you should get it checked. A few quick questions about the ${what}:`,
     `Thanks for telling me. I’ll ask a few short questions about the ${what} — you can type freely or tap an option.`],
    seed,
  );
}

/* ---------- keeping general information and symptom checks separate ---------- */
export const OFFER_CHECK = 'Check my symptoms';
export const OFFER_INFO = 'Just general information';

/**
 * Reply when someone describes their own symptom outside the symptom checker: empathy
 * first, then let them choose — information, or a short symptom check. Nothing is
 * started without their say-so.
 */
export function symptomOffer(text: string, seed = 0): { text: string; quickReplies: string[] } {
  const mental = isMentalHealth(text);
  const open = mental
    ? pick(['I’m really sorry you’re feeling this way — thank you for telling me.', 'That sounds really hard, and I’m glad you said something.'], seed)
    : pick(['I’m sorry you’re dealing with that.', 'That sounds uncomfortable — I’m sorry.'], seed);
  const offer = mental
    ? 'Would you like me to ask a few gentle questions so I can point you to the right support, or would you prefer some general information first?'
    : 'Would you like me to ask a few quick questions to work out how soon you should get care, or would you prefer some general information about it?';
  return { text: `${open} ${offer}`, quickReplies: [OFFER_CHECK, OFFER_INFO] };
}

export function wantsCheck(text: string): boolean | null {
  const t = expandShorthand(text);
  if (/check my symptoms|^\s*(yes|yeah|yep|ok|okay|sure|please|haan|ji)\b|ask (me )?(the |a few )?questions|check (it|me)/.test(t)) return true;
  if (/general information|just (info|information)|^\s*(no|nope|nah|not now|no thanks|nahi)\b|information only|tell me about/.test(t)) return false;
  return null;
}

/** The health topic to look up for a described symptom ("I have stomach pain" → "stomach pain"). */
export function topicForSymptom(text: string): string {
  const t = expandShorthand(text);
  if (isMentalHealth(t)) return /panic/.test(t) ? 'panic attack' : /anxi|worr|nervous|ghabrah/.test(t) ? 'anxiety' : /stress|tension/.test(t) ? 'stress' : /sleep|insomnia/.test(t) ? 'insomnia' : 'depression';
  return t
    .replace(/\b(i have|i've got|i got|i am having|i'm having|i've been having|i feel|i'm feeling|i am feeling|i keep getting|i keep|feeling|having|suffering from|my|a|an|some|really|very|bad|severe|since \w+|for \w+ \w+|today|yesterday|this morning|and|it|is|hurts?|hurting)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
