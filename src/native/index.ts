// Native capability registry. The app imports from here, never from a concrete module,
// so the real on-device implementations can be swapped in at startup (registerNative)
// while tests and early development run against the stubs.
import type { AlarmScheduler, Embedder, ForegroundService, LlmRunner, OcrEngine } from './types';
import { StubAlarmScheduler, StubEmbedder, StubForegroundService, StubLlmRunner, StubOcrEngine } from './stubs';

interface Native {
  llm: LlmRunner;
  ocr: OcrEngine;
  embedder: Embedder;
  alarms: AlarmScheduler;
  foreground: ForegroundService;
}

let current: Native = {
  llm: new StubLlmRunner(),
  ocr: new StubOcrEngine(),
  embedder: new StubEmbedder(),
  alarms: new StubAlarmScheduler(),
  foreground: new StubForegroundService(),
};

/** Called once at app startup on-device to install the real modules. */
export function registerNative(impls: Partial<Native>) {
  current = { ...current, ...impls };
}

export const native = {
  get llm() { return current.llm; },
  get ocr() { return current.ocr; },
  get embedder() { return current.embedder; },
  get alarms() { return current.alarms; },
  get foreground() { return current.foreground; },
};

export * from './types';
