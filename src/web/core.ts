// Web build entry: the same tested, pure-TS safety logic the Android app uses, bundled
// for the static web app by scripts/build-web.mjs -> mednest/core.js. Nothing here may
// import React Native, Expo or native modules.
export { startTriage, respond, computeOutcome, renderOutcome, dispositionHeading, DISCLAIMER as TRIAGE_DISCLAIMER, TRIAGE_ENGINE_VERSION } from '../ai/triage/engine';
export { detectRedFlags, EMERGENCY_MESSAGE, SELF_HARM_MESSAGE, EMERGENCY_NUMBER } from '../ai/triage/redFlags';
export { PROTOCOLS } from '../ai/triage/protocols';
export { readWithRules } from '../ai/ruleExtract';
export { parseFrequency } from '../ai/frequency';
export {
  buildDoseAlarms,
  deriveStatus,
  doseOccurrences,
  effectiveEndDate,
  formatTime,
  localDateIso,
  addDaysLocal,
  parseLocalDate,
  resolveTime,
  scheduleBlockers,
  snoozeAlarm,
  reminderBody,
} from '../domain/schedule';
export { proposeFollowUp, parseFollowUp, appointmentAlarms } from '../domain/followUp';
export { todaysDoses, pastDoses, upcomingAppointments, pendingConfirmations, historyEntries } from '../domain/care';
export { askCare } from '../domain/askCare';
export { doseCheck } from '../ai/medicineInfo';
