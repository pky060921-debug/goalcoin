import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// 🚨 Sui 지갑 연결 및 데이터 통신을 위한 필수 라이브러리
import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 🚨 지갑 연결 UI(버튼 등)를 위한 기본 디자인 파일
import '@mysten/dapp-kit/dist/index.css';

// 1. 데이터 통신을 위한 쿼리 클라이언트 생성
const queryClient = new QueryClient();

// 2. Sui 네트워크 설정 (에러를 막기 위해 테스트넷 주소를 직접 하드코딩)
const { networkConfig } = createNetworkConfig({
  testnet: { url: "https://fullnode.testnet.sui.io:443" },
});

// 3. React 앱을 각종 Provider(지갑, 네트워크 등)로 감싸서 실행
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <App />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
