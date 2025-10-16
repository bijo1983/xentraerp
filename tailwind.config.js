/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#FDE4EE',
          100: '#F9C8DC',
          200: '#F598C1',
          300: '#F06AA7',
          400: '#EC408F',
          500: '#E91E63',
          600: '#C2185B',
          700: '#A0114A',
          800: '#780B3B',
          900: '#4F0627',
        },
        secondary: {
          50: '#E0F7FF',
          100: '#B3EBFF',
          200: '#80DFFF',
          300: '#4DD2FF',
          400: '#26C6FF',
          500: '#00AEEF',
          600: '#0093CC',
          700: '#0077A6',
          800: '#005B80',
          900: '#003F59',
        },
        accent: {
          50: '#FFF4D5',
          100: '#FFE7AA',
          200: '#FFD980',
          300: '#FFCA55',
          400: '#FFBE2E',
          500: '#FFC107',
          600: '#E0A306',
          700: '#B88205',
          800: '#8F6104',
          900: '#664102',
        },
        highlight: '#40C4FF',
        text: {
          primary: '#0B1F3B',
          secondary: '#555555',
        },
        background: {
          DEFAULT: '#FFFFFF',
          subtle: '#F5F5F5',
          tint: '#ECF6FF',
        },
      },
    },
  },
  plugins: [],
};
