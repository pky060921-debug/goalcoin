import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { useSuiClientQuery, useSuiClient } from "@mysten/dapp-kit";
import { useEffect, useState } from "react";
import { Trophy, ArrowRight, Loader2, Lock, CheckCircle2 } from "lucide-react";
import { Transaction } from "@mysten/sui/transactions";

function App() {
  const enokiFlow = useEnokiFlow();
  const { address } = useZkLogin();
  const client = useSuiClient();
  
  const [goalAmount, setGoalAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null); // 어떤 금고를 환급 중인지 추적

  // 🚨 아키님의 V2 스마트 컨트랙트 주소 (입/출구 완비)
  const PACKAGE_ID = "0xf2c3799a6a3e53155508770cd166deddd2df9794a4c0095c1142237333b6f473";
  const VAULT_TYPE = `${PACKAGE_ID}::goal_vault::GoalVault`;

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

  // 잔액 조회
  const { data: balanceData, refetch: refetchBalance } = useSuiClientQuery("getBalance", {
    owner: address || "",
  });
  const balance = balanceData ? (Number(balanceData.totalBalance) / 1_000_000_000).toFixed(2) : "0.00";

  // 내 금고 스캔 (V2 금고만 찾아냅니다)
  const { data: vaultData, refetch: refetchVaults } = useSuiClientQuery("getOwnedObjects", {
    owner: address || "",
    filter: { StructType: VAULT_TYPE },
    options: { showContent: true },
  }, {
    enabled: !!address,
  });

  const vaults = vaultData?.data || [];
  const vaultCount = vaults.length;

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

  // 📥 [입구] 예치하기 로직
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
      await client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: { showEffects: true },
      });

      alert("🎉 보증금 예치 성공!");
      setGoalAmount("");
      refetchBalance();
      refetchVaults();

    } catch (error: any) {
      alert("예치 실패: " + error.message);
    } finally {
      setIsDepositing(false);
    }
  };

  // 📤 [출구] 환급받기 로직 (새로 추가됨!)
  const handleWithdraw = async (vaultId: string) => {
    try {
      setWithdrawingId(vaultId); // 로딩 표시용
      const tx = new Transaction();

      // V2 금고의 withdraw 함수 호출 (금고 객체를 통째로 넘김)
      tx.moveCall({
        target: `${PACKAGE_ID}::goal_vault::withdraw`,
        arguments: [tx.object(vaultId)], 
      });

      const keypair = await enokiFlow.getKeypair({ network: "testnet" });
      const response = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: { showEffects: true },
      });

      alert("🏆 목표 달성 축하합니다!\n금고가 해제되어 보증금이 지갑으로 환급되었습니다.");
      refetchBalance();
      refetchVaults();

    } catch (error: any) {
      alert("환급 실패: " + error.message);
    } finally {
      setWithdrawingId(null);
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
        {/* 잔액 영역 */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
          <p className="text-slate-400 text-sm mb-2">현재 예치 가능 잔액</p>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-bold">{balance}</span>
            <span className="text-xl text-slate-500 font-medium">SUI</span>
          </div>
        </section>

        {/* 내 금고 현황 영역 */}
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="text-blue-400 w-5 h-5" />
            <h2 className="text-lg font-semibold text-slate-200">내 보증금 현황 (봉인됨: {vaultCount}개)</h2>
          </div>
          
          <div className="space-y-3">
            {vaultCount === 0 ? (
              <p className="text-slate-500 text-center py-4">진행 중인 목표가 없습니다.</p>
            ) : (
              vaults.map((vault) => (
                <div key={vault.data?.objectId} className="flex justify-between items-center bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-sm font-mono truncate w-24">
                    {vault.data?.objectId.slice(0, 8)}...
                  </span>
                  <button 
                    onClick={() => handleWithdraw(vault.data?.objectId as string)}
                    disabled={withdrawingId === vault.data?.objectId}
                    className="bg-green-600 hover:bg-green-500 disabled:bg-slate-800 text-white text-sm font-bold py-2 px-4 rounded-lg flex items-center gap-1 transition-all"
                  >
                    {withdrawingId === vault.data?.objectId ? (
                      <><Loader2 className="animate-spin w-4 h-4" /> 해제 중</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4" /> 환급받기</>
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 목표 설정 (예치) 영역 */}
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
