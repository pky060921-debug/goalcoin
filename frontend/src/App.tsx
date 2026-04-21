console.log("App Start");

import { ConnectButton, useCurrentAccount, useSuiClientQuery, useSuiClient } from "@mysten/dapp-kit";
import { Box, Flex, Heading, Text, Container, Card, Button, TextField } from "@radix-ui/themes";
import { useEffect, useState } from "react";
import { useEnokiFlow, useZkLoginSession } from "@mysten/enoki/react";
import { Transaction } from "@mysten/sui/transactions"; // 트랜잭션 생성을 위한 도구

// 1. TODO: 아키님이 방금 터미널에서 얻은 PackageID를 여기에 넣으세요!
const PACKAGE_ID = "0x1c879ffce834a5e4295fda7bf69de5d33917c2066b603e4f973231fa48bf5d0b";
const MODULE_NAME = "goal_coin";
const GOOGLE_CLIENT_ID = "536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com";

function App() {
  const suiClient = useSuiClient(); // Sui 네트워크와 통신할 클라이언트
  const extensionAccount = useCurrentAccount();
  const enokiFlow = useEnokiFlow();
  const zkLoginSession = useZkLoginSession();
  
  const [zkAddress, setZkAddress] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [goalText, setGoalText] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");

  useEffect(() => {
    enokiFlow.handleAuthCallback().catch(() => {});
  }, [enokiFlow]);

  useEffect(() => {
    if (zkLoginSession?.jwt) {
      enokiFlow.getKeypair({ network: "testnet" }).then((keypair) => {
        const address = typeof keypair.toSuiAddress === 'function' ? keypair.toSuiAddress() : (keypair as any).address;
        setZkAddress(address);
      });
    } else { setZkAddress(null); }
  }, [zkLoginSession, enokiFlow]);

  const activeAddress = zkAddress || extensionAccount?.address;

  const { data: balanceData, refetch: refetchBalance } = useSuiClientQuery(
    "getBalance", { owner: activeAddress as string }, { enabled: !!activeAddress }
  );

  const suiBalance = balanceData ? (Number(balanceData.totalBalance) / 1_000_000_000).toFixed(2) : "0.00";

  // 🚀 핵심: 스마트 컨트랙트 호출 (목표 예치 실행)
  const handleCreateGoal = async () => {
    if (!activeAddress || !goalText || !stakeAmount) return;
    setIsProcessing(true);

    try {
      const tx = new Transaction();
      
      // 입력받은 SUI 금액을 MIST 단위로 변환 ($1 SUI = 10^9 MIST$)
      const amountInMist = BigInt(parseFloat(stakeAmount) * 1_000_000_000);

      // 1. 보증금으로 쓸 코인을 분리
      const [coin] = tx.splitCoins(tx.gas, [amountInMist]);

      // 2. 스마트 컨트랙트의 'create_goal' 함수 호출
      tx.moveCall({
        target: `${PACKAGE_ID}::${MODULE_NAME}::create_goal`,
        arguments: [
          tx.pure.vector("u8", Array.from(new TextEncoder().encode(goalText))), // 목표 텍스트
          coin, // 예치할 코인
        ],
      });

      // 3. Enoki를 통해 트랜잭션 서명 및 전송
      const signer = await enokiFlow.getKeypair({ network: "testnet" });
      const result = await suiClient.signAndExecuteTransaction({
        transaction: tx,
        signer: signer as any,
      });

      console.log("성공!", result);
      alert("🎯 목표가 블록체인에 예치되었습니다!");
      setGoalText(""); setStakeAmount("");
      setTimeout(() => refetchBalance(), 3000);
    } catch (error) {
      console.error("트랜잭션 에러:", error);
      alert("예치 중 오류가 발생했습니다. 잔액이나 PackageID를 확인해 주세요.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGoogleLogin = async () => {
    const url = await enokiFlow.createAuthorizationURL({
      provider: "google", clientId: GOOGLE_CLIENT_ID, redirectUrl: window.location.origin, network: "testnet",
    });
    window.location.href = url;
  };

  return (
    <Container size="2" style={{ minHeight: '100vh', padding: '2rem' }}>
      <Flex direction="column" gap="5">
        <Heading size="8" style={{ color: 'var(--color-sui)' }}>🎯 Goal Coin</Heading>

        <Card size="3" variant="surface">
          <Heading mb="3">내 지갑 정보</Heading>
          {activeAddress ? (
            <Flex direction="column" gap="4">
              <Box><Text as="label" size="2" weight="bold">주소</Text><Text as="p" size="1" style={{ wordBreak: 'break-all' }}>{activeAddress}</Text></Box>
              <Flex justify="between" align="end">
                <Box><Text as="label" size="2" weight="bold">잔액</Text><Heading size="7">{suiBalance} SUI</Heading></Box>
                <Button onClick={() => refetchBalance()} variant="soft" size="2">🔄 새로고침</Button>
              </Flex>
            </Flex>
          ) : (
            <Button onClick={handleGoogleLogin} size="3">Google로 시작하기</Button>
          )}
        </Card>

        {activeAddress && (
          <Card size="3" variant="surface">
            <Heading mb="4">새로운 목표 설정</Heading>
            <Flex direction="column" gap="4">
              <Box>
                <Text as="label" size="2" weight="bold">목표</Text>
                <TextField.Root placeholder="매일 아침 6시 기상" value={goalText} onChange={(e) => setGoalText(e.target.value)} />
              </Box>
              <Box>
                <Text as="label" size="2" weight="bold">보증금 (SUI)</Text>
                <TextField.Root placeholder="1" value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} type="number" />
              </Box>
              <Button size="3" onClick={handleCreateGoal} loading={isProcessing} disabled={!goalText || !stakeAmount}>
                🚀 목표 예치하고 시작하기
              </Button>
            </Flex>
          </Card>
        )}
      </Flex>
    </Container>
  );
}

export default App;
