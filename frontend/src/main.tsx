import React from "react";
import ReactDOM from "react-dom/client";
import { createNetworkConfig, SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Theme } from "@radix-ui/themes";
import { EnokiFlowProvider } from "@mysten/enoki/react";

// CSS 스타일 임포트
import "@mysten/dapp-kit/dist/index.css"; 
import "@radix-ui/themes/styles.css";
import App from "./App.tsx";
import "./index.css";

// React Query 클라이언트 초기화
const queryClient = new QueryClient();

// Sui 네트워크 설정 (테스트넷 공식 노드 사용)
const { networkConfig } = createNetworkConfig({
	testnet: { url: getFullnodeUrl("testnet") },
});

// 💡 아키님의 Enoki Public Key (테스트넷 전용인지 꼭 확인하세요!)
const ENOKI_API_KEY = "enoki_public_08e79fba532f4b3f54e86e722297b35e";

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<Theme appearance="dark">
			<QueryClientProvider client={queryClient}>
				<SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
					<EnokiFlowProvider apiKey={ENOKI_API_KEY}>
						<WalletProvider autoConnect>
							<App />
						</WalletProvider>
					</EnokiFlowProvider>
				</SuiClientProvider>
			</QueryClientProvider>
		</Theme>
	</React.StrictMode>,
);
