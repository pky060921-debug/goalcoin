import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EnokiFlowProvider } from '@mysten/enoki/react'

const queryClient = new QueryClient()
// getFullnodeUrl 함수 충돌을 막기 위해 메인넷 주소 하드코딩
const networks = { mainnet: { url: 'https://fullnode.mainnet.sui.io:443' } }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="mainnet">
        <WalletProvider>
          <EnokiFlowProvider apiKey="enoki_public_08e79fba532f4b3f54e86e722297b35e"> 
            <App />
          </EnokiFlowProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
