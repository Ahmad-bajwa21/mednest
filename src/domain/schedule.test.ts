import {
  buildDoseAlarms,
  deriveStatus,
  doseOccurrences,
  doseState,
  effectiveEndDate,
  scheduleBlockers,
  snoozeAlarm,
  type SchedulableMedicine,
} from './schedule';
import { appointmentAlarms, parseFollowUp, proposeFollowUp } from './followUp';

const med = (over: Partial<SchedulableMedicine> = {}): SchedulableMedicine => ({
  id: 'm1',
  name: 'Amoxicillin',
  dose: '500 mg',
  times: ['Morning', 'Afternoon', 'Night'],
  startDate: '2026-10-13',
  durationDays: 5,
  instructions: 'After meals',
  status: 'active',
  confirmedAt: '2026-10-13T08:00:00Z',
  ...over,
});

describe('medication schedule', () => {
  it('three times daily for five days = 15 doses, ending on day 5', () => {
    const occ = doseOccurrences(med(), '2026-10-01', '2026-10-31');
    expect(occ).toHaveLength(15);
    expect(effectiveEndDate(med())).toBe('2026-10-17');
    expect(occ[0]!.key).toBe('m1:2026-10-13:08:00');
    expect(occ.at(-1)!.key).toBe('m1:2026-10-17:21:00');
  });

  it('never schedules unconfirmed or incomplete instructions', () => {
    expect(scheduleBlockers(med({ confirmedAt: null }))).toContain('Instructions not confirmed yet');
    expect(scheduleBlockers(med({ dose: '' }))).toContain('Dose missing');
    expect(scheduleBlockers(med({ times: [] }))).toContain('How often / what times is missing');
    expect(scheduleBlockers(med({ times: ['after lunch'] }))[0]).toMatch(/Unclear time/);
    expect(doseOccurrences(med({ confirmedAt: null }), '2026-10-13', '2026-10-20')).toEqual([]);
  });

  it('paused / discontinued medicines produce no doses', () => {
    expect(doseOccurrences(med({ status: 'paused' }), '2026-10-13', '2026-10-20')).toEqual([]);
    expect(doseOccurrences(med({ status: 'discontinued' }), '2026-10-13', '2026-10-20')).toEqual([]);
  });

  it('an active course past its end reads as completed', () => {
    expect(deriveStatus(med(), '2026-10-18')).toBe('completed');
    expect(deriveStatus(med(), '2026-10-17')).toBe('active');
    expect(deriveStatus(med({ durationDays: null }), '2030-01-01')).toBe('active');
  });

  it('an alarm firing is not a dose taken: unlogged past doses become missed', () => {
    const [occ] = doseOccurrences(med(), '2026-10-13', '2026-10-13');
    expect(doseState(occ!, undefined, occ!.at - 1)).toBe('upcoming');
    expect(doseState(occ!, undefined, occ!.at + 60_000)).toBe('due');
    expect(doseState(occ!, undefined, occ!.at + 3 * 3600_000)).toBe('missed');
    expect(doseState(occ!, { doseKey: occ!.key, status: 'taken' }, occ!.at + 3 * 3600_000)).toBe('taken');
  });

  it('alarms: multiple medicines, no duplicates, logged doses excluded, past doses dropped', () => {
    const now = new Date(2026, 9, 13, 9, 0); // 09:00 local, after the 08:00 dose
    const m2 = med({ id: 'm2', name: 'Metformin', times: ['Morning', 'Night'], durationDays: null });
    const logs = [{ doseKey: 'm1:2026-10-13:14:00', status: 'skipped' as const }];
    const alarms = buildDoseAlarms([med(), m2, med()], logs, now);
    const ids = alarms.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('dose:m1:2026-10-13:08:00');
    expect(ids).not.toContain('dose:m1:2026-10-13:14:00');
    expect(ids).toContain('dose:m1:2026-10-13:21:00');
    expect(ids).toContain('dose:m2:2026-10-13:21:00');
    expect(alarms[0]!.body).toMatch(/Dose: 500 mg.*Time: 9:00 PM.*Instruction: After meals/);
  });

  it('editing the schedule changes future alarms (rebuild is the source of truth)', () => {
    const now = new Date(2026, 9, 13, 9, 0);
    const before = buildDoseAlarms([med()], [], now).map((a) => a.id);
    const after = buildDoseAlarms([med({ times: ['Night'] })], [], now).map((a) => a.id);
    expect(before.some((id) => id.endsWith('14:00'))).toBe(true);
    expect(after.some((id) => id.endsWith('14:00'))).toBe(false);
    expect(buildDoseAlarms([med({ status: 'discontinued' })], [], now)).toEqual([]);
  });

  it('snooze replaces itself and stops after 3', () => {
    const now = new Date(2026, 9, 13, 21, 0);
    const a = { id: 'dose:m1:2026-10-13:21:00', at: now.getTime(), title: 't', body: 'b' };
    const s1 = snoozeAlarm(a, 0, now)!;
    const s2 = snoozeAlarm(s1, 1, now)!;
    expect(s1.id).toBe(s2.id);
    expect(snoozeAlarm(s2, 3, now)).toBeNull();
  });
});

describe('follow-ups', () => {
  it('relative instruction counts from a confirmed document date', () => {
    const p = proposeFollowUp('Review after 7 days', '2026-10-13');
    expect(p.date).toBe('2026-10-20');
    expect(p.basis).toBe('relative_to_document');
    expect(p.needsConfirmation).toBe(true);
  });

  it('relative instruction without a known reference date asks the user', () => {
    expect(proposeFollowUp('after 2 weeks', null).date).toBeNull();
    expect(proposeFollowUp('after 2 weeks', '2026-10-13', false).basis).toBe('needs_user');
  });

  it('reads written dates, flagging day/month ambiguity', () => {
    expect(parseFollowUp('Next visit 2026-11-02')).toMatchObject({ kind: 'absolute', date: '2026-11-02', ambiguous: false });
    expect(parseFollowUp('come on 19/10/2026')).toMatchObject({ date: '2026-10-19', ambiguous: false });
    expect(parseFollowUp('come on 05/11/2026')).toMatchObject({ date: '2026-11-05', ambiguous: true });
    expect(parseFollowUp('19th October 2026')).toMatchObject({ date: '2026-10-19' });
  });

  it('understands shorthand and months', () => {
    expect(parseFollowUp('F/U 2/52')).toMatchObject({ kind: 'relative', days: 14 });
    expect(proposeFollowUp('review in 1 month', '2026-01-31').date).toBe('2026-02-28');
  });

  it('unreadable text never produces a date', () => {
    expect(proposeFollowUp('see me when reports come', '2026-10-13').date).toBeNull();
  });

  it('appointment reminders: evening before and morning of; none once completed', () => {
    const now = new Date(2026, 9, 13, 9, 0);
    const alarms = appointmentAlarms({ id: 'a1', date: '2026-10-20', status: 'planned', doctor: 'Dr. Ali', reason: 'BP review' }, now);
    expect(alarms.map((a) => a.id)).toEqual(['appt:a1:before', 'appt:a1:day']);
    expect(new Date(alarms[0]!.at).getDate()).toBe(19);
    expect(alarms[1]!.body).toMatch(/Dr\. Ali — BP review/);
    expect(appointmentAlarms({ id: 'a1', date: '2026-10-20', status: 'completed' }, now)).toEqual([]);
  });
});
