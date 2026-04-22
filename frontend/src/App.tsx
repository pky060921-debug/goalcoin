import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { useSuiClientQuery } from "@mysten/dapp-kit";
import { useEffect, useState } from "react";
import { Trophy, ArrowRight } from "lucide-react";

function App() {
  const enokiFlow = useEnokiFlow();
  const { address } = useZkLogin();
  const [goalAmount, setGoalAmount] = useState("");

  // 🚨 바로 이 부분! 구글이 던져준 열쇠를 줍고 해독하는 핵심 로직입니다.
  useEffect(() => {
    if (window.location.hash.includes("id_token=")) {
      console.log("🔑 구글 인증 토큰 감지! 해독을 시작합니다...");
      
      enokiFlow.handleAuthCallback()
        .then(() => {
          console.log("✅ 해독 성공! 지갑이 열렸습니다.");
          // 주소창의 지저분한 토큰을 지우고 깔끔하게 화면 갱신
          window.history.replaceState(null, "", window.location.pathname);
          window.location.reload(); 
        })
        .catch((error) => {
          console.error("❌ 토큰 해독 실패:", error);
          alert("로그인 실패 원인: " + error.message + "\n(Enoki 포털에 Client ID가 등록되었는지 확인하세요!)");
        });
    }
  }, [enokiFlow]);

  // 잔액 조회 (테스트넷)
  const { data: balanceData } = useSuiClientQuery("getBalance", {
    owner: address || "",
  });

  const balance = balanceData ? (Number(balanceData.totalBalance) / 1_000_000_000).toFixed(2) : "0.00";

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
          {/* 지갑 주소가 있으면 앞뒤 6, 4자리만 잘라서 보여줍니다 */}
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
          <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-5 rounded-2xl flex items-center justify-center gap-2 group transition-all">
            보증금 예치하고 시작하기 <ArrowRight className="group-hover:translate-x-1 transition-transform" />
          </button>
        </section>
      </main>
    </div>
  );
}

export default App;
