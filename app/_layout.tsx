// Root layout — single activity, Navigation (Expo Router Stack), theme provider.
import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from '../src/design/theme';
import { installReminders } from '../src/features/reminders';

function Nav() {
  const { c, name } = useTheme();
  return (
    <>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          animation: 'slide_from_right',
        }}
      />
    </>
  );
}

export default function RootLayout() {
  // Medicine + follow-up reminders: rebuilt from the database on start and on every
  // return to the foreground; tapping a reminder opens that profile's doses.
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    installReminders((profileId) => router.push(`/profile/${profileId}/doses`))
      .then((fn) => { cleanup = fn; })
      .catch(() => undefined);
    return () => cleanup?.();
  }, []);

  return (
    <ThemeProvider>
      <Nav />
    </ThemeProvider>
  );
}
