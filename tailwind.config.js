/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Segoe UI"',
          'sans-serif',
        ],
        mono: [
          '"Segoe UI"',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
