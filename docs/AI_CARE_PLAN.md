# MedNest — AI assistant, scanning, schedules & reminders: implementation plan

Status as of 2026-10-13. Owner decisions are in `DECISIONS.md` (full triage assistant;
no server; Android first). Spec: `MedNest_Build_Spec.md`.

## 1. What was built (Android app, this change)

| Proposal § | Built | Where |
|---|---|---|
| 1 Symptom assistant | Adaptive rules engine: 6 protocols (stomach pain, headache, fever, cough/cold, diarrhoea/vomiting, general), opening-message pre-fill, conditional questions, retry on unclear answers, "not sure" handling, fixed medicine/dose refusal, outcome + general info + safety-net + record notes | `src/ai/triage/*`, `app/profile/[id]/assistant.tsx` |
| 1/12 Emergencies | Red-flag detector (English + Roman Urdu, negation-aware) on **every** message, before anything else; emergency ends questioning with call-1122 message; also guards the general Health Info chat | `src/ai/triage/redFlags.ts`, `src/features/health.ts` |
| 2 History-aware | Uses allergies, current medicines, earlier episodes of the same problem ("last time on … — similar?") | `engine.ts` (`TriageContext`) |
| 2/8 Longitudinal record | New tables: `symptom_episodes`, `chat_sessions`, `appointments`, `dose_logs` (unique dose key), `audit_log`; medicine status/provenance columns; unified chronological History with provenance on every entry | `src/data/schema.ts`, `migrations.ts`, `careRepo.ts`, `src/domain/care.ts`, `history.tsx` |
| 3 Add document | Scan with camera / Choose from gallery / Choose a file / Enter manually; original image retained; OCR → model → validators → review; graceful fallback to manual entry with the image kept | `add.tsx`, `src/features/scanPipeline.ts`, `src/native/types.ts` (`DocumentScanner`) |
| 4 Prescription recognition | Existing validators (copy-only, medicine match, frequency rules) now drive the review screen: every unsure field is marked and **blocks saving** until corrected or confirmed; "as written" frequency shown; patient-name mismatch warning | `add.tsx`, `src/ai/extract.ts` |
| 5 Schedule | Doses computed in code from confirmed instructions only; blockers listed (no dose / no times / unclear time / no start); statuses pending/active/paused/completed/discontinued; edit with before/after audit | `src/domain/schedule.ts`, `medicine/[medId].tsx`, `meds.tsx` |
| 6 Alarms | expo-notifications with Taken / Later / Skip; snooze 15 min ×3 (self-replacing, no stacking); dedupe by dose key; full rebuild on start/foreground/change (reboot, time zone); permission banner; dose history with "Not marked" ≠ taken | `src/native/expoAlarms.ts`, `src/features/reminders.ts`, `doses.tsx` |
| 7 Follow-ups | Parses written dates (dd/mm ambiguity flagged), relative ("after 7 days", "2/52", months); counts only from a confirmed document date, else asks; proposed → confirmed → reminders (evening before + day of); edit/reschedule/complete/cancel; never claims booking | `src/domain/followUp.ts`, `appointments.tsx` |
| 9 Dashboard | Summary (still first) → Pending confirmations → Today's medicines → Upcoming appointments → Check a symptom → Recent documents → results/notes → Medical history | `app/profile/[id]/index.tsx` |
| 11 Security | **SQLCipher actually enabled** (was silently off); migrations; audit log; image files deleted with document/profile/all-data | `package.json`, `src/data/*` |

Tests: 104 passing (`npm test`), `tsc --noEmit` clean. New suites: `triage.test.ts`,
`schedule.test.ts`, `care.test.ts`, `migrations.test.ts`.

## 2. Remaining work (in order)

1. **Clinical review (release blocker).** A clinician signs off every protocol question,
   threshold, red-flag pattern, general-information line and safety-net list. Then bump
   `PROTOCOL_VERSION`. Add Urdu-script UI text for the assistant.
2. **Regulatory assessment (release blocker).** Symptom triage with next-step advice is
   likely SaMD (DRAP in Pakistan; EU MDR Class IIa; UK MHRA; US FDA). Decide markets,
   classification, quality system (IEC 62304, ISO 14971 risk file), and update store
   listing/positioning (spec §12 currently says "not a medical device").
3. **Native modules** (needs the Android toolchain):
   - `DocumentScanner`: Google ML Kit Document Scanner (on-device; edge detection, crop,
     perspective/rotation, retake; no CAMERA permission needed). Register via
     `registerNative({ scanner })`. The current fallback uses the plain camera.
   - `OcrEngine`: `@react-native-ml-kit/text-recognition` (already a dependency).
   - `LlmRunner`: LiteRT-LM / react-native-executorch with Gemma (per DECISIONS).
   - Exact-alarm module + boot receiver (optional upgrade over expo-notifications;
     handles Taken/Skip without opening the app).
4. **Image encryption at rest** (spec §10, AES-256-GCM, key in Keystore); decrypt to a
   temp file for display.
5. **Bundled medicine list** for name matching (`scanPipeline.ts` `MEDICINE_LIST`).
   Until then every extracted medicine name is flagged for the user — safe, but slower.
6. **Doctor summary**: add symptom checks, dose adherence and follow-ups to the
   existing printable summary (`summary.tsx`) — the "doctor access" path chosen.

## 3. Architecture

- **Rules own every safety-critical decision**: red flags, which question next,
  dispositions, dose times, dates, follow-up arithmetic, reminder generation. The model
  only (a) extracts text it can see on a document (copy-checked by code) and (b) maps a
  free-text answer onto a question's allowed options (validated). It never writes advice.
- **Knowledge source**: curated, clinician-reviewed protocol content in code — not
  retrieval from open web/medical corpora, which a 1–2B on-device model cannot use
  reliably or safely.
- **Model / OCR**: Gemma (3 1B / 4 E2B, Apache-2.0) on-device; ML Kit Text Recognition
  v2 (Latin; no Urdu script — §6.9); ML Kit Document Scanner. No API costs, offline,
  nothing leaves the phone. Evaluate on the 300-document test set (§6.7) before release.
- **Storage**: SQLCipher DB (key in Android Keystore), PRAGMA-versioned migrations,
  append-only audit log; provenance stored per document/medicine/appointment.
- **Reminders**: DB is the source of truth; OS alarms are a cache rebuilt by
  `syncReminders()`.

## 4. Test plan

Automated (in repo, `npm test`):
- Emergency phrases (chest pain, breathing, stroke, bleeding, anaphylaxis, self-harm,
  Roman Urdu) → immediate emergency, no further questions; negation handling.
- Adaptive flow skips what was already said; prefilled symptoms preserved; urgent
  combinations (lower-right pain + fever, thunderclap headache); insufficient info.
- Medicine requests refused; history-aware prompts; state immutability.
- Schedules: 3×/day × 5 days = 15 doses ending day 5; unconfirmed/incomplete → no doses;
  paused/stopped → no alarms; multiple medicines; no duplicates; logged doses excluded;
  edits change future alarms; snooze limit; missed ≠ taken.
- Follow-ups: relative with/without confirmed reference date; dd/mm ambiguity; 2/52;
  month-end; unreadable → no date; reminders cancelled once completed.
- Migrations match the Drizzle schema column-for-column.

Manual on device (before release):
- Wrong OCR: edit a flagged dose; confirm "Save" stays disabled until resolved.
- Ambiguous prescription ("1 tab after food", no frequency) → saved as pending, no alarm.
- Notification permission denied → banner, schedule still visible, no crash.
- Reboot, force-stop, time-zone change, DST → alarms present and at local wall time.
- Reschedule / complete a follow-up → old reminders gone.
- Blurry photo → retake; PDF → saved, manual entry; extraction failure → image kept.
- Delete document / profile / all data → images removed from storage.

## 5. Web demo (Vercel)

The web build (`mednest/`) now has the same features, driven by the same TypeScript
logic bundled into `mednest/core.js` (`npm run build:web`): symptom check, scan /
gallery / manual add with a rules-based reader (Tesseract.js OCR in the browser; every
read medicine field flagged for confirmation), review that blocks saving until checked,
schedules with pause/resume/stop, doses with Taken / Skip / Later, follow-ups, unified
history with provenance, dashboard sections, and an updated doctor summary. Web limits:
no edge detection/perspective correction, reminders only while a tab is open, browser
storage is not encrypted. Tests: `node mednest/tests/smoke.mjs`, `node mednest/tests/ask.test.mjs`.
