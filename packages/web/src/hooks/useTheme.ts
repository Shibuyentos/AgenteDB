import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const getInitialTheme = (): Theme => {
  const saved = localStorage.getItem('agentdb-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('agentdb-theme', next);
      applyTheme(next);
      return { theme: next };
    }),
  setTheme: (theme) => {
    localStorage.setItem('agentdb-theme', theme);
    applyTheme(theme);
    set({ theme });
  },
}));

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'light') {
    root.style.setProperty('--color-bg-base', '#FFFFFF');
    root.style.setProperty('--color-bg-card', '#F4F4F5');
    root.style.setProperty('--color-bg-elevated', '#E4E4E7');
    root.style.setProperty('--color-border', '#D4D4D8');
    root.style.setProperty('--color-text-primary', '#18181B');
    root.style.setProperty('--color-text-secondary', '#52525B');
    root.style.setProperty('--color-text-muted', '#71717A');
    root.classList.add('light');
    root.classList.remove('dark');
  } else {
    root.style.setProperty('--color-bg-base', '#09090B');
    root.style.setProperty('--color-bg-card', '#18181B');
    root.style.setProperty('--color-bg-elevated', '#27272A');
    root.style.setProperty('--color-border', '#3F3F46');
    root.style.setProperty('--color-text-primary', '#FAFAFA');
    root.style.setProperty('--color-text-secondary', '#A1A1AA');
    root.style.setProperty('--color-text-muted', '#71717A');
    root.classList.add('dark');
    root.classList.remove('light');
  }
}

// Apply on load
applyTheme(getInitialTheme());
