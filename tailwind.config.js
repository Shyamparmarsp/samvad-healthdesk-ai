/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'],
        hindi: ['"Noto Sans Devanagari"', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          navy: '#1f2a44',
          'navy-light': '#2a3a5c',
        },
        surface: {
          desktop: '#dde3ee',
          mobile: '#f8fafc',
        },
        text: {
          primary: '#1d2433',
          secondary: '#4a5470',
        },
      },
      borderRadius: {
        card: '20px',
        'card-lg': '30px',
        input: '13px',
        pill: '27px',
        chip: '9999px',
      },
      backdropBlur: {
        frosted: '9px',
      },
      height: {
        'btn-mobile': '54px',
        'btn-mobile-lg': '58px',
        'btn-desktop': '54px',
      },
      minHeight: {
        'btn-touch': '48px',
      },
    },
  },
  plugins: [],
};
