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

  useEffect(() => {
    enokiFlow.handleAuthCallback().catch(() => {}); // 로그에 찍히는 단순 에러 방지
  }, [enokiFlow]);

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

  // 3. SUI 잔액 조회 (429 에러 방지를 위한 초강력 옵션)
  const { data: balanceData, refetch: refetchBalance } = useSuiClientQuery(
    "getBalance",
    { owner: activeAddress as string },
    { 
      enabled: !!activeAddress,
      refetchInterval: false,      // 자동 조회 끔
      refetchOnWindowFocus: false, // 창 포커스 시 조회 끔
      retry: 1                     // 실패 시 재시도 횟수 제한
    }
  );

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
        alert("성공적으로 테스트 SUI를 요청했습니다! 약 10초 뒤 새로고침 버튼을 눌러주세요.");
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

        {activeAddress && (
          <Card size="3" variant="surface" style={{ backgroundColor: 'var(--color-card)' }}>
            <Heading mb="4">새로운 목표 설정</Heading>
            <Flex direction="column" gap="4">
              <Box>
                <Text as="label" size="2" weight="bold" mb="1" style={{ display: 'block' }}>목표 내용</Text>
                <TextField.Root size="3" placeholder="예: 매일 아침 6시 기상" value={goalText} onChange={(e) => setGoalText(e.target.value)} />
              </Box>
              <Box>
                <Text as="label" size="2" weight="bold" mb="1" style={{ display: 'block' }}>보증금 (SUI)</Text>
                <TextField.Root size="3" placeholder="예: 1" value={stakeAmount} onChange={(e) => setStakeAmount(e.target.value)} type="number" />
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
