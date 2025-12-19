module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sanbou: {
          main: '#FFFFFF',   // カード背景（白）
          dark: '#F8FAFC',   // アプリ背景（薄いグレー/Slate-50）
          accent: '#C4A052', // ゴールド（そのまま）
          light: '#0F172A',  // 文字色（濃いネイビー/Slate-900）に反転
          sub: '#E2E8F0',    // 枠線（薄いグレー/Slate-200）
        },
      },
      fontFamily: {
        sans: ['"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}