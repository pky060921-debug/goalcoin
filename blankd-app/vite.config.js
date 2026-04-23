import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

export default defineConfig({
  plugins: [react()],
  server: { 
    port: 3002, 
    host: true, 
    allowedHosts: ['blankd.top'] 
  },
  // 🚨 디자인 공장(Tailwind)을 무조건 거치도록 강제 지정
  css: {
    postcss: {
      plugins: [
        tailwindcss(), 
        autoprefixer()
      ],
    },
  },
})