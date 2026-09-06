/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--color-base)',
        surface: 'var(--color-surface)',
        'surface-raised': 'var(--color-surface-raised)',
        accent: 'var(--color-accent)',
        'accent-muted': 'var(--color-accent-muted)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
      },
      fontFamily: {
        heading: ['"IBM Plex Sans"', 'sans-serif'],
        body: ['"IBM Plex Sans"', 'sans-serif'],
        arabic: ['"IBM Plex Sans Arabic"', 'sans-serif'],
      },
      letterSpacing: {
        drafting: '0.02em',
      },
    },
  },
  plugins: [],
};
