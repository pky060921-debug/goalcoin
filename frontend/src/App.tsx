import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { Box, Flex, Heading, Text, Container, Card, Button, TextField } from "@radix-ui/themes";
import { useState } from "react";

function App() {
  const account = useCurrentAccount();
  const [amount, setAmount] = useState("");

  return (
    <Container size="2">
      <Flex direction="column" gap="4" py="8">
        {/* 상단 헤더 */}
        <Flex justify="between" align="center">
          <Heading size="8" color="blue">🎯 Goal Coin</Heading>
          <ConnectButton />
        </Flex>

        <Text size="4" color="gray">노력이 자산이 되는 Proof of Effort 생태계</Text>

        {/* 메인 대시보드 */}
        <Card size="3" variant="surface" style={{ marginTop: '20px' }}>
          <Heading mb="2">나의 목표 설정</Heading>
          
          {account ? (
            <Flex direction="column" gap="4">
              <Box>
                <Text as="label" size="2" mb="1" weight="bold">연결된 지갑 주소</Text>
                <Text as="p" size="1" color="gray" style={{ wordBreak: 'break-all' }}>{account.address}</Text>
              </Box>

              <Box>
                <Text as="label" size="2" mb="1" weight="bold">예치할 SUI 수량</Text>
                <TextField.Root 
                  placeholder="예: 10" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                >
                  <TextField.Slot side="right">SUI</TextField.Slot>
                </TextField.Root>
              </Box>

              <Button size="3" variant="solid" onClick={() => alert(`${amount} SUI 예치 로직은 다음 단계에서 연결합니다!`)}>
                목표 설정 및 보증금 예치하기
              </Button>
            </Flex>
          ) : (
            <Flex direction="column" align="center" py="6" gap="3">
              <Text color="gray">서비스를 이용하려면 먼저 지갑을 연결해 주세요.</Text>
              <ConnectButton />
            </Flex>
          )}
        </Card>

        {/* 하단 안내 */}
        <Box mt="4">
          <Text size="1" color="gray">
            * 예치 시 3%의 수수료(소각/운영/리워드)가 발생하며, 목표 달성 시 97%가 환급됩니다.
          </Text>
        </Box>
      </Flex>
    </Container>
  );
}

export default App;
