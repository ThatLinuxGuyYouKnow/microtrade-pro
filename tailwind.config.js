/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#060908',
          900: '#0A0F0D',
          850: '#0C1210',
          800: '#101714',
          750: '#141C18',
          700: '#1A2520',
        },
        mint: {
          300: '#8CF2C6',
          400: '#5CE1A8',
          500: '#34D399',
          600: '#1FA97A',
        },
        solar: '#F5B84A',
        flow: '#67B7F7',
        danger: '#F87171',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
      },
    },
  },
  plugins: [],
};
