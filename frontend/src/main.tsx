// 🚨 최상단에 추가
console.log("🚀 아키님, main.tsx 파일이 로드되었습니다!");
alert("main.tsx 실행 시작!"); // 팝업으로 강제 확인

import React from "react";
// ... (나머지 기존 코드)

import React from "react";
import ReactDOM from "react-dom/client";
import { createNetworkConfig, SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Theme } from "@radix-ui/themes";
import { EnokiFlowProvider } from "@mysten/enoki/react";
import App from "./App.tsx";

const queryClient = new QueryClient();
const { networkConfig } = createNetworkConfig({
	testnet: { url: getFullnodeUrl("testnet") },
});

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
	</React.StrictMode>
);
