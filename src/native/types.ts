// Interfaces for the on-device native capabilities. The pure-TS app (pipeline, memory,
// UI) depends ONLY on these interfaces, so screens and logic can be built and tested
// against dev stubs while the real native modules are implemented on-device.
//
// Implementations (to build on a machine with the Android toolchain):
//  - LlmRunner   -> react-native-executorch, OR a native module wrapping LiteRT-LM
//  - OcrEngine   -> @react-native-ml-kit/text-recognition (bundled, offline)
//  - Embedder    -> onnxruntime-react-native (all-MiniLM-L6-v2 / EmbeddingGemma)
//  - AlarmScheduler / ForegroundService -> custom Android modules (see plugins/)

export interface LlmGenerateOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  /** When true and the model is multimodal (Gemma 3n/4 E2B), pass the page image. */
  imageUri?: string;
}

export interface LlmRunner {
  /** Resolve once the model is loaded into memory and ready. */
  ensureReady(): Promise<void>;
  /** Run a single prompt to completion, returning the raw text. */
  generate(prompt: string, opts?: LlmGenerateOptions): Promise<string>;
  /** Release the model from memory (called after 60s idle — §6.8). */
  release(): Promise<void>;
  /** The model id + version recorded with every extraction (§6.6). */
  readonly modelVersion: string;
}

export interface OcrLine {
  text: string;
  confidence?: number;
}
export interface OcrResult {
  fullText: string;
  lines: OcrLine[];
}
export interface OcrEngine {
  /** Recognise text from an image file. Latin/Devanagari/CJK only — no Arabic/Urdu (§6.9). */
  recognise(imageUri: string): Promise<OcrResult>;
}

export interface Embedder {
  /** Embed one or more strings. Vectors share a fixed dimension. */
  embed(texts: string[]): Promise<Float32Array[]>;
  readonly dimension: number;
  readonly modelVersion: string;
}

export interface ScheduledAlarm {
  id: string;
  /** Epoch millis for the next fire. */
  at: number;
  title: string;
  body: string;
  /** Hidden on the lock screen when app-lock is on (§S13). */
  lockScreenBody?: string;
  /** Daily repeat etc. — encoded like an RRULE subset. */
  repeatRule?: string;
  /** Which action buttons to show: dose = Taken / Later / Skip. */
  category?: 'dose' | 'appointment';
  /** Delivered back with the user's response (profileId, medicineId, doseKey, …). */
  data?: Record<string, string | number>;
}
export interface AlarmScheduler {
  /** Register an exact alarm that survives reboot and Doze (§9.6). */
  schedule(alarm: ScheduledAlarm): Promise<void>;
  cancel(id: string): Promise<void>;
  /** Re-register everything (called on boot, app update, time-zone change). */
  rescheduleAll(alarms: ScheduledAlarm[]): Promise<void>;
  /** Whether the OS currently grants exact-alarm permission. */
  canScheduleExact(): Promise<boolean>;
}

export interface ForegroundService {
  /** Start a foreground service so a long (≤60s) extraction can finish (§6.8/§9.3). */
  start(notificationText: string): Promise<void>;
  stop(): Promise<void>;
}

export interface ScannedDocument {
  /** One cropped, perspective-corrected image per page (local file URIs). */
  pages: string[];
}
export interface DocumentScanner {
  /**
   * Open the camera document scanner: edge detection, auto-crop, perspective and
   * rotation correction, retake per page. Resolves null if the user cancelled.
   * Real impl: Google ML Kit Document Scanner (on-device, no camera permission needed).
   */
  scan(maxPages?: number): Promise<ScannedDocument | null>;
}
