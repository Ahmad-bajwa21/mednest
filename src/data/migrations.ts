// Schema migrations, run on every open (src/data/db.ts). PRAGMA user_version tracks the
// applied version. Migrations are append-only: never edit a shipped step, add a new one.
// Keep the SQL in step with the Drizzle schema in ./schema.ts.

export interface SqlRunner {
  execute(sql: string, params?: Array<string | number | null>): Promise<{ rows?: Array<Record<string, unknown>> }>;
}

const V1 = [
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, relation TEXT NOT NULL, birth_year INTEGER,
    sex TEXT, blood_group TEXT, allergies TEXT, colour TEXT NOT NULL, created_at TEXT NOT NULL, imported_from TEXT)`,
  `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL, type TEXT NOT NULL, doc_date TEXT, doctor TEXT,
    facility TEXT, diagnosis_written TEXT, image_paths TEXT, ocr_text TEXT, status TEXT NOT NULL,
    model_version TEXT, follow_up TEXT, source TEXT, extraction_json TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS medicines (
    id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL, document_id TEXT, name TEXT NOT NULL,
    matched_medicine_id TEXT, dose TEXT, frequency_code TEXT, times TEXT, duration_days INTEGER,
    start_date TEXT, end_date TEXT, instructions TEXT, active INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active', as_needed INTEGER NOT NULL DEFAULT 0, source TEXT,
    confirmed_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS test_results (
    id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL, document_id TEXT, test_code TEXT,
    test_name_raw TEXT NOT NULL, value TEXT, unit TEXT, range_low REAL, range_high REAL, flag TEXT, doc_date TEXT)`,
  `CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL, medicine_id TEXT, follow_up_text TEXT,
    time TEXT NOT NULL, repeat_rule TEXT, enabled INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS dose_logs (
    id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL, medicine_id TEXT NOT NULL, reminder_id TEXT,
    dose_key TEXT NOT NULL UNIQUE, scheduled_at TEXT NOT NULL, status TEXT NOT NULL, logged_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL, document_id TEXT, date TEXT, time TEXT,
    doctor TEXT, reason TEXT, source_text TEXT, basis TEXT, status TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS symptom_episodes (
    id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL, protocol_id TEXT, complaint TEXT NOT NULL,
    answers TEXT, flags TEXT, disposition TEXT, summary TEXT, engine_version TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL, episode_id TEXT, transcript TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY NOT NULL, profile_id TEXT, entity TEXT NOT NULL, entity_id TEXT, action TEXT NOT NULL,
    detail TEXT, at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL, document_id TEXT, kind TEXT, date TEXT,
    text TEXT NOT NULL, vector BLOB, embed_version TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pattern_notes (
    id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL,
    source_document_ids TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS summaries (
    profile_id TEXT PRIMARY KEY NOT NULL, short_text TEXT, long_text TEXT, source_document_ids TEXT,
    updated_at TEXT, generated_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_profile ON documents(profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_medicines_profile ON medicines(profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_results_profile ON test_results(profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_doses_profile ON dose_logs(profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_appointments_profile ON appointments(profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_episodes_profile ON symptom_episodes(profile_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_profile ON audit_log(profile_id, at)`,
];

// v2: doctor visit summary (patient updates/corrections + saved summaries).
const V2 = [
  `CREATE TABLE IF NOT EXISTS symptom_updates (
    id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL, at TEXT NOT NULL, complaint TEXT NOT NULL,
    severity INTEGER, new_symptoms TEXT, note TEXT, corrects_id TEXT)`,
  `CREATE TABLE IF NOT EXISTS visit_summaries (
    id TEXT PRIMARY KEY NOT NULL, profile_id TEXT NOT NULL, created_at TEXT NOT NULL, text TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_updates_profile ON symptom_updates(profile_id, at)`,
];

export const MIGRATIONS: string[][] = [V1, V2];

export async function migrate(db: SqlRunner): Promise<number> {
  const res = await db.execute('PRAGMA user_version');
  const current = Number(res.rows?.[0]?.user_version ?? 0);
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.execute('BEGIN');
    try {
      for (const sql of MIGRATIONS[v]!) await db.execute(sql);
      await db.execute(`PRAGMA user_version = ${v + 1}`);
      await db.execute('COMMIT');
    } catch (e) {
      await db.execute('ROLLBACK');
      throw e;
    }
  }
  return MIGRATIONS.length;
}
