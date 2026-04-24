import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// 🚨 경로를 @mysten/enoki/react 로 수정 완료
import { EnokiFlowProvider } from '@mysten/enoki/react';
import '@mysten/dapp-kit/dist/index.css';

const queryClient = new QueryClient();
const { networkConfig } = createNetworkConfig({
  testnet: { url: "https://fullnode.testnet.sui.io:443" },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EnokiFlowProvider apiKey="enoki_public_08e79fba532f4b3f54e86e722297b35e">
      <QueryClientProvider client={queryClient}>
        <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
          <WalletProvider autoConnect>
            <App />
          </WalletProvider>
        </SuiClientProvider>
      </QueryClientProvider>
    </EnokiFlowProvider>
  </React.StrictMode>,
)
