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

## Open / to verify before release
- Library versions in `package.json` are best-effort for 2026 — verify current stable at
  build time (spec §9.1 VERIFY).
- Final app name, launch medicine-brand market, crash reporting, Remove-ads price,
  Enhanced tier at launch (spec §17).
