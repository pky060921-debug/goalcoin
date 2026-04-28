import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

export default defineConfig({
  plugins: [react()],
  
  // 개발용(npm run dev) 포트 설정
  server: { 
    port: 3002, 
    host: true, 
    allowedHosts: ['blankd.top'] 
  },
  
  // 🚨 실전용(PM2, npm run preview) 포트 강제 고정! (이 부분이 502 에러의 진범이었습니다)
  preview: {
    port: 3002,
    host: true,
    allowedHosts: ['blankd.top']
  },

  // 🚨 디자인 공장(Tailwind)을 무조건 거치도록 강제 지정 (기존 설정 완벽 유지)
  css: {
    postcss: {
      plugins: [
        tailwindcss(), 
        autoprefixer()
      ],
    },
  },
})
