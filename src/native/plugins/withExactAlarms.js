// Expo config plugin — exact-alarm reminders (spec §9.6). Permissions are declared in
// app.json. This plugin is where the native wiring is registered once the Android module
// exists. It is intentionally a safe pass-through today so `expo prebuild` and the Gradle
// build both succeed before the native classes are written.
//
// TODO (native, on a machine with the Android toolchain):
//   1. Create a module that calls AlarmManager.setExactAndAllowWhileIdle(...) implementing
//      src/native/types.ts -> AlarmScheduler.
//   2. Add a BootReceiver (RECEIVE_BOOT_COMPLETED) and a TIMEZONE_CHANGED receiver that
//      call AlarmScheduler.rescheduleAll(...) on boot / time-zone change.
//   3. Register the <receiver> entries here via withAndroidManifest, pointing at those
//      classes. (Do NOT add them before the classes exist, or the build will fail to
//      compile.)
module.exports = function withExactAlarms(config) {
  // eslint-disable-next-line no-console
  console.warn('[withExactAlarms] placeholder plugin active — wire the native AlarmScheduler + BootReceiver before relying on reminders.');
  return config;
};
