// Dev stubs for the native modules. They let the app run end-to-end on a simulator or
// in tests before the real on-device modules are wired in. Each stub is deliberately
// obvious (prefixed output, fake vectors) so stub data is never mistaken for real.
import type { AlarmScheduler, Embedder, ForegroundService, LlmRunner, OcrEngine, ScheduledAlarm } from './types';

export class StubLlmRunner implements LlmRunner {
  readonly modelVersion = 'stub-llm-0';
  async ensureReady() {}
  async release() {}
  async generate(prompt: string): Promise<string> {
    // Returns an empty, schema-shaped Task A object so the pipeline flows without a model.
    if (prompt.includes('"type": "prescription|lab_report')) {
      return JSON.stringify({
        type: 'other', patient_name: null, date: null, doctor: null, diagnosis_written: null,
        medicines: [], results: [], follow_up: null, unsure: ['everything'],
      });
    }
    return '[stub] on-device model not available in this build.';
  }
}

export class StubOcrEngine implements OcrEngine {
  async recognise(): Promise<{ fullText: string; lines: [] }> {
    return { fullText: '', lines: [] };
  }
}

export class StubEmbedder implements Embedder {
  readonly dimension = 256;
  readonly modelVersion = 'stub-embed-0';
  async embed(texts: string[]): Promise<Float32Array[]> {
    // Deterministic pseudo-embedding from a cheap hash — stable but meaningless.
    return texts.map((t) => {
      const v = new Float32Array(this.dimension);
      let h = 2166136261;
      for (let i = 0; i < t.length; i++) {
        h ^= t.charCodeAt(i);
        h = Math.imul(h, 16777619);
        const idx = (h >>> 0) % this.dimension;
        v[idx] = (v[idx] ?? 0) + 1;
      }
      // L2 normalise
      let norm = 0;
      for (const x of v) norm += x * x;
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < v.length; i++) v[i]! /= norm;
      return v;
    });
  }
}

export class StubAlarmScheduler implements AlarmScheduler {
  private store = new Map<string, ScheduledAlarm>();
  async schedule(a: ScheduledAlarm) { this.store.set(a.id, a); }
  async cancel(id: string) { this.store.delete(id); }
  async rescheduleAll(alarms: ScheduledAlarm[]) { this.store.clear(); alarms.forEach((a) => this.store.set(a.id, a)); }
  async canScheduleExact() { return true; }
}

export class StubForegroundService implements ForegroundService {
  async start() {}
  async stop() {}
}
