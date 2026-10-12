// Expo config plugin — adds FLAG_SECURE to the main activity so health screens are not
// captured in screenshots or the recents preview (spec §4, §10). A Settings toggle can
// relax this at runtime by clearing the flag from JS via a tiny native module later.
const { withMainActivity } = require('@expo/config-plugins');

const IMPORT = 'import android.view.WindowManager';
const FLAG_LINE = 'getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);';

module.exports = function withFlagSecure(config) {
  return withMainActivity(config, (c) => {
    let src = c.modResults.contents;
    const isKotlin = c.modResults.language === 'kt';

    // Add import if missing.
    if (!src.includes('android.view.WindowManager')) {
      src = src.replace(/(^package .*$)/m, `$1\n\n${IMPORT}${isKotlin ? '' : ';'}`);
    }

    // Inject the flag right after the super.onCreate(...) call.
    const flag = isKotlin
      ? 'window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)'
      : FLAG_LINE;
    if (!src.includes('FLAG_SECURE')) {
      src = src.replace(/(super\.onCreate\([^)]*\);?)/, `$1\n    ${flag}`);
    }

    c.modResults.contents = src;
    return c;
  });
};
