import React, { useState, useEffect } from "react";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { api } from "./services/api";
import { CardModal } from "./components/CardModal";
import { DashboardTab } from "./tabs/DashboardTab";
import { CraftTab } from "./tabs/CraftTab";
import { EnhanceTab } from "./tabs/EnhanceTab";
import { MypageTab } from "./tabs/MypageTab";

function MainApp() {
  const enokiFlow = useEnokiFlow();
  const zkLogin = useZkLogin();
  const suiWalletAccount = useCurrentAccount();
  
  // 지갑 또는 구글(zkLogin) 로그인 여부 확인
  const safeAddress = suiWalletAccount?.address || zkLogin?.address || "";
  const isLoggedIn = safeAddress.length > 0;

  // 탭 및 데이터 상태 관리
  const [activeTab, setActiveTab] = useState('dashboard');
  const [categories, setCategories] = useState([]);
  const [savedCards, setSavedCards] = useState([]);
  const [activeCard, setActiveCard] = useState<any>(null);
  
  // 글로벌 UI 설정 상태 관리
  const [viewMode, setViewMode] = useState('all');
  const [colCount, setColCount] = useState(3);
  const [useAiRecommend, setUseAiRecommend] = useState(true);
  const [panelState, setPanelState] = useState({ progress: 0, message: "대기 중..." });

  // 로그인 시 데이터 로드
  useEffect(() => {
    if (isLoggedIn) { 
      loadAllData(); 
    }
    const sAi = localStorage.getItem('useAiRecommend');
    if (sAi !== null) setUseAiRecommend(sAi === 'true');
  }, [isLoggedIn, safeAddress]);

  const loadAllData = async () => {
    try {
      const catRes = await api.getCategories(safeAddress);
      setCategories(catRes.categories || []);
      const cardRes = await api.getMyCards(safeAddress);
      setSavedCards(cardRes.cards || []);
    } catch (e) { 
      console.error("데이터 로딩 실패:", e); 
    }
  };

  const handleDeleteCard = async (id: number) => {
    if (window.confirm("이 카드를 삭제하시겠습니까?")) {
      await api.deleteCard(safeAddress, id);
      loadAllData();
    }
  };

  const handleMakeBlankCard = async (cat: any, text: string, selectedWords: Set<number>) => {
    alert("카드가 저장되었습니다! (실제 백엔드 API 연동 필요)");
  };

  const handleAiRecommend = async (cat: any) => {
    setPanelState({ progress: 50, message: "AI가 추천 중입니다..." });
  };

  const createLongPressHandlers = (cb: any) => ({ onMouseDown: cb, onTouchStart: cb });

  // 구글 로그인 처리 함수 (에러 진단 로그 포함)
  const handleGoogleLogin = async () => {
    console.log("🚀 구글 로그인 시도 시작...");
    try {
      const protocol = window.location.protocol;
      const host = window.location.host;
      const redirectUrl = `${protocol}//${host}`;
      
      console.log("📍 리다이렉트 주소:", redirectUrl);

      const url = await enokiFlow.createAuthorizationURL({
        provider: 'google',
        clientId: '802422002773-j64t319p7pveem8gukq1t832b8h7l6um.apps.googleusercontent.com',
        redirectUrl: redirectUrl,
        extraParams: { scope: ['openid', 'email', 'profile'] }
      });

      console.log("🔗 생성된 인증 URL:", url);
      window.location.href = url;

    } catch (error) {
      console.error("❌ 구글 로그인 에러 발생:", error);
      alert("로그인 창을 불러오지 못했습니다. 콘솔(F12) 에러 로그를 확인해 주세요.");
    }
  };

  // 로그아웃 처리 함수
  const handleLogout = async () => {
    await enokiFlow.logout();
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#d1d1d1] p-6 sm:p-12">
      <header className="max-w-6xl mx-auto border-b border-white/10 pb-8 mb-12 flex justify-between items-end">
        <h1 className="text-2xl font-light tracking-widest text-white">Blank_D</h1>
        {isLoggedIn && (
          <div className="flex items-center gap-4">
            <div className="text-[10px] text-teal-400 font-mono bg-teal-900/20 px-2 py-1 rounded">
              {safeAddress.slice(0,6)}...{safeAddress.slice(-4)}
            </div>
            <button onClick={handleLogout} className="text-[10px] text-white/40 hover:text-white transition-colors">
              로그아웃
            </button>
          </div>
        )}
      </header>

      {!isLoggedIn ? (
        <main className="max-w-md mx-auto mt-32 animate-in fade-in flex flex-col items-center">
          <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-sm mb-8 flex items-center justify-center text-2xl">
            🏛️
          </div>
          <h2 className="text-xl font-serif text-white mb-2">법령 기억 강화 시스템</h2>
          <p className="text-sm text-white/40 mb-12 text-center">인지 과학 기반의 간격 반복 학습으로<br/>방대한 법령을 영구 기억으로 전환합니다.</p>
          
          <button 
            onClick={handleGoogleLogin} 
            className="w-full py-4 bg-white text-black font-bold text-sm flex items-center justify-center gap-3 hover:bg-gray-200 transition-all rounded-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google 계정으로 시작하기
          </button>
        </main>
      ) : (
        <main className="max-w-6xl mx-auto">
          <nav className="flex gap-8 mb-8 border-b border-white/5 pb-4 overflow-x-auto">
            {['dashboard', 'create', 'enhance', 'exam', 'mypage'].map(id => (
              <button key={id} onClick={() => setActiveTab(id)} className={`text-xs uppercase tracking-widest ${activeTab === id ? 'text-white border-b' : 'text-white/30'}`}>{id}</button>
            ))}
          </nav>

          {activeTab === 'dashboard' && <DashboardTab categories={categories} savedCards={savedCards} />}
          
          {activeTab === 'create' && (
            <CraftTab 
              categories={categories} colCount={colCount} viewMode={viewMode} 
              useAiRecommend={useAiRecommend} panelState={panelState}
              handleMakeBlankCard={handleMakeBlankCard} handleAiRecommend={handleAiRecommend} 
            />
          )}
          
          {activeTab === 'enhance' && (
            <EnhanceTab 
              savedCards={savedCards} colCount={colCount} viewMode={viewMode} 
              setActiveCard={setActiveCard} handleDeleteCard={handleDeleteCard} 
              createLongPressHandlers={createLongPressHandlers} 
            />
          )}

          {activeTab === 'mypage' && (
             <MypageTab 
               useAiRecommend={useAiRecommend} setUseAiRecommend={setUseAiRecommend}
               viewMode={viewMode} setViewMode={setViewMode}
               colCount={colCount} updateColCount={setColCount}
               handleDeleteAll={async () => {
                 if(window.confirm('모든 데이터를 초기화합니까?')) {
                   await fetch('https://api.blankd.top/api/delete-all', {
                     method: 'POST', 
                     headers: {'Content-Type':'application/json'}, 
                     body: JSON.stringify({wallet_address: safeAddress})
                   });
                   loadAllData();
                   alert("초기화 완료! 문헌을 다시 업로드해주세요.");
                 }
               }}
             />
          )}
        </main>
      )}

      {activeCard && (
        <CardModal 
          activeCard={activeCard} totalTimeLimit={10} elapsed={0} 
          answerInput="" setAnswerInput={()=>{}} inputStatus="idle" 
          handleSequentialInput={()=>{}} renderContent={() => <div>{activeCard.content}</div>} 
          onClose={() => setActiveCard(null)} 
        />
      )}
    </div>
  );
}

export default function App() {
  return <MainApp />;
}
