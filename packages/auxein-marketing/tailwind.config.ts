import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        olive: {
          DEFAULT: '#5B6830',
          50: '#f4f5f0',
          100: '#e6e9dc',
          200: '#cdd3ba',
          300: '#adb78f',
          400: '#8d9a68',
          500: '#5B6830',
          600: '#4a5528',
          700: '#3d4622',
          800: '#33391d',
          900: '#2b2f1a',
          950: '#181a0e',
        },
        sand: {
          DEFAULT: '#FDF6E3',
          50: '#FFFDF7',
          100: '#FDF6E3',
          200: '#f9edd0',
          300: '#f3dfb0',
          400: '#eacf8a',
          500: '#e0bc64',
          600: '#d4a43e',
          700: '#b18428',
          800: '#8c6820',
          900: '#72551c',
          950: '#422f0e',
        },
        terracotta: {
          DEFAULT: '#D1583B',
          50: '#fdf5f3',
          100: '#fce8e4',
          200: '#fad5cd',
          300: '#f5b7a9',
          400: '#ed8d78',
          500: '#D1583B',
          600: '#c24a2e',
          700: '#a33b23',
          800: '#873421',
          900: '#713022',
          950: '#3d150d',
        },
        charcoal: {
          DEFAULT: '#2F2F2F',
          50: '#f6f6f6',
          100: '#e7e7e7',
          200: '#d1d1d1',
          300: '#b0b0b0',
          400: '#888888',
          500: '#6d6d6d',
          600: '#5d5d5d',
          700: '#4f4f4f',
          800: '#454545',
          900: '#2F2F2F',
          950: '#1a1a1a',
        },
      },
      fontFamily: {
        sans: ['Calibri', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;