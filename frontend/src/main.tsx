import React from "react";
import ReactDOM from "react-dom/client";
import { createNetworkConfig, SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client"; // 공식 URL 도구 추가
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Theme } from "@radix-ui/themes";
import { EnokiFlowProvider } from "@mysten/enoki/react";
import "@mysten/dapp-kit/dist/index.css";
import "@radix-ui/themes/styles.css";
import App from "./App.tsx";
import "./index.css";

const queryClient = new QueryClient();

// 💡 공식 테스트넷 노드와 대체 노드를 함께 설정합니다.
const { networkConfig } = createNetworkConfig({
testnet: { url: getFullnodeUrl("testnet") }, // 공식 노드가 가장 정확합니다.
});

// ⚠️ 중요: 반드시 'enoki_public_...' 키로 교체하세요!
const ENOKI_API_KEY = "enoki_public_08e79fba532f4b3f54e86e722297b35e
";

ReactDOM.createRoot(document.getElementById("root")!).render(
<React.StrictMode>
<Theme appearance="dark">
<QueryClientProvider client={queryClient}>
<SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
<WalletProvider autoConnect>
<EnokiFlowProvider apiKey={ENOKI_API_KEY}>
<App />
</EnokiFlowProvider>
</WalletProvider>
</SuiClientProvider>
</QueryClientProvider>
</Theme>
</React.StrictMode>,
);
