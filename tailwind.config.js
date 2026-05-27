/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        red: {
          50: '#fff1f1',
          100: '#ffe0e0',
          200: '#ffc7c7',
          300: '#ffa0a0',
          400: '#ff6b6b',
          500: '#ff3b3b',
          600: '#ff1f1f',
          700: '#e01010',
          800: '#b81010',
          900: '#981313',
        },
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
