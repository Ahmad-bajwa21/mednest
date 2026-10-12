# MedNest — web app

A fully client-side build of MedNest. All data is stored in the browser's
`localStorage` only — no account, no server, no upload. This mirrors the native
app's "stays on your device" philosophy and lets people try the full flow on the web.

Deployed on Vercel (static, no build step).

## Pages / routes (hash router)

- `#/welcome` — 3-slide onboarding with an "I understand" gate (first run)
- `#/` — profiles home (max 4), import entry
- `#/profile/:id` — overview: always-on summary, active meds, latest results with
  trend, **Things to notice** (code-based pattern notes), **Coming up**
- `#/profile/:id/add` — add a document: scan with camera / choose from gallery / enter manually
- `#/profile/:id/review` — check and confirm what was read (unsure fields block saving)
- `#/profile/:id/assistant` — symptom check (rules-based triage, red flags, history-aware)
- `#/profile/:id/history` — unified medical history with provenance
- `#/profile/:id/doses` — today's doses (Taken / Skip / Later) + 14-day history
- `#/profile/:id/appointments` — follow-ups: confirm, reschedule, complete
- `#/profile/:id/medicine/:mid` — medicine schedule: edit, pause, resume, stop
- `#/profile/:id/timeline` — documents grouped by month
- `#/profile/:id/doc/:docId` — document detail ("in simple words" + compared-with-earlier)
- `#/profile/:id/meds` — active / past medicines
- `#/profile/:id/ask` — ask questions over the records (rule-based; refuses advice-seeking)
- `#/profile/:id/summary` — doctor summary (Print → PDF)
- `#/profile/:id/share` — export a profile file
- `#/import` — import a profile file (enforces the 4-profile cap)
- `#/settings` — export all / delete all / privacy
- `/privacy` — privacy policy

## Shared logic

`core.js` is GENERATED from the app's TypeScript (`src/web/core.ts`) — triage engine,
red flags, rules-based document reader, schedules, follow-ups, history. Rebuild with
`npm run build:web` from the repo root after changing `src/`. Do not edit it by hand.

Scanning uses Tesseract.js (loaded from jsDelivr on first scan) in the browser; photos
are kept in IndexedDB. Reminders use browser notifications plus an in-page banner and
only fire while a MedNest tab is open.

## What is NOT in the web build (comes with the native app)

Document edge detection/perspective correction, Gemma extraction, exact-alarm reminders that fire when closed, encrypted
SQLCipher storage, biometric lock, and Google Drive backup are native Android
capabilities. See `../MedNest_Build_Spec.md` and the plan file for the native build.

## Tests (off-device, no deps)

The pure logic (template summary, result trends, pattern notes, Ask refusal/search) is
tested headlessly by stubbing browser globals:

```bash
node tests/smoke.mjs      # renders every screen, asserts no runtime errors
node tests/ask.test.mjs   # safety-critical Ask logic (advice refusal, sources)
```

## Deploy

```bash
vercel deploy --prod --yes --scope gieek
```
