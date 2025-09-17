/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0b1020',
          800: '#0e1224',
          700: '#121733',
        },
      },
      borderRadius: {
        xl: '12px',
      },
      fontFamily: {
        bitcount: ['Bitcount Grid Double', 'monospace'],
        condensed: ['Roboto Condensed', 'sans-serif'],
      },
      maxWidth: {
        app: '1100px',
      },
    },
  },
  plugins: [],
}


