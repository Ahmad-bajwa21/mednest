# MedNest: Complete Build Specification

Version 1.0 of the plan. Status: planning only, nothing built yet.

---

## 0. How to use this document

This file is the full brief for an AI coding assistant (or a developer) who will build MedNest. It is written so the builder needs no other context.

Instructions to the builder:

1. Read the whole file before writing code.
2. Build in the phase order in section 16. Do not skip ahead.
3. Section 3 (screens) is the source of truth for what the user sees. Section 2 (design system) is the source of truth for how it looks.
4. Anything marked **RULE** is non-negotiable. Anything marked **VERIFY** is a fact that must be checked against current official documentation at build time, because library versions and model releases change.
5. If something is not specified, choose the simplest option that respects the rules, and list the choice in a `DECISIONS.md` file.

---

## 1. Product summary

**Name:** MedNest (alternates if the name is taken: CareFolio, HealthShelf). **VERIFY** Play Store and trademark availability.

**One line:** Photograph your family's medical papers; MedNest turns them into an organised health record for each person, reminds you about medicines, and prepares a one-page summary for the doctor. Everything stays on the phone.

**Problem:** In most homes, prescriptions, lab reports and scans are loose papers in a drawer. When a doctor asks "what medicine were you on before?" or "what was the last sugar reading?", nobody remembers.

**Who it is for:** One adult who looks after the health paperwork of a small family (self, spouse, parents, children).

**What makes it different:**
- Starts from paper. No hospital integration needed.
- Works offline. An on-device open-source model does the reading and reasoning, so there is no API bill and no server.
- Private by design. Health data never leaves the phone unless the user shares or backs it up.
- It acts, it does not only store: it files, reminds, compares, summarises.

**What it is not (RULE):** MedNest does not diagnose, does not recommend or change treatment, and does not replace a doctor. It records, organises and explains what is already written on the user's own documents.

**Core rules (RULE):**
- Maximum 4 profiles per phone.
- Every profile always has a visible summary.
- A profile can be shared to another phone.
- No gradients anywhere in the UI.
- No account, no login, no backend server.

**Platform:** Android phone, native Kotlin with Jetpack Compose. Minimum Android 10 (API 29). Minimum 4 GB RAM. iOS is out of scope for version 1.

---

## 2. Design system

The look is calm, flat and clinical in the good sense: lots of white space, one accent colour, clear type.

### 2.1 Rules (RULE)

- No gradients. No glow. No glassmorphism. No decorative illustrations with shading.
- Solid flat fills only.
- No drop shadows. Separation is done with a 1 dp border or with spacing.
- One accent colour. Amber and red are used only for status, never for decoration.
- One typeface.
- Every screen has one clear primary action.

### 2.2 Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#FFFFFF` | `#0E1113` | Screen background |
| `surface` | `#F6F7F8` | `#171B1E` | Cards, input fields |
| `border` | `#E3E6E8` | `#2A3035` | 1 dp card and divider lines |
| `text` | `#111417` | `#F2F4F5` | Main text |
| `textMuted` | `#5E6870` | `#9AA5AD` | Secondary text, labels |
| `accent` | `#0F766E` | `#2DB5A8` | Primary buttons, active tab, links |
| `onAccent` | `#FFFFFF` | `#06211E` | Text on accent |
| `warn` | `#B45309` | `#F0A04B` | Uncertain fields, out-of-range values |
| `danger` | `#B42318` | `#F2776B` | Delete, errors |
| `ok` | `#15803D` | `#4CC38A` | Confirmed, taken |

Profile colour dots (flat, user picks one): `#0F766E`, `#1D4ED8`, `#9333EA`, `#C2410C`.

**VERIFY** every text and background pair meets WCAG AA contrast (4.5:1 for body text).

### 2.3 Type

Typeface: Inter (bundled). Urdu text falls back to Noto Nastaliq Urdu or Noto Naskh Arabic.

| Style | Size / line | Weight | Use |
|---|---|---|---|
| Title | 24 / 32 sp | 600 | Screen titles |
| Heading | 18 / 26 sp | 600 | Card titles |
| Body | 16 / 24 sp | 400 | Main text |
| Label | 14 / 20 sp | 500 | Field labels, chips |
| Caption | 12 / 16 sp | 400 | Dates, hints |

### 2.4 Layout

- Spacing grid: 4 dp base. Common values 8, 12, 16, 24.
- Screen side padding: 16 dp.
- Corner radius: 12 dp for cards and buttons, 8 dp for chips and fields.
- Minimum tap target: 48 x 48 dp.
- Icons: outline style, 24 dp, 1.5 dp stroke (Lucide or Material Symbols Outlined).

### 2.5 Components

- **Primary button:** solid `accent`, `onAccent` text, 52 dp tall, full width.
- **Secondary button:** transparent, 1 dp `border`, `text` colour.
- **Text button:** `accent` text only.
- **Card:** `surface` fill, 1 dp `border`, 12 dp radius, 16 dp padding.
- **Chip:** 8 dp radius, 1 dp `border`; selected chip is solid `accent`.
- **Field:** `surface` fill, 1 dp `border`; label above the field, never floating inside.
- **Uncertain field:** same as field but 1.5 dp `warn` border and a small "Please check" caption.
- **Bottom tabs:** 4 items, outline icon plus label; active item in `accent`.
- **Banner ad slot:** fixed 50 dp strip at the bottom of allowed screens, separated by a 1 dp border, labelled "Ad".
- **Empty state:** one outline icon, one sentence, one button.

### 2.6 Tone of text

Short, plain, kind. "We could not read this clearly. Please check the dose." Never alarming. Never medical opinion.

---

## 3. Screens

There are 19 screens. Each entry has: purpose, wireframe, elements, behaviour, states, and "explain to user" (the text the app uses to make the screen self-explanatory).

Wireframes are layout guides, not pixel designs. `[ ]` is a button, `( )` is a chip or toggle, `▢` is a card.

### S1. Splash

**Purpose:** Brief launch screen while the database unlocks.

```
┌──────────────────────────┐
│                          │
│                          │
│         MedNest          │
│   Your family's health   │
│        in one place      │
│                          │
│                          │
└──────────────────────────┘
```

- White background, wordmark in `text`, tagline in `textMuted`. No logo animation.
- Goes to S4 (lock) if app lock is on, S2 on first run, otherwise S5.
- Maximum 1 second.

### S2. Welcome (3 slides)

**Purpose:** Explain the app and set expectations before anything else.

```
┌──────────────────────────┐
│                    Skip  │
│                          │
│        (outline icon)    │
│                          │
│  Photograph your papers  │
│  MedNest reads and files │
│  them for each person.   │
│                          │
│          ● ○ ○           │
│  [        Next         ] │
└──────────────────────────┘
```

Slides:
1. "Photograph your papers." MedNest reads prescriptions and reports and files them for each family member.
2. "It stays on your phone." No account. No upload. The AI runs on this device.
3. "A helper, not a doctor." MedNest organises and explains your documents. It does not diagnose or advise treatment.

- Slide 3 has a checkbox "I understand" that must be ticked before "Get started" enables (RULE: needed for health app policy).
- "Skip" jumps to slide 3, it never skips the checkbox.

### S3. Model setup

**Purpose:** One-time download of the on-device AI model.

```
┌──────────────────────────┐
│  Setting up your helper  │
│                          │
│  MedNest needs to down-  │
│  load its reading model  │
│  once. After this it     │
│  works without internet. │
│                          │
│  Size: 0.6 GB            │
│  ▓▓▓▓▓▓▓░░░░░░░  46%     │
│  Wi-Fi recommended       │
│                          │
│  [   Pause download    ] │
│  Set up later            │
└──────────────────────────┘
```

- Shows real file size and free storage. Blocks with a clear message if storage is too low.
- Pause, resume and retry are supported. Download continues in the background with a notification.
- "Set up later" lets the user create profiles and take photos; photos queue until the model is ready.
- The app picks the model tier by device RAM (section 6.2). The user does not choose.
- States: not started, downloading, paused, verifying, done, failed (with retry).

### S4. App lock

**Purpose:** Protect health data if someone else picks up the phone.

```
┌──────────────────────────┐
│                          │
│         MedNest          │
│    Unlock to continue    │
│                          │
│     (fingerprint icon)   │
│                          │
│     Use PIN instead      │
└──────────────────────────┘
```

- Uses Android BiometricPrompt with device credential fallback, or a 4 to 6 digit app PIN.
- Off by default; offered once after the first profile is created ("Protect your records?").
- Locks again after 2 minutes in the background.
- Screenshots are blocked on all screens showing health data (`FLAG_SECURE`), with a Settings toggle.

### S5. Profiles (home)

**Purpose:** The home screen. Choose whose record to open.

```
┌──────────────────────────┐
│ MedNest              ⚙   │
│                          │
│ ▢ ● Ammi      Mother     │
│   Diabetes follow-up due │
│   Next: Metformin 8 pm   │
│                          │
│ ▢ ● Abbu      Father     │
│   2 active medicines     │
│   Next: no reminders     │
│                          │
│ ▢ +  Add profile         │
│                          │
│ 2 of 4 profiles          │
│──────────────────────────│
│ Ad                       │
└──────────────────────────┘
```

- Each card: colour dot, name, relation, one line taken from the profile summary, next reminder.
- Tap a card: open S7. Long-press: Edit, Share, Delete.
- **RULE:** at 4 profiles the "Add profile" card is removed and the counter reads "4 of 4 profiles". There is no way to create a fifth.
- Top right: Settings (S18). A small "Import" option sits in the overflow menu.
- A thin status line appears under the title when documents are processing: "Reading 2 documents...".
- Empty state: "Add the first person whose records you want to keep." with [Add profile].
- Banner ad at the bottom.

### S6. Add / edit profile

**Purpose:** Create or change a person.

```
┌──────────────────────────┐
│ ←  New profile           │
│                          │
│ Name                     │
│ [____________________]   │
│ Relation                 │
│ (Self)(Mother)(Father)   │
│ (Spouse)(Child)(Other)   │
│ Birth year    Sex        │
│ [______]      (F)(M)(-)  │
│ Blood group (optional)   │
│ [______]                 │
│ Known allergies (optional)│
│ [____________________]   │
│ Colour   ● ● ● ●         │
│                          │
│ [        Save          ] │
└──────────────────────────┘
```

- Only Name and Relation are required.
- Birth year rather than full date (less sensitive, enough for age).
- Edit mode adds a "Delete profile" text button in `danger`. Delete asks the user to type the profile name, explains that all documents, medicines and reminders for this person will be removed from this phone, and cannot be undone.

### S7. Profile overview (dashboard)

**Purpose:** Everything important about one person at a glance. The summary is always on top.

```
┌──────────────────────────┐
│ ←  ● Ammi           ⋮    │
│                          │
│ ▢ SUMMARY                │
│   62 years. Diabetes     │
│   medicines since 2023.  │
│   Last HbA1c 7.2 (Sep).  │
│   Allergy: penicillin.   │
│   Updated 3 Oct · source │
│                          │
│ ▢ Active medicines (2) › │
│ ▢ Latest results      ›  │
│ ▢ Things to notice (1) › │
│ ▢ Coming up           ›  │
│                     (+)  │
│──────────────────────────│
│ Overview Timeline Meds Ask│
└──────────────────────────┘
```

- **Summary card (RULE):** always present and always first. It never scrolls out of order and cannot be hidden. If the profile has no documents it reads: "No records yet. Add a document to start this summary." It shows the last updated date. Tapping "source" lists the documents it was built from. A small refresh icon regenerates it.
- **Active medicines:** name, dose, next time. Opens S12.
- **Latest results:** up to 3 most recent test values with an arrow (up, down, same) versus the previous value. Out-of-range values in `warn`.
- **Things to notice:** pattern notes from the memory system (section 7), such as "HbA1c has risen across the last three reports." Each opens the documents behind it. Every note ends with "Discuss with your doctor."
- **Coming up:** reminders and follow-ups in the next 14 days.
- **(+)** floating button: Add document (S8).
- **⋮ menu:** Doctor summary (S15), Share profile (S16), Edit profile (S6).
- Bottom tabs: Overview (this screen), Timeline (S10), Meds (S12), Ask (S14).
- No ad on this screen.

### S8. Add document

**Purpose:** Capture one or many papers quickly.

```
┌──────────────────────────┐
│ ✕   Add document         │
│ ┌──────────────────────┐ │
│ │                      │ │
│ │    camera preview    │ │
│ │   (edge detection)   │ │
│ │                      │ │
│ └──────────────────────┘ │
│  Hold steady. Good light │
│  helps us read it.       │
│                          │
│  (gallery)   ◯   (PDF)   │
│  3 pages captured  [Done]│
└──────────────────────────┘
```

- Camera with automatic edge detection and crop; manual crop available.
- Multi-page: keep shooting; a counter shows pages captured.
- Gallery: pick multiple images. PDF: import a file (first 10 pages).
- "Done" asks one question: "Are these pages one document or separate documents?"
- After Done the user returns to where they came from; a status line shows "Reading 3 documents...". Processing is in the background.
- A blurry or dark photo is rejected immediately: "This photo is too blurry to read. Try again?"

### S9. Review and confirm

**Purpose:** The user checks what the AI read before anything is saved. This is the safety gate.

```
┌──────────────────────────┐
│ ←  Check this document   │
│ ┌──────────────────────┐ │
│ │   photo (tap to zoom)│ │
│ └──────────────────────┘ │
│ For      (● Ammi ▾)      │
│ Type     (Prescription ▾)│
│ Date     [12 Sep 2026]   │
│ Doctor   [Dr. S. Khan]   │
│                          │
│ MEDICINES                │
│ ▢ Metformin              │
│   Dose  [500 mg]         │
│   When  (Morning)(Night) │
│   For   [30 days]        │
│ ▢ ⚠ Please check         │
│   Name  (Amoxil)(Amaryl) │
│   Dose  (1 mg)(2 mg)     │
│ + Add medicine           │
│                          │
│ [  Confirm and save    ] │
│ Discard                  │
└──────────────────────────┘
```

- Opened from a notification ("Your document is ready to check") or from the status line on S5.
- Fields the AI was unsure about have the `warn` border and offer 2 or 3 tap options plus "Type it myself".
- "For" is pre-selected when the AI matched a name on the paper to a profile; otherwise the user picks.
- For lab reports the section is RESULTS: test name, value, unit, normal range. Values are editable.
- **RULE:** nothing is saved, and no reminder is created, until the user taps Confirm.
- **RULE:** a medicine with an unresolved "Please check" field blocks Confirm until resolved or removed.
- "Add reminders for these medicines" toggle, on by default, with suggested times shown before saving.
- If the same document appears to exist already: "This looks like a document you already added on 12 Sep." with View and Save anyway.

### S10. Timeline

**Purpose:** Every document for one profile, newest first.

```
┌──────────────────────────┐
│ ←  ● Ammi · Timeline  🔍 │
│ (All)(Prescriptions)     │
│ (Reports)(Scans)(Bills)  │
│                          │
│ September 2026           │
│ ▢ 12 Sep  Prescription   │
│   Dr. S. Khan · 2 meds   │
│ ▢ 10 Sep  Lab report     │
│   HbA1c, Lipid profile   │
│                          │
│ June 2026                │
│ ▢ 03 Jun  Lab report     │
│──────────────────────────│
│ Ad                       │
│ Overview Timeline Meds Ask│
└──────────────────────────┘
```

- Grouped by month. Filter chips by type. Search by doctor, medicine, test name or free text.
- Unconfirmed documents appear at the top with a "Needs checking" tag.
- Empty state: "No documents yet." with [Add document].
- Banner ad allowed here (list screen, no document content shown in detail).

### S11. Document detail

**Purpose:** One document: the original image and everything read from it.

```
┌──────────────────────────┐
│ ←  Lab report · 10 Sep ⋮ │
│ ┌──────────────────────┐ │
│ │  original (zoomable) │ │
│ └──────────────────────┘ │
│ ▢ IN SIMPLE WORDS        │
│   Your HbA1c is 7.2.     │
│   The report's normal    │
│   range is below 5.7.    │
│                          │
│ ▢ RESULTS                │
│   HbA1c   7.2 %   ▲      │
│   Chol.   182 mg/dL  =   │
│                          │
│ ▢ COMPARED WITH 03 JUN   │
│   HbA1c   6.8 → 7.2      │
│                          │
│ Information only. Not    │
│ medical advice.          │
└──────────────────────────┘
```

- "In simple words" is generated text that restates the document. It may say a value is above or below the range printed on the report. It never says what the user should do, except "discuss with your doctor".
- Comparison appears only when an earlier document has the same test.
- ⋮ menu: Edit (reopens S9), Share image, Move to another profile, Delete.
- **RULE:** no ads on this screen.

### S12. Medicines

**Purpose:** What this person is taking and when.

```
┌──────────────────────────┐
│ ←  ● Ammi · Medicines    │
│ (Active)(Past)           │
│                          │
│ ▢ Metformin 500 mg       │
│   Morning · Night        │
│   Until 12 Oct  (on ●)   │
│   From: Dr. S. Khan 12 Sep│
│                          │
│ ▢ Amaryl 1 mg            │
│   Morning                │
│   No end date   (on ●)   │
│                          │
│ + Add medicine manually  │
│──────────────────────────│
│ Overview Timeline Meds Ask│
└──────────────────────────┘
```

- Each card: name, dose, times, end date, reminder toggle, source document link.
- Tap a card: edit times, end date, or stop the medicine (moves it to Past).
- A medicine moves to Past automatically when its course ends; the reminder stops.
- Today's doses show "Taken" ticks in `ok`.
- If two active medicines for one profile come from different doctors, a neutral line appears: "These were prescribed by different doctors. Make sure each doctor knows about the other." Version 1 does **not** claim drug interactions (see section 15).

### S13. Reminder (notification and action)

**Purpose:** The medicine reminder itself.

```
 ┌────────────────────────────┐
 │ MedNest · 8:00 pm          │
 │ Ammi: Metformin 500 mg     │
 │ [Taken]  [Later]  [Skip]   │
 └────────────────────────────┘
```

- Notification shows the profile name and medicine. With app lock on, the lock-screen notification hides the medicine name ("Ammi: medicine reminder").
- Taken: logs it. Later: repeats in 15 minutes, up to 3 times. Skip: logs skipped.
- Tapping the body opens S12.
- Follow-up reminders use the same pattern: "Abbu: follow-up test suggested by Dr. Ali is due this week."
- Reminders must survive reboot and work in Doze mode (exact alarms; see section 9.6).

### S14. Ask

**Purpose:** Ask questions about one person's records in plain language.

```
┌──────────────────────────┐
│ ←  ● Ammi · Ask          │
│                          │
│ (Last sugar test?)       │
│ (Current medicines?)     │
│ (What changed this year?)│
│                          │
│     When was the last    │
│     sugar test?        ◥ │
│ ◤ The last HbA1c was     │
│   7.2 % on 10 Sep 2026.  │
│   Source: Lab report,    │
│   10 Sep ›               │
│                          │
│ Information only. Not    │
│ medical advice.          │
│ [ Ask about Ammi...  ➤ ] │
│ Overview Timeline Meds Ask│
└──────────────────────────┘
```

- Scope is one profile. The title always shows whose records are being asked about.
- Suggested question chips for first use.
- Every answer lists its source documents as tappable links. If nothing relevant is found: "I could not find that in Ammi's records."
- Questions asking for diagnosis or treatment ("should I stop this medicine?", "do I have diabetes?") get a fixed reply: "I can't advise on that. I can show you what your records say, and you can discuss it with your doctor." followed by the relevant records.
- Voice input button uses the phone's on-device speech recognition when available.
- Fixed footer disclaimer. No ads.

### S15. Doctor summary

**Purpose:** One page to show or hand to a doctor.

```
┌──────────────────────────┐
│ ←  Doctor summary        │
│ ┌──────────────────────┐ │
│ │ Ammi · F · 62        │ │
│ │ Allergies: penicillin│ │
│ │ CURRENT MEDICINES    │ │
│ │ Metformin 500 mg 1-0-1│ │
│ │ RECENT RESULTS       │ │
│ │ HbA1c 7.2 (10 Sep)   │ │
│ │ PAST 12 MONTHS       │ │
│ │ 3 visits, 2 doctors  │ │
│ │ NOTES                │ │
│ │ HbA1c rising         │ │
│ └──────────────────────┘ │
│ Period (6 mo)(1 yr)(All) │
│ [   Save as PDF      ]   │
│ [   Share            ]   │
└──────────────────────────┘
```

- A4 single page, black on white, built from stored records (not free-written by the model): identity line, allergies, current medicines, recent results with dates, visit history, pattern notes, and a footer "Generated by MedNest from the patient's own documents. Not a clinical record."
- Period selector changes how far back it looks.
- "Show full screen" mode for holding the phone up to the doctor.

### S16. Share profile

**Purpose:** Send one person's record to another phone (for example a sibling who also cares for a parent).

```
┌──────────────────────────┐
│ ←  Share Ammi's profile  │
│                          │
│ What to include          │
│ (●) Everything           │
│ ( ) Summary and medicines│
│ ( ) Doctor summary PDF   │
│                          │
│ ▢ Sharing sends a copy.  │
│   Later changes are not  │
│   sent automatically.    │
│                          │
│ [  Create secure file  ] │
│                          │
│ Code:  K7M2-9QXD         │
│ Give this code to the    │
│ receiver separately.     │
│ [  Send file           ] │
└──────────────────────────┘
```

- "Everything" and "Summary and medicines" create an encrypted `.mednest` file. "Doctor summary PDF" creates a normal PDF.
- The app generates an 8-character code. The file cannot be opened without it. The user is told to send the code by a different route (say it on a call) than the file.
- "Send file" opens the Android share sheet (WhatsApp, Bluetooth, Nearby Share, email).
- Sharing is a copy, not live sync. This is stated on the screen (RULE).

### S17. Import profile

**Purpose:** Receive a shared profile.

```
┌──────────────────────────┐
│ ←  Import profile        │
│                          │
│ File: ammi.mednest       │
│ Enter the code           │
│ [ _ _ _ _ - _ _ _ _ ]    │
│                          │
│ ▢ Ammi · Mother          │
│   14 documents           │
│   2 active medicines     │
│   Shared on 10 Oct 2026  │
│                          │
│ [   Add to my profiles ] │
└──────────────────────────┘
```

- Opens when the user taps a `.mednest` file or uses Import in the S5 menu.
- Preview appears only after the correct code. Five wrong attempts add a delay.
- **RULE:** if 4 profiles already exist, import is blocked: "You already have 4 profiles. Remove one to import this profile."
- If a profile with the same name exists: "Replace existing", "Add as new" (if under 4), or "Cancel". Merge is out of scope for version 1.
- Reminders in an imported profile start switched off; the user is asked whether to turn them on.

### S18. Settings

**Purpose:** Controls and legal information.

```
┌──────────────────────────┐
│ ←  Settings              │
│ SECURITY                 │
│  App lock            (●) │
│  Block screenshots   (●) │
│ DATA                     │
│  Backup and restore    › │
│  Storage used  412 MB  › │
│  Delete all data       › │
│ APP                      │
│  Language  English     › │
│  Theme     System      › │
│  Reminder sound        › │
│  AI model  Ready       › │
│  Remove ads            › │
│ ABOUT                    │
│  Not medical advice    › │
│  Privacy policy        › │
│  Open-source licences  › │
│  Send feedback         › │
│  Version 1.0.0           │
└──────────────────────────┘
```

- "AI model" shows which tier is installed, its size, and re-download.
- "Delete all data" requires typing DELETE and wipes the database, images and keys.
- "Remove ads" is a one-time in-app purchase (section 11).
- Languages at launch: English, Urdu (right-to-left layout supported).

### S19. Backup and restore

**Purpose:** Keep records safe when the phone is lost or changed, with no server cost.

```
┌──────────────────────────┐
│ ←  Backup and restore    │
│                          │
│ ▢ Last backup: 9 Oct     │
│   Google Drive (yours)   │
│                          │
│ Automatic backup     (●) │
│ Only on Wi-Fi        (●) │
│ Backup password      Set │
│                          │
│ [   Back up now      ]   │
│ [   Restore          ]   │
│                          │
│ If you forget the backup │
│ password, the backup     │
│ cannot be opened.        │
└──────────────────────────┘
```

- Backup is one encrypted file in the user's own Google Drive app-data folder. The developer never sees it.
- Encrypted with a password the user sets. No password, no backup.
- A local "Export to file" option exists for users without Google accounts.
- Android auto-backup is disabled for the app's data so nothing unencrypted reaches the cloud (RULE).

---

## 4. Navigation map

```
S1 Splash
 ├─ first run → S2 Welcome → S3 Model setup → S5
 ├─ lock on  → S4 Lock → S5
 └─ else     → S5 Profiles
                ├─ S6 Add / edit profile
                ├─ S17 Import
                ├─ S18 Settings → S19 Backup
                └─ S7 Profile overview
                     ├─ tabs: S10 Timeline · S12 Medicines · S14 Ask
                     ├─ S8 Add document → (background) → S9 Review
                     ├─ S11 Document detail
                     ├─ S15 Doctor summary
                     └─ S16 Share
Notifications: S13 reminder → S12 ; "ready to check" → S9
```

---

## 5. Feature rules in detail

### 5.1 Profiles
- Hard cap of 4, enforced in the data layer (not only in the UI), including import and restore.
- Deleting a profile deletes its documents, images, medicines, results, reminders, memory chunks, pattern notes and summary.

### 5.2 The always-on summary
- Stored per profile. Regenerated when a document is confirmed, edited or deleted, when a medicine is stopped, or on manual refresh.
- Fixed structure, maximum about 60 words on the card:
  1. Age and sex.
  2. Ongoing conditions **only if written on a document** (for example a diagnosis line on a prescription). The model must not infer a condition from medicines or values.
  3. Active medicines count and the main ones.
  4. Most recent key result with date.
  5. Allergies.
  6. Next follow-up, if any.
- A longer version (about 150 words) is used in the doctor summary.
- If generation fails, the previous summary stays and a template-built summary (no model) is used as fallback, so the card is never empty (RULE).

### 5.3 Sharing
- File format `.mednest`: a zip of a JSON export plus images, encrypted with AES-256-GCM. Key derived from the 8-character code with Argon2id (memory-hard, to resist guessing).
- Embeddings are not exported. They are rebuilt on the receiving phone.

### 5.4 Reminders
- Created only from confirmed medicines.
- Default times: Morning 8:00, Afternoon 14:00, Evening 18:00, Night 21:00; editable globally and per medicine.
- Stop automatically at the end of the course.

---

## 6. AI: models, how they run, how they are trained

### 6.1 Honest overview

There are three separate jobs, and each uses a different component:

| Job | Component | Trained by us? |
|---|---|---|
| Read text from a photo | OCR: Google ML Kit Text Recognition v2 (on-device) | No |
| Understand the text, extract fields, write summaries, answer questions | Small language model: Gemma family | Not for launch; optional fine-tune later |
| Remember and find a person's history | Embedding model plus vector store | No |

"The app learns the user's illness behaviour" is delivered by memory and retrieval (section 7), **not** by training the model on the phone. Training on a phone is not practical for this device class and is not needed for this result.

### 6.2 Which language model

Two tiers, picked automatically by device RAM:

| Tier | Device | Model | Notes |
|---|---|---|---|
| Standard | 4 to 6 GB RAM | **Gemma 3 1B**, 4-bit quantised | Text only. About 0.5 to 0.6 GB download. Works on OCR text. |
| Enhanced | 8 GB RAM or more | **Gemma 3n E2B**, 4-bit quantised | Can read images directly, which helps with handwritten prescriptions. About 3 GB download. |

Runtime: Google AI Edge **MediaPipe LLM Inference API** (LiteRT), GPU where available and CPU fallback.

**VERIFY at build time:** current Gemma versions, exact file sizes, RAM needs, the recommended Android runtime (MediaPipe LLM Inference versus LiteRT-LM), and whether a newer small model outperforms these. Pick by measured accuracy on our test set (section 6.7), not by name.

**Licence note:** Gemma is free to use commercially under Google's Gemma Terms of Use, which include a prohibited-use policy. It is "open weights", not an OSI open-source licence. **VERIFY** the terms before release. If a strictly open licence is required, evaluate an Apache-2.0 or MIT small model (for example a Qwen small model or Phi mini) on the same test set.

**Cost:** zero per use. The model file is delivered through Play Asset Delivery (or Play for On-device AI), so there is no hosting bill. **VERIFY** current size limits.

### 6.3 Embedding model

- **EmbeddingGemma** (about 300M parameters, on-device), output truncated to 256 dimensions to save space. **VERIFY** availability and the Android runtime.
- Fallback: `all-MiniLM-L6-v2` (384 dimensions, about 25 MB) through ONNX Runtime Mobile or LiteRT.
- The same embedding model must be used for storing and searching. Store the model name and version with every vector; if the model changes, re-embed everything.

### 6.4 How the model is used (no training needed for launch)

**RULE: the model never produces numbers or medicine names from its own memory.** It only copies from the document text it is given, and code checks that every extracted value actually appears in the OCR text.

Four tasks, each with a fixed prompt, low temperature (0 to 0.2), and JSON output validated against a schema. Use constrained or structured output if the runtime supports it; otherwise validate and retry once.

**Task A: classify and extract**

```
You read medical documents. Use ONLY the text below. Do not guess.
If something is unclear or missing, use null and add its name to "unsure".

Return JSON:
{
 "type": "prescription|lab_report|scan_report|bill|other",
 "patient_name": string|null,
 "date": "YYYY-MM-DD"|null,
 "doctor": string|null,
 "diagnosis_written": string|null,
 "medicines": [{"name":..., "dose":..., "frequency":..., "duration_days":..., "instructions":...}],
 "results": [{"test":..., "value":..., "unit":..., "range":...}],
 "follow_up": string|null,
 "unsure": [field names]
}

DOCUMENT TEXT:
<<<ocr_text>>>
```

After the model answers, code does this:
1. Validate the JSON schema.
2. Check every name and number appears in the OCR text; if not, mark the field unsure.
3. Match medicine names against the bundled medicine list (fuzzy match). No match or more than one close match means unsure, with the candidates offered as options on S9.
4. Match test names against the bundled test dictionary to normalise them ("Glycated Hb" becomes "HbA1c").
5. Convert frequency shorthand with rules, not the model: "1-0-1", "BD", "TDS", "OD", "HS", "SOS".

**Task B: plain-language explanation** of one document, given the extracted JSON. Must restate only; may compare a value with the range printed on the report; must end with the disclaimer.

**Task C: pattern notes and summary**, given structured facts retrieved from memory (section 7). Most trend maths is done in code (is the value rising across the last three readings?), and the model only phrases the result.

**Task D: answer a question**, given the top retrieved chunks:

```
Answer using ONLY the records below. Quote dates.
If the answer is not in the records, say you could not find it.
Do not diagnose. Do not advise starting, stopping or changing any medicine.
RECORDS:
<<<chunks with ids and dates>>>
QUESTION: <<<question>>>
Return JSON: {"answer": string, "source_ids": [..]}
```

A lightweight rule-based check runs before Task D to catch advice-seeking questions and return the fixed refusal (S14).

### 6.5 Why no training for launch

- Small general models already extract fields from clean printed text reasonably well when the prompt is strict and the output is checked.
- The safety comes from the checks around the model (copy-only rule, medicine list matching, user confirmation), not from model intelligence.
- Training costs time and needs data we do not have yet. Launch first with prompts, measure, then decide.

### 6.6 Optional fine-tuning plan (only if measured accuracy is too low)

Trigger: field-level accuracy on the test set is below the targets in 6.7 after prompt improvements.

What is trained: a LoRA adapter on the Standard-tier model for **Task A only** (OCR text in, JSON out). Nothing else.

1. **Data.** 2,000 to 5,000 pairs of (OCR text, correct JSON).
   - Synthetic: generate realistic prescriptions and lab reports from templates using the medicine list and test dictionary, with varied layouts, abbreviations, and injected OCR noise (missing letters, merged lines).
   - Real: documents contributed by the team and volunteers with written consent, with names, phone numbers and IDs removed before use. Labelled by hand, checked by a second person.
   - **RULE: no user data from the app is ever used. The app has no way to send it.**
   - Split: 80% train, 10% validation, 10% test, split by document source so the same layout is not in both train and test.
2. **Method.** LoRA / QLoRA with Hugging Face PEFT or Unsloth. Starting values: rank 16, alpha 32, dropout 0.05, learning rate 2e-4, 3 epochs, batch 8, max length 2,048 tokens. Tune from there.
3. **Hardware.** A free cloud notebook GPU (Kaggle or Colab) is enough for a 1B model. Cost: zero.
4. **Evaluation.** Compare against the untrained model on the held-out test set using the metrics in 6.7. Ship only if it is clearly better and has not got worse at saying "unsure".
5. **Packaging.** Merge the adapter, quantise to 4-bit, convert to the on-device format (LiteRT / `.task`) with Google's AI Edge conversion tools, test on a real 4 GB phone, then ship as a new asset pack version. **VERIFY** the current conversion path.
6. **Versioning.** The app stores the model version with each extraction so results can be traced.

The embedding model and OCR are not trained.

### 6.7 Accuracy targets and test set

Build a fixed test set of at least 300 documents before coding the pipeline: printed lab reports, printed prescriptions, handwritten prescriptions, mixed-language papers, poor photos.

| Measure | Target for launch |
|---|---|
| Document type correct | 95% |
| Lab values exactly correct (printed reports) | 97% |
| Medicine name correct (printed) | 95% |
| Medicine name correct or flagged unsure (handwritten) | 99% |
| Wrong medicine or dose saved **without** an unsure flag | under 1% |
| Question answering: answer supported by a cited record | 95% |
| Advice-seeking questions correctly refused | 99% |

The last-but-two row is the one that matters most: being unsure is fine, being confidently wrong is not.

### 6.8 Performance budget (4 GB device)

- OCR: under 2 seconds per page.
- Extraction: under 60 seconds per document, in the background.
- Answer in Ask: first words within 5 seconds.
- The model is loaded only when needed and released after 60 seconds idle.
- Processing pauses below 15% battery unless charging.

### 6.9 Known limits

- ML Kit Text Recognition does not read Urdu script. Urdu handwriting on documents will not be extracted in version 1. **VERIFY** current script support.
- Doctors' handwriting is the hardest input. On the Standard tier, expect many "Please check" fields; that is the intended behaviour.

---

## 7. Memory: the vector store and how the app "learns" a person

### 7.1 What is stored

Three layers per profile:

1. **Chunks.** After a document is confirmed, it is turned into small self-contained sentences, each embedded and stored.
   - "On 2026-09-10 HbA1c was 7.2 % (report range below 5.7)."
   - "On 2026-09-12 Dr. S. Khan prescribed Metformin 500 mg, morning and night, for 30 days."
   - "Prescription of 2026-09-12 lists diagnosis: Type 2 diabetes."
2. **Pattern notes.** Short observations produced after each new document (7.3).
3. **Summary.** The living summary (5.2).

Each chunk carries: profile id, document id, type, date, text, vector, embedding model version.

### 7.2 Storage choice

One encrypted database: **Room over SQLCipher**. Vectors are stored in a table as binary blobs, and search is an exact cosine comparison in code, filtered by profile first.

Why not a separate vector database product: a profile will have hundreds to a few thousand chunks, so exact search takes a few milliseconds, and keeping everything in one encrypted database gives one thing to secure, back up and delete. If chunk counts ever exceed about 50,000, switch to an approximate index (sqlite-vec or ObjectBox HNSW) behind the same interface.

Interface the rest of the app uses:

```
MemoryStore.add(profileId, chunks)
MemoryStore.search(profileId, queryText, k, filters) -> chunks
MemoryStore.deleteByDocument(documentId)
MemoryStore.deleteByProfile(profileId)
MemoryStore.reembedAll()
```

**RULE:** `profileId` is a required argument on every search. There is no cross-profile search.

### 7.3 Pattern detection

Run after each confirmed document, for that profile only. Detection is done with rules in code; the model only writes the sentence.

| Pattern | Rule | Example note |
|---|---|---|
| Rising or falling value | Same test, 3 or more readings, moving one way | "HbA1c has risen across the last three reports (6.5, 6.8, 7.2)." |
| Out of range repeatedly | Same test outside printed range 2 or more times | "Vitamin D has been below the report's range in both tests this year." |
| Repeated prescriptions | Same medicine or class prescribed 3 or more times in 12 months | "Antibiotics were prescribed four times in the last 12 months." |
| Overdue follow-up | Follow-up date passed, no newer related document | "The follow-up test Dr. Ali asked for in June has not been added." |
| Missed doses | Skipped doses above 30% in 14 days | "About one in three evening doses were skipped in the last two weeks." |
| Seasonal recurrence | Same complaint or medicine in the same months in 2 or more years | "Inhaler prescriptions appear each winter (2024, 2025)." |
| Many prescribers | 3 or more doctors with active medicines | "Active medicines come from three different doctors." |

Rules for notes (RULE):
- A note states what the records show. It never names a disease the documents do not name and never suggests treatment.
- Every note links to its source documents.
- Every note ends with "Discuss with your doctor."
- A note is removed if its source documents are deleted or the pattern no longer holds.
- Maximum 5 notes shown per profile, most recent first.

### 7.4 Retrieval for questions

1. Embed the question.
2. Filter by profile; optionally by date or type when the question mentions them ("last year", "sugar test").
3. Combine vector similarity with keyword match on medicine and test names (hybrid search), take the top 8.
4. For "latest" or "how many" questions, query the structured tables directly rather than relying on the model.
5. Pass chunks to Task D.

---

## 8. Data model

All ids are UUIDs. All dates ISO 8601.

- **Profile:** id, name, relation, birthYear, sex, bloodGroup, allergies, colour, createdAt, importedFrom
- **Document:** id, profileId, type, docDate, doctor, facility, diagnosisWritten, imagePaths[], ocrText, status (queued, processing, needsReview, confirmed, failed), modelVersion, createdAt
- **Medicine:** id, profileId, documentId, name, matchedMedicineId, dose, frequencyCode, times[], durationDays, startDate, endDate, instructions, active
- **TestResult:** id, profileId, documentId, testCode, testNameRaw, value, unit, rangeLow, rangeHigh, flag
- **Reminder:** id, profileId, medicineId, followUpText, time, repeatRule, enabled
- **DoseLog:** id, reminderId, scheduledAt, status (taken, skipped, missed), loggedAt
- **Chunk:** id, profileId, documentId, kind, date, text, vector, embedVersion
- **PatternNote:** id, profileId, kind, text, sourceDocumentIds[], createdAt
- **Summary:** profileId, shortText, longText, sourceDocumentIds[], updatedAt, generatedBy (model, template)
- **Settings:** key, value

Bundled read-only data:
- **Medicine list:** brand and generic names. Source options: openFDA / RxNorm for generics, plus a locally compiled list of brand names for the launch market. **VERIFY** licences.
- **Test dictionary:** common test names, synonyms and units (LOINC common tests can be the base; **VERIFY** licence terms). Normal ranges are taken from the user's report first; the dictionary range is a fallback and is labelled "typical range".

---

## 9. Architecture and tech stack

### 9.1 Stack

| Area | Choice |
|---|---|
| Language, UI | Kotlin, Jetpack Compose, Material 3 with custom tokens (section 2) |
| Architecture | MVVM, unidirectional state, single activity, Navigation Compose |
| Dependency injection | Hilt |
| Database | Room + SQLCipher |
| Key storage | Android Keystore |
| Background work | WorkManager |
| Camera and scan | CameraX, ML Kit Document Scanner |
| OCR | ML Kit Text Recognition v2 (bundled model, offline) |
| Language model | MediaPipe LLM Inference (Gemma) |
| Embeddings | LiteRT or ONNX Runtime Mobile |
| Reminders | AlarmManager exact alarms + boot receiver |
| PDF | Android `PdfDocument` |
| Ads | Google Mobile Ads SDK + UMP consent SDK |
| Purchases | Play Billing |
| Backup | Google Drive REST (app-data scope) |
| Crash reports | Optional, opt-in, no health data (Firebase Crashlytics or none) |

**VERIFY** all library versions at build time and use current stable releases.

### 9.2 Modules

```
app/                 navigation, DI setup, theme
core-design/         tokens, components (section 2)
core-data/           Room entities, DAOs, repositories, encryption
core-ai/             OCR, LLM runner, prompts, validators, embedder
core-memory/         MemoryStore, pattern rules, summary builder
feature-onboarding/  S1 to S4
feature-profiles/    S5, S6
feature-profile/     S7, S10, S11, S12
feature-capture/     S8, S9
feature-ask/         S14
feature-summary/     S15
feature-share/       S16, S17
feature-settings/    S18, S19
```

### 9.3 Document pipeline

```
photo → quality check → OCR → [queue]
  → LLM Task A → validators → medicine/test matching
  → status needsReview → notification
  → user confirms on S9
  → save records → create reminders
  → build chunks → embed → store
  → run pattern rules → update notes
  → regenerate summary
```

Each stage is a resumable WorkManager job. A crash or reboot continues from the last finished stage. Failed documents stay in the timeline as "Could not read" with Retry and Enter manually.

### 9.4 Offline behaviour

Everything works offline except: model download, Drive backup, ads, purchases. No feature shows an error only because there is no internet.

### 9.5 Permissions

| Permission | Why | When asked |
|---|---|---|
| Camera | Photograph documents | First tap on camera |
| Notifications | Reminders | When the first reminder is created |
| Exact alarms | On-time reminders | Same moment |
| Photos (picker) | Import images | Uses the system photo picker, no storage permission |

No location, contacts, SMS or accessibility permissions.

### 9.6 Reliability

- Reminders use exact alarms, are re-registered on boot, on app update and on time-zone change.
- Some phone brands kill background apps; show a one-time guide to exempt MedNest from battery optimisation if a reminder was missed.

---

## 10. Security and privacy

- Database encrypted with SQLCipher. The key is random, wrapped by an Android Keystore key.
- Document images are stored in app-private storage and encrypted with AES-256-GCM.
- `android:allowBackup="false"` and data extraction rules exclude everything.
- `FLAG_SECURE` on health screens (toggle in Settings).
- No analytics on health content. If crash reporting is enabled it must strip all user text.
- No network calls contain user data, ever. The only outbound calls are model download, ads, billing, and the user's own Drive backup.
- Shared files and backups are end-to-end encrypted with user-held secrets.
- "Delete all data" really deletes: database, images, keys, cached model inputs.
- Privacy policy must state plainly: what is stored, that it stays on the device, what the ad SDK collects, how to delete.

---

## 11. Monetisation

- **AdMob banner ads** on: S5 Profiles, S10 Timeline, S18 Settings. Nowhere else.
- **RULE:** no ads on any screen that shows document content, medicines, results, chat or the summary (S7, S9, S11, S12, S14, S15).
- **RULE:** ads are non-personalised, and no health data or profile information is passed to the ad SDK. Request UMP consent where required.
- No interstitial or full-screen ads in version 1. They damage trust in a health app.
- **Remove ads:** one-time in-app purchase.
- Later options, not in version 1: lab and pharmacy partnerships, a paid family cloud sync.

---

## 12. Store readiness checklist

**VERIFY** each item against current Google Play policy before submission.

- [ ] Health apps declaration completed in Play Console.
- [ ] App is positioned as a personal health record organiser, not a medical device. No claims of diagnosis, treatment or clinical accuracy in the listing, screenshots or app text.
- [ ] "Not medical advice" disclaimer in onboarding, on Ask, on document detail, in the listing description.
- [ ] Privacy policy hosted at a public URL and linked in the app and the listing.
- [ ] Data safety form filled in accurately (health data processed on-device and not collected; ad SDK data disclosed).
- [ ] Ads declaration and UMP consent flow.
- [ ] Target API level meets the current requirement.
- [ ] Content rating questionnaire.
- [ ] 64-bit build, Android App Bundle, model in an asset pack.
- [ ] Tested on low-RAM devices and at least three phone brands.
- [ ] TalkBack labels on all controls; font scaling to 200% does not break layouts.
- [ ] English and Urdu strings complete; right-to-left layout checked.
- [ ] Store listing: icon (flat, no gradient), 6 screenshots, short and full description, feature graphic.
- [ ] Open-source licences screen, including the model's terms.
- [ ] Closed testing track completed as required for new developer accounts.
- [ ] Release signing key backed up.

Legal note: health data is regulated differently in each country (for example GDPR in Europe). Keeping data on the device reduces the obligations a great deal but does not remove them. Get the privacy policy and disclaimers reviewed by a lawyer before a worldwide launch.

---

## 13. Edge cases

| Case | Behaviour |
|---|---|
| Photo is not a medical document | "This doesn't look like a medical document." Save as Other or discard. |
| Name on paper matches no profile | Ask the user to choose a profile. Never auto-create one. |
| Two family members with similar names | Always ask. |
| Document has no date | Ask for it on S9; default to today, flagged. |
| Same document added twice | Duplicate warning (S9). |
| Unknown medicine name | Keep the text as written, marked "not in our list", reminder allowed after user confirms. |
| Dose missing | Medicine saved without dose; reminder text omits the dose. |
| Model not downloaded yet | Photos queue; user is told they will be read once setup finishes. |
| Model fails or runs out of memory | Fall back to OCR-only with manual entry form pre-filled where possible. |
| Storage almost full | Warn before capture; offer to compress old images. |
| User edits a confirmed document | Re-chunk, re-embed, re-run patterns and summary. |
| Time zone or clock change | Re-schedule reminders. |
| Import when 4 profiles exist | Blocked with explanation (S17). |
| Wrong share code | Error, delay after 5 tries. |
| Forgot backup password | Cannot restore; stated clearly at setup. |
| Child profile | Same as others; age shown in years and months under 2. |

---

## 14. Testing and acceptance

**Automated**
- Unit tests: frequency parser, JSON validator, copy-only check, medicine matcher, pattern rules, summary template fallback, 4-profile cap, export and import round trip, encryption round trip.
- Memory tests: a search in profile A never returns profile B's chunks; deleting a document removes its chunks.
- UI tests: main flow from first run to confirmed document.
- Pipeline evaluation script: runs the 300-document test set and reports the metrics in 6.7. Run on every model or prompt change.

**Manual, on a real 4 GB phone**
1. First run offline after model download: create 4 profiles; confirm a fifth is impossible.
2. Add a printed lab report, a printed prescription and a handwritten prescription. Check "Please check" behaviour.
3. Confirm; see reminders, summary, timeline update.
4. Add two more lab reports for the same test; see the pattern note appear.
5. Ask five questions, including one asking for advice; check sources and the refusal.
6. Export doctor summary PDF.
7. Share a profile to a second phone; import with the code; check the 4-profile block.
8. Back up, wipe, restore.
9. Reboot; reminder still fires. Airplane mode; everything except backup and ads works.
10. Visual check: no gradients, no shadows, no ads on restricted screens, dark theme correct.

**Acceptance for version 1:** all metrics in 6.7 met, all manual steps pass, checklist in section 12 complete.

---

## 15. Out of scope for version 1

- iOS and web versions.
- Live sync between phones.
- Drug interaction checking. This needs a licensed, maintained clinical database and would move the app toward medical-device territory. Version 1 only notes that medicines come from different doctors.
- Diagnosis, risk scores, treatment suggestions, diet or lifestyle advice.
- Urdu script OCR.
- Hospital or lab system integration.
- Wearable or glucose meter data.
- Merging two copies of the same profile.

---

## 16. Build phases

| Phase | Contents | Done when |
|---|---|---|
| 0. Preparation | Collect the 300-document test set. Verify all **VERIFY** items. Benchmark candidate models on the test set. Compile medicine list and test dictionary. | Model choice confirmed by numbers |
| 1. Foundation | Project, modules, design system components, navigation, encrypted database, profiles with cap, app lock. S1, S2, S4, S5, S6. | Profiles work end to end |
| 2. Capture and extraction | Camera, OCR, model download, Task A with validators, review screen, timeline, detail. S3, S8, S9, S10, S11. | A document goes from photo to confirmed record |
| 3. Memory | Chunking, embeddings, MemoryStore, pattern rules, summary, Ask. S7, S14. | Summary and notes update on every new document |
| 4. Actions | Medicines, reminders, dose log, doctor summary. S12, S13, S15. | Reminders reliable across reboot |
| 5. Sharing and backup | Export, import, Drive backup. S16, S17, S19. | Round trip works between two phones |
| 6. Release | Ads, purchase, Urdu, accessibility, settings, store checklist. S18. | Section 12 complete |
| 7. Optional | Fine-tune (6.6) if metrics require it. | Metrics in 6.7 met |

---

## 17. Open decisions for the product owner

1. Final name, after availability check.
2. Launch market for the first medicine brand list (Pakistan first is assumed).
3. Whether crash reporting is included at all.
4. Price of "Remove ads".
5. Whether the Enhanced model tier ships at launch or later (it adds about 3 GB for those devices).
6. Whether a strictly open-source model licence is required instead of Gemma's terms.
