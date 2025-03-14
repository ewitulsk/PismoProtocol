/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#00fff7',
        secondary: '#ff69b4',
        darkBackground: '#0d0415',
        mainBackground: '#150726',
      },
    },
  },
  plugins: [],
}

