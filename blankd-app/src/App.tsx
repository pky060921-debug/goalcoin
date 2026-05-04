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
  
  // 💡 모바일 화면용 시스템 터미널 로그 상태
  const [systemLogs, setSystemLogs] = useState<string[]>(["[System] 터미널 초기화 완료..."]);
  const [panelState, setPanelState] = useState({ progress: 0, message: "대기 중..." });

  // 💡 터미널에 로그를 추가하는 헬퍼 함수
  const addLog = (msg: string) => {
    setSystemLogs(prev => {
      const newLogs = [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`];
      return newLogs.slice(-5); // 최신 5개 로그만 유지하여 화면 낭비 방지
    });
  };

  useEffect(() => {
    if (isLoggedIn) { 
      addLog("✅ 로그인 성공. 데이터를 불러옵니다.");
      loadAllData(); 
    }
    const sAi = localStorage.getItem('useAiRecommend');
    if (sAi !== null) setUseAiRecommend(sAi === 'true');
  }, [isLoggedIn, safeAddress]);

  const loadAllData = async () => {
    try {
      addLog("⏳ API 통신 중: 카테고리 & 카드 로딩...");
      const catRes = await api.getCategories(safeAddress);
      setCategories(catRes.categories || []);
      const cardRes = await api.getMyCards(safeAddress);
      setSavedCards(cardRes.cards || []);
      addLog(`✅ 데이터 로드 완료 (카테고리: ${catRes.categories?.length || 0}개, 카드: ${cardRes.cards?.length || 0}개)`);
    } catch (e: any) { 
      addLog(`❌ 데이터 로딩 실패: ${e.message}`);
      console.error("데이터 로딩 실패:", e); 
    }
  };

  const handleDeleteCard = async (id: number) => {
    if (window.confirm("이 카드를 삭제하시겠습니까?")) {
      try {
        addLog(`⏳ 카드 삭제 시도 (ID: ${id})...`);
        await api.deleteCard(safeAddress, id);
        addLog("✅ 카드 삭제 성공.");
        loadAllData();
      } catch (e: any) {
        addLog(`❌ 카드 삭제 실패: ${e.message}`);
      }
    }
  };

  const handleMakeBlankCard = async (cat: any, text: string, selectedWords: Set<number>) => {
    addLog(`⚠️ 카드 저장 대기 중 (실제 백엔드 API 연동 필요)`);
    alert("카드가 저장되었습니다! (백엔드 연동 대기)");
  };

  const handleAiRecommend = async (cat: any) => {
    addLog("⏳ AI 추천 연산 요청 중...");
    setPanelState({ progress: 50, message: "AI가 추천 중입니다..." });
  };

  const createLongPressHandlers = (cb: any) => ({ onMouseDown: cb, onTouchStart: cb });

  // 💡 구글 로그인 전방위 오류 감지 및 터미널 출력
  const handleGoogleLogin = async () => {
    addLog("🚀 구글 로그인(Enoki) 프로세스 시작...");
    try {
      const protocol = window.location.protocol;
      const host = window.location.host;
      const redirectUrl = `${protocol}//${host}`;
      
      addLog(`📍 리다이렉트 주소 계산 완료: ${redirectUrl}`);

      const url = await enokiFlow.createAuthorizationURL({
        provider: 'google',
        clientId: '802422002773-j64t319p7pveem8gukq1t832b8h7l6um.apps.googleusercontent.com',
        redirectUrl: redirectUrl,
        extraParams: { scope: ['openid', 'email', 'profile'] }
      });
      
      addLog(`🔗 Enoki 인증 URL 생성 성공. 페이지 이동 중...`);
      window.location.href = url;
    } catch (error: any) {
      const errorMsg = error?.message || "알 수 없는 에러";
      addLog(`❌ 구글 로그인 에러 발생: ${errorMsg}`);
      console.error("❌ 구글 로그인 에러 발생:", error);
      alert(`로그인 창을 불러오지 못했습니다.\n원인: ${errorMsg}`);
    }
  };

  const handleLogout = async () => {
    addLog("⏳ 로그아웃 처리 중...");
    await enokiFlow.logout();
    window.location.reload();
  };

  const renderMaskedContent = () => {
    if (!activeCard) return null;
    const parts = activeCard.content.split(/(\[.*?\])/g);
    return parts.map((p: string, i: number) => {
      if (p.startsWith('[') && p.endsWith(']')) return <span key={i} className="bg-indigo-500/30 border-b border-indigo-400 mx-1 px-4 text-transparent">____</span>;
      return p;
    });
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-[#d1d1d1] p-6 sm:p-12 relative pb-32">
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
        <main className="max-w-md mx-auto mt-16 animate-in fade-in flex flex-col items-center">
          <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-sm mb-8 flex items-center justify-center text-2xl">🏛️</div>
          <h2 className="text-xl font-serif text-white mb-2">법령 기억 강화 시스템</h2>
          <p className="text-sm text-white/40 mb-12 text-center">인지 과학 기반의 간격 반복 학습으로<br/>방대한 법령을 영구 기억으로 전환합니다.</p>
          <button onClick={handleGoogleLogin} className="w-full py-4 bg-white text-black font-bold text-sm flex items-center justify-center gap-3 hover:bg-gray-200 transition-all rounded-sm mb-8">
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
                   try {
                     addLog("⏳ 전체 데이터 삭제 API 호출 중...");
                     await api.deleteAll(safeAddress);
                     addLog("✅ 초기화 완료.");
                     loadAllData();
                     alert("초기화 완료! 문헌을 다시 업로드해주세요.");
                   } catch (e: any) {
                     addLog(`❌ 초기화 실패: ${e.message}`);
                   }
                 }
               }} />
          )}
        </main>
      )}

      {activeCard && (
        <CardModal activeCard={activeCard} totalTimeLimit={10} elapsed={0} answerInput="" setAnswerInput={()=>{}} inputStatus="idle" handleSequentialInput={()=>{}} renderContent={renderMaskedContent} onClose={() => setActiveCard(null)} />
      )}

      {/* 💡 모바일 기기를 위한 플로팅 시스템 터미널 (항상 하단 고정) */}
      <div className="fixed bottom-0 left-0 w-full bg-black/90 border-t border-indigo-500/30 p-4 z-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-[10px] text-indigo-400 font-bold mb-2 uppercase">System Terminal Logs</div>
          <div className="space-y-1 h-20 overflow-y-auto">
            {systemLogs.map((log, idx) => (
              <div key={idx} className={`text-[11px] ${log.includes('❌') ? 'text-red-400' : log.includes('✅') ? 'text-green-400' : 'text-white/70'}`}>
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return <MainApp />;
}
