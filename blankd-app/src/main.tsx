import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit'
import { getFullnodeUrl } from '@mysten/sui/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EnokiFlowProvider } from '@mysten/enoki/react'

const queryClient = new QueryClient()
const networks = { mainnet: { url: getFullnodeUrl('mainnet') } }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="mainnet">
        <WalletProvider>
          {/* 아키님의 Enoki Public Key (enoki_public_... 로 시작하는 키)를 여기에 넣으세요 */}
          <EnokiFlowProvider apiKey="enoki_public_79288e2c949704c77c61148439df67d1"> 
            <App />
          </EnokiFlowProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
