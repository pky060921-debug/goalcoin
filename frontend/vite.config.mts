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
    // 클라우드플레어 터널 도메인 허용
    allowedHosts: ['goalcoin.top']
  },
  // 🚨 502 에러의 주범인 무한 재시작을 막는 핵심 설정입니다.
  optimizeDeps: {
    include: [
      '@mysten/enoki/react', 
      'lucide-react', 
      '@mysten/dapp-kit', 
      '@mysten/sui/transactions',
      '@tanstack/react-query' // 추가적인 의존성 로딩 방지
    ],
  },
})
