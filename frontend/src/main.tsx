import React from "react";
import ReactDOM from "react-dom/client";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css"; // 디자인 핵심 스타일
import App from "./App.tsx";
import "./index.css"; // Architect님의 테마 설정

// 1. 데이터 쿼리 클라이언트 생성
const queryClient = new QueryClient();

// 2. 수이 네트워크 설정 (테스트넷)
const networks = {
  testnet: { url: getFullnodeUrl("testnet") },
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* 3. Radix UI 테마 적용 (다크 모드 권장) */}
    <Theme appearance="dark">
      <QueryClientProvider client={queryClient}>
        <SuiClientProvider networks={networks} defaultNetwork="testnet">
          <WalletProvider autoConnect>
            <App />
          </WalletProvider>
        </SuiClientProvider>
      </QueryClientProvider>
    </Theme>
  </React.StrictMode>
);
