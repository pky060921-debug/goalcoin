import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { Box, Flex, Heading, Text, Container, Card, Button } from "@radix-ui/themes";
import { useEffect } from "react";
import { useEnokiFlow, useZkLoginSession } from "@mysten/enoki/react";

// TODO: 구글 클라우드 콘솔에서 발급받은 Client ID를 아래에 넣으세요.
const GOOGLE_CLIENT_ID = "536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com";

function App() {
  const extensionAccount = useCurrentAccount();
  const enokiFlow = useEnokiFlow();
  const zkLoginSession = useZkLoginSession();

  useEffect(() => {
    enokiFlow.handleAuthCallback().catch((err) => console.log("인증 처리 중...", err));
  }, [enokiFlow]);

  const activeAddress = zkLoginSession?.address || extensionAccount?.address;

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
            <Flex direction="column" alig            <Flex direction="column" a   <Button onClick={handleGoogleLogin} size="3" style={{ cursor: 'pointer', backgroundColor: '#fff', color: '#000', width: '100%' }}>
                <Text weight="bold">Google              3초 만에 시작하기</Text>
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
