# MedNest — DECISIONS

Choices made while building, per spec §0.5. Dates are absolute.

## Platform & stack (changed from spec)
- **React Native + Expo (TypeScript)** instead of native Kotlin/Compose. Owner's call
  (2026-10-10). Heavy native capabilities run through native modules; TS orchestrates.
- **Expo Router** (file-based) for navigation; **Zustand** for state; single activity.
- **op-sqlite + SQLCipher + Drizzle ORM** for the encrypted DB (replaces Room+SQLCipher).
- **expo-secure-store** (Android Keystore) holds the random DB key.
- Model runtime: **LiteRT-LM** or **react-native-executorch** (MediaPipe LLM Inference API
  for Android is deprecated as of 2026 — verified).

## AI model
- **Fine-tune a LoRA now** for Task A (OCR→JSON), rather than the spec's prompts-first
  default (§6.5). Owner's call (2026-10-10). Needs the 300-doc test set + 2–5k labelled
  pairs first (see `MedNest_Build_Spec.md` §6.6/§6.7).
- Benchmark **Gemma 4 E2B** alongside Gemma 3 1B; pick by measured accuracy.
- **Licence resolved:** Gemma 3 & 4 are now **Apache-2.0** (verified 2026) — commercial
  use is free; open-decision #6 closed. Verify the exact quantized checkpoint's card.

## Safety layer (built + unit-tested, 30/30 passing)
- Copy-only check, frequency parser, medicine fuzzy-matcher, advice-seeking refusal,
  Task A schema validator, extraction pipeline — all pure TS in `src/ai/`.
- **Date fields are exempt from the numeric copy-only check** (legitimate reformat, e.g.
  "12 Sep 2026" → "2026-09-12"); flagged only when missing/model-unsure, always editable.

## Native modules — deferred to on-device build
- LLM / OCR / Embedder / AlarmScheduler / ForegroundService are defined as interfaces
  (`src/native/types.ts`) with dev stubs; real impls registered via `registerNative()`.
- Config plugins: `withFlagSecure` implemented (screenshot blocking); `withExactAlarms`
  and `withForegroundService` are safe pass-throughs with TODOs until the Android classes
  exist (so `expo prebuild` and Gradle both stay green).

## Web app
- A separate fully-client-side web build lives in `mednest/` and is deployed to Vercel
  (scope `gieek`): https://mednest-nine.vercel.app · privacy at `/privacy`.
- It uses browser `localStorage` (no native capabilities) to let people try the full flow.

## AI medical assistant & care features (owner's call, 2026-10-12)
Owner chose these after being told they change spec rules (§1 "does not diagnose or
recommend", §15 out-of-scope "diagnosis, risk scores, treatment suggestions"):
- **Full symptom-triage assistant: YES.** Adaptive follow-up questions, next-step
  recommendation (emergency / see a doctor today / GP in a few days / watch at home /
  not enough info), emergency warning signs. **This supersedes the spec §1 RULE for
  the assistant only**; documents, summary and Ask keep the original no-advice rules.
  Consequence: the app is likely regulated medical software (SaMD) in launch markets
  and must not be listed as "not a medical device" (spec §12). Needs regulatory review
  and clinician sign-off before release.
- **Doctor access: NO server.** Records stay on the device; doctors get the doctor
  summary / shared file. No accounts, no backend.
- **Target: Android app first** (web demo unchanged).
- **Architecture of the assistant:** a deterministic rules engine (`src/ai/triage/`)
  owns questions, red flags and dispositions. The on-device LLM may only map an answer
  onto a question's allowed options (validated). It never writes advice, a diagnosis,
  a medicine or a dose. Red flags run in code on every message (assistant AND the
  general Health Info chat). Medicine/dose requests get a fixed refusal.
- **Clinical content is DRAFT** (`PROTOCOL_VERSION = protocols-0.1-draft`). Questions,
  thresholds, general information and safety-net text must be reviewed by a qualified
  clinician before release. Every saved assessment records the engine/protocol version.
- **Emergency number** is Rescue 1122 (Pakistan); localise per market (`redFlags.ts`).

## Medication schedule & reminders
- Doses are computed in code from CONFIRMED instructions only; missing dose / times /
  start date block reminders (shown under Pending confirmations), never auto-filled.
- Dose key `medicineId:YYYY-MM-DD:HH:mm` is the alarm id and a UNIQUE column, so no
  duplicate reminders or double logs. A dose is taken/skipped only when the user marks
  it; an unmarked past dose shows "Not marked" (missed) after 2 h.
- Reminders use **expo-notifications** now (`src/native/expoAlarms.ts`), rebuilt from
  the DB on app start, every foreground, and every change (covers reboot, OS clean-up,
  time-zone change). Rolling 3-day horizon, max 60 pending. The custom exact-alarm
  module can replace it via `registerNative({ alarms })`.
- Follow-ups: relative instructions ("after 7 days", "2/52") are counted from the
  document date only when that date was confirmed; otherwise the user picks the date.
  Every follow-up needs user confirmation before reminders (evening before + day of).

## Security fixes (2026-10-13)
- **SQLCipher was not enabled**: op-sqlite ignores `encryptionKey` unless the app's
  package.json has `"op-sqlite": { "sqlcipher": true }`. Added. Existing dev installs
  must be wiped (old DB file is plaintext).
- DB tables were never created (no migrations existed). Added `src/data/migrations.ts`
  (PRAGMA user_version) + a test that checks it against the Drizzle schema.
- Append-only `audit_log` for every record change; deletes leave a content-free trace.
- Deleting a document / profile / all data now also deletes the image files.
- **Still open:** document images are not yet AES-256-GCM encrypted at rest (spec §10).

## Open / to verify before release
- Library versions in `package.json` are best-effort for 2026 — verify current stable at
  build time (spec §9.1 VERIFY).
- Final app name, launch medicine-brand market, crash reporting, Remove-ads price,
  Enhanced tier at launch (spec §17).
