// Expo config plugin — foreground service for the document pipeline (spec §6.8/§9.3).
// A long (≤60s) extraction needs a foreground service; RN headless/background limits
// won't carry it. Permissions (FOREGROUND_SERVICE, FOREGROUND_SERVICE_DATA_SYNC) are in
// app.json. Safe pass-through today so prebuild/build succeed before the native class.
//
// TODO (native):
//   1. Create a Service implementing src/native/types.ts -> ForegroundService that posts a
//      "Reading documents…" notification while the WorkManager-style queue runs.
//   2. Register its <service android:foregroundServiceType="dataSync"> here via
//      withAndroidManifest once the class exists.
module.exports = function withForegroundService(config) {
  // eslint-disable-next-line no-console
  console.warn('[withForegroundService] placeholder plugin active — wire the native foreground Service before running the pipeline in the background.');
  return config;
};
