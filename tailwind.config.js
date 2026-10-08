/** Design tokens from design/components.png (see src/client/styles/tokens.css). */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/client/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: v('green-brand'), hover: v('green-hover') },
        green: {
          200: v('green-200'),
          100: v('green-100'),
          soft: v('green-soft'),
          bg: v('green-bg'),
          nav: v('green-active-nav'),
        },
        gray: {
          900: v('gray-900'),
          800: v('gray-800'),
          700: v('gray-700'),
          600: v('gray-600'),
          500: v('gray-500'),
          400: v('gray-400'),
          300: v('gray-300'),
          200: v('gray-200'),
          100: v('gray-100'),
          50: v('gray-50'),
        },
        red: { DEFAULT: v('red-brand'), light: v('red-light') },
        amber: { DEFAULT: v('amber'), light: v('amber-light') },
        blue: { DEFAULT: v('blue'), light: v('blue-light') },
        canvas: v('canvas'),
        white: v('white'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Arial', 'sans-serif'],
      },
      borderRadius: { sm: '6px', DEFAULT: '6px', md: '12px', lg: '16px', pill: '9999px' },
      boxShadow: {
        1: '0 1px 2px rgba(17,24,39,0.05)',
        2: '0 1px 3px rgba(17,24,39,0.08), 0 1px 2px rgba(17,24,39,0.04)',
        3: '0 10px 24px -6px rgba(17,24,39,0.12), 0 4px 8px -4px rgba(17,24,39,0.06)',
        4: '0 6px 16px -4px rgba(9,109,73,0.45)',
        modal: '0 24px 48px -12px rgba(17,24,39,0.18), 0 8px 16px -8px rgba(17,24,39,0.08)',
      },
      fontSize: {
        '2xs': ['11px', '16px'],
        xs: ['12px', '16px'],
        sm: ['13px', '18px'],
        base: ['14px', '20px'],
        md: ['15px', '22px'],
        lg: ['16px', '24px'],
        xl: ['18px', '26px'],
        '2xl': ['24px', '32px'],
        kpi: ['30px', '36px'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': { from: { opacity: '0', transform: 'translate(-50%,-48%) scale(.98)' }, to: { opacity: '1', transform: 'translate(-50%,-50%) scale(1)' } },
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'toast-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        highlight: { '0%': { backgroundColor: 'rgb(var(--green-bg))' }, '100%': { backgroundColor: 'transparent' } },
        shimmer: { '0%': { opacity: '.55' }, '50%': { opacity: '1' }, '100%': { opacity: '.55' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'pop-in': 'pop-in 160ms ease-out',
        'slide-in': 'slide-in 200ms ease-out',
        'toast-in': 'toast-in 180ms ease-out',
        highlight: 'highlight 2.4s ease-out',
        shimmer: 'shimmer 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
