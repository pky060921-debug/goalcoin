import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { Box, Flex, Heading, Text, Container, Card, Button } from "@radix-ui/themes";
import { useEffect, useState } from "react";
import { useEnokiFlow, useZkLoginSession } from "@mysten/enoki/react";

// TODO: 구글 클라우드 콘솔에서 발급받은 Client ID를 아래에 넣으세요.
const GOOGLE_CLIENT_ID = "여기에_GOOGLE_CLIENT_ID_입력";

function App() {
  const extensionAccount = useCurrentAccount();
  const enokiFlow = useEnokiFlow();
  const zkLoginSession = useZkLoginSession();
  
  // 구글 로그인으로 파생된 지갑 주소를 담을 새로운 공간입니다.
  const [zkAddress, setZkAddress] = useState<string | null>(null);

  // 1. 구글 인증 후 돌아오는 콜백 처리
  useEffect(() => {
    enokiFlow.handleAuthCallback().catch((err) => console.log("인증 대기 중...", err));
  }, [enokiFlow]);

  // 2. 인증 티켓(JWT)이 확인되면, Enoki에 지갑 주소(Keypair) 생성을 요청합니다!
  useEffect(() => {
    if (zkLoginSession?.jwt) {
      enokiFlow.getKeypair({ network: "testnet" })
        .then((keypair) => {
          // 키페어에서 SUI 주소를 추출하여 화면에 반영합니다.
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

  // 구글 지갑 주소가 있으면 그것을 우선 사용하고, 없으면 확장프로그램 주소 사용
  const activeAddress = zkAddress || extensionAccount?.address;

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
      alert("구글 로그인 설정이 올바르지 않습니다. 키를 다시 확인해 주세요.");
    }
  };

  const handleLogout = async () => {
    await enokiFlow.logout();
    window.location.reload();
  };

  return (
    <Container size="2" style={{ minHeight: '100vh', padding: '2rem' }}>
      <Flex direction="column" gap="4">
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

        <Card size="3" variant="surface" style={{ marginTop: '20px', backgroundColor: 'var(--color-card)' }}>
          <Heading mb="3">시작하기</Heading>
          
          {activeAddress ? (
            <Flex direction="column" gap="4">
              <Box>
                <Text as="label" size="2" weight="bold">내 지갑 주소</Text>
                <Text as="p" size="1" style={{ color: 'var(--color-muted-foreground)', wordBreak: 'break-all' }}>
                  {activeAddress}
                </Text>
              </Box>
              <Text size="2" color="green">성공적으로 연결되었습니다! 이제 목표를 설정할 준비가 되었습니다.</Text>
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
      </Flex>
    </Container>
  );
}

export default App;
