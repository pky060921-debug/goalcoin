import React from "react";
import ReactDOM from "react-dom/client";
import { createNetworkConfig, SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Theme } from "@radix-ui/themes";
import { EnokiFlowProvider } from "@mysten/enoki/react";

import "@mysten/dapp-kit/dist/index.css"; 
import "@radix-ui/themes/styles.css";
import App from "./App.tsx";
import "./index.css";

const queryClient = new QueryClient();

// 에러 원인이었던 자동 URL 생성 대신 직접 주소를 입력합니다.
const { networkConfig } = createNetworkConfig({
	testnet: { url: "https://fullnode.testnet.sui.io:443" },
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
	</React.StrictMode>,
);
