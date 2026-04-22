import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { useSuiClientQuery, useSuiClient } from "@mysten/dapp-kit";
import { useEffect, useState } from "react";
import { Trophy, ArrowRight, Loader2, Lock } from "lucide-react"; // 🚨 Lock 아이콘 추가!
import { Transaction } from "@mysten/sui/transactions";

function App() {
  const enokiFlow = useEnokiFlow();
  const { address } = useZkLogin();
  const client = useSuiClient();
  
  const [goalAmount, setGoalAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);

  // 🚨 아키님의 스마트 컨트랙트(금고) 주소
  const PACKAGE_ID = "0x4bcf8d6824087db76e120b2e27650914409f3c78b1456e4eb661270e2f9cf16b";
  const VAULT_TYPE = `${PACKAGE_ID}::goal_vault::GoalVault`;

  // 구글 로그인 토큰 해독
  useEffect(() => {
    if (window.location.hash.includes("id_token=")) {
      enokiFlow.handleAuthCallback()
        .then(() => {
          window.history.replaceState(null, "", window.location.pathname);
          window.location.reload(); 
        })
        .catch((error) => console.error("토큰 해독 실패:", error));
    }
  }, [enokiFlow]);

  // 1. 잔액 조회 (잔액이 바뀌면 자동 갱신할 수 있도록 refetch 추출)
  const { data: balanceData, refetch: refetchBalance } = useSuiClientQuery("getBalance", {
    owner: address || "",
  });
  const balance = balanceData ? (Number(balanceData.totalBalance) / 1_000_000_000).toFixed(2) : "0.00";

  // 2. 🚨 내 지갑에 있는 '금고(GoalVault)'만 싹 다 찾아오기!
  const { data: vaultData, refetch: refetchVaults } = useSuiClientQuery("getOwnedObjects", {
    owner: address || "",
    filter: { StructType: VAULT_TYPE }, // 이 타입의 물건만 찾습니다.
    options: { showContent: true },
  }, {
    enabled: !!address, // 주소가 있을 때만 스캔 시작
  });

  // 찾아낸 금고의 총 개수
  const vaultCount = vaultData?.data?.length || 0;

  const handleGoogleLogin = async () => {
    await enokiFlow.createAuthorizationURL({
      provider: "google",
      clientId: "536814695888-bepe0chce3nq31vuu3th60c7al7vpsv7.apps.googleusercontent.com",
      redirectUrl: "https://goalcoin.top",
      network: "testnet",
    }).then((url) => {
      window.location.href = url;
    });
  };

  const handleDeposit = async () => {
    if (!address) return alert("먼저 구글 로그인을 진행해주세요.");
    if (!goalAmount || Number(goalAmount) <= 0) return alert("정확한 수량을 입력해주세요.");

    try {
      setIsDepositing(true);
      
      const tx = new Transaction();
      const depositAmountMist = BigInt(parseFloat(goalAmount) * 1_000_000_000);

      const [coin] = tx.splitCoins(tx.gas, [depositAmountMist]);

      tx.moveCall({
        target: `${PACKAGE_ID}::goal_vault::deposit`,
        arguments: [coin],
      });

      const keypair = await enokiFlow.getKeypair({ network: "testnet" });
      const response = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: { showEffects: true },
      });

      alert("🎉 진짜 금고에 예치 성공!\n목표 달성을 위한 보증금이 안전하게 묶였습니다.");
      setGoalAmount("");
      
      // 🚨 예치 성공 즉시 잔액과 금고 개수를 새로고침합니다!
      refetchBalance();
      refetchVaults();

    } catch (error: any) {
      alert("트랜잭션 중 오류가 발생했습니다: " + error.message);
    } finally {
      setIsDepositing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6 font-sans">
      <header className="max-w-md mx-auto flex justify-between items-center mb-12">
        <div className="flex items-center gap-2">
          <Trophy className="text-yellow-400 w-8 h-8" />
          <h1 className="text-2xl font-black italic tracking-tighter">GOAL COIN</h1>
        </div>
        <button 
          onClick={handleGoogleLogin}
          className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-full text-sm font-medium transition-all"
        >
          {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "구글 로그인"}
        </button>
      </header>

      <main className="max-w-md mx-auto space-y-8">
        
        {/* 잔액 표시 영역 */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
          <p className="text-slate-400 text-sm mb-2">현재 예치 가능 잔액</p>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-bold">{balance}</span>
            <span className="text-xl text-slate-500 font-medium">SUI</span>
          </div>
        </section>

        {/* 🚨 새로운 영역: 내 보증금 현황 표시 */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="text-blue-400 w-5 h-5" />
            <h2 className="text-lg font-semibold text-slate-200">내 보증금 현황</h2>
          </div>
          <div className="flex justify-between items-center bg-slate-950 p-4 rounded-xl border border-slate-800">
            <span className="text-slate-400 font-medium">봉인된 금고</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-white">{vaultCount}</span>
              <span className="text-sm text-slate-500">개</span>
            </div>
          </div>
        </section>

        {/* 목표 설정 영역 */}
        <section className="space-y-4">
          <label className="block text-lg font-semibold ml-2">새로운 목표 설정</label>
          <div className="relative">
            <input 
              type="number" 
              placeholder="0.1"
              value={goalAmount}
              onChange={(e) => setGoalAmount(e.target.value)}
              className="w-full bg-slate-900 border-2 border-slate-800 focus:border-blue-500 rounded-2xl p-5 text-xl outline-none transition-all"
            />
            <span className="absolute right-5 top-5 text-slate-500 font-bold">SUI</span>
          </div>
          <button 
            onClick={handleDeposit}
            disabled={isDepositing || !address}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white font-bold py-5 rounded-2xl flex items-center justify-center gap-2 group transition-all"
          >
            {isDepositing ? (
              <><Loader2 className="animate-spin w-5 h-5" /> 금고에 암호화 보관 중...</>
            ) : (
              <>보증금 예치하고 시작하기 <ArrowRight className="group-hover:translate-x-1 transition-transform" /></>
            )}
          </button>
        </section>

      </main>
    </div>
  );
}

export default App;
