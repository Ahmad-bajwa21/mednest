// MedNest data model — spec §8. Drizzle schema for op-sqlite (SQLCipher-encrypted).
// All ids are UUIDs; all dates are ISO-8601 strings.
// List/array fields (imagePaths, times, sourceDocumentIds) are stored as JSON text
// and (de)serialised by the repositories — see src/data/json.ts.
import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  relation: text('relation').notNull(),
  birthYear: integer('birth_year'),
  sex: text('sex'), // 'F' | 'M' | '-'
  bloodGroup: text('blood_group'),
  allergies: text('allergies'),
  colour: text('colour').notNull(),
  createdAt: text('created_at').notNull(),
  importedFrom: text('imported_from'),
});

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  profileId: text('profile_id').notNull(),
  type: text('type').notNull(), // prescription | lab_report | scan_report | bill | other
  docDate: text('doc_date'),
  doctor: text('doctor'),
  facility: text('facility'),
  diagnosisWritten: text('diagnosis_written'),
  imagePaths: text('image_paths'), // JSON string[]
  ocrText: text('ocr_text'),
  status: text('status').notNull(), // queued|processing|needsReview|confirmed|failed
  modelVersion: text('model_version'),
  followUp: text('follow_up'),
  createdAt: text('created_at').notNull(),
});

export const medicines = sqliteTable('medicines', {
  id: text('id').primaryKey(),
  profileId: text('profile_id').notNull(),
  documentId: text('document_id'),
  name: text('name').notNull(),
  matchedMedicineId: text('matched_medicine_id'),
  dose: text('dose'),
  frequencyCode: text('frequency_code'),
  times: text('times'), // JSON string[] of time slots / HH:mm
  durationDays: integer('duration_days'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  instructions: text('instructions'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

export const testResults = sqliteTable('test_results', {
  id: text('id').primaryKey(),
  profileId: text('profile_id').notNull(),
  documentId: text('document_id'),
  testCode: text('test_code'),
  testNameRaw: text('test_name_raw').notNull(),
  value: text('value'),
  unit: text('unit'),
  rangeLow: real('range_low'),
  rangeHigh: real('range_high'),
  flag: text('flag'), // normal | high | low
  docDate: text('doc_date'),
});

export const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(),
  profileId: text('profile_id').notNull(),
  medicineId: text('medicine_id'),
  followUpText: text('follow_up_text'),
  time: text('time').notNull(), // HH:mm
  repeatRule: text('repeat_rule'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
});

export const doseLogs = sqliteTable('dose_logs', {
  id: text('id').primaryKey(),
  reminderId: text('reminder_id').notNull(),
  scheduledAt: text('scheduled_at').notNull(),
  status: text('status').notNull(), // taken | skipped | missed
  loggedAt: text('logged_at'),
});

export const chunks = sqliteTable('chunks', {
  id: text('id').primaryKey(),
  profileId: text('profile_id').notNull(),
  documentId: text('document_id'),
  kind: text('kind'),
  date: text('date'),
  text: text('text').notNull(),
  vector: blob('vector'), // Float32 bytes
  embedVersion: text('embed_version').notNull(),
});

export const patternNotes = sqliteTable('pattern_notes', {
  id: text('id').primaryKey(),
  profileId: text('profile_id').notNull(),
  kind: text('kind').notNull(),
  text: text('text').notNull(),
  sourceDocumentIds: text('source_document_ids'), // JSON string[]
  createdAt: text('created_at').notNull(),
});

export const summaries = sqliteTable('summaries', {
  profileId: text('profile_id').primaryKey(),
  shortText: text('short_text'),
  longText: text('long_text'),
  sourceDocumentIds: text('source_document_ids'), // JSON string[]
  updatedAt: text('updated_at'),
  generatedBy: text('generated_by'), // model | template
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
});

// Inferred row types for use across the app.
export type ProfileRow = typeof profiles.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type MedicineRow = typeof medicines.$inferSelect;
export type TestResultRow = typeof testResults.$inferSelect;
export type ReminderRow = typeof reminders.$inferSelect;
export type DoseLogRow = typeof doseLogs.$inferSelect;
export type ChunkRow = typeof chunks.$inferSelect;
export type PatternNoteRow = typeof patternNotes.$inferSelect;
export type SummaryRow = typeof summaries.$inferSelect;

export const MAX_PROFILES = 4; // spec RULE — enforced in the repository layer
