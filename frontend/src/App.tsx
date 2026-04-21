import { ConnectButton, useCurrentAccount, useSuiClientQuery } from "@mysten/dapp-kit";
import { Box, Flex, Heading, Text, Container, Card, Button, TextField } from "@radix-ui/themes";
import { useEffect, useState } from "react";
import { useEnokiFlow, useZkLoginSession } from "@mysten/enoki/react";

// TODO: 구글 클라우드 콘솔에서 발급받은 Client ID를 아래에 넣으세요.
const GOOGLE_CLIENT_ID = "536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com";

function App() {
  const extensionAccount = useCurrentAccount();
  const enokiFlow = useEnokiFlow();
  const zkLoginSession = useZkLoginSession();
  
  const [zkAddress, setZkAddress] = useState<string | null>(null);
  const [isFunding, setIsFunding] = useState(false);
  const [goalText, setGoalText] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");

  // 1. 구글 인증 후 돌아오는 콜백 처리
  useEffect(() => {
    enokiFlow.handleAuthCallback().catch((err) => console.log("인증 대기 중...", err));
  }, [enokiFlow]);

  // 2. 인증 티켓(JWT)이 확인되면, Enoki에 지갑 주소 생성을 요청
  useEffect(() => {
    if (zkLoginSession?.jwt) {
      enokiFlow.getKeypair({ network: "testnet" })
        .then((keypair) => {
          const address = typeof keypair.toSuiAddress === 'function' 
                            ? keypair.toSuiAddress() 
                            : (keypair as any).address;
          setZkAddress(address);
        })
        .catch((err) => console.error("지갑 주소 생성 실패:", err));
    } else {
      setZkAddress(null);
    }
  }, [zkLoginSession, enokiFlow]);

  const activeAddress = zkAddress || extensionAccount?.address;

  // 3. SUI 잔액 조회 (429 에러 방지를 위해 자동 조회를 끄고 수동 호출로 설정)
  const { data: balanceData, refetch: refetchBalance } = useSuiClientQuery(
    "getBalance",
    { owner: activeAddress as string },
    { 
      enabled: !!activeAddress,
      refetchInterval: false // 자동 조회를 꺼서 노드 서버의 부담을 줄입니다.
    }
  );

  // MIST 단위를 SUI 단위로 변환
  const suiBalance = balanceData ? (Number(balanceData.totalBalance) / 1_000_000_000).toFixed(2) : "0.00";

  const handleGoogleLogin = async () => {
    try {
      const url = await enokiFlow.createAuthorizationURL({
        provider: "google",
        clientId: GOOGLE_CLIENT_ID,
        redirectUrl: window.location.origin,
        network: "testnet",
      });
      window.location.href = url;
    } catch (error) {
      alert("구글 로그인 설정이 올바르지 않습니다.");
    }
  };

  const handleLogout = async () => {
    await enokiFlow.logout();
    window.location.reload();
  };

  // 4. 테스트넷 SUI 받기 (Faucet) 함수
  const requestTestTokens = async () => {
    if (!activeAddress) return;
    setIsFunding(true);
    try {
      const res = await fetch("https://faucet.testnet.sui.io/gas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ FixedAmountRequest: { recipient: activeAddress } }),
      });
      if (res.ok) {
        alert("성공적으로 테스트 SUI를 요청했습니다! 약 5~10초 뒤 잔액을 새로고침합니다.");
        // 블록체인 반영 시간을 고려해 7초 뒤 잔액 업데이트
        setTimeout(() => refetchBalance(), 7000);
      } else {
        alert("Sui Faucet 서버가 바쁩니다. 잠시 후 다시 시도해 주세요.");
      }
    } catch (error) {
      console.error("Faucet 에러:", error);
    }
    setIsFunding(false);
  };

  return (
    <Container size="2" style={{ minHeight: '100vh', padding: '2rem' }}>
      <Flex direction="column" gap="5">
        <Flex justify="between" align="center">
          <Heading size="8" style={{ color: 'var(--color-sui)' }}>🎯 Goal Coin</Heading>
          <Flex gap="3" align="center">
            {activeAddress ? (
              <Button onClick={handleLogout} variant="soft" color="red">로그아웃</Button>
            ) : (
              <ConnectButton />
            )}
          </Flex>
        </Flex>

        {/* 내 지갑 정보 카드 */}
        <Card size="3" variant="surface" style={{ backgroundColor: 'var(--color-card)' }}>
          <Heading mb="3">내 지갑 정보</Heading>
          {activeAddress ? (
            <Flex direction="column" gap="4">
              <Box>
                <Text as="label" size="2" weight="bold">내 주소</Text>
                <Text as="p" size="1" style={{ color: 'var(--color-muted-foreground)', wordBreak: 'break-all' }}>
                  {activeAddress}
                </Text>
              </Box>
              <Flex justify="between" align="end">
                <Box>
                  <Text as="label" size="2" weight="bold">현재 잔액</Text>
                  <Heading size="7" style={{ color: 'var(--color-sui)' }}>{suiBalance} SUI</Heading>
                </Box>
                <Flex gap="2">
                  <Button onClick={() => refetchBalance()} variant="soft" size="2">🔄 새로고침</Button>
                  <Button onClick={requestTestTokens} disabled={isFunding} variant="outline" size="2">
                    {isFunding ? "요청 중..." : "💧 테스트 SUI 받기"}
                  </Button>
                </Flex>
              </Flex>
            </Flex>
          ) : (
            <Flex direction="column" align="center" py="4" gap="3">
              <Button onClick={handleGoogleLogin} size="3" style={{ cursor: 'pointer', backgroundColor: '#fff', color: '#000', width: '100%' }}>
                <Text weight="bold">Google 계정으로 3초 만에 시작하기</Text>
              </Button>
              <Text size="1" style={{ color: 'var(--color-muted-foreground)' }}>확장프로그램 설치 없이 간편하게 로그인하세요.</Text>
            </Flex>
          )}
        </Card>

        {/* 목표 설정 카드 */}
        {activeAddress && (
          <Card size="3" variant="surface" style={{ backgroundColor: 'var(--color-card)' }}>
            <Heading mb="4">새로운 목표 설정</Heading>
            <Flex direction="column" gap="4">
              <Box>
                <Text as="label" size="2" weight="bold" mb="1" style={{ display: 'block' }}>어떤 목표를 달성하고 싶으신가요?</Text>
                <TextField.Root size="3" placeholder="예: 매일 아침 6시 기상 후 러닝" value={goalText} onChange={(e) => setGoalText(e.target.value)} />
              </Box>
              <Box>
                <Text as="label" size="2" weight="bold" mb="1" style={{ display: 'block' }}>보증금 예치 (SUI)</Text>
                <TextField.Root size="3" placeholder="예: 1" value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} type="number" />
                <Text size="1" color="gray" mt="1" style={{ display: 'block' }}>
                  목표 달성 시 보증금 환급 및 Goal Coin 보상이 주어집니다.
                </Text>
              </Box>
              <Button size="3" style={{ cursor: 'pointer', marginTop: '10px' }} disabled={!goalText || !stakeAmount}>
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
