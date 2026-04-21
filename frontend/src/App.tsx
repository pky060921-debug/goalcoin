import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { Box, Flex, Heading, Text, Container, Card, Button, TextField } from "@radix-ui/themes";
import { useState } from "react";

// 배포된 실제 ID들
const PACKAGE_ID = "0x3f6621b609babc6bcf9e5e0ed0f2002e4eb075bcc0c175ab3e1fb90565449b5c";
const VAULT_ID = "0x3bd37a0ca982e4371ae24534f068c6a13843873e34503671f13b6817a14fe811";

function App() {
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const [amount, setAmount] = useState("");

  const handleDeposit = async () => {
    if (!amount || isNaN(Number(amount))) return alert("올바른 수량을 입력하세요.");

    const tx = new Transaction();
    
    // 1. 보증금으로 보낼 SUI 코인 생성
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(Number(amount) * 1_000_000_000)]);

    // 2. goal_vault 모듈의 deposit 함수 호출 (Vault 객체와 코인을 인자로 전달)
    tx.moveCall({
      target: `${PACKAGE_ID}::goal_vault::deposit`,
      arguments: [tx.object(VAULT_ID), coin],
    });

    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (result) => {
          console.log("성공!", result);
          alert("성공적으로 예치되었습니다! 이제 목표를 향해 달려보세요.");
        },
        onError: (error) => {
          console.error("에러:", error);
          alert("지갑 승인이 거절되었거나 잔액이 부족합니다.");
        }
      }
    );
  };

  return (
    <Container size="2" style={{ minHeight: '100vh', padding: '2rem' }}>
      <Flex direction="column" gap="4">
        <Flex justify="between" align="center">
          <Heading size="8" style={{ color: 'var(--color-sui)' }}>🎯 Goal Coin</Heading>
          <ConnectButton />
        </Flex>

        <Card size="3" variant="surface" style={{ marginTop: '20px', backgroundColor: 'var(--color-card)' }}>
          <Heading mb="3">목표 보증금 예치</Heading>
          
          {account ? (
            <Flex direction="column" gap="4">
              <Box>
                <Text as="label" size="2" weight="bold">연결된 지갑</Text>
                <Text as="p" size="1" style={{ color: 'var(--color-muted-foreground)', wordBreak: 'break-all' }}>
                  {account.address}
                </Text>
              </Box>

              <TextField.Root 
                placeholder="예치할 SUI 수량" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              >
                <TextField.Slot side="right">SUI</TextField.Slot>
              </TextField.Root>

              <Button size="3" variant="solid" onClick={handleDeposit}>
                보증금 걸고 시작하기
              </Button>
            </Flex>
          ) : (
            <Flex direction="column" align="center" py="4" gap="2">
              <Text style={{ color: 'var(--color-muted-foreground)' }}>시작하려면 지갑을 연결하세요.</Text>
              <ConnectButton />
            </Flex>
          )}
        </Card>
      </Flex>
    </Container>
  );
}

export default App;
