import React from "react";
import ReactDOM from "react-dom/client";
import { createNetworkConfig, SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Theme } from "@radix-ui/themes";
import "@mysten/dapp-kit/dist/index.css"; // dApp-kit 기본 스타일
import "@radix-ui/themes/styles.css";
import App from "./App.tsx";
import "./index.css";

const queryClient = new QueryClient();

// 네트워크 설정
const { networkConfig } = createNetworkConfig({
	testnet: { url: getFullnodeUrl("testnet") },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<Theme appearance="dark">
			<QueryClientProvider client={queryClient}>
				<SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
					{/* WalletProvider가 App을 완벽히 감싸야 에러가 사라집니다 */}
					<WalletProvider autoConnect>
						<App />
					</WalletProvider>
				</SuiClientProvider>
			</QueryClientProvider>
		</Theme>
	</React.StrictMode>,
);
