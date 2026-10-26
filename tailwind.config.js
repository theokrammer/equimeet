/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'mode-air': '#0284c7',   // Sky Blue (Air distance)
        'mode-road': '#10b981',  // Emerald Green (Road distance)
        'mode-time': '#f59e0b',  // Amber / Warm Gold (Driving time)
      }
    },
  },
  plugins: [],
}
