/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx,html}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        claude: {
          orange: '#da7756',
          tan: '#d4a27f',
          cream: '#e8dcd0',
          beige: '#f5f0e8',
        },
        gray: {
          750: '#2d2d3a',
          850: '#1f1f2e',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
