import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EnokiFlowProvider } from '@mysten/enoki/react'

const queryClient = new QueryClient()

// 💡 403 에러 방지를 위해 테스트넷 공식 주소를 직접 입력합니다.
const networks = { testnet: { url: 'https://fullnode.testnet.sui.io:443' } }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider>
          {/* ⚠️ 반드시 Enoki 대시보드에서 발급받은 테스트넷용 Public Key를 넣으세요 */}
          <EnokiFlowProvider apiKey="enoki_public_08e79fba532f4b3f54e86e722297b35e"> 
            <App />
          </EnokiFlowProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
