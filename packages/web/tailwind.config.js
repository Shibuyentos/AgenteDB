/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: 'var(--color-brand)', hover: 'var(--color-brand-hover)' },
        bg: { base: 'var(--color-bg-base)', card: 'var(--color-bg-card)', elevated: 'var(--color-bg-elevated)' },
        border: { DEFAULT: 'var(--color-border)', hover: 'var(--color-border-hover)' },
        text: { primary: 'var(--color-text-primary)', secondary: 'var(--color-text-secondary)', muted: 'var(--color-text-muted)' },
      },
      boxShadow: {
        /* Sombra interna sutil para dar volume leve aos cartoes */
        'subtle-inner': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
      },
      animation: {
        fadeIn: 'fadeIn 400ms ease-out',
        slideUp: 'slideUp 500ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      }
    },
  },
  plugins: [],
};
