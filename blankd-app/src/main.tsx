import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mysten/dapp-kit/dist/index.css';

// 🚨 에러를 일으키던 함수를 지우고, Testnet 주소를 직접 문자로 박아 넣습니다.
const queryClient = new QueryClient();
const { networkConfig } = createNetworkConfig({
  testnet: { url: "https://fullnode.testnet.sui.io:443" },
});

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
