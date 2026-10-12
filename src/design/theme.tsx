// Theme context — exposes the active palette and follows the system colour scheme.
import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { palettes, type Palette, type ThemeName } from './tokens';

interface ThemeValue {
  name: ThemeName;
  c: Palette; // colours
}

const ThemeContext = createContext<ThemeValue>({ name: 'light', c: palettes.light });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const name: ThemeName = scheme === 'dark' ? 'dark' : 'light';
  return <ThemeContext.Provider value={{ name, c: palettes[name] }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
