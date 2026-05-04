import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EnokiFlowProvider } from '@mysten/enoki/react'

const queryClient = new QueryClient()

// 💡 에러를 일으키던 getFullnodeUrl 함수를 지우고, 메인넷 공식 주소를 직접 꽂아 넣었습니다! (에러율 0%)
const networks = { mainnet: { url: 'https://fullnode.mainnet.sui.io:443' } }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="mainnet">
        <WalletProvider>
          {/* 아키님의 Enoki Public Key */}
          <EnokiFlowProvider apiKey="enoki_public_79288e2c949704c77c61148439df67d1"> 
            <App />
          </EnokiFlowProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
