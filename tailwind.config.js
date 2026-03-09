/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#FFFFFF',
          card: '#F8FAFB',
          elevated: '#F1F4F8',
        },
        border: {
          DEFAULT: '#E2E8F0',
          bright: '#CBD5E1',
        },
        teal: {
          DEFAULT: '#4E8EA7',
          dim: '#3D7A94',
          glow: 'rgba(78,142,167,0.12)',
        },
        gold: '#C9A84C',
        'brand-red': '#CC0000',
        text: {
          primary: '#1A2332',
          secondary: '#374151',
          muted: '#64748B',
        },
        danger: '#E05252',
        success: '#22C55E',
      },
      fontFamily: {
        heading: ['"Playfair Display"', 'serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'slide-in-left': {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'fade-up': {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'cursor-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        'chip-in': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'slide-in-left': 'slide-in-left 0.3s ease-out',
        'fade-up': 'fade-up 0.4s ease-out 0.1s both',
        'fade-in': 'fade-in 0.3s ease-out',
        'cursor-blink': 'cursor-blink 1s step-end infinite',
        'chip-in-1': 'chip-in 0.3s ease-out 0.1s both',
        'chip-in-2': 'chip-in 0.3s ease-out 0.18s both',
        'chip-in-3': 'chip-in 0.3s ease-out 0.26s both',
        'chip-in-4': 'chip-in 0.3s ease-out 0.34s both',
      },
    },
  },
  plugins: [],
}
