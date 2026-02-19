/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#10B981',
          hover: '#059669',
          dark: '#064E3B',
        },
        accent: {
          DEFAULT: '#06B6D4',
          hover: '#0891B2',
        },
        bg: {
          base: '#09090B',
          card: '#18181B',
          elevated: '#27272A',
        },
        border: {
          DEFAULT: '#3F3F46',
          hover: '#52525B',
        },
        text: {
          primary: '#FAFAFA',
          secondary: '#A1A1AA',
          muted: '#71717A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideLeft: {
          '0%': { opacity: '0', transform: 'translateX(8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        dotBounce: {
          '0%, 80%, 100%': { transform: 'translateY(0)' },
          '40%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 200ms ease-out',
        slideUp: 'slideUp 200ms ease-out',
        slideLeft: 'slideLeft 200ms ease-out',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
        'dot-bounce': 'dotBounce 1.4s infinite ease-in-out both',
      },
    },
  },
  plugins: [],
};
