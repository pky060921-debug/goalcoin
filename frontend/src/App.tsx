import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { useSuiClientQuery, useSuiClient } from "@mysten/dapp-kit";
import { useEffect, useState } from "react";
import { Trophy, ArrowRight, Loader2 } from "lucide-react";
import { Transaction } from "@mysten/sui/transactions"; // 🚨 블록체인 전송용 핵심 부품 추가!

function App() {
  const enokiFlow = useEnokiFlow();
  const { address } = useZkLogin();
  const client = useSuiClient(); // Sui 네트워크와 통신하는 안테나
  
  const [goalAmount, setGoalAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false); // 로딩 상태 관리

  // 구글 로그인 토큰 해독 로직
  useEffect(() => {
    if (window.location.hash.includes("id_token=")) {
      console.log("🔑 구글 인증 토큰 감지! 해독을 시작합니다...");
      enokiFlow.handleAuthCallback()
        .then(() => {
          console.log("✅ 해독 성공! 지갑이 열렸습니다.");
          window.history.replaceState(null, "", window.location.pathname);
          window.location.reload(); 
        })
        .catch((error) => {
          console.error("❌ 토큰 해독 실패:", error);
          alert("로그인 실패 원인: " + error.message);
        });
    }
  }, [enokiFlow]);

  // 잔액 조회
  const { data: balanceData } = useSuiClientQuery("getBalance", {
    owner: address || "",
  });
  const balance = balanceData ? (Number(balanceData.totalBalance) / 1_000_000_000).toFixed(2) : "0.00";

  // 구글 로그인 버튼 클릭 시
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

  // 🚀 예치하기 버튼 클릭 시 실행되는 트랜잭션 로직
  const handleDeposit = async () => {
    if (!address) return alert("먼저 구글 로그인을 진행해주세요.");
    if (!goalAmount || Number(goalAmount) <= 0) return alert("정확한 수량을 입력해주세요.");

    try {
      setIsDepositing(true); // 로딩 버튼으로 변경
      
      const tx = new Transaction();
      // 사람이 보는 SUI 단위를 블록체인이 아는 MIST 단위로 변환 (1 SUI = 1,000,000,000 MIST)
      const depositAmountMist = BigInt(parseFloat(goalAmount) * 1_000_000_000);

      // 🚨 아직 스마트 컨트랙트(금고)가 없으므로, 내 지갑에서 SUI를 분리해 다시 내 지갑으로 보내는 테스트 전송을 합니다.
      const [coin] = tx.splitCoins(tx.gas, [depositAmountMist]);
      tx.transferObjects([coin], address);

      // Enoki를 통해 비밀번호 없이 서명(Sign)하고 네트워크에 기록(Execute)
      const keypair = await enokiFlow.getKeypair({ network: "testnet" });
      const response = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: { showEffects: true },
      });

      console.log("블록체인 기록 완료:", response);
      alert(`🎉 트랜잭션 성공!\n테스트넷 블록체인에 완벽하게 기록되었습니다.\n\n블록 해시: ${response.digest}`);
      setGoalAmount(""); // 입력창 초기화

    } catch (error: any) {
      console.error("예치 실패:", error);
      alert("트랜잭션 중 오류가 발생했습니다: " + error.message);
    } finally {
      setIsDepositing(false); // 로딩 종료
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
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
          <p className="text-slate-400 text-sm mb-2">현재 예치 가능 잔액</p>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-bold">{balance}</span>
            <span className="text-xl text-slate-500 font-medium">SUI</span>
          </div>
        </section>

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
          
          {/* 🚀 트랜잭션이 연결된 진짜 버튼! */}
          <button 
            onClick={handleDeposit}
            disabled={isDepositing || !address}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white font-bold py-5 rounded-2xl flex items-center justify-center gap-2 group transition-all"
          >
            {isDepositing ? (
              <><Loader2 className="animate-spin w-5 h-5" /> 블록체인 통신 중...</>
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
