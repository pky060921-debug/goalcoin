import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002, // 🚨 3002번 포트 사용
    host: true,
    allowedHosts: ['blankd.top'] // 터널 도메인 허용
  },
  optimizeDeps: {
    include: ['lucide-react'], // 무한 재시작 방지
  },
})
