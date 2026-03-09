/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0E1117',
          card: '#161C26',
        },
        border: '#1E2A38',
        accent: '#009B8D',
        'accent-hover': '#00B8A9',
        text: {
          primary: '#E8EDF3',
          muted: '#6B7C93',
        },
      },
      fontFamily: {
        heading: ['Playfair Display', 'serif'],
        mono: ['IBM Plex Mono', 'monospace'],
        sans: ['IBM Plex Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
