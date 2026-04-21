import React from "react";
import ReactDOM from "react-dom/client";
import { createNetworkConfig, SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Theme } from "@radix-ui/themes";
import { EnokiFlowProvider } from "@mysten/enoki/react";
import "@mysten/dapp-kit/dist/index.css"; 
import "@radix-ui/themes/styles.css";
import App from "./App.tsx";
import "./index.css";

// 🚨 태블릿에서 에러를 확인하기 위한 긴급 코드
window.onerror = function(message, source, lineno, colno, error) {
    alert("에러 발생: " + message + "\n출처: " + source + ":" + lineno);
};

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
