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

const { networkConfig } = createNetworkConfig({
	testnet: { url: "https://fullnode.testnet.sui.io:443" },
});

// TODO: 반드시 'enoki_public_key_' 로 시작하는 공개 키를 넣으세요!
const ENOKI_API_KEY = "enoki_private_07a009182017b289c1ac6b7307f504a3";

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
