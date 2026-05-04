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
  const safeAddress = suiWalletAccount?.address || zkLogin?.address || "";
  const isLoggedIn = safeAddress.length > 0;

  const [activeTab, setActiveTab] = useState('dashboard');
  const [categories, setCategories] = useState([]);
  const [savedCards, setSavedCards] = useState([]);
  const [activeCard, setActiveCard] = useState<any>(null);
  
  const [viewMode, setViewMode] = useState('all');
  const [colCount, setColCount] = useState(3);
  const [useAiRecommend, setUseAiRecommend] = useState(true);
  const [panelState, setPanelState] = useState({ progress: 0, message: "대기 중..." });

  useEffect(() => {
    if (isLoggedIn) { loadAllData(); }
    const sAi = localStorage.getItem('useAiRecommend');
    if (sAi !== null) setUseAiRecommend(sAi === 'true');
  }, [isLoggedIn, safeAddress]);

  const loadAllData = async () => {
    try {
      const catRes = await api.getCategories(safeAddress);
      setCategories(catRes.categories || []);
      const cardRes = await api.getMyCards(safeAddress);
      setSavedCards(cardRes.cards || []);
    } catch (e) { console.error("데이터 로딩 실패:", e); }
  };

  const handleDeleteCard = async (id: number) => {
    if (window.confirm("이 카드를 삭제하시겠습니까?")) {
      await api.deleteCard(safeAddress, id);
      loadAllData();
    }
  };

  const handleMakeBlankCard = async (cat: any, text: string, selectedWords: Set<number>) => {
    alert("카드가 저장되었습니다! (백엔드 연동 대기)");
  };

  const handleAiRecommend = async (cat: any) => {
    setPanelState({ progress: 50, message: "AI가 추천 중입니다..." });
  };

  const createLongPressHandlers = (cb: any) => ({ onMouseDown: cb, onTouchStart: cb });

  const handleGoogleLogin = async () => {
    try {
      const protocol = window.location.protocol;
      const host = window.location.host;
      const redirectUrl = `${protocol}//${host}`;
      const url = await enokiFlow.createAuthorizationURL({
        provider: 'google',
        clientId: '802422002773-j64t319p7pveem8gukq1t832b8h7l6um.apps.googleusercontent.com',
        redirectUrl: redirectUrl,
        extraParams: { scope: ['openid', 'email', 'profile'] }
      });
      window.location.href = url;
    } catch (error) {
      console.error("❌ 구글 로그인 에러 발생:", error);
      alert("로그인 창을 불러오지 못했습니다. 콘솔을 확인해주세요.");
    }
  };

  const handleLogout = async () => {
    await enokiFlow.logout();
    window.location.reload();
  };

  // 모달 복원용 렌더링
  const renderMaskedContent = () => {
    if (!activeCard) return null;
    const parts = activeCard.content.split(/(\[.*?\])/g);
    return parts.map((p: string, i: number) => {
      if (p.startsWith('[') && p.endsWith(']')) return <span key={i} className="bg-indigo-500/30 border-b border-indigo-400 mx-1 px-4 text-transparent">____</span>;
      return p;
    });
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#d1d1d1] p-6 sm:p-12">
      <header className="max-w-6xl mx-auto border-b border-white/10 pb-8 mb-12 flex justify-between items-end">
        <h1 className="text-2xl font-light tracking-widest text-white">Blank_D</h1>
        {isLoggedIn && (
          <div className="flex items-center gap-4">
            <div className="text-[10px] text-teal-400 font-mono bg-teal-900/20 px-2 py-1 rounded">{safeAddress.slice(0,6)}...{safeAddress.slice(-4)}</div>
            <button onClick={handleLogout} className="text-[10px] text-white/40 hover:text-white transition-colors">로그아웃</button>
          </div>
        )}
      </header>

      {!isLoggedIn ? (
        <main className="max-w-md mx-auto mt-32 animate-in fade-in flex flex-col items-center">
          <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-sm mb-8 flex items-center justify-center text-2xl">🏛️</div>
          <h2 className="text-xl font-serif text-white mb-2">법령 기억 강화 시스템</h2>
          <p className="text-sm text-white/40 mb-12 text-center">인지 과학 기반의 간격 반복 학습으로<br/>방대한 법령을 영구 기억으로 전환합니다.</p>
          <button onClick={handleGoogleLogin} className="w-full py-4 bg-white text-black font-bold text-sm flex items-center justify-center gap-3 hover:bg-gray-200 transition-all rounded-sm">
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
          {activeTab === 'create' && <CraftTab categories={categories} colCount={colCount} viewMode={viewMode} useAiRecommend={useAiRecommend} panelState={panelState} handleMakeBlankCard={handleMakeBlankCard} handleAiRecommend={handleAiRecommend} />}
          {activeTab === 'enhance' && <EnhanceTab savedCards={savedCards} colCount={colCount} viewMode={viewMode} setActiveCard={setActiveCard} handleDeleteCard={handleDeleteCard} createLongPressHandlers={createLongPressHandlers} />}
          {activeTab === 'mypage' && (
             <MypageTab useAiRecommend={useAiRecommend} setUseAiRecommend={setUseAiRecommend} viewMode={viewMode} setViewMode={setViewMode} colCount={colCount} updateColCount={setColCount} handleDeleteAll={async () => {
                 if(window.confirm('모든 데이터를 초기화합니까?')) {
                   await api.deleteAll(safeAddress);
                   loadAllData();
                   alert("초기화 완료! 문헌을 다시 업로드해주세요.");
                 }
               }} />
          )}
        </main>
      )}

      {activeCard && (
        <CardModal activeCard={activeCard} totalTimeLimit={10} elapsed={0} answerInput="" setAnswerInput={()=>{}} inputStatus="idle" handleSequentialInput={()=>{}} renderContent={renderMaskedContent} onClose={() => setActiveCard(null)} />
      )}
    </div>
  );
}

export default function App() {
  return <MainApp />;
}
