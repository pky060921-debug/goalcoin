import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 3001번 포트로 고정
    port: 3001,
    // 모든 IP(0.0.0.0)에서의 접속 허용
    host: true,
    // 클라우드플레어 터널 도메인 허용 (Vite 6 보안 설정)
    allowedHosts: ['goalcoin.top']
  }
})
