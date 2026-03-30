/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: { extend: { colors: { indigo: { DEFAULT: '#3D157D' }, aqua: { DEFAULT: '#30BEAA' }, orange: { DEFAULT: '#FACC91' } }, fontFamily: { sans: ['Nunito', 'sans-serif'] } } },
  plugins: [],
}
