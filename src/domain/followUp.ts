// Follow-up date handling (spec §7). The model only COPIES the follow-up text from the
// document; this code turns it into a proposed date. Every proposal still needs the
// user's confirmation, and a relative instruction ("after 7 days") with no known
// reference date is never calculated — the user is asked instead.
import type { ScheduledAlarm } from '../native/types';
import { addDaysLocal, localDateIso, parseLocalDate } from './schedule';

export type FollowUpParse =
  | { kind: 'absolute'; date: string; ambiguous: boolean; note?: string }
  | { kind: 'relative'; days?: number; months?: number; text: string }
  | { kind: 'unreadable' };

export interface FollowUpProposal {
  /** Proposed date (YYYY-MM-DD), or null when the user has to pick it. */
  date: string | null;
  basis: 'written_date' | 'relative_to_document' | 'needs_user';
  /** Plain-language explanation shown on the confirmation screen. */
  explanation: string;
  /** Always true — follow-ups are never saved without the user confirming. */
  needsConfirmation: true;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WORD_NUM: Record<string, number> = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fourteen: 14, fifteen: 15 };

function iso(y: number, m: number, d: number): string | null {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? localDateIso(dt) : null;
}

/** Parse what the document says. Day-first (dd/mm) is the Pakistan convention. */
export function parseFollowUp(text: string | null | undefined): FollowUpParse {
  if (!text?.trim()) return { kind: 'unreadable' };
  const t = text.toLowerCase().replace(/\s+/g, ' ');

  // ISO 2026-10-19
  let m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) {
    const d = iso(+m[1]!, +m[2]!, +m[3]!);
    if (d) return { kind: 'absolute', date: d, ambiguous: false };
  }
  // dd/mm/yyyy or dd-mm-yy
  m = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (m) {
    const a = +m[1]!;
    const b = +m[2]!;
    const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    const dayFirst = iso(y, b, a);
    const monthFirst = iso(y, a, b);
    if (dayFirst) return { kind: 'absolute', date: dayFirst, ambiguous: !!monthFirst && a !== b, note: monthFirst && a !== b ? `Could also mean ${monthFirst}` : undefined };
    if (monthFirst) return { kind: 'absolute', date: monthFirst, ambiguous: true, note: 'Read as month/day' };
  }
  // 19 Oct 2026 / 19th October 2026 / Oct 19, 2026
  m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)? ([a-z]{3})[a-z]*,? (\d{4})\b/) ?? null;
  if (m && MONTHS.includes(m[2]!)) {
    const d = iso(+m[3]!, MONTHS.indexOf(m[2]!) + 1, +m[1]!);
    if (d) return { kind: 'absolute', date: d, ambiguous: false };
  }
  m = t.match(/\b([a-z]{3})[a-z]* (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})\b/);
  if (m && MONTHS.includes(m[1]!)) {
    const d = iso(+m[3]!, MONTHS.indexOf(m[1]!) + 1, +m[2]!);
    if (d) return { kind: 'absolute', date: d, ambiguous: false };
  }

  // Medical shorthand: 1/52 = 1 week, 3/7 = 3 days. ("x/12" = months is too easily a
  // date, so it is left to the user.)
  m = t.match(/\b(\d{1,2})\s*\/\s*52\b/);
  if (m) return { kind: 'relative', days: +m[1]! * 7, text: `${m[1]} week(s)` };
  m = t.match(/\b(\d{1,2})\s*\/\s*7\b/);
  if (m) return { kind: 'relative', days: +m[1]!, text: `${m[1]} day(s)` };

  // after 7 days / in 2 weeks / review after one month / next week
  if (/\bnext week\b/.test(t)) return { kind: 'relative', days: 7, text: 'next week' };
  if (/\bnext month\b/.test(t)) return { kind: 'relative', months: 1, text: 'next month' };
  m = t.match(/\b(\d{1,3}|one|a|an|two|three|four|five|six|seven|eight|nine|ten|fourteen|fifteen) ?(day|days|week|weeks|wk|wks|month|months|din|hafta|hafte|mahina|mahine)\b/);
  if (m) {
    const n = /^\d/.test(m[1]!) ? +m[1]! : WORD_NUM[m[1]!]!;
    const unit = m[2]!;
    if (/^(month|months|mahina|mahine)$/.test(unit)) return { kind: 'relative', months: n, text: `${n} month${n === 1 ? '' : 's'}` };
    const days = /^(week|weeks|wk|wks|hafta|hafte)$/.test(unit) ? n * 7 : n;
    return { kind: 'relative', days, text: `${days} day${days === 1 ? '' : 's'}` };
  }
  return { kind: 'unreadable' };
}

function addMonthsLocal(isoDate: string, n: number): string {
  const d = parseLocalDate(isoDate)!;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return localDateIso(d);
}

/**
 * Turn the document's follow-up text into a proposal for the confirmation screen.
 * `docDate` is the prescription's own date, and only counts when the user confirmed it.
 */
export function proposeFollowUp(text: string | null | undefined, docDate: string | null | undefined, docDateConfirmed = true): FollowUpProposal {
  const p = parseFollowUp(text);
  if (p.kind === 'absolute') {
    return {
      date: p.date,
      basis: 'written_date',
      explanation: p.ambiguous ? `The document says “${text}”. We read this as ${p.date}. ${p.note ?? ''} Please check.`.trim() : `The document says “${text}”.`,
      needsConfirmation: true,
    };
  }
  if (p.kind === 'relative') {
    if (!docDate || !docDateConfirmed || !parseLocalDate(docDate)) {
      return {
        date: null,
        basis: 'needs_user',
        explanation: `The document says “${text}”, but the date it counts from is not clear. Please choose the follow-up date.`,
        needsConfirmation: true,
      };
    }
    const date = p.months ? addMonthsLocal(docDate, p.months) : addDaysLocal(docDate, p.days ?? 0);
    return {
      date,
      basis: 'relative_to_document',
      explanation: `The document says “${text}”. Counting ${p.text} from the document date (${docDate}) gives ${date}. Please check.`,
      needsConfirmation: true,
    };
  }
  return {
    date: null,
    basis: 'needs_user',
    explanation: text?.trim() ? `The document mentions a follow-up (“${text}”), but we could not read a date. Please choose it.` : 'Please choose the follow-up date.',
    needsConfirmation: true,
  };
}

export interface AppointmentLike {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string | null; // HH:mm
  doctor?: string | null;
  reason?: string | null;
  status: 'planned' | 'completed' | 'cancelled';
}

/**
 * Advance reminders for a confirmed appointment: the evening before and the morning
 * of the day (or 2 hours before, when a time is known). Past reminders are dropped.
 */
export function appointmentAlarms(a: AppointmentLike, now: Date, opts: { profileName?: string; hideOnLockScreen?: boolean } = {}): ScheduledAlarm[] {
  if (a.status !== 'planned') return [];
  const day = parseLocalDate(a.date);
  if (!day) return [];
  const who = a.doctor ? ` with ${a.doctor}` : '';
  const why = a.reason ? ` — ${a.reason}` : '';
  const title = opts.profileName ? `Follow-up · ${opts.profileName}` : 'Doctor follow-up';
  const before = new Date(day);
  before.setDate(before.getDate() - 1);
  before.setHours(18, 0, 0, 0);
  const sameDay = new Date(day);
  if (a.time && /^\d{2}:\d{2}$/.test(a.time)) {
    const [h, m] = a.time.split(':').map(Number);
    sameDay.setHours(h! - 2, m!, 0, 0);
  } else {
    sameDay.setHours(8, 0, 0, 0);
  }
  const lock = opts.hideOnLockScreen ? 'MedNest reminder' : undefined;
  return [
    { id: `appt:${a.id}:before`, at: before.getTime(), title, body: `Tomorrow: follow-up${who}${why}.`, lockScreenBody: lock, category: 'appointment' as const, data: { kind: 'appointment', appointmentId: a.id } },
    { id: `appt:${a.id}:day`, at: sameDay.getTime(), title, body: `Today${a.time ? ` at ${a.time}` : ''}: follow-up${who}${why}.`, lockScreenBody: lock, category: 'appointment' as const, data: { kind: 'appointment', appointmentId: a.id } },
  ].filter((x) => x.at > now.getTime());
}
