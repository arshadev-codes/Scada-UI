import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'dark' | 'light';

const META_COLOR: Record<Theme, string> = { dark: '#0B1322', light: '#EEF1F0' };

/** Writes the theme to <html data-theme> immediately (no React round-trip). */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[theme]);
}

function initialTheme(): Theme {
  const preset = document.documentElement.dataset.theme;
  if (preset === 'light' || preset === 'dark') return preset;
  return 'light'; // porcelain + copper is the main look; dark is the night option
}

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: initialTheme(),
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
    }),
    {
      // index.html reads this key before first paint to avoid a theme flash
      name: 'ttb01.theme',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ theme: s.theme }),
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    },
  ),
);
